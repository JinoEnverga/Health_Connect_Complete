-- Replaces PIN-based prescription verification with birth-year-based
-- verification, and adds DB-level rate limiting.
--
-- ** READ BEFORE RUNNING **
-- I don't have credentials to your Supabase project from this repo (only
-- the public anon key is checked in, in src/lib/supabase.js, and it can't
-- run DDL). This file is not applied automatically — run it yourself in
-- Project -> SQL Editor. I also can't see the *current* body of
-- verify_prescription (it isn't in this repo), so the function below is a
-- best-effort reconstruction based only on what the frontend actually reads
-- (src/pages/verify/VerifyRx.jsx: data.success / data.error /
-- data.prescription / data.doctor / data.patient) and the table columns
-- referenced across the app. Please diff it against what's really in your
-- database before running, in case the live version does more than what's
-- observable from the client.
--
-- Rate limiting is enforced HERE, in Postgres, on purpose: the anon key
-- used by the frontend is public (shipped in the JS bundle), so anyone can
-- call this RPC directly over HTTP. Throttling only in the React component
-- would not stop that.
--
-- By design, this endpoint has exactly one job: correct birth year on this
-- link -> instantly dispensed, no exceptions, whoever opens it. There's no
-- "preview" branch here on purpose — patients view their own prescription
-- separately and non-destructively via get_own_prescription_details (see
-- 003_own_prescription_view.sql), so this one stays simple. To reset a
-- prescription you've consumed while testing:
--   update public.prescriptions
--   set status = 'active', dispensed_at = null,
--       failed_verify_attempts = 0, verify_locked_until = null
--   where verification_token = '<paste the token from its URL>';

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Rate-limit bookkeeping (additive, safe to run even with existing rows)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.prescriptions
  add column if not exists failed_verify_attempts integer not null default 0;
alter table public.prescriptions
  add column if not exists verify_locked_until timestamptz;

-- Renaming the existing verified-count column now that it no longer tracks
-- PIN verifications specifically. Skipped harmlessly if already renamed or
-- if your column is actually named something else — check first with:
--   select column_name from information_schema.columns
--   where table_name = 'prescriptions';
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prescriptions' and column_name = 'pin_verified_count'
  ) then
    alter table public.prescriptions rename column pin_verified_count to verified_count;
  end if;
end $$;

alter table public.prescriptions
  add column if not exists verified_count integer not null default 0;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Find and remove the old random-PIN generator.
-- ─────────────────────────────────────────────────────────────────────────
-- I can't see this object's name from the client repo. Run this to find it:
--
--   select tgname, pg_get_triggerdef(oid)
--   from pg_trigger
--   where tgrelid = 'public.prescriptions'::regclass and not tgisinternal;
--
-- Then drop whatever it names, e.g.:
--   drop trigger if exists <trigger_name> on public.prescriptions;
--   drop function if exists <backing_function_name>();
--
-- If verification_pin is a column default instead of a trigger (e.g.
-- `default lpad((random()*9999)::int::text, 4, '0')`), check with:
--   select column_default from information_schema.columns
--   where table_name = 'prescriptions' and column_name = 'verification_pin';
-- and drop it with:
--   alter table public.prescriptions alter column verification_pin drop default;
--
-- The verification_pin column itself is left in place below (now unused)
-- rather than dropped, since dropping a column is irreversible and I can't
-- confirm from here that nothing else in your project still reads it.

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Birth-year verification with per-prescription rate limiting.
-- ─────────────────────────────────────────────────────────────────────────
-- Postgres refuses to rename a parameter via CREATE OR REPLACE (error
-- 42P13) — the old function took (p_token text, p_pin text), so the
-- (text, text) signature already exists under those old names and has to
-- be dropped before it can be recreated with p_birth_year. If your old
-- version had a different signature (extra params, different types), list
-- what actually exists first: select oid::regprocedure from pg_proc where
-- proname = 'verify_prescription'; and adjust the line below to match.
drop function if exists public.verify_prescription(text, text);

create function public.verify_prescription(p_token text, p_birth_year text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rx                 public.prescriptions%rowtype;
  v_patient_birth_year integer;
  v_input_is_valid     boolean;
  v_input_year         integer;
  v_max_attempts        constant integer := 5;
  v_lock_minutes         constant integer := 15;
begin
  select * into v_rx from public.prescriptions where verification_token = p_token;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Prescription not found.');
  end if;

  if v_rx.verify_locked_until is not null and v_rx.verify_locked_until > now() then
    return jsonb_build_object(
      'success', false,
      'error', format('Too many incorrect attempts. Try again after %s.',
                       to_char(v_rx.verify_locked_until, 'HH12:MI AM'))
    );
  end if;

  if v_rx.status = 'revoked' then
    return jsonb_build_object('success', false, 'error', 'This prescription has been revoked by the doctor.');
  end if;

  if v_rx.status = 'expired' or v_rx.expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'This prescription has expired.');
  end if;

  if v_rx.status = 'dispensed' then
    return jsonb_build_object('success', false, 'error', 'This prescription has already been dispensed. It cannot be used again.');
  end if;

  select birth_year into v_patient_birth_year
  from public.patient_profiles
  where user_id = v_rx.patient_id;

  -- Validate the input format before ever casting it, so a malformed
  -- p_birth_year can't raise an error instead of returning a clean failure.
  v_input_is_valid := p_birth_year ~ '^\d{4}$';
  if v_input_is_valid then
    v_input_year := p_birth_year::integer;
  end if;

  if v_patient_birth_year is null or not v_input_is_valid or v_input_year <> v_patient_birth_year then
    update public.prescriptions
    set failed_verify_attempts = failed_verify_attempts + 1,
        verify_locked_until = case
          when failed_verify_attempts + 1 >= v_max_attempts
            then now() + (v_lock_minutes || ' minutes')::interval
          else verify_locked_until
        end
    where id = v_rx.id;

    return jsonb_build_object(
      'success', false,
      'error', 'That birth year doesn''t match our records for this patient.'
    );
  end if;

  -- Correct: instantly mark dispensed (single-use), no exceptions for who
  -- opened the link. See the file header for why that's the right call now.
  update public.prescriptions
  set failed_verify_attempts = 0,
      verify_locked_until   = null,
      verified_count        = verified_count + 1,
      status                = 'dispensed',
      dispensed_at          = now()
  where id = v_rx.id;

  return jsonb_build_object(
    'success', true,
    'prescription', jsonb_build_object(
      'diagnosis',        v_rx.diagnosis,
      'additional_notes', v_rx.additional_notes,
      'issued_at',        v_rx.issued_at,
      'expires_at',       v_rx.expires_at,
      'medications', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'medicine_name',        m.medicine_name,
                 'dosage',               m.dosage,
                 'frequency',            m.frequency,
                 'duration',             m.duration,
                 'special_instructions', m.special_instructions,
                 'quantity',             m.quantity
               ) order by m.sort_order), '[]'::jsonb)
        from public.prescription_medications m
        where m.prescription_id = v_rx.id
      )
    ),
    'doctor', (
      select jsonb_build_object(
        'full_name',      trim(both ' ' from coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
        'specialization',  d.specialization,
        'license_number',  d.license_number,
        'clinic_name',     d.clinic_name,
        'clinic_address',  d.clinic_address,
        'clinic_phone',    d.clinic_phone
      )
      from public.profiles p
      join public.doctor_profiles d on d.user_id = p.id
      where p.id = v_rx.doctor_id
    ),
    'patient', (
      select jsonb_build_object(
        'full_name',     trim(both ' ' from coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
        'date_of_birth', p.date_of_birth
      )
      from public.profiles p
      where p.id = v_rx.patient_id
    )
  );
end;
$$;

grant execute on function public.verify_prescription(text, text) to anon, authenticated;
