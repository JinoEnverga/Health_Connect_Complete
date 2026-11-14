-- 014_prescription_print_lock.sql
-- E-prescription print locking (panel requirement: "Rx locking / one-time print")
-- with a printed pharmacist dispensing ledger for partial fills.
--
-- * Patients can print an official copy of a prescription a limited number of
--   times: 1 + the highest refills_allowed on its medication lines
--   (copy 1 = Original, the rest = Refill copies).
-- * Each print goes through record_prescription_print(), which locks the row,
--   checks the allowance and counts the print BEFORE the browser prints, so
--   the limit holds across tabs, sessions and devices.
-- * The prescribing doctor can grant one extra print at a time (printer jam,
--   ink failure, ...) with authorize_prescription_reprint(), which requires a
--   reason and is logged.
-- * Nobody can change the print counters directly: a trigger rejects any
--   change that doesn't come from those two functions.
-- * Partial fills are recorded by pharmacists on the paper copy itself
--   (ledger printed at the bottom), because outside pharmacies have no
--   HealthConnect account. The prescribed quantity per line is
--   prescription_medications.quantity.


-- 1. Print-tracking columns ---------------------------------------------------
alter table public.prescriptions
  add column if not exists print_count         integer not null default 0,
  add column if not exists max_prints          integer not null default 1,
  add column if not exists reprints_authorized integer not null default 0,
  add column if not exists first_printed_at    timestamptz,
  add column if not exists last_printed_at     timestamptz,
  add column if not exists reprint_reason      text;

alter table public.prescriptions
  add column if not exists is_printed boolean generated always as (print_count > 0) stored;

alter table public.prescriptions drop constraint if exists prescriptions_print_count_check;
alter table public.prescriptions add constraint prescriptions_print_count_check
  check (print_count >= 0 and max_prints >= 1 and reprints_authorized >= 0 and print_count <= max_prints);

-- 2. Audit log of prints and reprint authorizations ---------------------------
create table if not exists public.prescription_print_log (
  id              bigint generated always as identity primary key,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  event           text not null check (event in ('printed', 'reprint_authorized')),
  copy_number     integer,
  max_prints      integer,
  copy_label      text,
  actor_id        uuid references public.profiles(id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now()
);
create index if not exists prescription_print_log_rx_idx
  on public.prescription_print_log (prescription_id, created_at);

alter table public.prescription_print_log enable row level security;
revoke insert, update, delete, truncate on public.prescription_print_log from anon, authenticated;
grant select on public.prescription_print_log to authenticated;

drop policy if exists "print log: participants and admins read" on public.prescription_print_log;
create policy "print log: participants and admins read"
on public.prescription_print_log for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id
      and auth.uid() in (p.doctor_id, p.patient_id)
  )
);

-- 3. Guard: print counters only change through the functions below ----------
create or replace function public.prescriptions_guard_print_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.print_count         := 0;
    new.max_prints          := 1;
    new.reprints_authorized := 0;
    new.first_printed_at    := null;
    new.last_printed_at     := null;
    new.reprint_reason      := null;
    return new;
  end if;

  if (new.print_count, new.max_prints, new.reprints_authorized,
      new.first_printed_at, new.last_printed_at, new.reprint_reason)
     is distinct from
     (old.print_count, old.max_prints, old.reprints_authorized,
      old.first_printed_at, old.last_printed_at, old.reprint_reason)
     and coalesce(current_setting('hc.rx_print_ok', true), '') <> 'on'
  then
    raise exception 'Print counters can only be changed by printing or by an authorized reprint.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prescriptions_guard_print_columns on public.prescriptions;
create trigger prescriptions_guard_print_columns
before insert or update on public.prescriptions
for each row execute function public.prescriptions_guard_print_columns();

-- 4. Keep max_prints = 1 + max(refills) + authorized reprints -----------------
create or replace function public.recalc_prescription_max_prints(p_prescription_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('hc.rx_print_ok', true), '');
begin
  perform set_config('hc.rx_print_ok', 'on', true);
  update public.prescriptions p
     set max_prints = greatest(
           1 + coalesce((select max(m.refills_allowed) from public.prescription_medications m
                         where m.prescription_id = p.id), 0)
             + p.reprints_authorized,
           p.print_count)
   where p.id = p_prescription_id;
  perform set_config('hc.rx_print_ok', v_prev, true);
end;
$$;
revoke all on function public.recalc_prescription_max_prints(uuid) from public, anon, authenticated;

create or replace function public.prescription_medications_recalc_prints()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalc_prescription_max_prints(old.prescription_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.prescription_id is distinct from old.prescription_id) then
    perform public.recalc_prescription_max_prints(new.prescription_id);
  end if;
  return null;
end;
$$;

drop trigger if exists prescription_medications_recalc_prints on public.prescription_medications;
create trigger prescription_medications_recalc_prints
after insert or delete or update of refills_allowed, prescription_id on public.prescription_medications
for each row execute function public.prescription_medications_recalc_prints();

-- Backfill existing prescriptions.
do $$
declare r record;
begin
  for r in select id from public.prescriptions loop
    perform public.recalc_prescription_max_prints(r.id);
  end loop;
end $$;

-- 5. Patient: record one official print --------------------------------------
create or replace function public.record_prescription_print(p_prescription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_rx    public.prescriptions;
  v_copy  integer;
  v_label text;
  v_refill_copies integer;
  v_doctor text;
begin
  if v_uid is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  select * into v_rx from public.prescriptions where id = p_prescription_id for update;
  if not found or v_rx.patient_id <> v_uid then
    raise exception 'Prescription not found.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.prescription_medications where prescription_id = v_rx.id) then
    raise exception 'This prescription has no medication lines to print.';
  end if;
  if v_rx.status <> 'active' then
    raise exception 'This prescription is % and can no longer be printed.', v_rx.status;
  end if;
  if v_rx.expires_at is not null and v_rx.expires_at < now() then
    raise exception 'This prescription expired on % and can no longer be printed.',
      to_char(v_rx.expires_at at time zone 'Asia/Manila', 'Mon DD, YYYY');
  end if;
  if v_rx.print_count >= v_rx.max_prints then
    select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), 'your doctor')
      into v_doctor from public.profiles where id = v_rx.doctor_id;
    raise exception 'All % allowed print(s) of this prescription have been used. Ask Dr. % to authorize a reprint if your copy was damaged or lost.',
      v_rx.max_prints, coalesce(v_doctor, 'your doctor');
  end if;

  v_copy := v_rx.print_count + 1;
  v_refill_copies := v_rx.max_prints - v_rx.reprints_authorized - 1;
  v_label := case
    when v_copy = 1 then 'Original'
    when v_copy <= 1 + v_refill_copies then 'Refill Copy'
    else 'Authorized Reprint'
  end;

  perform set_config('hc.rx_print_ok', 'on', true);
  update public.prescriptions
     set print_count      = v_copy,
         first_printed_at = coalesce(first_printed_at, now()),
         last_printed_at  = now()
   where id = v_rx.id;
  perform set_config('hc.rx_print_ok', '', true);

  insert into public.prescription_print_log
    (prescription_id, event, copy_number, max_prints, copy_label, actor_id)
  values (v_rx.id, 'printed', v_copy, v_rx.max_prints, v_label, v_uid);

  return jsonb_build_object(
    'copy_number', v_copy,
    'max_prints',  v_rx.max_prints,
    'copy_label',  v_label,
    'remaining',   v_rx.max_prints - v_copy,
    'printed_at',  now()
  );
end;
$$;
revoke all on function public.record_prescription_print(uuid) from public, anon;
grant execute on function public.record_prescription_print(uuid) to authenticated;

-- 6. Doctor: authorize one extra print ---------------------------------------
create or replace function public.authorize_prescription_reprint(p_prescription_id uuid, p_reason text)
returns public.prescriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_rx     public.prescriptions;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  select * into v_rx from public.prescriptions where id = p_prescription_id for update;
  if not found or v_rx.doctor_id <> v_uid then
    raise exception 'Prescription not found.' using errcode = 'P0002';
  end if;
  if length(v_reason) < 5 then
    raise exception 'Please give a reason for the reprint (at least 5 characters).';
  end if;
  if length(v_reason) > 500 then
    raise exception 'The reason is too long (500 characters max).';
  end if;
  if v_rx.status <> 'active' then
    raise exception 'This prescription is % — a reprint can''t be authorized.', v_rx.status;
  end if;
  if v_rx.expires_at is not null and v_rx.expires_at < now() then
    raise exception 'This prescription has expired — issue a new one instead.';
  end if;
  if v_rx.print_count < v_rx.max_prints then
    raise exception 'The patient still has % print(s) left — no reprint is needed yet.',
      v_rx.max_prints - v_rx.print_count;
  end if;

  perform set_config('hc.rx_print_ok', 'on', true);
  update public.prescriptions
     set reprints_authorized = reprints_authorized + 1,
         max_prints          = max_prints + 1,
         reprint_reason      = v_reason
   where id = v_rx.id
  returning * into v_rx;
  perform set_config('hc.rx_print_ok', '', true);

  insert into public.prescription_print_log
    (prescription_id, event, copy_number, max_prints, copy_label, actor_id, reason)
  values (v_rx.id, 'reprint_authorized', v_rx.print_count + 1, v_rx.max_prints, 'Authorized Reprint', v_uid, v_reason);

  return v_rx;
end;
$$;
revoke all on function public.authorize_prescription_reprint(uuid, text) from public, anon;
grant execute on function public.authorize_prescription_reprint(uuid, text) to authenticated;

-- 7. Live updates: print button state follows across tabs/devices ------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prescriptions') then
    alter publication supabase_realtime add table public.prescriptions;
  end if;
end $$;

notify pgrst, 'reload schema';

