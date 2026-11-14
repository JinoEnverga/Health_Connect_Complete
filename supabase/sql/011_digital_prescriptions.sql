-- Panel recommendation #1: prescriptions are native, structured digital
-- records — medication name, dosage, frequency, duration, quantity and
-- instructions stored as rows in prescription_medications — instead of an
-- uploaded image/PDF of a paper Rx pad.
--
-- Older prescriptions that only have an uploaded file (file_path) stay
-- readable; new ones are always created structured, through this function.
--
-- Safe to re-run.

-- Doctors can now attach refill counts (column already existed) and the
-- app always writes these fields, so keep them sane.
alter table public.prescription_medications drop constraint if exists prescription_medications_quantity_check;
alter table public.prescription_medications add constraint prescription_medications_quantity_check
  check (quantity is null or quantity between 1 and 10000);
alter table public.prescription_medications drop constraint if exists prescription_medications_refills_check;
alter table public.prescription_medications add constraint prescription_medications_refills_check
  check (refills_allowed is null or refills_allowed between 0 and 12);

-- Role lookup that isn't limited by the caller's RLS view of `profiles`:
-- a doctor may prescribe to a patient they found by email but haven't had
-- an appointment with yet, whose profile row they therefore can't select.
create or replace function public.account_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = p_user_id;
$$;

revoke all on function public.account_role(uuid) from public, anon;
grant execute on function public.account_role(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- issue_prescription: one call creates the prescription AND its medication
-- lines in a single transaction (no half-written prescriptions).
--
-- p_medications is a JSON array of objects:
--   [{ "medicine_name": "Amoxicillin 500mg capsule", "dosage": "1 capsule",
--      "frequency": "3 times a day", "duration": "7 days",
--      "quantity": 21, "refills_allowed": 0,
--      "special_instructions": "Take after meals" }, ...]
--
-- SECURITY INVOKER: the existing RLS policies ("prescriptions: doctor
-- issues", "rx_meds: doctor inserts") still decide who may write.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.issue_prescription(
  p_patient_id       uuid,
  p_diagnosis        text,
  p_medications      jsonb,
  p_additional_notes text    default null,
  p_appointment_id   uuid    default null,
  p_valid_days       integer default 30
)
returns public.prescriptions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rx   public.prescriptions%rowtype;
  v_med  jsonb;
  v_i    integer := 0;
  v_name text; v_dosage text; v_freq text; v_dur text;
begin
  if public.account_role(auth.uid()) is distinct from 'doctor' then
    raise exception 'Only doctors can issue prescriptions.' using errcode = '42501';
  end if;

  if public.account_role(p_patient_id) is distinct from 'patient' then
    raise exception 'That account is not a patient.' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_diagnosis), '') = '' then
    raise exception 'A diagnosis is required.' using errcode = 'P0001';
  end if;

  if p_valid_days is null or p_valid_days not between 1 and 365 then
    raise exception 'Validity must be between 1 and 365 days.' using errcode = 'P0001';
  end if;

  if p_medications is null or jsonb_typeof(p_medications) <> 'array' or jsonb_array_length(p_medications) = 0 then
    raise exception 'Add at least one medication.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_medications) > 20 then
    raise exception 'A prescription can list at most 20 medications.' using errcode = 'P0001';
  end if;

  if p_appointment_id is not null and not exists (
    select 1 from public.appointments
    where id = p_appointment_id and doctor_id = auth.uid() and patient_id = p_patient_id
  ) then
    raise exception 'That appointment doesn''t belong to you and this patient.' using errcode = 'P0001';
  end if;

  insert into public.prescriptions
    (doctor_id, patient_id, appointment_id, diagnosis, additional_notes, expires_at)
  values
    (auth.uid(), p_patient_id, p_appointment_id, btrim(p_diagnosis),
     nullif(btrim(coalesce(p_additional_notes, '')), ''),
     now() + make_interval(days => p_valid_days))
  returning * into v_rx;

  for v_med in select * from jsonb_array_elements(p_medications) loop
    v_i    := v_i + 1;
    v_name   := btrim(coalesce(v_med->>'medicine_name', ''));
    v_dosage := btrim(coalesce(v_med->>'dosage', ''));
    v_freq   := btrim(coalesce(v_med->>'frequency', ''));
    v_dur    := btrim(coalesce(v_med->>'duration', ''));
    if v_name = '' or v_dosage = '' or v_freq = '' or v_dur = '' then
      raise exception 'Medication %: name, dosage, frequency and duration are all required.', v_i
        using errcode = 'P0001';
    end if;

    insert into public.prescription_medications
      (prescription_id, medicine_name, dosage, frequency, duration,
       quantity, refills_allowed, special_instructions, sort_order)
    values
      (v_rx.id, v_name, v_dosage, v_freq, v_dur,
       nullif(v_med->>'quantity', '')::integer,
       coalesce(nullif(v_med->>'refills_allowed', '')::integer, 0),
       nullif(btrim(coalesce(v_med->>'special_instructions', '')), ''),
       v_i);
  end loop;

  return v_rx;
end;
$$;

revoke all on function public.issue_prescription(uuid, text, jsonb, text, uuid, integer) from public, anon;
grant execute on function public.issue_prescription(uuid, text, jsonb, text, uuid, integer) to authenticated;

-- The patient's unlock RPC (get_own_prescription_details, see 007) now also
-- returns diagnosis, dates and refills so the patient app can render the
-- full digital prescription from one call. Same checks and error codes.
create or replace function public.get_own_prescription_details(p_prescription_id uuid, p_birth_year text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rx                 public.prescriptions%rowtype;
  v_patient_birth_year integer;
  v_input_is_valid     boolean;
  v_input_year         integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'code', 'not_signed_in', 'error', 'Not signed in.');
  end if;

  select * into v_rx
  from public.prescriptions
  where id = p_prescription_id and patient_id = auth.uid();

  if not found then
    return jsonb_build_object('success', false, 'code', 'not_found', 'error', 'Prescription not found.');
  end if;

  select birth_year into v_patient_birth_year
  from public.patient_profiles
  where user_id = auth.uid();

  if v_patient_birth_year is null then
    return jsonb_build_object(
      'success', false,
      'code', 'no_birth_year_set',
      'error', 'No birth year is on file for this account yet. Please set it in your profile first.'
    );
  end if;

  v_input_is_valid := p_birth_year ~ '^\d{4}$';
  if v_input_is_valid then
    v_input_year := p_birth_year::integer;
  end if;

  if not v_input_is_valid or v_input_year <> v_patient_birth_year then
    return jsonb_build_object('success', false, 'code', 'birth_year_mismatch', 'error', 'That birth year doesn''t match our records.');
  end if;

  return jsonb_build_object(
    'success', true,
    'code', 'ok',
    'prescription', jsonb_build_object(
      'id',               v_rx.id,
      'diagnosis',        v_rx.diagnosis,
      'additional_notes', v_rx.additional_notes,
      'issued_at',        v_rx.issued_at,
      'expires_at',       v_rx.expires_at,
      'status',           v_rx.status,
      'file_path',        v_rx.file_path,
      'file_name',        v_rx.file_name,
      'file_type',        v_rx.file_type,
      'medications', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'medicine_name',        m.medicine_name,
                 'dosage',               m.dosage,
                 'frequency',            m.frequency,
                 'duration',             m.duration,
                 'special_instructions', m.special_instructions,
                 'quantity',             m.quantity,
                 'refills_allowed',      m.refills_allowed
               ) order by m.sort_order), '[]'::jsonb)
        from public.prescription_medications m
        where m.prescription_id = v_rx.id
      )
    )
  );
end;
$$;

grant execute on function public.get_own_prescription_details(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Doctors can see the name of any patient they've issued a prescription
-- to — including patients found by email with no appointment — so their
-- prescription list and the printed Rx show who it's for.
drop policy if exists "doctors can view profiles of patients they prescribed to" on public.profiles;
create policy "doctors can view profiles of patients they prescribed to"
on public.profiles for select
to authenticated
using (exists (
  select 1 from public.prescriptions rx
  where rx.patient_id = profiles.id and rx.doctor_id = auth.uid()
));

notify pgrst, 'reload schema';
