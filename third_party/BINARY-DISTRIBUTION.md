# Desktop binary distribution: 0.5.6-alpha.2

This record describes the public prerelease binary delivery scope for Windows
x64 and macOS arm64/x64. The versioned source checkout and an assembled desktop
application have different contents. Historical `not-bundled` fields in the
unchanged source evidence inventories describe source-checkout delivery only.

Desktop binaries carry production JavaScript dependencies, the selected native
Canvas addon, OCR JS/WASM and model resources, the target Electron runtime,
the application font and other listed assets, and their notices. Each target
has a component manifest recording the actual payload and notice locations.
The bundled [target validation](binary-distribution/TARGET-VALIDATION.json) is a
**source pre-assembly validation-plan snapshot**: its original `NOT_RUN` values
are preserved, rather than updated inside a sealed or signed package. Final
execution evidence is published separately in the fixed
[v0.5.6-alpha.2 Release Assets](https://github.com/X9728771115-dotcom/biaoxi/releases/tag/v0.5.6-alpha.2):
`desktop-manifest-<platform>-<arch>.json`, `core-smoke-<platform>-<arch>.json`,
`startup-smoke-<platform>-<arch>.json` and `SHA256SUMS.txt`.
Consult the matching target assets for completed checks; an absent result is
not a passing result. This document does not replace those checks or provide a
complete legal guarantee.

## Original notices, later notices and standard references

All previously retained original notices remain in place. The
[source inventory](dependency-inventory.json),
[exact upstream provenance](exact-upstream-provenance.json) and
[native/OCR provenance](native-source-provenance.json) preserve their sources
and hashes. The binary supplement adds only bounded, public dependency facts:

- [Original later-upstream notice provenance](binary-distribution/NOTICE-PROVENANCE.json)
  records source URLs, commits, Git blobs and SHA-256 hashes, using relative paths.
- [Published declarations and original author metadata](binary-distribution/PACKAGE-DECLARATIONS.json)
  records exact package versions, unchanged license identifiers and author fields.
- [Minimal code-match evidence](binary-distribution/CODE-MATCH-EVIDENCE.json)
  distinguishes identical runtime bytes from the original npm release archive.
- [Bounded source inspection](binary-distribution/SOURCE-INSPECTION.json)
  records what exact and later upstream material was actually checked.

The [SPDX standard texts](license-templates/) remain **standard terms references
for published identifiers**. They are not recovered upstream package notices.
No copyright year, holder or author grant has been invented by filling a
template. The absence of a separate LICENSE file is not automatically a license
conflict. No `BINARY_CLEARED` status is asserted.

## Seven production dependency entries

| Package | Published declaration and author | Retained binary notice evidence and bounded limit |
| --- | --- | --- |
| boolbase 1.0.0 | ISC; Felix Boehm | [Real later ISC notice](binary-distribution/notices/boolbase/LICENSE). Its upstream commit adds only LICENSE; the package still says 1.0.0 and index.js matches the installed version byte for byte. The package test script differs. This is a later-upstream identical-runtime-code notice, not a recovered original npm archive file. |
| tr46 0.0.3 | MIT; Sebastian Mayr | [Real later MIT notice](binary-distribution/notices/tr46/LICENSE.md). The direct next commit after the exact npm gitHead adds only LICENSE.md. Installed index.js and package.json match the exact parent Git blobs. Generated mapping data was not regenerated. This is a later-upstream notice, not an original npm archive file. |
| fontkit 2.0.4 | MIT in package.json and README; Devon Govett | Complete exact archive inspected: 18,224,180 bytes, 218 members, 194 files, all 118 overlapping source/package/README files match. No project standalone body was found; three test-font licenses have separate scope. Later source also lacks a project body. Retain the declaration, author metadata and clearly labelled MIT reference. |
| dfa 1.2.0 | MIT in package.json and README; Devon Govett | Exact complete source tree and the unchanged current HEAD have no recovered standalone author body. Retain the exact published statements, author metadata and labelled MIT reference. |
| brotli 1.3.3 | MIT in package.json and README; Devon Govett | [Google Apache decoder source header](licenses/brotli@1.3.3--ddb9b3df/APACHE-decoder-source-notice.txt) is retained separately. Exact and later source trees have no recovered independent package-level MIT body. Keep both scopes visible. |
| @tesseract.js-data/chi_sim 1.0.0 | MIT wrapper declaration; Balearica; contributors Balearica and jeromewu | Full independent MIT wrapper body not recovered. Exact model Apache notice is linked below. The [real later Apache root LICENSE](binary-distribution/notices/tessdata-later-root/LICENSE) is supplementary and does not stand in for an MIT wrapper notice. |
| @tesseract.js-data/eng 1.0.0 | MIT wrapper declaration; Balearica; contributors Balearica and jeromewu | Same separate wrapper/model scopes and remaining independent MIT-body fact as chi_sim. |

The two OCR wrappers' exact repository commit is followed immediately by a
commit adding only an Apache root LICENSE. However, the retained source
generator differs from the published v1 wrapper index.js; byte-identical
published-wrapper applicability was not established. Its MIT declaration is
therefore preserved without being silently replaced.

The current application reads the `4.0.0` base Chinese and English models.
Their original [Apache-2.0 model COPYING](source-evidence/tesseract-ocr_tessdata/277725be3b123d384af6f1ce237fc274421e502b/COPYING.txt)
is retained with the [exact model lineage/hashes](native-source-provenance.json).
The original [tessdata_best Apache notice](source-evidence/tesseract-ocr_tessdata_best/e9f15884bc503cf905c8a1dbbc9cb14458152628/LICENSE.txt)
also remains for the separately recorded integerized source scope. Models are
not relicensed as MIT by the wrapper metadata or project license. If unused
model variants remain in the final payload, the manifest must list them.

## Nine build/install tools

The following REVIEW entries belong to the build/install dependency graph.
Final package validation must verify that their **code is absent**, including
nested copies. Their historical declarations and legal evidence may remain in
the evidence bundle.

| Package | Build/install use |
| --- | --- |
| @electron-internal/extract-zip 1.0.5 | Electron npm download extraction |
| chromium-pickle-js 0.2.0 | app-builder-lib |
| cross-dirname 0.1.0 | Windows signing tool |
| err-code 2.0.3 | Build graph promise-retry |
| lazy-val 1.0.5 | Electron packaging/publishing tools |
| node-api-version 0.2.1 | Electron rebuild tool |
| read-binary-file-arch 1.0.6 | Electron rebuild tool |
| temp-file 3.4.0 | Packaging utilities |
| tmp-promise 3.0.3 | Flatpak bundling tool |

**Electron 44.7.0 is the runtime exception.** Its npm installer is a
`devDependency`, but the resulting Electron runtime is distributed with the
desktop application. Keep its [LICENSE](runtime/electron-44.7.0/LICENSE) and
full [Chromium notices](runtime/electron-44.7.0/LICENSES.chromium.html), and
reconcile them against the notices supplied by each actual target runtime.
An npm dev flag alone is not evidence that a component is absent.

## Minimum target manifest and checks

| Check | Required record |
| --- | --- |
| Artifact | Application version 0.5.6-alpha.2, platform/CPU, format, artifact SHA-256 and extracted payload location within the release |
| Installed packages | Actual npm names, versions and relative payload paths, keeping duplicate versions distinct; applicable notice paths/hashes |
| Electron | Target runtime version/archive identity and hash, target-supplied LICENSE and LICENSES.chromium.html, final readable notice locations |
| Native Canvas | Actual .node target/package version/hash and source/registry pointer; external dynamic libraries if present; existing conservative Canvas/Skia/Rust notices retained |
| OCR | Actual JS/WASM filenames/hashes mapped to existing source blobs; Tesseract/core and nine build-component notice sets retained |
| Models | Actual Chinese/English model files/hashes; wrapper and data scopes kept distinct; original Apache data notices retained |
| Other assets | Adobe font hash and original OFL; SheetJS original LICENSE; PDF.js auxiliary font/cmap/ICC/WASM notices for any included assets |
| Final payload | All nine development-tool code trees absent; applicable notice files and local links present; user can open notices |

The Windows x64 delivery includes setup and portable formats; macOS arm64/x64
delivery includes DMG and ZIP formats. These formats share the same notice
responsibilities for their contained application. Any installer runtime
components must also retain their applicable notices.

The existing font [OFL and Adobe copyright](../assets/FONT-LICENSE.txt),
[SheetJS original LICENSE](licenses/xlsx@0.20.3--16c95d29/LICENSE),
native source notices, FreeType License choice and Independent JPEG Group
acknowledgement remain in effect. Existing broad source inventories are
conservative evidence, not a reconstructed final linkage SBOM. Native source
rebuilds remain `NOT_RUN`; that fact alone is not a demonstrated runtime
license conflict.

The final package verification script records actual manifest results and
development-tool absence in external release evidence. The bundled plan remains
`NOT_RUN` as a historical pre-assembly snapshot. Do not rewrite sealed or signed
package contents to insert final artifact hashes or later execution results;
that would invalidate the artifact and create circular self-verification.
