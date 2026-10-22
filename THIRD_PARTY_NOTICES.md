# Third-party notices

Biaoxi project source is offered under the root [MIT license](LICENSE).
Third-party materials retain their own rights and terms. Project MIT does not
relicense dependencies, fonts, policy source material or other third-party work.

## Current source delivery

This is a source-only candidate. Except for the SheetJS vendor archive listed
below, locked npm dependencies, Electron, native Canvas
addons, OCR WASM and traineddata are installation references; their package code
and binary payloads are **not bundled**. The legal/source evidence retained under
`third_party/` is documentation, not an installed dependency tree.

The [431-entry inventory](third_party/DEPENDENCIES.md) records 185 production and
246 development references according to the final lockfile dev flag. Optional
platform entries are included whether installed or not. The [JSON inventory](third_party/dependency-inventory.json)
separates evidence, SPDX declarations, selected alternatives, delivery scope and
future binary responsibilities.

| Material retained with source | Terms and evidence |
| --- | --- |
| `vendor/xlsx-0.20.3.tgz` | SheetJS Community Edition 0.20.3, Apache-2.0. [Vendor provenance](vendor/README.md) gives the official URL and verified tarball hash; its original package license is retained. |
| `assets/SourceHanSansSC-Regular.otf` | Adobe Source Han Sans SC Regular 2.005 under [SIL OFL 1.1](assets/FONT-LICENSE.txt). Its Git blob matches Adobe's official release. [Font metadata](third_party/font-metadata.json) and [source records](third_party/source-provenance.json) are retained. Reserved Font Name: Source. |
| `assets/icon.svg` and `assets/icon.png` | Original Biaoxi geometry under [MIT](assets/ICON-LICENSE.txt), copyright 2026 Biaoxi contributors. [Render script](scripts/generate-icon.mjs) generates the 1024 PNG without external artwork/fonts; [provenance and hashes](assets/icon-provenance.json) record the reproducibility check. |
| Structured offline policy catalog | Official PDF/DOCX/HTML originals and the derived QA contact sheet are **not bundled**. Original URLs and pinned hashes remain in the [policy manifest](third_party/policy-source-manifest.json). Downloads require the explicit [cache/hash-check command](scripts/cache-policy-sources.mjs); see the [policy README](assets/policies/README.md). Project MIT does not claim to relicense source policy material. |

## Dependency evidence

Exact installed-version notices are preserved under `third_party/licenses/`,
with source paths and SHA-256 hashes. [Exact upstream provenance](third_party/exact-upstream-provenance.json)
pins additional original notices and source evidence to immutable commits and
Git blob hashes.

The project chooses MIT for JSZip's `(MIT OR GPL-3.0-or-later)` alternative.
Pako's MIT and Zlib notices are both retained. Missing lock license fields were
checked against actual text: busboy, png-js and streamsearch use MIT; duck's BSD
text is BSD-2-Clause. Missing metadata or offered alternatives are not treated
as established license conflicts.

Exact release licenses were recovered for saxes and the app-builder-lib /
dmg-builder monorepo. Original Apache author grant headers are retained for
filelist and Jake, plus app-builder-lib's embedded Yarn BSD notice. The exact
published Compare-version and Keyv README sections state MIT and name their
copyright holders.

Thirteen historical packages have exact-version declarations but no recovered
complete standalone author notice/grant body. Two OCR wrappers and Brotli have
separately documented body/attribution gaps. [Declaration evidence](third_party/declaration-evidence.json)
retains the original statements, authors, inspected source references and
precise limitations. These packages are not bundled in this source candidate.
The missing-body facts are future binary redistribution responsibilities; they
are not thirteen proven authorization conflicts or a blanket conclusion that
this source candidate cannot be shared. Official SPDX text is retained only as
labelled terms reference, never as a fabricated upstream author grant.

## Native and OCR provenance

[Native source provenance](third_party/native-source-provenance.json) records:

- Canvas's registry source commit and pinned Skia commit, original Skia notice,
  [93 checksum-verified Rust source archives and notices](third_party/canvas-rust-inventory.json),
  and [12 enabled Skia dependency notice sets](third_party/canvas-skia-deps.json).
  Missing workspace notices were recovered at exact crate VCS commits.
- Tesseract.js-core 7.0.0's nine pinned build submodules and original notices.
  Twelve installed WASM/JS files match Git blobs checked in at the registry
  source commit. Source rebuilds were not performed.
- Four exact training-data gzip Git blobs. The two base models also match the
  original model Git blobs after decompression. Integerized results match the
  published compressed blobs; their transformation script is retained but
  integerization was not rerun. Wrapper MIT declarations and original
  Apache-2.0 model notices are separate scopes.

This software is based in part on the work of the Independent JPEG Group.
The native graphics source uses FreeType under the FreeType License and is
based in part on the work of the FreeType Team. The selected alternative is
FreeType License; the offered GPL alternative does not make it GPL-only.
OpenLibm's original notice distinguishes runtime MIT/BSD/ISC/FDLIBM code from
LGPL test files.

The full Electron 44.7.0 Chromium notice is retained as version-matched reference
under `third_party/runtime/electron-44.7.0/`. It does not prove final target
packaging or identical components across platforms.

## Future binary delivery

Before distributing an application binary, reconcile the actual target component
manifest and final linkage, retain applicable runtime/native/model notices, and
address the precise missing upstream standalone notices in [future binary responsibilities](third_party/REVIEW-ITEMS.md).
Native build reproduction and final macOS/Windows package notice validation
remain **NOT_RUN**. This collection records evidence and scope; it does not
assert complete legal clearance or invent rights absent from upstream materials.
