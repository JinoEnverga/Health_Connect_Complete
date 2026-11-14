-- Availability Windows & Time-Block Queue appointment system.
--
-- Replaces fixed 1-hour time slots with doctor-defined availability blocks
-- (e.g. Mon 9:00 AM – 12:00 PM, 8 patients, ~20 min each). Patients book a
-- spot in a block and get a queue number + estimated time; the doctor runs
-- the queue live and everyone's estimate shifts as consultations finish
-- early or run late.
--
-- Where the rules are enforced (all in Postgres, so the web app, the mobile
-- app, or a direct API call all get the same guarantees):
--   * No overlapping blocks per doctor  -> exclusion constraint
--   * Capacity / race conditions        -> BEFORE INSERT trigger on
--     appointments locks the block row (SELECT ... FOR UPDATE), so two
--     patients booking the last spot at once are serialized: one wins, the
--     other gets "This block is full".
--   * Queue numbers, estimated times, booked_count, now_serving
--     -> maintained only by SECURITY DEFINER triggers; clients can't write
--        those columns (there is no UPDATE policy on availability_blocks).
--
-- Status values follow the existing lowercase convention:
--   waiting | in_progress | completed | cancelled | no_show
-- The legacy 'upcoming' value stays valid for pre-existing slot-based
-- appointments (and the mobile app), which keep working unchanged.
--
-- All clock times are Philippine time (Asia/Manila); the database itself
-- runs in UTC, so conversions are explicit below.
--
-- Safe to re-run.

create extension if not exists btree_gist with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Availability blocks
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.availability_blocks (
  id                       uuid primary key default gen_random_uuid(),
  doctor_id                uuid not null references public.profiles(id) on delete cascade,
  date                     date not null,
  start_time               time not null,
  end_time                 time not null,
  max_patients             integer not null,
  booked_count             integer not null default 0,
  avg_minutes_per_patient  integer not null,
  -- Never decremented, so queue numbers stay unique within a block even
  -- after cancellations (booked_count does go down to free the spot).
  next_queue_number        integer not null default 1,
  -- Queue number currently IN_PROGRESS (null when nobody is being seen),
  -- plus when it started — what the patient dashboard shows as "Now Serving".
  now_serving              integer,
  now_serving_started_at   timestamptz,
  is_full                  boolean generated always as (booked_count >= max_patients) stored,
  created_at               timestamptz not null default now(),

  constraint availability_blocks_time_order     check (end_time > start_time),
  constraint availability_blocks_capacity_range check (max_patients between 1 and 100),
  constraint availability_blocks_avg_range      check (avg_minutes_per_patient between 5 and 240),
  constraint availability_blocks_booked_range   check (booked_count between 0 and max_patients),
  -- Zero overlap between a doctor's own blocks. '[)' = touching blocks
  -- (9–12 and 12–3) are fine; anything that actually overlaps is rejected.
  constraint availability_blocks_no_overlap exclude using gist (
    doctor_id with =,
    tsrange(date + start_time, date + end_time, '[)') with &&
  )
);

create index if not exists availability_blocks_doctor_date_idx
  on public.availability_blocks (doctor_id, date);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Appointment columns for the queue
-- ─────────────────────────────────────────────────────────────────────────
alter table public.appointments
  add column if not exists block_id       uuid references public.availability_blocks(id) on delete restrict,
  add column if not exists queue_number   integer,
  add column if not exists estimated_time timestamptz,
  add column if not exists started_at     timestamptz,
  add column if not exists completed_at   timestamptz;

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('upcoming', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'));

-- Queue numbers are unique per block.
create unique index if not exists appointments_block_queue_number_key
  on public.appointments (block_id, queue_number) where block_id is not null;
-- A patient holds at most one active spot per block.
create unique index if not exists appointments_block_patient_active_key
  on public.appointments (block_id, patient_id) where status in ('waiting', 'in_progress');
-- A doctor sees one patient at a time per block.
create unique index if not exists appointments_block_one_in_progress_key
  on public.appointments (block_id) where status = 'in_progress';

create index if not exists appointments_block_id_idx on public.appointments (block_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Queue recalculation
-- ─────────────────────────────────────────────────────────────────────────
-- Re-derives estimated_time for every WAITING patient in a block, in queue
-- order, from the current real-world state:
--   * someone IN_PROGRESS -> next patient expected at
--       max(their start + avg minutes, now)   (so an overrun pushes everyone back)
--   * nobody in progress  -> next patient expected at
--       max(block start, now)                  (so an early finish pulls everyone forward)
-- then each following patient is avg_minutes_per_patient later.
-- Also refreshes the block's now_serving / now_serving_started_at.
create or replace function public.recalc_block_queue(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b         public.availability_blocks%rowtype;
  v_start   timestamptz;
  v_anchor  timestamptz;
  v_cur_q   integer;
  v_cur_at  timestamptz;
  r         record;
  i         integer := 0;
begin
  select * into b from public.availability_blocks where id = p_block_id;
  if not found then return; end if;

  v_start := (b.date + b.start_time) at time zone 'Asia/Manila';

  select queue_number, coalesce(started_at, now()) into v_cur_q, v_cur_at
  from public.appointments
  where block_id = b.id and status = 'in_progress'
  limit 1;

  if v_cur_q is not null then
    v_anchor := greatest(v_cur_at + make_interval(mins => b.avg_minutes_per_patient), now());
  else
    v_anchor := greatest(v_start, now());
  end if;

  for r in
    select id from public.appointments
    where block_id = b.id and status = 'waiting'
    order by queue_number
  loop
    update public.appointments
    set estimated_time = v_anchor + make_interval(mins => i * b.avg_minutes_per_patient)
    where id = r.id;
    i := i + 1;
  end loop;

  update public.availability_blocks
  set now_serving = v_cur_q, now_serving_started_at = v_cur_at
  where id = b.id
    and (now_serving is distinct from v_cur_q or now_serving_started_at is distinct from v_cur_at);
end;
$$;

revoke all on function public.recalc_block_queue(uuid) from public, anon, authenticated;

-- Lets the doctor's live-queue screen push estimates back while a
-- consultation runs over (no status change happens during an overrun, so
-- nothing else would trigger a recalculation). Only the block's own doctor.
create or replace function public.refresh_block_queue(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.availability_blocks where id = p_block_id and doctor_id = auth.uid()
  ) then
    raise exception 'Not your availability block.' using errcode = '42501';
  end if;
  perform public.recalc_block_queue(p_block_id);
end;
$$;

revoke all on function public.refresh_block_queue(uuid) from public, anon;
grant execute on function public.refresh_block_queue(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Booking (BEFORE INSERT on appointments)
-- ─────────────────────────────────────────────────────────────────────────
-- Clients book with a plain insert of { patient_id, block_id,
-- chief_complaint }. Everything else is derived here, under a row lock on
-- the block, so capacity can't be exceeded by concurrent bookings.
create or replace function public.queue_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.availability_blocks%rowtype;
begin
  if new.block_id is null then
    return new; -- legacy slot-based appointment, untouched
  end if;

  select * into b from public.availability_blocks where id = new.block_id for update;
  if not found then
    raise exception 'That availability block no longer exists.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = new.patient_id and role = 'patient') then
    raise exception 'Only patient accounts can book a queue spot.' using errcode = 'P0001';
  end if;

  if ((b.date + b.end_time) at time zone 'Asia/Manila') <= now() then
    raise exception 'This availability block has already ended.' using errcode = 'P0001';
  end if;

  if b.booked_count >= b.max_patients then
    raise exception 'This block is full — no spots left.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.appointments
    where block_id = b.id and patient_id = new.patient_id and status in ('waiting', 'in_progress')
  ) then
    raise exception 'You already have a spot in this block.' using errcode = 'P0001';
  end if;

  new.doctor_id        := b.doctor_id;
  new.appointment_date := b.date;
  new.time_slot        := ltrim(to_char(b.start_time, 'HH12:MI AM'), '0') || ' – ' || ltrim(to_char(b.end_time, 'HH12:MI AM'), '0');
  new.duration_minutes := b.avg_minutes_per_patient;
  new.status           := 'waiting';
  new.queue_number     := b.next_queue_number;
  new.estimated_time   := ((b.date + b.start_time) at time zone 'Asia/Manila')
                          + make_interval(mins => (b.next_queue_number - 1) * b.avg_minutes_per_patient);
  new.started_at       := null;
  new.completed_at     := null;
  if new.consultation_fee is null then
    select consultation_fee into new.consultation_fee
    from public.doctor_profiles where user_id = b.doctor_id;
  end if;

  update public.availability_blocks
  set booked_count      = booked_count + 1,
      next_queue_number = next_queue_number + 1
  where id = b.id;

  return new;
end;
$$;

drop trigger if exists trg_queue_before_insert on public.appointments;
create trigger trg_queue_before_insert
  before insert on public.appointments
  for each row execute function public.queue_before_insert();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Status changes (BEFORE UPDATE: validate; AFTER: bookkeeping)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.queue_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.block_id is null then
    if new.block_id is not null then
      raise exception 'An existing appointment can''t be moved into a queue block — book a new spot instead.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.block_id is distinct from old.block_id
     or new.queue_number is distinct from old.queue_number
     or new.patient_id   is distinct from old.patient_id
     or new.doctor_id    is distinct from old.doctor_id then
    raise exception 'Queue assignments can''t be changed.' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'waiting'     and new.status in ('in_progress', 'cancelled', 'no_show'))
      or (old.status = 'in_progress' and new.status in ('completed', 'waiting', 'no_show'))
    ) then
      raise exception 'Can''t change a % appointment to %.', replace(old.status, '_', ' '), replace(new.status, '_', ' ')
        using errcode = 'P0001';
    end if;

    if new.status = 'in_progress' then
      -- Friendly message; the unique index appointments_block_one_in_progress_key
      -- is the real guarantee if two requests race.
      if exists (
        select 1 from public.appointments
        where block_id = new.block_id and status = 'in_progress' and id <> new.id
      ) then
        raise exception 'Complete the current consultation before calling the next patient.' using errcode = 'P0001';
      end if;
      new.started_at := now();
    elsif new.status = 'waiting' then
      new.started_at := null; -- doctor put them back in the queue
    elsif new.status = 'completed' then
      new.completed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_queue_before_update on public.appointments;
create trigger trg_queue_before_update
  before update on public.appointments
  for each row execute function public.queue_before_update();

create or replace function public.queue_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalc_block_queue(new.block_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('waiting', 'in_progress') then
      update public.availability_blocks set booked_count = greatest(booked_count - 1, 0) where id = old.block_id;
    end if;
    perform public.recalc_block_queue(old.block_id);
    return old;
  end if;

  -- UPDATE of status. A cancellation frees the spot; a no-show doesn't
  -- (that time has already been spent).
  if new.status = 'cancelled' and old.status in ('waiting', 'in_progress') then
    update public.availability_blocks set booked_count = greatest(booked_count - 1, 0) where id = new.block_id;
  end if;
  perform public.recalc_block_queue(new.block_id);
  return new;
end;
$$;

drop trigger if exists trg_queue_after_insert on public.appointments;
create trigger trg_queue_after_insert
  after insert on public.appointments
  for each row when (new.block_id is not null)
  execute function public.queue_after_change();

-- Only fires on status changes, so recalc_block_queue's own estimated_time
-- updates don't re-trigger it.
drop trigger if exists trg_queue_after_status on public.appointments;
create trigger trg_queue_after_status
  after update of status on public.appointments
  for each row when (new.block_id is not null and old.status is distinct from new.status)
  execute function public.queue_after_change();

drop trigger if exists trg_queue_after_delete on public.appointments;
create trigger trg_queue_after_delete
  after delete on public.appointments
  for each row when (old.block_id is not null)
  execute function public.queue_after_change();

revoke all on function public.queue_before_insert()  from public, anon, authenticated;
revoke all on function public.queue_before_update()  from public, anon, authenticated;
revoke all on function public.queue_after_change()   from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Block creation guard (BEFORE INSERT on availability_blocks)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.availability_block_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_window_minutes integer;
begin
  -- Counters always start clean, whatever the client sent.
  new.booked_count           := 0;
  new.next_queue_number      := 1;
  new.now_serving            := null;
  new.now_serving_started_at := null;

  if ((new.date + new.end_time) at time zone 'Asia/Manila') <= now() then
    raise exception 'Can''t create an availability block in the past (%).', to_char(new.date, 'Dy, Mon DD')
      using errcode = 'P0001';
  end if;

  -- The planned queue has to fit inside the window; otherwise the last
  -- patients' estimated times would land after the block ends.
  v_window_minutes := extract(epoch from (new.end_time - new.start_time))::integer / 60;
  if new.max_patients * new.avg_minutes_per_patient > v_window_minutes then
    raise exception '% patients × % min = % min, which doesn''t fit in a % min window. Lower the patient cap or the minutes per patient.',
      new.max_patients, new.avg_minutes_per_patient,
      new.max_patients * new.avg_minutes_per_patient, v_window_minutes
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_availability_block_before_insert on public.availability_blocks;
create trigger trg_availability_block_before_insert
  before insert on public.availability_blocks
  for each row execute function public.availability_block_before_insert();

revoke all on function public.availability_block_before_insert() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Create one or many blocks atomically (specific date or recurring)
-- ─────────────────────────────────────────────────────────────────────────
-- Specific date: p_start_date = p_end_date, p_weekdays = null.
-- Recurring:     a date range + ISO weekdays (1 = Mon … 7 = Sun).
-- All-or-nothing: if any date overlaps an existing block, nothing is created.
-- SECURITY INVOKER, so the insert policy below still decides who may call it.
create or replace function public.create_availability_blocks(
  p_start_date   date,
  p_end_date     date,
  p_weekdays     integer[],
  p_start_time   time,
  p_end_time     time,
  p_max_patients integer,
  p_avg_minutes  integer
)
returns setof public.availability_blocks
language plpgsql
security invoker
set search_path = public
as $$
declare
  d       date;
  r       public.availability_blocks%rowtype;
  v_count integer := 0;
begin
  if p_end_date < p_start_date then
    raise exception 'The end date must be on or after the start date.' using errcode = 'P0001';
  end if;
  if p_end_date - p_start_date > 92 then
    raise exception 'You can create at most 3 months of blocks at a time.' using errcode = 'P0001';
  end if;

  for d in select generate_series(p_start_date, p_end_date, interval '1 day')::date loop
    continue when p_weekdays is not null and not (extract(isodow from d)::integer = any (p_weekdays));
    begin
      insert into public.availability_blocks
        (doctor_id, date, start_time, end_time, max_patients, avg_minutes_per_patient)
      values
        (auth.uid(), d, p_start_time, p_end_time, p_max_patients, p_avg_minutes)
      returning * into r;
    exception when exclusion_violation then
      raise exception 'This overlaps an availability block you already have on %. Nothing was created.',
        to_char(d, 'Dy, Mon DD, YYYY') using errcode = 'P0001';
    end;
    v_count := v_count + 1;
    return next r;
  end loop;

  if v_count = 0 then
    raise exception 'None of the selected weekdays fall within that date range.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.create_availability_blocks(date, date, integer[], time, time, integer, integer) from public, anon;
grant execute on function public.create_availability_blocks(date, date, integer[], time, time, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Row-level security
-- ─────────────────────────────────────────────────────────────────────────
alter table public.availability_blocks enable row level security;
revoke all on public.availability_blocks from anon;

-- Signed-in users can browse blocks (patients need this to book and to
-- see "Now Serving"). Not visible to logged-out visitors.
drop policy if exists "blocks: signed-in users read" on public.availability_blocks;
create policy "blocks: signed-in users read"
on public.availability_blocks for select
to authenticated
using (true);

drop policy if exists "blocks: doctors create own" on public.availability_blocks;
create policy "blocks: doctors create own"
on public.availability_blocks for insert
to authenticated
with check (
  doctor_id = auth.uid()
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'doctor')
);

-- Only empty blocks can be removed. (A block that ever had a booking,
-- even a cancelled one, is also kept by the appointments FK, for history.)
drop policy if exists "blocks: doctors delete own empty" on public.availability_blocks;
create policy "blocks: doctors delete own empty"
on public.availability_blocks for delete
to authenticated
using (doctor_id = auth.uid() and booked_count = 0);

-- No UPDATE policy on purpose: booked_count / next_queue_number /
-- now_serving are maintained by the triggers above only.

-- Patients cancel their own waiting queue spot. (The pre-existing
-- "patient cancels own" policy only covers legacy 'upcoming' rows.)
drop policy if exists "appointments: patient cancels own queue spot" on public.appointments;
create policy "appointments: patient cancels own queue spot"
on public.appointments for update
to authenticated
using (auth.uid() = patient_id and status = 'waiting')
with check (auth.uid() = patient_id and status = 'cancelled');

-- ─────────────────────────────────────────────────────────────────────────
-- 9. Realtime (live "Now Serving" / estimate updates)
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'availability_blocks'
  ) then
    alter publication supabase_realtime add table public.availability_blocks;
  end if;
end $$;

notify pgrst, 'reload schema';
