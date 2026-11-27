-- 016_mark_missed_appointments.sql  (mobile handoff item C6, approved 27 Nov 2026)
-- Server half of the shared "Missed after one hour" rule. Written by the
-- mobile team; applied unchanged except that the cron job is replaced (not
-- duplicated) if this file is run again.
--
-- Every minute: a slot booking (block_id IS NULL) for today that is still
-- 'upcoming' one hour after its start time becomes 'no_show' (shown as
-- "Missed" in both apps) — unless a call was answered, a call is ringing or
-- live, or a prescription was issued for it. Queue bookings, 'waiting' and
-- 'in_progress' rows are never touched. The nightly
-- 'close-past-appointments' job is unchanged.

create or replace function public.mark_missed_appointments()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        record;
  v_label  text;
  v_start  time;
  v_done   integer := 0;
  v_today  date := (now() at time zone 'Asia/Manila')::date;
begin
  for r in
    select a.id, a.appointment_date, a.time_slot
    from public.appointments a
    where a.appointment_date = v_today
      and a.status = 'upcoming'
      and a.block_id is null
  loop
    v_label := btrim(regexp_replace(
      replace(replace(r.time_slot, chr(8239), ' '), chr(160), ' '),
      '\s+', ' ', 'g'));
    v_label := substring(v_label from '^(\d{1,2}:\d{2}(?: ?[AaPp][Mm])?)');
    continue when v_label is null;

    begin
      v_start := v_label::time;
    exception when others then
      continue;
    end;

    continue when now() <
      ((r.appointment_date + v_start) at time zone 'Asia/Manila')
        + interval '1 hour';

    continue when exists (
        select 1 from public.call_logs c
        where c.appointment_id = r.id
          and (c.answered_at is not null or c.status in ('ringing', 'active')))
      or exists (
        select 1 from public.prescriptions p
        where p.appointment_id = r.id);

    begin
      update public.appointments
         set status = 'no_show'
       where id = r.id and status = 'upcoming';
      v_done := v_done + 1;
    exception when others then
      raise notice 'mark_missed_appointments: skipped % : %', r.id, sqlerrm;
    end;
  end loop;
  return v_done;
end;
$function$;

revoke all on function public.mark_missed_appointments()
  from public, anon, authenticated;

-- One job only, even if this file is applied again.
select cron.unschedule(jobid) from cron.job where jobname = 'mark-missed-appointments';
select cron.schedule(
  'mark-missed-appointments',
  '* * * * *',
  'select public.mark_missed_appointments()'
);
