# Import formats — V393

Source implementation only; runtime acceptance belongs to the user.

| Format | Import behavior |
| --- | --- |
| DXF | Existing ASCII geometry preview, layer selection, crop, units and optional object recognition. |
| DWG | Browser-local DWG to ASCII DXF conversion, then the same DXF preview. Supported file signatures: AC1012–AC1032 (R13–R2018 family). No claim of full AutoCAD fidelity. |
| PDF | Existing page selection/crop; imported pages are raster image objects. |
| CDR | Explicit conversion guide; export PDF or DXF in CorelDRAW, then select that output. Direct CDR parsing is deferred. |
| RoomPlan / JSON | Existing project-opening path; replaces the current drawing. |

Desktop: File → Import. Mobile: main menu → Import.
Choose a format in the Import dialog, then select the file. Existing Open/Ctrl+O
and direct DXF/PDF actions remain callable for compatibility.

DWG conversion uses the pinned `dwgdxf@2.0.1` browser WASM assets (MIT wrapper;
acadrust 0.4.0 parser under MPL-2.0),
served from `assets/vendor/dwgdxf/`; no CDN or upload service is used. The worker
loads only after DWG selection. Source package, license and SHA-256 hashes are
recorded beside the vendor files. New dependency installation/build is not needed.

DWG input is limited to 25 MiB; converted output is limited to 80 MiB, followed
by the existing DXF geometry/import limits. Conversion runs in a disposable
module Worker, with cancel and a two-minute deadline. Cancel/error/timeout
terminates the worker and releases its WASM memory. Drawing identity is checked
after conversion and again before applying geometry. No drawing mutation happens
until the existing DXF import confirmation.

Use HTTPS hosting (such as the existing GitHub Pages deployment). Module Workers
and WebAssembly must be supported. File-system HTML previews may not load modules.
Unsupported versions, encrypted/corrupt drawings, complex/proxy/3D objects and
fonts may require an ASCII DXF export from the originating CAD software. Existing
DXF limitations apply to converted drawings, including omitted text/entities.

User runtime checks pending: import one real DWG with known units and layers;
compare geometry and scale to its DXF export; crop/confirm/Undo; cancel a second
conversion; check invalid/unsupported files; confirm PDF page import and existing
RoomPlan opening still work on desktop and iPhone. No build, tests or runtime
checks were executed by the assistant.

## Portable NRD resource envelope (V393-R)

NRD exports now use `format: "roomdesigner-portable/v1"` alongside the existing `doc`, `types`, and `catalog` keys, plus `assets.svg[]` for SVG asset IDs actually referenced by the drawing, its embedded revision snapshots, or catalog entries. Each item carries the sanitized SVG, ID, UTF-16 character length, FNV-1a 32-bit checksum, and limited display metadata. This checksum detects accidental damage; it is **not** a cryptographic authenticity signature.

When importing, the SVG package is checked for unique/safe IDs, schema, length, checksum, sanitization, and a bounded total (1,000 items, 250,000 characters per asset, 12,000,000 total characters). Referenced SVG resources missing from a portable package cause a failure **before** writing the drawing. A pre-existing unrelated symbol under the same ID is preserved; the incoming symbol receives a distinct `portable-svg-*` ID and imported drawing/revision/catalog references are remapped. Only changed draft assets are persisted, through the same `rd_pending_import` journal as `rd_last`, with the original `rd_svg_drafts` restored on failed writes/rollback. The old bare document and legacy `{doc,types,catalog}` envelopes remain readable, but cannot recreate any resource that the old file never contained.

Import/export source has been updated, but Node, Playwright, real-file/mobile, cross-store IndexedDB durability and end-user acceptance are still **NOT_RUN / PENDING**. Non-atomic LocalStorage/IndexedDB mirror reconciliation remains a separate open risk.
