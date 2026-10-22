# Offline Excel parser dependency

SheetJS Community Edition 0.20.3 (Apache-2.0), vendored from the official distribution:
https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

Fetched 2026-10-14 over HTTPS with normal certificate verification. The dependency
is pinned to `file:vendor/xlsx-0.20.3.tgz`; npm records package integrity in
`package-lock.json`. Installation and runtime require no SheetJS CDN access.

SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`

The original tarball includes the upstream Apache-2.0 license. The parser reads
cell values, formatting and existing formula caches; it does not calculate
formulas, run macros or retrieve external links. Excel extraction has explicit
file, decompression, worksheet, row/column, cell and sparse-table expansion caps.

## Open-source candidate notice preservation

The tarball SHA-256 above was checked again on 2026-10-23. The exact installed 0.20.3 package license is also preserved in [`third_party/licenses/xlsx@0.20.3--16c95d29/LICENSE`](../third_party/licenses/xlsx@0.20.3--16c95d29/LICENSE). See the root `THIRD_PARTY_NOTICES.md` and `third_party/dependency-inventory.json`. This preservation does not relicense SheetJS or its code under the project MIT license.
