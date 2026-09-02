-- Creates the missing ai-scans bucket (confirmed missing — see the
-- comment already sitting in src/pages/patient/AIScanner.jsx line ~103:
-- "Storage bucket not set up yet — skip silently". That catch swallows the
-- upload failure, imageUrl falls back to a browser-local blob: URL, and
-- that's exactly what ends up written to ai_scan_results.image_url — dead
-- the moment the tab closes. This is why the mobile team sees empty
-- strings and one expired blob: URL in that column.
--
-- Made PUBLIC on purpose, matching what the existing code already expects
-- (it calls storage.from('ai-scans').getPublicUrl(...) — a private bucket
-- would make that call return a URL that 403s). This is a judgment call,
-- not a certainty: skin-scan photos are health-sensitive, and a public
-- bucket means anyone who has (or guesses) the exact object path can view
-- one directly, no auth required — object paths aren't listable/
-- enumerable by outsiders, but "not enumerable" isn't the same guarantee
-- as prescription-files' private+signed-URL model. I went public because
-- it's a zero-contract-change fix that unblocks both teams this week
-- (mobile's image_url column keeps meaning "a working URL", not "a path
-- you must sign yourself"). If you'd rather match prescription-files'
-- stricter private/signed-URL pattern, that's a real option — it just
-- requires coordinating the image_url contract change with mobile first,
-- since they already read that column expecting a directly-usable URL.

insert into storage.buckets (id, name, public)
values ('ai-scans', 'ai-scans', true)
on conflict (id) do update set public = true;

-- Writes are still restricted even though reads are public: a user can
-- only upload into their own folder, matching the path convention already
-- in AIScanner.jsx: `${user.id}/${timestamp}_${filename}`.
drop policy if exists "patients can upload their own scan images" on storage.objects;
create policy "patients can upload their own scan images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ai-scans'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Public bucket reads normally go through the CDN public-URL path (no RLS
-- involved), but this also covers reads made through the Storage SDK
-- directly (e.g. .list()), which do still check policies.
drop policy if exists "anyone can read ai-scans images" on storage.objects;
create policy "anyone can read ai-scans images"
on storage.objects for select
to public
using (bucket_id = 'ai-scans');

-- Nothing to backfill: the old broken rows (empty image_url, the expired
-- blob: URL) never had a real stored file — there's no source image left
-- to recover. Only scans taken after this bucket exists will have a
-- working image_url. Leaving the old rows as-is; say the word if you'd
-- rather null them out explicitly instead of leaving a dead URL sitting
-- there.
