# Mobile App Handoff — Digital Prescriptions, Chat & Call History

> For the mobile (Information Systems) team. Paste into your AI assistant or
> read as a plain spec. Framework-agnostic: everything maps onto Flutter,
> React Native or native through the Supabase SDK.
>
> **Updated 2026-11-13** after the capstone panel review. If you built
> against the earlier version of this doc, read "What changed" first.

## What changed (breaking for older mobile code)

Panel recommendations, now live in the shared Supabase project:

1. **Prescriptions are structured digital records again**, not uploaded
   files. Issue them with the `issue_prescription` RPC (below). The old
   "upload a photo of the Rx pad" flow is retired for new prescriptions.
2. **Call history** is recorded for every video call (initiated, joined,
   cancelled, ended, missed) through the `log_call_event` RPC.
3. **Chat** in the web app now uses the same `chat_logs` table as mobile,
   so conversations sync across both. A few new rules apply (see Chat).
4. **QR code / PIN verification is removed.** These no longer exist —
   remove any mobile code that reads or calls them:
   - RPCs `verify_prescription(...)` and `get_patient_prescription(token)`
   - `prescriptions` columns `verification_token`, `verification_pin`,
     `pin_verified_at`, `verified_count`, `failed_verify_attempts`,
     `verify_locked_until`

   A query that selects any of those columns will now fail with a
   "column does not exist" error.

5. **Prescriptions are print-locked** (added 2026-11-14). A patient can print
   an official copy only 1 + refills times; every print must go through the
   `record_prescription_print` RPC. Don't offer unlimited "Save as PDF" /
   share-as-image of a prescription. See "Printing" below.

SQL for all of this is in `supabase/sql/011_*.sql` through `014_*.sql` in
the web repo.

## Shared schema (relevant parts)

- **`profiles`** — `id` (= `auth.users.id`), `role`
  (`patient`/`doctor`/`bhw`/`admin`), `first_name`, `last_name`, `email`, …
- **`patient_profiles`** — `user_id`, `birth_year`, …
- **`doctor_profiles`** — `user_id`, `specialization`, `license_number`,
  `clinic_name`, `clinic_address`, `clinic_phone`, …
- **`prescriptions`** — `id`, `doctor_id`, `patient_id`, `appointment_id`
  (nullable), `diagnosis`, `additional_notes`, `status`
  (`active`/`dispensed`/`expired`/`revoked`), `issued_at`, `expires_at`,
  `dispensed_at`; `file_path`/`file_name`/`file_type` only on older
  prescriptions issued as uploaded files. Print lock (read-only for apps):
  `print_count`, `max_prints`, `is_printed`, `reprints_authorized`,
  `first_printed_at`, `last_printed_at`, `reprint_reason`.
- **`prescription_print_log`** (new) — `prescription_id`, `event`
  (`printed`/`reprint_authorized`), `copy_number`, `max_prints`,
  `copy_label`, `actor_id`, `reason`, `created_at`. Readable by the
  prescription's doctor and patient (and admins).
- **`prescription_medications`** — one row per medication line:
  `medicine_name`, `dosage`, `frequency`, `duration`, `quantity`,
  `refills_allowed`, `special_instructions`, `sort_order`.
- **`consultation_sessions`** — one consultation room per appointment
  (unique `appointment_id`). Chat hangs off it.
- **`chat_logs`** — `id`, `session_id`, `sender_id`, `message_type`,
  `content`, `file_url`, `is_read`, `sent_at`.
- **`call_logs`** (new) — one row per call attempt: `appointment_id`,
  `doctor_id`, `patient_id`, `initiated_by`, `status`
  (`ringing`/`active`/`ended`/`cancelled`/`missed`), `initiated_at`,
  `answered_at`, `ended_at`, `ended_by`, `duration_seconds`, `end_reason`.
- **`call_events`** (new) — timeline per call: `call_id`, `user_id`,
  `event` (`initiated`/`joined`/`rejoined`/`cancelled`/`ended`/`missed`/`failed`),
  `detail`, `created_at`.

## Prescriptions

### Doctor: issue

```
rpc('issue_prescription', {
  p_patient_id:       <uuid>,
  p_diagnosis:        'Acute pharyngitis',
  p_medications: [
    { medicine_name: 'Amoxicillin 500 mg capsule', dosage: '1 capsule',
      frequency: '3 times a day', duration: '7 days',
      quantity: 21, refills_allowed: 0, special_instructions: 'After meals' }
  ],
  p_additional_notes: 'Return if fever persists',   // optional
  p_appointment_id:   <uuid>,                       // optional; must be yours with this patient
  p_valid_days:       30                            // optional, 1–365
}) -> the new prescriptions row
```

- Creates the prescription **and** its medication lines in one
  transaction. 1–20 medications; name, dosage, frequency and duration are
  required on each. Errors come back as readable messages.
- Find the patient by email first with
  `rpc('get_patient_id_by_email', { patient_email })` if you don't already
  have their id.
- Don't insert into `prescriptions` / `prescription_medications` directly.

### Patient: view

1. List own prescriptions (`prescriptions` where `patient_id = me`). To show
   the doctor's letterhead, embed
   `doctor:profiles!prescriptions_doctor_id_fkey(first_name, last_name, doctor_profiles(specialization, license_number, clinic_name, clinic_address, clinic_phone))`.
2. Each one is locked behind the patient's 4-digit birth year:
   `rpc('get_own_prescription_details', { p_prescription_id, p_birth_year })`.
   Read-only. Returns `{ success, code, error }` on failure, where `code` is
   `not_signed_in | not_found | no_birth_year_set | birth_year_mismatch`, or
   on success:
   `{ success: true, code: 'ok', prescription: { id, diagnosis, additional_notes, issued_at, expires_at, status, medications: [...], file_path, file_name, file_type } }`.
3. Render the medications as a prescription document (℞, numbered lines,
   "Sig: dosage, frequency, for duration"). Older prescriptions may instead
   have `file_path`: get a short-lived link with
   `storage.from('prescription-files').createSignedUrl(file_path, 120)`.

### Printing (one-time print lock)

- Allowed prints = `max_prints` = 1 + the highest `refills_allowed` on the
  prescription's medication lines, plus any reprint the doctor authorizes.
  Show "`print_count` of `max_prints` used".
- To print, first call `rpc('record_prescription_print', { p_prescription_id })`.
  It counts the print and returns
  `{ copy_number, max_prints, copy_label, remaining, printed_at }`
  (`copy_label`: `Original` / `Refill Copy` / `Authorized Reprint`). Only
  open the print dialog after it succeeds. It errors (readable message)
  when the prescription isn't `active`, is expired, or has no prints left.
- The printout must carry the security strip (`OFFICIAL COPY — Print n of
  m (copy_label)`, the print time and the Rx ID) and the **pharmacist
  dispensing ledger** table (Date | Medication & Qty Dispensed | Remaining
  Balance | Pharmacy Name, License No. & Signature) so pharmacies can
  record partial fills on paper. Match the web layout in
  `src/components/shared/DigitalPrescription.jsx`.
- Doctor reprint override:
  `rpc('authorize_prescription_reprint', { p_prescription_id, p_reason })`
  — only the prescribing doctor, only once all prints are used, reason
  required (5–500 chars). Grants exactly one more print.
- The counters can't be changed by a normal table update (a trigger
  rejects it). Subscribe to `postgres_changes` UPDATE on `prescriptions`
  if you want the print button to update live.

Birth year is a UX confirmation step, not the real security boundary —
row-level security on `prescriptions` is (patients only ever see their own).

## Chat (`chat_logs`, shared with web)

- Get the room: `rpc('get_or_create_consultation_session', { p_appointment_id })`
  → returns the `consultation_sessions` row; use its `id` as `session_id`.
- **Send:** insert `{ id: <client-generated uuid>, session_id, sender_id: <your own user id>, message_type: 'text', content }`.
  - `sender_id` **must be your own** id (RLS rejects anything else) —
    this includes `message_type: 'system'` messages.
  - Generate the `id` on the device so retries are safe: a duplicate-key
    error (`23505`) means "already sent", not a failure.
  - The server sets `sent_at` (ordering uses the server clock) and
    `is_read = false`; max 2000 characters.
- **Receive:** subscribe to Realtime `postgres_changes` (INSERT/UPDATE) on
  `chat_logs` filtered by `session_id=eq.<id>`, and re-fetch history on
  every (re)connect so nothing sent while offline is missed.
- **Read receipts:** update `is_read = true` on the other person's
  messages. That's the only change allowed after sending — content can't
  be edited.

## Calls

### Call history — `log_call_event`

Call `rpc('log_call_event', { p_appointment_id, p_event, p_detail? })`:

| When | `p_event` | Result |
|---|---|---|
| The user opens/joins the video call | `start` | 1st person → new call `ringing` (event `initiated`); 2nd person → `active` (`joined`) |
| The user hangs up, leaves, or closes the app | `leave` | before an answer → `cancelled`; after → `ended` with `duration_seconds` |
| The connection fails | `failed` | logged in the timeline; call stays open |

Calls left open by a crash are closed automatically on the next `start`
(ringing > 5 min → `missed`, active > 4 h → `ended`). Read history from
`call_logs` / `call_events` — participants (and admins) can read; nobody
writes them directly.

**Incoming calls:** subscribe to `postgres_changes` on `call_logs`
filtered by `patient_id=eq.<me>` (or `doctor_id`) and show a "calling you"
prompt while a row is `ringing` and `initiated_by` isn't you.

### Video signaling channel is now private

WebRTC signaling uses the Realtime channel `call:<appointment id>`
(broadcast `signal` / `hangup` / `restart-request` events + presence keyed
by user id). It is now a **private** channel: join it with
`{ config: { private: true, … } }` while signed in. Only that
appointment's doctor and patient are authorized; anyone else gets
"Unauthorized". If mobile joins this channel without `private: true`, it
won't see the web side's messages.

## Open items for the IS team

- Point at the **same** Supabase project (URL + anon key) as web.
- Remove any use of the dropped QR/PIN columns and RPCs listed above.
- Decide whether mobile needs the doctor issuance flow or is patient-only.
