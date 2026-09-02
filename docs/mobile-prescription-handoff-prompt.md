# Mobile App Prompt — E-Prescriptions (matching the HealthConnect web app)

> Paste this into whatever AI assistant or dev doc your mobile team is using
> (Claude, ChatGPT, Cursor, etc.), or hand it over as a plain spec. It's
> written framework-agnostically since I don't know your mobile stack
> (Flutter, React Native, native Android/iOS) — everything below maps onto
> any of those through their Supabase SDK. Swap in your actual stack name
> where it says "your mobile app."

## Context

HealthConnect is a telemedicine web app (React + Supabase). The mobile app
is a separate, collaborating project (Information Systems team) that must
talk to the **same Supabase project** — same URL, same anon key, same
tables/storage/RPCs — so a prescription issued from either platform shows
up correctly on both. This prompt covers only the prescription feature.

**Important design context**: prescriptions are **not** structured
medication data (no medicine-name/dosage/frequency fields to fill in).
Each prescription is a single uploaded **file** — a PDF or photo of the
doctor's actual signed Rx pad, since that's the document a real pharmacy
accepts. That was a deliberate redesign partway through the web build;
don't re-introduce a structured-medication entry form unless the IS team
specifically wants to diverge from web.

## Shared database schema

- **`profiles`** — shared identity table: `id` (= `auth.users.id`), `role`
  (`patient`/`doctor`/`bhw`/`admin`), `first_name`, `last_name`, `phone`,
  `date_of_birth`, `gender`.
- **`patient_profiles`** — patient-only extension: `user_id` (FK to
  `profiles.id`), plus `birth_year` (integer) — the field this whole
  feature is built around.
- **`doctor_profiles`** — `user_id`, `specialization`, `license_number`,
  `clinic_name`, `clinic_address`, `clinic_phone`, etc.
- **`prescriptions`** — `id`, `doctor_id`, `patient_id`, `appointment_id`
  (nullable), `diagnosis`, `additional_notes`, `status`
  (`active`/`dispensed`/`expired`/`revoked`), `issued_at`, `expires_at`,
  `dispensed_at`, **`file_path`**, **`file_name`**, **`file_type`** (mime),
  plus legacy/mostly-unused columns: `verification_token`,
  `verification_pin`, `verified_count`, `failed_verify_attempts`,
  `verify_locked_until`.
- **`prescription_medications`** — legacy structured rows
  (`medicine_name`, `dosage`, `frequency`, `duration`,
  `special_instructions`, `quantity`, `sort_order`). Only populated on
  prescriptions issued *before* the file-upload redesign. New
  prescriptions leave this empty — treat it as a fallback display for old
  data, not something to write to.

## Storage

- Bucket: **`prescription-files`** — **private**, not publicly readable.
- Path convention: `{patient_id}/{random-uuid}-{sanitized-filename}`.
- Access policies already in place:
  - **Insert**: any authenticated user whose `profiles.role = 'doctor'`
    can upload anywhere in the bucket.
  - **Select**: a user can read objects only in *their own* folder
    (first path segment = `auth.uid()`), **or** a doctor can read a file
    if a `prescriptions` row exists with that `file_path` and
    `doctor_id = auth.uid()`.
- The bucket has no public URLs. To let a user view/download a file, call
  `storage.from('prescription-files').createSignedUrl(file_path, ~120)`
  and use the returned short-lived URL.

## RPC functions to call directly

1. **`get_patient_id_by_email(patient_email text) returns uuid`**
   Doctor-side. Look up a patient's user id by email before issuing.

2. **`get_own_prescription_details(p_prescription_id uuid, p_birth_year text) returns jsonb`**
   Patient-side "unlock" check — call this when the patient enters their
   birth year to view a prescription. **Read-only**, does not change
   `status` or any counter. Returns either
   `{"success": false, "error": "..."}` or
   `{"success": true, "prescription": {"additional_notes", "file_path",
   "file_name", "file_type", "medications": [...]}}`.

3. **`verify_prescription(p_token text, p_birth_year text)`** —
   **deprecated, do not build against this.** It backed a public web page
   for pharmacists to verify a prescription via a shared link; that page
   and the whole "share with pharmacist" flow were deliberately removed
   from web. There is currently no digital pharmacy handoff — the patient
   just downloads the file and brings/sends it to a pharmacy themselves,
   however they choose (in person, messaging app, email, print). Don't
   build a scan/verify screen for this unless the IS team explicitly wants
   to bring that concept back — check with the web side first.

## UX flow to replicate

### Doctor: issue a prescription
1. Enter patient email, diagnosis, optional notes.
2. Attach **one file** — PDF or photo, ~10MB max.
3. On submit: resolve `patient_id` via RPC #1 → upload the file to
   `{patient_id}/{uuid}-{filename}` → insert a `prescriptions` row with
   `file_path`/`file_name`/`file_type` + diagnosis/notes.

### Patient: view / download a prescription
1. List the patient's own prescriptions with a status badge.
2. Each one is locked by default. Tapping it prompts for the patient's own
   **4-digit Birth Year**.
3. On submit, call RPC #2. On success, if `file_path` is present, get a
   signed URL and let the user view/download/share the file (native share
   sheet is a good fit here — WhatsApp, email, printing, showing it at the
   counter).
4. If `medications` comes back non-empty, show it as a simple list — only
   relevant for prescriptions issued before this redesign.
5. Add a light client-side cooldown after several wrong entries (~5
   attempts) as a UX nicety — see the security note below for why that's
   not the real security boundary.

### Registration: Birth Year field
- Patient sign-up needs a **Birth Year** field: exactly 4 digits, range
  `[currentYear-120, currentYear]`, required for the patient role only.
- Persist to `patient_profiles.birth_year` — nullable at the DB level
  (enforced as "required" at the app layer, not a hard `NOT NULL`, so it
  doesn't break other flows).
- Existing patients without a `birth_year` should be prompted to set one
  right after their next login, once, not repeatedly.

## Security note worth relaying to the IS team as-is

Birth year is a deliberately weak "secret" — it's realistically guessable
or already known to people around the patient, and it's the same value for
every prescription that patient will ever have. It was chosen anyway, on
purpose, after that tradeoff was discussed. **It is a UX confirmation
step, not the real access boundary.** The actual security here is Supabase
Storage's folder-based RLS: a user can only ever get a signed URL for
files inside their own `{their_user_id}/` folder. The mobile app must
authenticate with Supabase Auth using the *same* accounts as web (shared
`auth.users`) so `auth.uid()` resolves correctly for these policies to do
anything.

## Open items to confirm with the IS team before they start

- They must point at the **same** Supabase project (URL + anon key) as
  web — otherwise prescriptions won't be shared between the two apps at
  all. The anon key is meant to be public/embedded in client code; RLS is
  what actually protects data, not keeping that key secret.
- Whether the mobile app needs the doctor-issuance flow too, or is
  patient-only.
- Confirm file size/type limits they want to enforce (web uses PDF or
  image, ~10MB) so behavior matches across platforms.
