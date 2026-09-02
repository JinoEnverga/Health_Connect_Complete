-- Fixes get_own_prescription_details collapsing two different failures
-- into one string ("That birth year doesn't match our records.") for both
-- a genuinely wrong guess AND a patient who has no birth_year on file at
-- all (currently 4 of 9 patients, per the mobile team). The second case
-- has no path to resolution as it stood — the patient just gets told
-- they're wrong forever.
--
-- Also adds a machine-readable `code` field to every branch, so callers
-- (web and mobile both) can branch on something other than string-matching
-- prose, which breaks the moment either client rewords a message.
--
-- Codes: not_signed_in | not_found | locked | revoked | expired |
--        already_dispensed | no_birth_year_set | birth_year_mismatch | ok

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
      'additional_notes', v_rx.additional_notes,
      'file_path', v_rx.file_path,
      'file_name', v_rx.file_name,
      'file_type', v_rx.file_type,
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
