-- Switches prescriptions from structured medication fields to a single
-- uploaded file — a PDF or photo of the doctor's actual signed Rx pad,
-- the document a real pharmacy accepts. Run in the Supabase SQL Editor.
-- Additive: old prescriptions with structured medications are untouched
-- and still readable (see 003's updated function below).

-- 1. Columns for the uploaded file.
alter table public.prescriptions add column if not exists file_path text;
alter table public.prescriptions add column if not exists file_name text;
alter table public.prescriptions add column if not exists file_type text;

-- 2. Private storage bucket — not public. Access is controlled entirely by
-- the policies below, not by a guessable URL.
insert into storage.buckets (id, name, public)
values ('prescription-files', 'prescription-files', false)
on conflict (id) do nothing;

-- (storage.objects already has RLS enabled by Supabase by default — the
-- table is owned by supabase_storage_admin, so project owners can't run
-- ALTER TABLE on it anyway; only the policies below are needed.)

-- 3. Access policies.
-- Path convention the app uses when uploading: {patient_id}/{random}-{filename}
-- so the patient's own folder IS the real access boundary — the same
-- ownership model as every other table here. The birth-year prompt on the
-- dashboard is a UX confirmation layered on top of this, not a substitute
-- for it (same caveat as get_own_prescription_details in 003: the patient
-- already owns this data under RLS).

drop policy if exists "doctors can upload prescription files" on storage.objects;
create policy "doctors can upload prescription files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'prescription-files'
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'doctor')
);

drop policy if exists "patients can read their own prescription files" on storage.objects;
create policy "patients can read their own prescription files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'prescription-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "doctors can read files on prescriptions they issued" on storage.objects;
create policy "doctors can read files on prescriptions they issued"
on storage.objects for select
to authenticated
using (
  bucket_id = 'prescription-files'
  and exists (
    select 1 from public.prescriptions
    where file_path = storage.objects.name and doctor_id = auth.uid()
  )
);

-- 4. get_own_prescription_details (003) now also returns the file, so the
-- dashboard's unlock can offer a download instead of / alongside a
-- medication list. Same function, same birth-year check — just adding
-- fields to what a correct check returns.
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

-- Note: verify_prescription (002) and the public /verify/rx/:token page are
-- no longer used by the app — the pharmacy handoff is now "download the
-- file, bring/show it in person," not an online verification link. I'm
-- leaving that function in place rather than dropping it (it's harmless
-- unused, and I can't be sure nothing else references it); the route and
-- page are removed from the frontend.
