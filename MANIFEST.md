# Final delivery — corrected after recovering your real files

## The key discovery this round
`app/cases/new/page.tsx` (your real, live page — 903 lines, confirmed by
its `handleSynthesize` function) calls `/api/cases/synthesize` with a JSON
body (`rawText`, `organizationId`, etc.) and expects a SOAP-note-style
`masterRecord` (`chiefComplaints`, `historyOfPresentIllness`,
`clinicalExamination`, `managementPlan`). This is a COMPLETELY different
contract than `CaseWorkflowStudio.tsx`, which sends FormData and expects
`primaryDiagnosis`/`coreEducationalMessage`.

**`CaseWorkflowStudio.tsx` is not wired into any route right now** — same
situation as `AppNavigation.tsx`. My earlier reconstruction of
`synthesize`/`cases` routes was built to match `CaseWorkflowStudio.tsx`,
which was the wrong target. That's fixed in this delivery.

## What changed from the previous zip
- `app/api/cases/synthesize/route.ts` — **replaced with your real,
  recovered original.** No reconstruction — this is your actual file.
- `app/api/cases/route.ts` — **replaced with your real, recovered
  original** (full GET with pagination/filters, simple stub POST for
  manual case creation).
- `lib/types.ts` — **deleted.** It only existed to type
  `CaseWorkflowStudio.tsx`'s contract, which isn't live.
- `app/globals.css` — rebuilt as a merge: your real original content
  (slate/teal palette, custom scrollbar, audio range-input styling) with
  my design tokens appended at the bottom, clearly marked, rather than
  replacing your file.
- `TAILWIND_CONFIG_ADDITION.md` (new) — the redesigned admin pages need a
  small addition to your real `tailwind.config.ts`, which I've never seen.
  This is instructions for a manual, additive edit, not a file to drop in.

## Everything else is unchanged from before
`prisma/schema.prisma`, `prisma/seed.ts`, `lib/r2.ts`, `lib/content-engine.ts`,
`lib/image-engine.ts`, the admin/cases + safety-queue + assets pages, the
two panel components, and the safety-flags/images/approve/assets API
routes — all additive, all independent of the synthesize/cases contract
confusion above. These generate the RFP's six required outputs
(video script, LinkedIn ×2, Facebook, X, YouTube/Reels, SEO blog) as a
SEPARATE, parallel admin governance flow — they do not replace or modify
your real doctor-facing dictation → synthesis → SOAP-note flow.

## Still NOT included, still yours
`package.json`, `app/layout.tsx`, `app/page.tsx` (dashboard),
`app/cases/new/page.tsx`, `next.config.ts`, `tsconfig.json`,
`tailwind.config.ts`, `lib/auth.ts`, `components/AppNavigation.tsx`,
`components/CaseWorkflowStudio.tsx` — all confirmed real, none touched.

## To apply
1. Copy this zip's contents into your project (structure matches
   `app/`, `lib/`, `components/`, `prisma/` at your project root) —
   this will NOT touch any of the "still yours" files above.
2. Manually apply `TAILWIND_CONFIG_ADDITION.md` to your real
   `tailwind.config.ts`.
3. `npx prisma generate && npx prisma migrate dev --name safety_and_images`
4. `npx tsx prisma/seed.ts` (optional — only feeds the admin-side content
   engine, not your real dictation flow)
5. `npm run dev` — test the real dictation flow at `/cases/new` first
   (should be completely unaffected by anything in this delivery), then
   check `/admin/cases` and `/admin/safety-queue`.
