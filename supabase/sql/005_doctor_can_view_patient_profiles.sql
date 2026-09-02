-- Fixes "patient name shows blank / falls back to 'Patient'" on
-- doctor-facing pages that join appointments -> profiles for the patient
-- side (the Teleconsultation picker, Dashboard's upcoming list, and almost
-- certainly doctor/Appointments.jsx too, even though nothing's been
-- reported broken there — same query pattern, same gap).
--
-- Root cause: this isn't a query-syntax issue — switching from the alias
-- shorthand to an explicit FK-hint made no difference, which is the tell.
-- PostgREST returns null for an embedded row (instead of erroring) when a
-- row-level security policy on the embedded table blocks it for the
-- current user. There's presumably a policy letting someone read their OWN
-- profile (id = auth.uid()), and likely one letting anyone read DOCTOR
-- profiles (needed for Find Doctors to work), but nothing lets a doctor
-- read a PATIENT's profile row — so that half of the join always comes
-- back null on every doctor-facing page.
--
-- Want to confirm before applying the fix? Run this in the SQL Editor
-- first — it runs with full privileges, bypassing RLS, so it shows the
-- real underlying data regardless of policies:
--
--   select a.id, a.doctor_id, a.patient_id, p.first_name, p.last_name
--   from appointments a
--   left join profiles p on p.id = a.patient_id
--   order by a.appointment_date desc limit 20;
--
-- If that shows real names, the data's fine and this policy is the whole
-- fix. If it ALSO shows blank names, something else is wrong with the data
-- itself (e.g. patient_id not matching any real profiles row) — paste back
-- what that query shows and I'll dig further.

drop policy if exists "doctors can view profiles of their patients" on public.profiles;
create policy "doctors can view profiles of their patients"
on public.profiles for select
to authenticated
using (
  exists (
    select 1 from public.appointments
    where appointments.patient_id = profiles.id
      and appointments.doctor_id = auth.uid()
  )
);
