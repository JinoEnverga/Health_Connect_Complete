-- Panel recommendation #4: remove the QR code feature entirely.
--
-- The QR / token flow (a verification_token in a QR code, scanned by a BHW
-- or pharmacist, checked against a 4-digit PIN by verify_prescription,
-- previewed by get_patient_prescription) is out of scope. Prescriptions
-- are now digital records the patient opens in their own account
-- (011_digital_prescriptions.sql), so all of it goes:
--   * functions verify_prescription(token, pin) and get_patient_prescription(token)
--   * columns verification_token, verification_pin, pin_verified_at,
--     verified_count, failed_verify_attempts, verify_locked_until
-- Supersedes 009_drop_verify_prescription_PROPOSAL.sql.
--
-- Kept on purpose: the 'dispensed' status and dispensed_at. 11 existing
-- prescriptions already carry that status as history; nothing sets it any
-- more, but rewriting past records would lose information.
--
-- Safe to re-run.

drop function if exists public.verify_prescription(text, text);
drop function if exists public.get_patient_prescription(text);

alter table public.prescriptions
  drop column if exists verification_token,
  drop column if exists verification_pin,
  drop column if exists pin_verified_at,
  drop column if exists verified_count,
  drop column if exists failed_verify_attempts,
  drop column if exists verify_locked_until;

notify pgrst, 'reload schema';
