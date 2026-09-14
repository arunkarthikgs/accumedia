# Changelog — RFP gap-closing pass

This covers changes made directly on top of the project you uploaded
(`macula_custom_project_files.zip`). Files not listed below are untouched.
Nothing here reconstructs the missing scaffolding (`package.json`,
`tsconfig.json`, `next.config.*`, `app/layout.tsx`, root `app/page.tsx`,
`.env`) — that's still a separate step; ask if you want that done too.

## How to apply

Unzip this over your real project (or diff it against your repo and cherry-pick).
Then:
```
npx prisma generate
npx prisma migrate dev --name rfp_gap_fixes
npx tsx prisma/seed.ts   # or: npx ts-node prisma/seed.ts
```
The migration will add new enum values, new columns, and three new tables
(`SafetyFlag`, `ImageAsset`, `AssetVersion`) — it should apply cleanly on
top of existing data, since nothing existing was removed or renamed.

## Why these changes, mapped to the RFP

### 1. `prisma/schema.prisma`
- `CaseStatus` — added `DRAFT`, `SCHEDULED`, `EXPORTED`, `PUBLISHED` (RFP §17 status flow was previously missing 4 of its 5 states)
- New `AssetStatus` enum — `GeneratedAsset` had **no status field at all**, so there was no way to represent "this one LinkedIn post is approved but the Facebook post isn't" (RFP §17: "Regenerate only one platform output" / independent approval)
- New `SafetyFlagStatus`, `SafetyFlagTargetType`, and `SafetyFlag` model (RFP §16) — flags now exist as queryable rows with an explicit human decision, not just JSON embedded in a `safetyAudit` blob nothing enforces
- New `OutputType` enum listing the RFP's six required outputs (§7–12) — `ChannelDefinition` and `GeneratedAsset` now reference it, so generation is tied to a fixed, required set rather than whatever the LLM felt like naming that call
- New `ImageAsset` model (RFP §14–15) — didn't exist previously; includes the explicit `publicUseApproved` / `consentConfirmed` fields the RFP requires before any image can go out
- New `AssetVersion` model (RFP §17 "Retain version history") — previously nothing snapshotted prior content before a regenerate/edit overwrote it
- `Case` — added `speciality` and `targetAudience` (RFP §18 dashboard search needs a speciality field that didn't exist), and `mccrApprovedAt`/`mccrApprovedBy` to make the approval gate an explicit, queryable event rather than inferred from `status`
- `ChannelDefinition` — added `outputType`, `wordCountMin/Max`, `durationLabel` so a channel definition actually maps to one of the six required outputs and its constraints, instead of being a free-text label with a system prompt attached to nothing in particular

### 2. `lib/content-engine.ts` (new)
The actual Platform Adaptation Engine (RFP §6 architecture, §7–12 outputs).
Previously, the six required output types (video script, LinkedIn ×2,
Facebook, X, YouTube/Reels, SEO blog) were **not implemented anywhere** —
`synthesize/route.ts` generated example content shaped like a discharge
summary and a referral letter instead. This file generates one asset per
active `ChannelDefinition`, using a default prompt per `OutputType` (falls
back to these if an org hasn't customized `ChannelDefinition.systemPrompt` —
this is the Prompt Management Layer, RFP §25, actually wired up now instead
of sitting unused).

### 3. `prisma/seed.ts` (new)
Seeds the eleven default channel definitions (5 video durations + 6 other
outputs) so a fresh org gets the full RFP Phase I output set without manual
admin setup.

### 4. `app/api/cases/synthesize/route.ts` (rewritten)
Previously did MCCR-building **and** full channel-draft generation in one
LLM call, before any doctor review — inverting the RFP §6 required order
(Doctor Input → MCCR → **Approval** → Adaptation Engine). Now this endpoint
only builds the MCCR and runs safety screening, writing flags as real
`SafetyFlag` rows. It never generates channel content.

### 5. `app/api/cases/[id]/approve/route.ts` (rewritten)
This is now the real gate the RFP describes:
- Refuses to approve (`409`) while any `SafetyFlag` is still `OPEN` — previously nothing checked this at all
- Only on successful approval does it call `runAdaptationEngine()` to generate assets — previously assets were already generated before this endpoint ran, making "approval" a no-op status flip

### 6. `app/api/cases/[id]/assets/[assetId]/route.ts` (new)
Implements the per-asset actions RFP §17 requires and that didn't exist:
regenerate one platform output, manual edit, independent approve — each
snapshotting the previous content to `AssetVersion` first, and each never
touching sibling assets for other channels.

### 7. `app/api/safety-flags/route.ts` (new)
Backend for the safety review queue (RFP §16). Also incidentally fixes the
dangling `fetch('/api/diagnostics/prompts-properties')` call in
`PromptInspectorModal.tsx` by giving the safety-flag data a real home — you
may still want to either build that diagnostics endpoint or repoint the
modal at this one, depending on what it's meant to show.

### 8. `app/api/cases/route.ts` (fixed)
`GET` returned the 20 most recent cases **across every organization**, with
no filter — a real tenant-isolation leak (RFP §20: "No client should have
access to another client's data"). Now requires `orgId` and filters on it.
This is a stopgap: once real auth exists, `orgId` should come from the
authenticated session, not a client-suppliable query param, since right now
nothing stops a client from passing a different org's id.

### 9. `app/api/audio/process/route.ts` (removed)
Redundant, superseded pipeline — duplicated `/api/audio/upload` →
`/api/audio/transcribe` → `/api/audio/refine`, hardcoded to OpenAI Whisper
only (bypassing the ASR factory), and didn't link a `caseId` the way the
newer flow does for chain-of-custody. Nothing in the uploaded frontend
referenced it, so it was safe to remove outright.

## Round 2 — image wiring + admin UI (this pass)

### `lib/r2.ts` (refactored)
Generalized `uploadAudioToR2` into a shared `uploadBufferToR2` helper plus a
new `uploadImageToR2`, namespaced under `<orgId>/images/` vs `<orgId>/audio/`.

### `lib/image-engine.ts` (new)
RFP §14's image generation engine — one AI image per channel aspect ratio
(`linkedin_cover`, `linkedin_carousel`, `facebook_post`, `ig_reels`,
`x_image`, `yt_thumbnail`, `blog_featured`), brand-accent-aware prompt,
uploaded to R2, always created with `publicUseApproved: false`. Did not
exist before this pass — image generation wasn't implemented at all.

### `app/api/cases/[id]/images/route.ts`, `.../images/upload/route.ts`, `.../images/[imageId]/route.ts` (new)
List/generate, doctor-upload-with-consent, and per-image approve/regenerate/
delete. AI generation is locked behind `mccrApprovedAt` being set — same
approval-before-generation rule as text assets. The upload route refuses to
set `publicUseApproved: true` in the same request unless
`consentConfirmed: true` is also present (RFP §15).

### `app/api/admin/cases/route.ts` (fixed — important)
Found while wiring up the admin UI: the existing admin "Approve" button
called `PATCH /api/admin/cases`, which flips status straight to `APPROVED`
with **no safety-flag check and no Adaptation Engine trigger** — completely
bypassing the gate built in the previous pass. `PATCH` now rejects
`status: "APPROVED"` outright and points to the correct endpoint;
`GET` now also returns each case's open `safetyFlags` so the UI can show
them without a second round trip.

### `app/admin/cases/page.tsx` (fixed)
- Approve button now calls `POST /api/cases/[id]/approve` (the real gate) instead of the ungated `PATCH`
- Approve button disables and relabels ("Flags open") when a case has open safety flags, with the flag detail in its tooltip
- A dismissible banner surfaces the specific flag(s) blocking approval if the gate still returns 409 (e.g. a flag opened after page load)
- Fixed a dead `fetch("/api/organizations")` call (that route doesn't exist in this project) to `fetch("/api/admin/organizations")`, which does

### `app/admin/safety-queue/page.tsx` (new)
The Safety Review Queue admin screen from the RFP (§16, §19) — previously
had a backend (`/api/safety-flags`, added last pass) but no UI at all. Lists
open flags org-filterable, with three explicit resolutions (OK / needs
redaction / reject) — never a generic "dismiss".

### `components/AssetActionsPanel.tsx`, `components/ImagesPanel.tsx` (new) + `app/cases/[id]/assets/page.tsx` (updated)
The per-asset regenerate/edit/approve backend from the previous pass had no
caller — the assets page just displayed static JSON. `AssetActionsPanel`
wires up all three actions per asset (each only touching that one asset's
row). `ImagesPanel` wires up the new image endpoints: generate-per-channel,
upload-with-consent-checkbox, and a public-use toggle that refuses to
enable itself without consent confirmed on the client side too (the API
already enforces this server-side; this just avoids a round trip for the
obvious case).


## Round 3 — visual redesign (this pass)

The project shipped with the generic "SaaS card kit" look — uniform
rounded-2xl white cards, soft grey shadows, bright teal-600/emerald-600
accents, pastel pill badges — regardless of subject matter. Replaced with a
deliberate design system instead.

### Design concept: "Clinical Ledger"
Closer to a hospital lab report or medical-journal layout than a startup
dashboard — precise, structured, quietly authoritative, since this is a
tool physicians use to sign off content under their own name. Status is
now communicated structurally (a coloured left-edge bar on cards/rows)
rather than decoratively (pastel pill backgrounds everywhere). Colour
palette: deep pine-teal for brand/primary actions, sage for approved,
burnt ochre for pending/flagged, muted brick for rejected/danger — all
deliberately desaturated compared to the previous bright emerald/rose/amber
defaults. Typography: Source Serif 4 for headings only (a clinical-journal
serif, not the cliché Playfair/Georgia-on-cream pairing), IBM Plex Sans for
UI/body, IBM Plex Mono for IDs and data.

### New files
- `app/globals.css`, `tailwind.config.ts` — the token system (`--ink`,
  `--paper`, `--pine`, `--ochre`, `--brick`, `--sage`, etc.) plus a `.card`
  utility class so every panel shares one definition of "card" instead of
  repeating the same Tailwind chain everywhere
- `app/layout.tsx` — loads the three fonts via `next/font/google` and
  applies the CSS variables; this file didn't exist in the uploaded
  project at all (part of the missing scaffolding flagged in Round 1),
  so it's new rather than modified
- `components/ui/StatusTag.tsx` — the shared status-tag primitive (colored
  dot + label) used everywhere a status previously got its own one-off
  pastel pill markup

### Restyled (same functionality, no logic changes)
- `app/admin/cases/page.tsx` — search/filter bar, table, rejection modal,
  audit-trail modal all restyled; all existing state/handlers untouched
- `app/admin/safety-queue/page.tsx`
- `app/cases/[id]/assets/page.tsx`
- `components/AssetActionsPanel.tsx`, `components/ImagesPanel.tsx`

### Not touched in this pass
`app/cases/new/page.tsx` (831 lines), `app/admin/organizations/page.tsx`,
`app/admin/compliance/prompts/page.tsx`, and `app/cases/[id]/review/page.tsx`
still use the old visual style. Say the word and I'll bring them in line
with the same system — the tokens and `StatusTag` primitive are already in
place, so it's markup/class changes only, not new design decisions.

- **No authentication.** Every route still trusts client-supplied IDs. This is the biggest remaining gap and should come before any of this touches real patient-adjacent data.
- **SEO keyword engine as a distinct feature** (RFP §13) — still folded into the `SEO_BLOG` output's prompt rather than a separate keyword-extraction pass.
- **Dynamic X/Twitter character limit** (RFP §10) — `content-engine.ts` hardcodes `280` where the RFP asks for it to track the platform's current limit; flagged inline in the code.
- **`/cases/[id]/review` is still a static stub** — it doesn't fetch the case, doesn't show its actual safety flags, and isn't wired to the approve endpoint. The case-creation wizard redirects here after synthesis, so right now a doctor lands on a generic informational page rather than their own case's MCCR review. Approval currently only happens through `/admin/cases` or by calling the API directly — worth fixing next if doctors (not just admins) need to approve their own cases.
- **Logo/typography compositing on generated images** — `lib/image-engine.ts` generates the base concept image only; actually stamping the org's logo and exact brand typography onto it needs a separate compositing pass (e.g. `sharp`), noted inline in that file.
- **PHI/face detection on doctor-uploaded images** — uploads land as `phiReviewStatus: "PENDING"` but nothing automatically screens them; a human has to set that status today (no route to do so was built — `PATCH /api/cases/[id]/images/[imageId]` accepts a `phiReviewStatus` value but nothing calls it with one yet).


## Round 4 — full runnable scaffolding (this pass)

Everything needed to actually `npm install && npm run dev` this project,
reconstructed since none of it was in the original upload:

- `package.json` — dependencies inferred directly from every `import`
  statement actually used across the codebase (checked via grep, not
  guessed), plus `prisma`/`tsx` as dev dependencies for migrations and the
  seed script
- `tsconfig.json` — includes the `@/*` path alias every file already
  assumed was configured
- `next.config.js` — minimal, with `images.remotePatterns` open for R2
- `postcss.config.js` — required for Tailwind to actually process
- `app/page.tsx` — the root landing page. Every other page links back to
  `/` as "Dashboard" but nothing existed there — this is intentionally
  minimal (three links out to New Case / Case Governance / Safety Queue),
  not a page that needed a redesign pass of its own
- `.env.example` — every environment variable actually referenced in the
  code (found via grep across `process.env.*`), with a comment on what
  each one is for and which file reads it
- `.gitignore` — standard Next.js ignores

This round's zip is flat (no wrapper folder) — extract it straight into an
empty project folder and everything lands in the right place. Copy
`.env.example` to `.env` and fill in real values before running.
