# Third-party evidence bundle

Start with [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). This source-only
candidate references npm packages, except the explicit SheetJS vendor archive,
without bundling their installed package trees, native addons,
OCR runtime or traineddata. Vendor SheetJS, the Adobe font, original icon,
structured policy catalog and retained legal/source evidence have separate
records. Raw policy originals and the QA image are not bundled.

- [DEPENDENCIES.md](DEPENDENCIES.md) and [dependency-inventory.json](dependency-inventory.json)
  record final lock references, declarations, evidence and delivery scope.
- `licenses/` holds exact-version original notices and labelled README/source
  excerpts. `runtime/electron-44.7.0/` holds Chromium/Electron notice evidence.
- [exact-upstream-provenance.json](exact-upstream-provenance.json) pins original
  copies in `source-evidence/` to commits, Git blobs and SHA-256 hashes.
- [declaration-evidence.json](declaration-evidence.json) and `declarations/`
  preserve exact historical statements and bounded missing-body facts.
- [native-source-provenance.json](native-source-provenance.json), [Rust crate inventory](canvas-rust-inventory.json)
  and [Skia dependency inventory](canvas-skia-deps.json) record native/OCR source
  pointers, binary/blob checks and original notices.
- `license-templates/SPDX-*.txt` are official standard terms references, not
  substitutes for author grants. [source-provenance.json](source-provenance.json)
  records those references and verified font/icon sources.
- [font-metadata.json](font-metadata.json) identifies the bundled font. The
  original icon has [SVG](../assets/icon.svg), [generator](../scripts/generate-icon.mjs)
  and [hash record](../assets/icon-provenance.json).
- [policy-source-manifest.json](policy-source-manifest.json) is maintained by the
  policy workflow. Original-file URLs/hashes describe **not-bundled** materials;
  fetching requires the explicit [cache command](../scripts/cache-policy-sources.mjs).
- [REVIEW-ITEMS.md](REVIEW-ITEMS.md) separates current source scope from future
  binary responsibilities. A missing historical standalone body is not labelled
  a demonstrated authorization conflict.

Exact source copies carry Git blob IDs. Crate archives were checked against the
exact Cargo.lock checksums. These establish provenance/copy integrity, not a
claim that all legal questions or future platform binaries have been audited.
Refresh the inventory when references or distributed assets change.
