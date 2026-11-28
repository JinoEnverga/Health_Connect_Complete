-- 018_bhw_reads_patient_profiles.sql  (28 Nov 2026)
-- Barangay Health Workers could not read any patient's patient_profiles row
-- (only "own access" and "doctor reads own appointment patient" existed), so
-- every BHW page — dashboard, Search Patient, Medical History, Record Vitals —
-- showed only the BHW's own row. Same rule the mobile team proposed in their
-- handoff ("patient_profiles: bhw reads"), limited to patients: sign-up also
-- creates patient_profiles rows for BHW / admin accounts, and those must not
-- show up as patients. Read-only; uses the SECURITY DEFINER helper
-- account_role() so the policy never queries profiles recursively.

drop policy if exists "patient_profiles: bhw reads patients" on public.patient_profiles;
create policy "patient_profiles: bhw reads patients"
on public.patient_profiles for select to authenticated
using (
  public.account_role(auth.uid()) = 'bhw'
  and public.account_role(user_id) = 'patient'
);
