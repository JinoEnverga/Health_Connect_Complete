-- 017_mobile_contract_part_c.sql
-- Closes the database gaps in the mobile team's brief (prompt_cs.txt, part C),
-- approved by the CS team lead on 27 Nov 2026. Additive only: no column is
-- renamed or dropped, no CHECK vocabulary changes, no RLS policy is weakened.
--
--   C1  expire stale prescriptions nightly (second cron entry, 16:05 UTC)
--   C2  audit_logs, announcements, profiles.is_active + admin_set_user_active,
--       profiles.last_login_at + update_last_login()
--   C3  one active prescription per patient (unique index)
--   C4  views obey RLS and are closed to anon; email lookup closed to anon;
--       sign-up can no longer choose a privileged role; users can no longer
--       change their own role; trigger functions not callable over the API;
--       specializations readable
--   C5  legacy time slots normalised; vito's slot ranges -> 30-minute slots;
--       Pharmacy Mode recorded in schema_migrations
-- Not done on purpose: the ai-scans bucket stays public until mobile has
-- switched to signed URLs (brief C4).

-- ─────────────────────────────────────────────────────────────────────────
-- C1. Prescriptions never stay 'active' after they expire
-- ─────────────────────────────────────────────────────────────────────────
update public.prescriptions set status = 'expired'
 where status = 'active' and expires_at < now();

select cron.unschedule(jobid) from cron.job where jobname = 'expire-prescriptions';
select cron.schedule(
  'expire-prescriptions',
  '5 16 * * *',   -- 00:05 Manila, next to close-past-appointments
  $$update public.prescriptions set status = 'expired' where status = 'active' and expires_at < now()$$
);

-- ─────────────────────────────────────────────────────────────────────────
-- C2. Objects the mobile app already calls
-- ─────────────────────────────────────────────────────────────────────────

-- audit_logs: mobile inserts (user_id, action, table_name, record_id)
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  action     text not null,
  table_name text,
  record_id  text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon;
grant select, insert on public.audit_logs to authenticated;
drop policy if exists "audit_logs: users write their own" on public.audit_logs;
create policy "audit_logs: users write their own" on public.audit_logs
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "audit_logs: admins read" on public.audit_logs;
create policy "audit_logs: admins read" on public.audit_logs
  for select to authenticated using (public.is_admin());

-- announcements: mobile inserts (created_by, title, content, target_roles,
-- is_active) and reads * ordered by published_at desc
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  content      text not null,
  target_roles text[] not null default '{}',
  is_active    boolean not null default true,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  expires_at   timestamptz
);
create index if not exists announcements_published_idx on public.announcements (published_at desc);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon;
grant select, insert, update, delete on public.announcements to authenticated;
drop policy if exists "announcements: admins manage" on public.announcements;
create policy "announcements: admins manage" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Everyone signed in reads live announcements meant for their role
-- (empty target_roles or 'all' = everyone).
drop policy if exists "announcements: users read live ones for their role" on public.announcements;
create policy "announcements: users read live ones for their role" on public.announcements
  for select to authenticated
  using (is_active
         and (expires_at is null or expires_at > now())
         and (cardinality(target_roles) = 0
              or 'all' = any(target_roles)
              or public.account_role(auth.uid()) = any(target_roles)));
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements') then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;

-- Account access switch
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists last_login_at timestamptz;

-- Blocks or restores sign-in. banned_until is what Supabase Auth checks at
-- sign-in and token refresh, on the web portal and mobile alike.
create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change account access' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot block your own account' using errcode = '22023';
  end if;
  update public.profiles set is_active = p_active, updated_at = now() where id = p_user_id;
  if not found then
    raise exception 'No such user' using errcode = 'P0002';
  end if;
  update auth.users
     set banned_until = case when p_active then null else now() + interval '100 years' end
   where id = p_user_id;
end;
$$;
revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- Last login (mobile calls it after sign-in; the web does too).
create or replace function public.update_last_login()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_login_at = now() where id = auth.uid();
$$;
-- Older mobile builds pass the user id; only the caller's own row is touched.
create or replace function public.update_last_login(user_uuid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_login_at = now() where id = auth.uid() and id = user_uuid;
$$;
revoke all on function public.update_last_login() from public, anon;
revoke all on function public.update_last_login(uuid) from public, anon;
grant execute on function public.update_last_login() to authenticated;
grant execute on function public.update_last_login(uuid) to authenticated;

-- Roles are assigned by an admin (self sign-up only creates patients, see C4).
create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;
  if p_role not in ('patient', 'doctor', 'bhw', 'admin') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '22023';
  end if;
  update public.profiles set role = p_role, updated_at = now() where id = p_user_id;
  if not found then
    raise exception 'No such user' using errcode = 'P0002';
  end if;
  -- The role shell the rest of the app expects (same as handle_new_user).
  if p_role = 'doctor' then
    insert into public.doctor_profiles (user_id, specialization, license_number)
    values (p_user_id, 'General Practice', 'PENDING-' || gen_random_uuid()::text)
    on conflict (user_id) do nothing;
  elsif p_role = 'patient' then
    insert into public.patient_profiles (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  end if;
end;
$$;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- C3. One active prescription per patient (the real guard; C1 runs first)
-- ─────────────────────────────────────────────────────────────────────────
create unique index if not exists prescriptions_one_active
  on public.prescriptions (patient_id) where status = 'active';

-- ─────────────────────────────────────────────────────────────────────────
-- C4. Security
-- ─────────────────────────────────────────────────────────────────────────

-- Views obey row-level security, and nobody writes through them.
alter view public.doctor_directory    set (security_invoker = on);
alter view public.appointment_details set (security_invoker = on);
alter view public.latest_vitals       set (security_invoker = on);
revoke all on public.doctor_directory, public.appointment_details, public.latest_vitals from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.doctor_directory, public.appointment_details, public.latest_vitals from authenticated;

-- No email -> user id lookup without signing in.
revoke execute on function public.get_patient_id_by_email(text) from public, anon;
grant execute on function public.get_patient_id_by_email(text) to authenticated;
alter function public.get_patient_id_by_email(text) set search_path = public;

-- Sign-up can no longer choose its own role: the role comes only from
-- raw_app_meta_data, which only the service role (Admin API) can set.
-- first_name / last_name / phone keep coming from raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce(new.raw_app_meta_data->>'role', 'patient');
begin
  if v_role not in ('patient', 'doctor', 'bhw', 'admin') then
    v_role := 'patient';
  end if;

  insert into public.profiles (id, email, role, first_name, last_name, phone)
  values (
    new.id,
    new.email,
    v_role,
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    nullif(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;

  if v_role = 'doctor' then
    insert into public.doctor_profiles (user_id, specialization, license_number)
    values (new.id, 'General Practice', 'PENDING-' || gen_random_uuid()::text)
    on conflict (user_id) do nothing;
  else
    insert into public.patient_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$function$;

-- Users could change their own role (the "update own row" policy has no
-- column limits). Role and account access now change only through the
-- admin functions above, which run as the table owner.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'Role and account access can only be changed by an admin.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
before update on public.profiles
for each row execute function public.profiles_guard_privileged_columns();

-- Trigger functions are not API endpoints (triggers keep firing).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prescription_medications_recalc_prints() from public, anon, authenticated;
revoke execute on function public.profiles_guard_privileged_columns() from public, anon, authenticated;

-- The specializations list had RLS on and no policy, so it read as empty.
drop policy if exists "specializations: everyone reads" on public.specializations;
create policy "specializations: everyone reads" on public.specializations for select using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- C5. Housekeeping
-- ─────────────────────────────────────────────────────────────────────────

-- Time slots: canonical "9:00 AM" (ASCII space, no leading zero, one start
-- time, never a range) on slot bookings. Queue bookings (block_id set) keep
-- their block range: they are web-only and booked_slots ignores them.
update public.appointments
   set time_slot = regexp_replace(
         btrim(regexp_replace(replace(replace(time_slot, chr(8239), ' '), chr(160), ' '), '\s+', ' ', 'g')),
         '^0', '')
 where block_id is null and time_slot ~ ('[' || chr(8239) || chr(160) || ']|^0');
update public.appointments
   set time_slot = regexp_replace(substring(time_slot from '^\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])'), '^0', '')
 where block_id is null and time_slot ~ '\d{1,2}:\d{2}\s*[AaPp][Mm]\s*[-–]';

-- vito@healthconnect.ph published ranges; expand to single 30-minute slots.
update public.doctor_profiles dp
   set available_time_slots = array[
         '9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM',
         '1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM']
  from public.profiles p
 where p.id = dp.user_id and p.email = 'vito@healthconnect.ph'
   and dp.available_time_slots = array['09:00 AM - 12:00 PM', '01:00 PM - 04:00 PM'];

-- Record the Pharmacy Mode migration (applied by mobile in the SQL editor)
-- and this one, so a future `supabase db push` won't try to re-create them.
insert into supabase_migrations.schema_migrations (version, name, created_by)
values ('20261127000100', 'pharmacy_mode_patient_dispense (applied in SQL editor, recorded by CS)', 'cs-web'),
       ('20261127000200', 'cs_017_mobile_contract_part_c', 'cs-web')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
