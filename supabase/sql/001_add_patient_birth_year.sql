-- Adds birth_year to patient_profiles.
--
-- This repo has no Supabase CLI / migrations setup checked in, so this file
-- is not applied automatically. Run it once yourself in the Supabase
-- dashboard: Project -> SQL Editor -> paste -> Run. Safe to re-run.
--
-- Design notes:
--   * The column is nullable at the DB level on purpose. "Required" for
--     patients is enforced at the application level (registration
--     validation + the first-login prompt for legacy accounts), not with a
--     hard NOT NULL — a NOT NULL here would break the existing
--     bhw/RegisterPatient.jsx insert path and any existing patient rows
--     the moment this statement runs.
--   * Scoped to patient_profiles (the patient-only extension table), not
--     the shared `profiles` table used by every role.

alter table public.patient_profiles
  add column if not exists birth_year integer;

alter table public.patient_profiles
  drop constraint if exists patient_profiles_birth_year_range;

alter table public.patient_profiles
  add constraint patient_profiles_birth_year_range
  check (
    birth_year is null
    or (birth_year between 1900 and extract(year from now())::int)
  );
