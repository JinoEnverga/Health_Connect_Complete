-- 015_reset_test_appointment.sql  (mobile handoff item C5, approved 27 Nov 2026)
-- Appointment 4a3b9db1… (demo@ with demo1, Mon 30 Nov 2026, 9:00 AM) was
-- marked 'completed' by an early test call on 22 Nov, although its date is
-- in the future. Mobile build 2009 no longer does that; put the row back.
-- Checked before applying: no other open booking holds demo1's 9:00 AM slot
-- on 30 Nov, so appointments_no_double_booking can't clash.

update public.appointments
   set status = 'upcoming'
 where id = '4a3b9db1-f97f-4139-bd93-430267b064b2'
   and status = 'completed';
