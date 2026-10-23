# Source checkout and binary redistribution review items

The versioned source checkout includes source, the SheetJS vendor archive,
Adobe font, project icon, structured policy catalog and retained legal/source
evidence. Installed npm package trees and downloaded runtime binaries are not
part of that versioned source scope. The **0.5.6-alpha.2 desktop binary scope**
includes production runtime packages, native/OCR/model components and Electron;
see [binary scope and notices](BINARY-DISTRIBUTION.md). Historical source
inventories remain unchanged and do not describe the final application payload.

## Sixteen historical entries: actual binary scope

| Package | Version | Binary scope and current evidence |
| --- | --- | --- |
| @electron-internal/extract-zip | 1.0.5 | Build/install tool. Final package script must verify its code is absent. Historical BSD-2-Clause declaration/body limitation remains in the source evidence. |
| @tesseract.js-data/chi_sim | 1.0.0 | Production model wrapper/resource package. Exact MIT declaration and author metadata retained; independent MIT wrapper body not recovered. Model Apache notices are separately retained. Later repository Apache root LICENSE is supplementary. |
| @tesseract.js-data/eng | 1.0.0 | Production model wrapper/resource package; same separate MIT wrapper and Apache model scopes as chi_sim. Independent MIT wrapper body not recovered. |
| boolbase | 1.0.0 | Production Cheerio selector dependency. Real later-upstream ISC body recovered; identical installed index.js and bounded metadata difference recorded. Not represented as a file recovered from the original npm archive. |
| brotli | 1.3.3 | Production fontkit dependency. Exact MIT declaration and author retained; independent MIT body not recovered. Google Apache decoder source header retained separately. |
| chromium-pickle-js | 0.2.0 | Build tool. Final package script must verify its code is absent; historical MIT declaration/body limitation remains documented. |
| cross-dirname | 0.1.0 | Build/signing tool. Final package script must verify its code is absent; historical MIT declaration/body limitation remains documented. |
| dfa | 1.2.0 | Production fontkit dependency. Exact package/README MIT statements and author retained; independent body not recovered. Exact and current upstream tree are the same commit. |
| err-code | 2.0.3 | Build dependency. Final package script must verify its code is absent; historical MIT declaration/body limitation remains documented. |
| fontkit | 2.0.4 | Production PDFKit dependency. Complete exact archive now inspected; no project independent body recovered. Three test-font licenses are separate. Exact MIT statements and author retained. |
| lazy-val | 1.0.5 | Build tool. Final package script must verify its code is absent; historical MIT declaration/body limitation remains documented. |
| node-api-version | 0.2.1 | Build/rebuild tool. Final package script must verify its code is absent; historical MIT declaration/body limitation remains documented. |
| read-binary-file-arch | 1.0.6 | Build/rebuild tool. Final package script must verify its code is absent; historical MIT declaration/body limitation remains documented. |
| temp-file | 3.4.0 | Build utility. Final package script must verify its code is absent; historical MIT declaration/body limitation remains documented. |
| tmp-promise | 3.0.3 | Build utility. Final package script must verify its code is absent; historical MIT declaration/body limitation remains documented. |
| tr46 | 0.0.3 | Production node-fetch/whatwg-url dependency. Real MIT notice from the exact npm commit's direct next commit; only LICENSE.md was added. Later-upstream source identity is documented without calling it an original npm archive file. |

[Historical declaration evidence](declaration-evidence.json) preserves original
statements and the limitations known at source checkout review.
[Binary supplements](binary-distribution/PACKAGE-DECLARATIONS.json) add the
subsequent findings, original author fields and relative-path evidence.
[Real later notice provenance](binary-distribution/NOTICE-PROVENANCE.json) and
[code-match evidence](binary-distribution/CODE-MATCH-EVIDENCE.json) keep the
exact-version versus later-upstream distinction explicit.

The nine build/install tools need not be shipped as application code. Their
absence must be established by the final extracted-payload script, not assumed
from a dev flag. Electron itself is a devDependency that supplies the distributed
runtime and therefore retains its Electron/Chromium notice responsibilities.

The remaining five production entries with unrecovered independent bodies are
fontkit, dfa, Brotli's package MIT scope and the two MIT OCR wrappers. Their
published declarations and authors remain visible, accompanied by labelled
standard license references and any applicable genuine source/model notices.
A missing separate LICENSE file is not automatically a license conflict.
Reference terms are not fabricated author grants. No `BINARY_CLEARED` or
complete legal guarantee is claimed.

## Native, OCR and final package evidence

- [Native source provenance](native-source-provenance.json) preserves Canvas/Skia,
  93 Rust crate records, 12 Skia dependency notice sets, nine WASM build
  components and exact published WASM/model blob checks.
- The application uses the two `4.0.0` base models. The separate recorded
  integerized variants were not regenerated; final payloads must list whichever
  variants they actually contain. MIT wrapper metadata does not relicense
  Apache model data.
- Existing source notices remain intact. Native rebuilds are `NOT_RUN`;
  original source inventory is not proof of every final linked component.
  OpenLibm's LGPL test files are distinguished from runtime MIT/BSD/ISC/FDLIBM
  code; their existence is not an established runtime copyleft conflict.
- Final Windows x64 and macOS arm64/x64 component manifests, notice paths/hashes
  and nine-tool code absence are initially **NOT_RUN**, pending release-assembly
  evidence in [target validation](binary-distribution/TARGET-VALIDATION.json).
  The [binary distribution checklist](BINARY-DISTRIBUTION.md) defines the checks.

## Policy materials and bundled assets

Policy official originals and the derived QA image are not included in the
source checkout delivery. Original URLs and pinned hashes remain in the
[policy manifest](policy-source-manifest.json); downloads use the explicit
[cache command](../scripts/cache-policy-sources.mjs). Project MIT does not
relicense those original materials.

Adobe Source Han Sans, original OFL, the vendor SheetJS archive and original
Apache notices retain their existing provenance and terms. The original
SVG/PNG icon remains project MIT artwork. Binary component manifests must
reconcile the actual assets and notices they distribute.
