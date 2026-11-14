-- Panel recommendations #2 (call history: join / cancel / end) and
-- #3 (reliable real-time chat alongside calls).
--
-- Model:
--   consultation_sessions  (existing, shared with the mobile app) — one
--                          "consultation room" per appointment. Chat
--                          messages hang off it.
--   chat_logs              (existing, shared with mobile) — now the web
--                          chat too, so messages persist, survive reloads
--                          and dropped connections, and sync between web
--                          and mobile.
--   call_logs   (new)      — one row per call attempt: who started it,
--                          when it was answered, how it ended, duration.
--   call_events (new)      — the timeline of each call: initiated, joined,
--                          cancelled, ended, missed, failed, with timestamps.
--
-- Clients never write call_logs / call_events directly: they call
-- log_call_event(), which validates the caller and applies the state
-- machine atomically (SELECT ... FOR UPDATE on the open call).
--
-- Also locks the WebRTC signaling channels ("call:<appointment id>") to the
-- appointment's own doctor and patient via Realtime Authorization, so
-- nobody else can listen in on or inject call signaling / presence.
--
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Call history tables
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.call_logs (
  id               uuid primary key default gen_random_uuid(),
  appointment_id   uuid not null references public.appointments(id) on delete cascade,
  session_id       uuid references public.consultation_sessions(id) on delete set null,
  doctor_id        uuid not null references public.profiles(id) on delete cascade,
  patient_id       uuid not null references public.profiles(id) on delete cascade,
  initiated_by     uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'ringing'
                   check (status in ('ringing', 'active', 'ended', 'cancelled', 'missed')),
  initiated_at     timestamptz not null default now(),
  answered_at      timestamptz,
  ended_at         timestamptz,
  ended_by         uuid references public.profiles(id) on delete set null,
  duration_seconds integer,
  end_reason       text
);

create index if not exists call_logs_appointment_idx on public.call_logs (appointment_id, initiated_at desc);
create index if not exists call_logs_doctor_idx      on public.call_logs (doctor_id, initiated_at desc);
create index if not exists call_logs_patient_idx     on public.call_logs (patient_id, initiated_at desc);
-- At most one open (ringing/active) call per appointment.
create unique index if not exists call_logs_one_open_per_appointment
  on public.call_logs (appointment_id) where status in ('ringing', 'active');

create table if not exists public.call_events (
  id             bigint generated always as identity primary key,
  call_id        uuid not null references public.call_logs(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete set null,
  event          text not null
                 check (event in ('initiated', 'joined', 'rejoined', 'cancelled', 'ended', 'missed', 'failed')),
  detail         text,
  created_at     timestamptz not null default now()
);

create index if not exists call_events_call_idx on public.call_events (call_id, created_at);

alter table public.call_logs   enable row level security;
alter table public.call_events enable row level security;
revoke all on public.call_logs, public.call_events from anon;

-- Read-only for the two participants (and admins, for the audit log).
drop policy if exists "call_logs: participants and admins read" on public.call_logs;
create policy "call_logs: participants and admins read"
on public.call_logs for select
to authenticated
using (auth.uid() in (doctor_id, patient_id) or public.is_admin());

drop policy if exists "call_events: participants and admins read" on public.call_events;
create policy "call_events: participants and admins read"
on public.call_events for select
to authenticated
using (exists (
  select 1 from public.call_logs c
  where c.id = call_events.call_id
    and (auth.uid() in (c.doctor_id, c.patient_id) or public.is_admin())
));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Consultation room (shared with mobile): get or create per appointment
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_or_create_consultation_session(p_appointment_id uuid)
returns public.consultation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.appointments%rowtype;
  s public.consultation_sessions%rowtype;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if not found or auth.uid() is null or auth.uid() not in (a.doctor_id, a.patient_id) then
    raise exception 'Not your appointment.' using errcode = '42501';
  end if;

  insert into public.consultation_sessions (appointment_id, patient_id, doctor_id)
  values (a.id, a.patient_id, a.doctor_id)
  on conflict (appointment_id) do nothing;

  select * into s from public.consultation_sessions where appointment_id = a.id;
  return s;
end;
$$;

revoke all on function public.get_or_create_consultation_session(uuid) from public, anon;
grant execute on function public.get_or_create_consultation_session(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Call state machine
-- ─────────────────────────────────────────────────────────────────────────
-- p_event, sent by the client:
--   'start'  — I opened the call (pressed Start Call / Join)
--   'leave'  — I hung up, went back, or closed the page
--   'failed' — my connection failed (logged; doesn't end the call)
--
-- Resulting history:
--   nobody in the call yet        + start -> new call 'ringing'  [initiated]
--   ringing, other person          + start -> 'active'           [joined]
--   I'm already in it              + start ->                    [rejoined]
--   ringing, I'm the initiator     + leave -> 'cancelled'        [cancelled]
--   active                         + leave -> 'ended' + duration [ended]
-- Calls left open by a crashed browser are closed on the next start:
-- ringing > 5 min -> 'missed', active > 4 h -> 'ended' (stale).
create or replace function public.log_call_event(
  p_appointment_id uuid,
  p_event          text,
  p_detail         text default null
)
returns public.call_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  a      public.appointments%rowtype;
  c      public.call_logs%rowtype;
  s      public.consultation_sessions%rowtype;
  v_me   uuid := auth.uid();
  v_in   boolean;
begin
  if p_event not in ('start', 'leave', 'failed') then
    raise exception 'Unknown call event %.', p_event using errcode = 'P0001';
  end if;

  select * into a from public.appointments where id = p_appointment_id;
  if not found or v_me is null or v_me not in (a.doctor_id, a.patient_id) then
    raise exception 'Not your appointment.' using errcode = '42501';
  end if;

  -- Serialize all call bookkeeping for this appointment.
  perform pg_advisory_xact_lock(hashtextextended('call:' || p_appointment_id::text, 0));

  -- Close out calls abandoned by a crashed tab / lost connection.
  for c in
    select * from public.call_logs
    where appointment_id = a.id and status in ('ringing', 'active')
      and ((status = 'ringing' and initiated_at < now() - interval '5 minutes')
        or (status = 'active'  and answered_at  < now() - interval '4 hours'))
  loop
    if c.status = 'ringing' then
      update public.call_logs set status = 'missed', ended_at = now(), end_reason = 'No answer'
      where id = c.id;
      insert into public.call_events (call_id, appointment_id, user_id, event, detail)
      values (c.id, a.id, null, 'missed', 'No one joined within 5 minutes');
    else
      update public.call_logs
      set status = 'ended', ended_at = now(), end_reason = 'Connection lost',
          duration_seconds = extract(epoch from (now() - answered_at))::integer
      where id = c.id;
      insert into public.call_events (call_id, appointment_id, user_id, event, detail)
      values (c.id, a.id, null, 'ended', 'Closed automatically (connection lost)');
    end if;
  end loop;

  select * into c from public.call_logs
  where appointment_id = a.id and status in ('ringing', 'active')
  for update;

  if p_event = 'start' then
    s := public.get_or_create_consultation_session(a.id);

    if c.id is null then
      insert into public.call_logs (appointment_id, session_id, doctor_id, patient_id, initiated_by)
      values (a.id, s.id, a.doctor_id, a.patient_id, v_me)
      returning * into c;
      insert into public.call_events (call_id, appointment_id, user_id, event, detail)
      values (c.id, a.id, v_me, 'initiated', p_detail);
      return c;
    end if;

    v_in := v_me = c.initiated_by or exists (
      select 1 from public.call_events
      where call_id = c.id and user_id = v_me and event in ('initiated', 'joined', 'rejoined')
    );

    if c.status = 'ringing' and not v_in then
      update public.call_logs set status = 'active', answered_at = now()
      where id = c.id returning * into c;
      insert into public.call_events (call_id, appointment_id, user_id, event, detail)
      values (c.id, a.id, v_me, 'joined', p_detail);
      update public.consultation_sessions
      set status = 'active', started_at = coalesce(started_at, now()), ended_at = null
      where id = s.id;
    else
      insert into public.call_events (call_id, appointment_id, user_id, event, detail)
      values (c.id, a.id, v_me, 'rejoined', p_detail);
    end if;
    return c;
  end if;

  if p_event = 'failed' then
    if c.id is not null then
      insert into public.call_events (call_id, appointment_id, user_id, event, detail)
      values (c.id, a.id, v_me, 'failed', left(p_detail, 300));
    end if;
    return c;
  end if;

  -- 'leave'
  if c.id is null then
    return null; -- nothing open (e.g. the other side already ended it)
  end if;

  if c.status = 'ringing' then
    update public.call_logs
    set status = 'cancelled', ended_at = now(), ended_by = v_me,
        end_reason = coalesce(p_detail, 'Cancelled before anyone answered')
    where id = c.id returning * into c;
    insert into public.call_events (call_id, appointment_id, user_id, event, detail)
    values (c.id, a.id, v_me, 'cancelled', p_detail);
  else
    update public.call_logs
    set status = 'ended', ended_at = now(), ended_by = v_me,
        duration_seconds = extract(epoch from (now() - answered_at))::integer,
        end_reason = coalesce(p_detail, 'Hung up')
    where id = c.id returning * into c;
    insert into public.call_events (call_id, appointment_id, user_id, event, detail)
    values (c.id, a.id, v_me, 'ended', p_detail);
    update public.consultation_sessions
    set status = 'ended', ended_at = now(),
        duration_seconds = coalesce(duration_seconds, 0) + coalesce(c.duration_seconds, 0)
    where appointment_id = a.id;
  end if;
  return c;
end;
$$;

revoke all on function public.log_call_event(uuid, text, text) from public, anon;
grant execute on function public.log_call_event(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Chat (chat_logs, shared with mobile)
-- ─────────────────────────────────────────────────────────────────────────
-- The old single "ALL" policy let a participant insert messages under the
-- other person's sender_id and rewrite any message. Split it so:
--   * participants read the conversation,
--   * you can only send as yourself,
--   * the only change allowed afterwards is marking messages read
--     (enforced by the trigger below).
drop policy if exists "chat_logs: session participants only" on public.chat_logs;

drop policy if exists "chat_logs: participants read" on public.chat_logs;
create policy "chat_logs: participants read"
on public.chat_logs for select
to authenticated
using (exists (
  select 1 from public.consultation_sessions s
  where s.id = chat_logs.session_id and auth.uid() in (s.patient_id, s.doctor_id)
));

drop policy if exists "chat_logs: participants send as themselves" on public.chat_logs;
create policy "chat_logs: participants send as themselves"
on public.chat_logs for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.consultation_sessions s
    where s.id = chat_logs.session_id and auth.uid() in (s.patient_id, s.doctor_id)
  )
);

drop policy if exists "chat_logs: participants mark read" on public.chat_logs;
create policy "chat_logs: participants mark read"
on public.chat_logs for update
to authenticated
using (exists (
  select 1 from public.consultation_sessions s
  where s.id = chat_logs.session_id and auth.uid() in (s.patient_id, s.doctor_id)
));

create or replace function public.chat_logs_only_read_flag_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.session_id   is distinct from old.session_id
     or new.sender_id    is distinct from old.sender_id
     or new.message_type is distinct from old.message_type
     or new.content      is distinct from old.content
     or new.file_url     is distinct from old.file_url
     or new.sent_at      is distinct from old.sent_at then
    raise exception 'Chat messages can''t be edited.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chat_logs_only_read_flag_changes on public.chat_logs;
create trigger trg_chat_logs_only_read_flag_changes
  before update on public.chat_logs
  for each row execute function public.chat_logs_only_read_flag_changes();

revoke all on function public.chat_logs_only_read_flag_changes() from public, anon, authenticated;

-- Server clock decides message order (client clocks drift); length cap.
create or replace function public.chat_logs_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.sent_at := now();
  new.is_read := false;
  if length(new.content) > 2000 then
    raise exception 'Messages can be at most 2000 characters.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chat_logs_before_insert on public.chat_logs;
create trigger trg_chat_logs_before_insert
  before insert on public.chat_logs
  for each row execute function public.chat_logs_before_insert();

revoke all on function public.chat_logs_before_insert() from public, anon, authenticated;

create index if not exists chat_logs_session_sent_idx on public.chat_logs (session_id, sent_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Realtime
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_logs') then
    alter publication supabase_realtime add table public.call_logs;
  end if;
  -- chat_logs is already published (used by mobile).
end $$;

-- Private signaling channels: "call:<appointment id>" is usable only by
-- that appointment's doctor and patient (broadcast + presence). The web
-- client joins it with { private: true }.
drop policy if exists "call channel: participants receive" on realtime.messages;
create policy "call channel: participants receive"
on realtime.messages for select
to authenticated
using (
  realtime.topic() like 'call:%'
  and exists (
    select 1 from public.appointments a
    where a.id::text = split_part(realtime.topic(), ':', 2)
      and auth.uid() in (a.doctor_id, a.patient_id)
  )
);

drop policy if exists "call channel: participants send" on realtime.messages;
create policy "call channel: participants send"
on realtime.messages for insert
to authenticated
with check (
  realtime.topic() like 'call:%'
  and exists (
    select 1 from public.appointments a
    where a.id::text = split_part(realtime.topic(), ':', 2)
      and auth.uid() in (a.doctor_id, a.patient_id)
  )
);

notify pgrst, 'reload schema';
