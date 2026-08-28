-- Adds a read-only, patient-scoped RPC backing the inline "View
-- Medications" unlock on the patient's own dashboard
-- (src/pages/patient/Prescriptions.jsx).
--
-- Why this is a separate function from verify_prescription (002):
-- that one is the pharmacist-facing, single-use, verify-AND-dispense
-- endpoint — reachable via a public token with no login. This one is for
-- the already-authenticated patient looking at their own record. It never
-- touches status / dispensed_at / verified_count. That split is the actual
-- fix for "opening my own prescription marks it Dispensed": previously the
-- only thing that checked a birth year (or PIN, before that) was the
-- pharmacist's dispense-on-verify function, so a patient previewing their
-- own share link through it consumed its one-time use. With this function,
-- the patient's own dashboard no longer calls that endpoint at all.
--
-- Note on the "auth" this provides: the patient already has normal
-- read access to their own birth_year (it's editable on their Profile
-- page) and, under this app's existing RLS, to their own prescription_
-- medications rows too — the same query the old "expand medications"
-- feature already ran. So this is a UX gate against someone glancing at an
-- unlocked screen, not a boundary against the account owner themselves;
-- unlike verify_prescription, it deliberately does not attempt any
-- server-side rate limiting beyond normal RLS, since there's no separate
-- attacker identity here to throttle.
--
-- Run in the Supabase SQL Editor. Safe to re-run.

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
    return jsonb_build_object('success', false, 'error', 'Not signed in.');
  end if;

  select * into v_rx
  from public.prescriptions
  where id = p_prescription_id and patient_id = auth.uid();

  if not found then
    return jsonb_build_object('success', false, 'error', 'Prescription not found.');
  end if;

  select birth_year into v_patient_birth_year
  from public.patient_profiles
  where user_id = auth.uid();

  -- Validate format before casting, so a malformed input can't raise an
  -- error instead of returning a clean failure.
  v_input_is_valid := p_birth_year ~ '^\d{4}$';
  if v_input_is_valid then
    v_input_year := p_birth_year::integer;
  end if;

  if v_patient_birth_year is null or not v_input_is_valid or v_input_year <> v_patient_birth_year then
    return jsonb_build_object('success', false, 'error', 'That birth year doesn''t match our records.');
  end if;

  return jsonb_build_object(
    'success', true,
    'prescription', jsonb_build_object(
      'additional_notes', v_rx.additional_notes,
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
    )
  );
end;
$$;

grant execute on function public.get_own_prescription_details(uuid, text) to authenticated;
