-- Proposed fix for get_patient_id_by_email silently returning NULL for
-- both "no account with that email" and "account exists but isn't a
-- patient" — per the mobile team's report. I don't have this function's
-- current source (same situation as every other pre-existing function in
-- this project) — this is a best-effort reconstruction from its name and
-- how both web (IssuePrescription.jsx) and mobile call it. Review before
-- running: if the real one does more than "look up a patient's profile id
-- by email", this will drop that behavior.
--
-- Behavior change: raises a clear exception instead of returning NULL.
-- Web's current caller already treats "error OR falsy data" identically
-- (see src/pages/doctor/IssuePrescription.jsx), so this is safe there.
-- Mobile should confirm their caller handles a thrown/RPC error the same
-- way before this ships, since a raised exception is a different code path
-- than a null return even if the end message ends up the same.

create or replace function public.get_patient_id_by_email(patient_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role    text;
begin
  select au.id, p.role into v_user_id, v_role
  from auth.users au
  join public.profiles p on p.id = au.id
  where lower(au.email) = lower(patient_email)
  limit 1;

  if v_user_id is null then
    raise exception 'No account found with that email address.' using errcode = 'P0001';
  end if;

  if v_role is distinct from 'patient' then
    raise exception 'That email belongs to a % account, not a patient.', coalesce(v_role, 'non-patient') using errcode = 'P0001';
  end if;

  return v_user_id;
end;
$$;

grant execute on function public.get_patient_id_by_email(text) to authenticated;
