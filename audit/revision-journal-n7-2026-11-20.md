# RoomDesigner N7 — RD-ST-REV-01: Revision Journal consistency

Date: 2026-11-20; Baseline: `f9dbd999495a10fa8428f1b37e7ac331cff7f791` (V398-R main); Target: **V399-R**.  
Scope: static source remediation only. **Tests, builds, Chromium/iOS and crash simulations NOT_RUN.**

## Confirmed P1 source flaw
`saveLocal()` writes `rd_pending_revision`, then `rd_profiles`, then `saveAuto()` persists `rd_last`. A crash in between leaves the new profile and an old but valid current document. Startup previously cleared the recovery journal with `profileExpected && currentValid`, without proof that `rd_last` belongs to the new Revision.

## Source correction
1. Keep exact expected checksums for both stores as primary commit evidence.
2. Permit a later autosaved drawing only with identical document ID, same valid integer Revision and a unique, identical Revision record in current drawing and saved profile.
3. Otherwise preserve journal and both stores, block unsafe writes and leave existing manual export/review flow. Never automatically prioritize an IndexedDB generation.

Six regression scenarios were added as test source and **not executed**. This fix does NOT make LocalStorage and IndexedDB atomic. Ambiguous crash states, denied writes, actual browsers and user acceptance remain **OPEN**. V400 milestone source audit is due.
