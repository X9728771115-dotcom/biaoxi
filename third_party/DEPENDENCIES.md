# Dependency license inventory

This is the final lockfile inventory for the **source-only candidate**. Installed npm package trees and native/WASM/model payloads are not bundled. The SheetJS vendor source archive is the explicit bundled dependency exception; font/icon assets have separate records. The JSON deliveryStatus field distinguishes the actual vendor archive from installation references.

`SOURCE_REFERENCE_VERIFIED` records the exact declared reference and retained evidence. It does not claim that a missing historical notice was recovered or that every future binary component has been audited. Standard SPDX texts are terms references, not invented author permission.

| Package | Version | Scope | Declared SPDX / selection | Actual evidence and notice copies |
| --- | --- | --- | --- | --- |
| `@electron-internal/extract-zip` | 1.0.5 | development | BSD-2-Clause | EXACT_VERSION_DECLARATION_ONLY: [README-license-excerpt.txt](licenses/_electron-internal_extract-zip@1.0.5--e0350db6/README-license-excerpt.txt), [SPDX-BSD-2-Clause.txt](license-templates/SPDX-BSD-2-Clause.txt) |
| `@electron/asar` | 3.4.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/_electron_asar@3.4.1--1a9afc95/LICENSE.md) |
| `balanced-match` | 1.0.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/balanced-match@1.0.2--51589ca3/LICENSE.md) |
| `brace-expansion` | 1.1.21 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/brace-expansion@1.1.21--cb643435/LICENSE) |
| `minimatch` | 3.1.5 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/minimatch@3.1.5--7a27b0dd/LICENSE) |
| `@electron/fuses` | 1.8.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_electron_fuses@1.8.0--82b333cc/LICENSE) |
| `fs-extra` | 9.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@9.1.0--4869c74c/LICENSE) |
| `@electron/get` | 5.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_electron_get@5.1.0--6d112376/LICENSE) |
| `@electron/notarize` | 2.5.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_electron_notarize@2.5.0--2b4b73f4/LICENSE) |
| `fs-extra` | 9.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@9.1.0--ccd27472/LICENSE) |
| `@electron/osx-sign` | 1.3.3 | development | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/_electron_osx-sign@1.3.3--8c1bb745/LICENSE) |
| `isbinaryfile` | 4.0.10 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/isbinaryfile@4.0.10--d8640246/LICENSE.txt) |
| `@electron/rebuild` | 4.2.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_electron_rebuild@4.2.1--0aef53e0/LICENSE) |
| `@electron/universal` | 2.0.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_electron_universal@2.0.3--cc38c6f7/LICENSE) |
| `balanced-match` | 1.0.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/balanced-match@1.0.2--789cfdee/LICENSE.md) |
| `brace-expansion` | 2.1.7 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/brace-expansion@2.1.7--f84516f3/LICENSE) |
| `fs-extra` | 11.4.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@11.4.1--1c8c79de/LICENSE) |
| `minimatch` | 9.0.9 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/minimatch@9.0.9--315f0c3a/LICENSE) |
| `@electron/windows-sign` | 1.2.2 | development (optional) | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/_electron_windows-sign@1.2.2--32f9d1b0/LICENSE) |
| `fs-extra` | 11.4.1 | development (optional) | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@11.4.1--e38175ad/LICENSE) |
| `@isaacs/fs-minipass` | 4.0.1 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/_isaacs_fs-minipass@4.0.1--ffeb5bb7/LICENSE) |
| `@malept/cross-spawn-promise` | 2.0.0 | development | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/_malept_cross-spawn-promise@2.0.0--0ff0c60c/LICENSE) |
| `@malept/flatpak-bundler` | 0.4.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_malept_flatpak-bundler@0.4.0--43e52f78/LICENSE) |
| `fs-extra` | 9.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@9.1.0--85b6e3d2/LICENSE) |
| `@napi-rs/canvas` | 1.0.10 | production | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-android-arm64` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-darwin-arm64` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-darwin-x64` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-linux-arm-gnueabihf` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-linux-arm64-gnu` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-linux-arm64-musl` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-linux-riscv64-gnu` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-linux-x64-gnu` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-linux-x64-musl` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-win32-arm64-msvc` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@napi-rs/canvas-win32-x64-msvc` | 1.0.10 | production (optional) | MIT | EXACT_UPSTREAM_SOURCE_NOTICE_COLLECTION: [LICENSE](licenses/_napi-rs_canvas@1.0.10--5b23341d/LICENSE) |
| `@noble/hashes` | 2.4.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_noble_hashes@2.4.0--db8b4657/LICENSE) |
| `@peculiar/asn1-schema` | 2.10.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_peculiar_asn1-schema@2.10.0--44c21b9b/LICENSE) |
| `@peculiar/json-schema` | 1.1.12 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_peculiar_json-schema@1.1.12--84f91118/LICENSE) |
| `@peculiar/utils` | 2.0.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_peculiar_utils@2.0.3--a98850c0/LICENSE) |
| `@peculiar/webcrypto` | 1.7.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/_peculiar_webcrypto@1.7.1--7bf2e14e/LICENSE.md) |
| `@sindresorhus/is` | 4.6.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/_sindresorhus_is@4.6.0--75ecf936/license) |
| `@swc/helpers` | 0.5.23 | production | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/_swc_helpers@0.5.23--bab36505/LICENSE) |
| `@szmarczak/http-timer` | 4.0.6 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_szmarczak_http-timer@4.0.6--577f73c0/LICENSE) |
| `@tesseract.js-data/chi_sim` | 1.0.0 | production | MIT | EXACT_TRAINEDDATA_SOURCE_AND_WRAPPER_DECLARATION: [COPYING.txt](source-evidence/tesseract-ocr_tessdata/277725be3b123d384af6f1ce237fc274421e502b/COPYING.txt), [LICENSE.txt](source-evidence/tesseract-ocr_tessdata_best/e9f15884bc503cf905c8a1dbbc9cb14458152628/LICENSE.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `@tesseract.js-data/eng` | 1.0.0 | production | MIT | EXACT_TRAINEDDATA_SOURCE_AND_WRAPPER_DECLARATION: [COPYING.txt](source-evidence/tesseract-ocr_tessdata/277725be3b123d384af6f1ce237fc274421e502b/COPYING.txt), [LICENSE.txt](source-evidence/tesseract-ocr_tessdata_best/e9f15884bc503cf905c8a1dbbc9cb14458152628/LICENSE.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `@types/cacheable-request` | 6.0.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_cacheable-request@6.0.3--fc0ad248/LICENSE) |
| `@types/debug` | 4.1.13 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_debug@4.1.13--733aa767/LICENSE) |
| `@types/fs-extra` | 9.0.13 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_fs-extra@9.0.13--c37fa2be/LICENSE) |
| `@types/http-cache-semantics` | 4.2.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_http-cache-semantics@4.2.0--99b42217/LICENSE) |
| `@types/keyv` | 3.1.4 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_keyv@3.1.4--3c2ee0e1/LICENSE) |
| `@types/ms` | 2.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_ms@2.1.0--0dde133c/LICENSE) |
| `@types/node` | 26.6.4 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_node@26.6.4--abcdd38c/LICENSE) |
| `@types/responselike` | 1.0.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_responselike@1.0.3--62bf1d2c/LICENSE) |
| `@xmldom/xmldom` | 0.8.15 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_xmldom_xmldom@0.8.15--3c032e07/LICENSE) |
| `abbrev` | 4.0.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/abbrev@4.0.0--328f9c7d/LICENSE) |
| `accepts` | 2.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/accepts@2.0.0--818cd6a4/LICENSE) |
| `agent-base` | 7.1.4 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/agent-base@7.1.4--e28bede7/LICENSE) |
| `ajv` | 8.20.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/ajv@8.20.0--b860c3f2/LICENSE) |
| `ansi-regex` | 5.0.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/ansi-regex@5.0.1--a9b9a5c3/license) |
| `ansi-styles` | 4.3.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/ansi-styles@4.3.0--9d675b59/license) |
| `app-builder-lib` | 26.15.3 | development | MIT | EXACT_RELEASE_LICENSE: [LICENSE.txt](source-evidence/electron-userland_electron-builder/electron-builder@26.15.3/LICENSE.txt), [YARN-hoist-source-notice.txt](licenses/app-builder-lib@26.15.3--6707012a/YARN-hoist-source-notice.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `@electron/get` | 3.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_electron_get@3.1.0--a0513d96/LICENSE) |
| `fs-extra` | 8.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@8.1.0--064e0c6c/LICENSE) |
| `semver` | 6.3.1 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/semver@6.3.1--0a0b5dbc/LICENSE) |
| `ci-info` | 4.3.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/ci-info@4.3.1--8959657b/LICENSE) |
| `env-paths` | 2.2.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/env-paths@2.2.1--95676a68/license) |
| `jsonfile` | 4.0.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/jsonfile@4.0.0--98421bcf/LICENSE) |
| `semver` | 7.7.4 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/semver@7.7.4--2ef0ea53/LICENSE) |
| `universalify` | 0.1.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/universalify@0.1.2--dbed45bd/LICENSE) |
| `append-field` | 1.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/append-field@1.0.0--fba37b7e/LICENSE) |
| `argparse` | 2.0.1 | production | Python-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/argparse@2.0.1--eb17fba4/LICENSE) |
| `asn1js` | 3.0.10 | development | BSD-3-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/asn1js@3.0.10--69e75115/LICENSE) |
| `async` | 3.2.6 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/async@3.2.6--9f104ff1/LICENSE) |
| `async-exit-hook` | 2.0.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/async-exit-hook@2.0.1--9ab548e5/license) |
| `asynckit` | 0.4.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/asynckit@0.4.0--a451f2a7/LICENSE) |
| `at-least-node` | 1.0.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/at-least-node@1.0.0--1e03c8da/LICENSE) |
| `aws4` | 1.13.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/aws4@1.13.2--d34d289c/LICENSE) |
| `balanced-match` | 4.0.4 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/balanced-match@4.0.4--e2485ae8/LICENSE.md) |
| `base64-js` | 1.5.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/base64-js@1.5.1--5892852b/LICENSE) |
| `bluebird` | 3.7.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/bluebird@3.7.2--f3468079/LICENSE) |
| `bmp-js` | 0.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/bmp-js@0.1.0--4542c676/LICENSE) |
| `body-parser` | 2.3.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/body-parser@2.3.0--9bd71de9/LICENSE) |
| `content-type` | 2.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/content-type@2.1.0--74b1028e/LICENSE) |
| `iconv-lite` | 0.7.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/iconv-lite@0.7.3--85d63df0/LICENSE) |
| `boolbase` | 1.0.0 | production | ISC | EXACT_VERSION_DECLARATION_ONLY: [SPDX-ISC.txt](license-templates/SPDX-ISC.txt) |
| `brace-expansion` | 5.0.12 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/brace-expansion@5.0.12--416f0dd3/LICENSE) |
| `brotli` | 1.3.3 | production | MIT | EXACT_DECODER_APACHE_NOTICE_AND_MIT_DECLARATION: [README-license-excerpt.txt](licenses/brotli@1.3.3--ddb9b3df/README-license-excerpt.txt), [APACHE-decoder-source-notice.txt](licenses/brotli@1.3.3--ddb9b3df/APACHE-decoder-source-notice.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt), [SPDX-Apache-2.0.txt](license-templates/SPDX-Apache-2.0.txt) |
| `browserify-zlib` | 0.2.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/browserify-zlib@0.2.0--eee49062/LICENSE) |
| `buffer-crc32` | 0.2.13 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/buffer-crc32@0.2.13--8005a2c9/LICENSE) |
| `buffer-from` | 1.1.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/buffer-from@1.1.2--5a9239bf/LICENSE) |
| `builder-util` | 26.15.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/builder-util@26.15.3--d3f1209e/LICENSE) |
| `builder-util-runtime` | 9.7.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/builder-util-runtime@9.7.0--48f27b39/LICENSE) |
| `busboy` | 1.6.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/busboy@1.6.0--230fd4c7/LICENSE) |
| `bytes` | 3.1.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/bytes@3.1.2--d60157a9/LICENSE) |
| `bytestreamjs` | 2.0.1 | development | BSD-3-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/bytestreamjs@2.0.1--9a6446e4/LICENSE) |
| `cacheable-lookup` | 5.0.4 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/cacheable-lookup@5.0.4--db74eb4a/LICENSE) |
| `cacheable-request` | 7.0.4 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/cacheable-request@7.0.4--f2083a47/LICENSE) |
| `call-bind-apply-helpers` | 1.0.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/call-bind-apply-helpers@1.0.2--cbf8af04/LICENSE) |
| `call-bound` | 1.0.4 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/call-bound@1.0.4--0c39f76d/LICENSE) |
| `chalk` | 4.1.2 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/chalk@4.1.2--e96ac6a5/license) |
| `cheerio` | 1.2.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/cheerio@1.2.0--1082a39d/LICENSE) |
| `cheerio-select` | 2.1.0 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/cheerio-select@2.1.0--5095eab9/LICENSE) |
| `chownr` | 3.0.0 | development | BlueOak-1.0.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/chownr@3.0.0--dda0e9f1/LICENSE.md) |
| `chromium-pickle-js` | 0.2.0 | development | MIT | EXACT_VERSION_DECLARATION_ONLY: [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `ci-info` | 4.4.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/ci-info@4.4.0--506bae41/LICENSE) |
| `cliui` | 8.0.1 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/cliui@8.0.1--50f48f26/LICENSE.txt) |
| `clone` | 2.1.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/clone@2.1.2--d7cadff3/LICENSE) |
| `clone-response` | 1.0.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/clone-response@1.0.3--964eebe6/LICENSE) |
| `color-convert` | 2.0.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/color-convert@2.0.1--a87fe2c0/LICENSE) |
| `color-name` | 1.1.4 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/color-name@1.1.4--44cf8c9e/LICENSE) |
| `combined-stream` | 1.0.8 | development | MIT | EXACT_VERSION_NOTICES: [License](licenses/combined-stream@1.0.8--14368fe7/License) |
| `commander` | 5.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/commander@5.1.0--30e08f9e/LICENSE) |
| `compare-version` | 0.1.2 | development | MIT | EXACT_PUBLISHED_COPYRIGHT_AND_MIT_DECLARATION: [README-license-excerpt.txt](licenses/compare-version@0.1.2--9137bf14/README-license-excerpt.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `concat-map` | 0.0.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/concat-map@0.0.1--c6dfc0f0/LICENSE) |
| `content-disposition` | 1.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/content-disposition@1.1.0--06357460/LICENSE) |
| `content-type` | 1.0.5 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/content-type@1.0.5--2e628902/LICENSE) |
| `cookie` | 0.7.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/cookie@0.7.2--58f3dc27/LICENSE) |
| `cookie-signature` | 1.2.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/cookie-signature@1.2.2--aa6fdf16/LICENSE) |
| `core-util-is` | 1.0.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/core-util-is@1.0.3--40d0aaef/LICENSE) |
| `cross-dirname` | 0.1.0 | development (optional) | MIT | EXACT_VERSION_DECLARATION_ONLY: [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `cross-spawn` | 7.0.6 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/cross-spawn@7.0.6--f4a37c70/LICENSE) |
| `isexe` | 2.0.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/isexe@2.0.0--aad736df/LICENSE) |
| `which` | 2.0.2 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/which@2.0.2--51005d6a/LICENSE) |
| `crypto-js` | 4.2.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/crypto-js@4.2.0--173a8ca6/LICENSE) |
| `css-select` | 5.2.2 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/css-select@5.2.2--1e37b3fb/LICENSE) |
| `css-what` | 6.2.2 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/css-what@6.2.2--98e353f5/LICENSE) |
| `debug` | 4.4.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/debug@4.4.3--e7b40ffc/LICENSE) |
| `decompress-response` | 6.0.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/decompress-response@6.0.0--7af54a27/license) |
| `mimic-response` | 3.1.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/mimic-response@3.1.0--9cb82cec/license) |
| `defer-to-connect` | 2.0.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/defer-to-connect@2.0.1--0d3d838e/LICENSE) |
| `define-data-property` | 1.1.4 | development (optional) | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/define-data-property@1.1.4--00265eb0/LICENSE) |
| `define-properties` | 1.2.1 | development (optional) | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/define-properties@1.2.1--739a7afb/LICENSE) |
| `delayed-stream` | 1.0.0 | development | MIT | EXACT_VERSION_NOTICES: [License](licenses/delayed-stream@1.0.0--4f71dda5/License) |
| `depd` | 2.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/depd@2.0.0--78a340b1/LICENSE) |
| `dfa` | 1.2.0 | production | MIT | EXACT_VERSION_DECLARATION_ONLY: [README-license-excerpt.txt](licenses/dfa@1.2.0--e7abe26a/README-license-excerpt.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `dingbat-to-unicode` | 1.0.2 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/dingbat-to-unicode@1.0.2--88003dc3/LICENSE) |
| `dir-compare` | 4.2.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/dir-compare@4.2.0--2e1c3362/LICENSE) |
| `balanced-match` | 1.0.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/balanced-match@1.0.2--c8ddaf7b/LICENSE.md) |
| `brace-expansion` | 1.1.21 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/brace-expansion@1.1.21--c6b59ce4/LICENSE) |
| `minimatch` | 3.1.5 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/minimatch@3.1.5--b9d9c0aa/LICENSE) |
| `dmg-builder` | 26.15.3 | development | MIT | EXACT_RELEASE_LICENSE: [LICENSE.txt](source-evidence/electron-userland_electron-builder/electron-builder@26.15.3/LICENSE.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `docx` | 9.9.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/docx@9.9.0--4002c0b0/LICENSE) |
| `dom-serializer` | 2.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/dom-serializer@2.0.0--841d6ae3/LICENSE) |
| `domelementtype` | 2.3.0 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/domelementtype@2.3.0--a43740c9/LICENSE) |
| `domhandler` | 5.0.3 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/domhandler@5.0.3--2eb069e5/LICENSE) |
| `domutils` | 3.2.2 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/domutils@3.2.2--c4ef98ff/LICENSE) |
| `dotenv` | 16.6.1 | development | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/dotenv@16.6.1--2e950221/LICENSE) |
| `dotenv-expand` | 11.0.7 | development | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/dotenv-expand@11.0.7--2c44d519/LICENSE) |
| `duck` | 0.1.12 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/duck@0.1.12--80380959/LICENSE) |
| `dunder-proto` | 1.0.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/dunder-proto@1.0.1--54633a98/LICENSE) |
| `duplexer2` | 0.1.4 | development | BSD-3-Clause | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/duplexer2@0.1.4--7cf1a7c2/LICENSE.md) |
| `ee-first` | 1.1.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/ee-first@1.1.1--d9438890/LICENSE) |
| `ejs` | 3.1.10 | development | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/ejs@3.1.10--16a7add4/LICENSE) |
| `electron` | 44.7.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/electron@44.7.0--92454e1e/LICENSE), [LICENSE](runtime/electron-44.7.0/LICENSE), [LICENSES.chromium.html](runtime/electron-44.7.0/LICENSES.chromium.html) |
| `electron-builder` | 26.15.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/electron-builder@26.15.3--27dd6bef/LICENSE) |
| `electron-builder-squirrel-windows` | 26.15.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/electron-builder-squirrel-windows@26.15.3--f89d6b3f/LICENSE) |
| `electron-publish` | 26.15.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/electron-publish@26.15.3--c7732b5c/LICENSE) |
| `electron-winstaller` | 5.4.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/electron-winstaller@5.4.0--58c9181e/LICENSE) |
| `fs-extra` | 7.0.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@7.0.1--72957390/LICENSE) |
| `jsonfile` | 4.0.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/jsonfile@4.0.0--6f804903/LICENSE) |
| `universalify` | 0.1.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/universalify@0.1.2--305ad118/LICENSE) |
| `@types/node` | 24.19.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_types_node@24.19.1--45b448b3/LICENSE) |
| `undici-types` | 7.24.6 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/undici-types@7.24.6--288bc1ee/LICENSE) |
| `emoji-regex` | 8.0.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE-MIT.txt](licenses/emoji-regex@8.0.0--130be300/LICENSE-MIT.txt) |
| `encodeurl` | 2.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/encodeurl@2.0.0--f855af3d/LICENSE) |
| `encoding-sniffer` | 0.2.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/encoding-sniffer@0.2.1--954208f4/LICENSE) |
| `end-of-stream` | 1.4.5 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/end-of-stream@1.4.5--03f14875/LICENSE) |
| `entities` | 4.5.0 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/entities@4.5.0--5d87f722/LICENSE) |
| `env-paths` | 3.0.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/env-paths@3.0.0--5ff7e2c9/license) |
| `err-code` | 2.0.3 | development | MIT | EXACT_VERSION_DECLARATION_ONLY: [README-license-excerpt.txt](licenses/err-code@2.0.3--c15ee3de/README-license-excerpt.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `es-define-property` | 1.0.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/es-define-property@1.0.1--c81157ba/LICENSE) |
| `es-errors` | 1.3.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/es-errors@1.3.0--ce536cac/LICENSE) |
| `es-object-atoms` | 1.1.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/es-object-atoms@1.1.2--c33c5ba1/LICENSE) |
| `es-set-tostringtag` | 2.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/es-set-tostringtag@2.1.0--e4e65a52/LICENSE) |
| `escalade` | 3.2.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/escalade@3.2.0--d9e495ab/license) |
| `escape-html` | 1.0.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/escape-html@1.0.3--27272b4b/LICENSE) |
| `escape-string-regexp` | 4.0.0 | development (optional) | MIT | EXACT_VERSION_NOTICES: [license](licenses/escape-string-regexp@4.0.0--fe8ffc90/license) |
| `etag` | 1.8.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/etag@1.8.1--70a173be/LICENSE) |
| `exponential-backoff` | 3.1.3 | development | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/exponential-backoff@3.1.3--46383d18/LICENSE) |
| `express` | 5.2.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/express@5.2.1--dac4790a/LICENSE) |
| `fast-deep-equal` | 3.1.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fast-deep-equal@3.1.3--1dc28023/LICENSE) |
| `fast-uri` | 3.1.8 | development | BSD-3-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/fast-uri@3.1.8--5852b277/LICENSE) |
| `fd-slicer` | 1.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fd-slicer@1.1.0--25ca9b0c/LICENSE) |
| `fdir` | 6.5.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fdir@6.5.0--2b5fa8f5/LICENSE) |
| `filelist` | 1.0.6 | development | Apache-2.0 | EXACT_SOURCE_COPYRIGHT_AND_LICENSE_GRANT: [index.js.txt](source-evidence/mde_filelist/v1.0.6/index.js.txt), [SPDX-Apache-2.0.txt](license-templates/SPDX-Apache-2.0.txt) |
| `balanced-match` | 1.0.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/balanced-match@1.0.2--c3de1f5c/LICENSE.md) |
| `brace-expansion` | 2.1.7 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/brace-expansion@2.1.7--6b909248/LICENSE) |
| `minimatch` | 5.1.9 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/minimatch@5.1.9--45e1839b/LICENSE) |
| `finalhandler` | 2.1.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/finalhandler@2.1.1--7498f428/LICENSE) |
| `fontkit` | 2.0.4 | production | MIT | EXACT_VERSION_DECLARATION_ONLY: [README-license-excerpt.txt](licenses/fontkit@2.0.4--4e8e0008/README-license-excerpt.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `form-data` | 4.0.6 | development | MIT | EXACT_VERSION_NOTICES: [License](licenses/form-data@4.0.6--2d6969e4/License) |
| `mime-db` | 1.52.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/mime-db@1.52.0--1175521f/LICENSE) |
| `mime-types` | 2.1.35 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/mime-types@2.1.35--382311cd/LICENSE) |
| `forwarded` | 0.2.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/forwarded@0.2.0--811e8b13/LICENSE) |
| `fresh` | 2.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fresh@2.0.0--fe46e395/LICENSE) |
| `fs-extra` | 10.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@10.1.0--f95259c7/LICENSE) |
| `fs.realpath` | 1.0.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs.realpath@1.0.0--9e39b964/LICENSE) |
| `function-bind` | 1.1.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/function-bind@1.1.2--f8694b46/LICENSE) |
| `get-caller-file` | 2.0.5 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/get-caller-file@2.0.5--32d72273/LICENSE.md) |
| `get-intrinsic` | 1.3.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/get-intrinsic@1.3.0--ba0227ed/LICENSE) |
| `get-proto` | 1.0.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/get-proto@1.0.1--4a0fc3d8/LICENSE) |
| `get-stream` | 5.2.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/get-stream@5.2.0--71d1f9fc/license) |
| `glob` | 7.2.3 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/glob@7.2.3--7b5d90d9/LICENSE) |
| `balanced-match` | 1.0.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/balanced-match@1.0.2--afde4883/LICENSE.md) |
| `brace-expansion` | 1.1.21 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/brace-expansion@1.1.21--8f133ec4/LICENSE) |
| `minimatch` | 3.1.5 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/minimatch@3.1.5--3316ec6b/LICENSE) |
| `global-agent` | 4.1.3 | development (optional) | BSD-3-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/global-agent@4.1.3--de2493f6/LICENSE) |
| `globalthis` | 1.0.4 | development (optional) | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/globalthis@1.0.4--0677cdd5/LICENSE) |
| `gopd` | 1.2.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/gopd@1.2.0--9d45d6c7/LICENSE) |
| `got` | 11.8.6 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/got@11.8.6--d5788ca6/license) |
| `graceful-fs` | 4.2.11 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/graceful-fs@4.2.11--d490a6d4/LICENSE) |
| `has-flag` | 4.0.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/has-flag@4.0.0--f1fca093/license) |
| `has-property-descriptors` | 1.0.2 | development (optional) | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/has-property-descriptors@1.0.2--943c9914/LICENSE) |
| `has-symbols` | 1.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/has-symbols@1.1.0--0d5368b0/LICENSE) |
| `has-tostringtag` | 1.0.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/has-tostringtag@1.0.2--40211af0/LICENSE) |
| `hash.js` | 1.1.7 | production | MIT | EXACT_VERSION_NOTICES: [README-license-excerpt.txt](licenses/hash.js@1.1.7--3c87af35/README-license-excerpt.txt) |
| `hasown` | 2.0.4 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/hasown@2.0.4--b4b7d523/LICENSE) |
| `hosted-git-info` | 4.1.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/hosted-git-info@4.1.0--f57a54b9/LICENSE) |
| `htmlparser2` | 10.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/htmlparser2@10.1.0--576f6cc2/LICENSE) |
| `entities` | 7.0.1 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/entities@7.0.1--ea2219bd/LICENSE) |
| `http-cache-semantics` | 4.3.0 | development | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/http-cache-semantics@4.3.0--f065dca1/LICENSE) |
| `http-errors` | 2.0.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/http-errors@2.0.1--6e70850c/LICENSE) |
| `http-proxy-agent` | 7.0.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/http-proxy-agent@7.0.2--1224f8f0/LICENSE) |
| `http2-wrapper` | 1.0.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/http2-wrapper@1.0.3--f9e5d01a/LICENSE) |
| `https-proxy-agent` | 7.0.6 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/https-proxy-agent@7.0.6--1e203a36/LICENSE) |
| `iconv-lite` | 0.6.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/iconv-lite@0.6.3--b5c92220/LICENSE) |
| `idb-keyval` | 6.3.0 | production | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENCE](licenses/idb-keyval@6.3.0--d1f2565d/LICENCE) |
| `immediate` | 3.0.6 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/immediate@3.0.6--034a0c8b/LICENSE.txt) |
| `inflight` | 1.0.6 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/inflight@1.0.6--aadb8145/LICENSE) |
| `inherits` | 2.0.4 | production | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/inherits@2.0.4--c76937ee/LICENSE) |
| `ipaddr.js` | 1.9.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/ipaddr.js@1.9.1--8443c23c/LICENSE) |
| `is-fullwidth-code-point` | 3.0.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/is-fullwidth-code-point@3.0.0--5a85b89b/license) |
| `is-promise` | 4.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/is-promise@4.0.0--f51471cf/LICENSE) |
| `is-url` | 1.2.4 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE-MIT](licenses/is-url@1.2.4--6f3da57e/LICENSE-MIT) |
| `isarray` | 1.0.0 | production | MIT | EXACT_VERSION_NOTICES: [README-license-excerpt.txt](licenses/isarray@1.0.0--4f959bdf/README-license-excerpt.txt) |
| `isbinaryfile` | 5.0.7 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/isbinaryfile@5.0.7--d31bae90/LICENSE.txt) |
| `isexe` | 3.1.5 | development | BlueOak-1.0.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/isexe@3.1.5--dd723b93/LICENSE.md) |
| `jake` | 10.9.4 | development | Apache-2.0 | EXACT_SOURCE_COPYRIGHT_AND_LICENSE_GRANT: [README-license-excerpt.txt](licenses/jake@10.9.4--96caaa43/README-license-excerpt.txt), [jake.js.txt](source-evidence/jakejs_jake/v10.9.4/lib/jake.js.txt), [SPDX-Apache-2.0.txt](license-templates/SPDX-Apache-2.0.txt) |
| `jiti` | 2.7.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/jiti@2.7.0--3fa9a035/LICENSE) |
| `jpeg-exif` | 1.1.4 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/jpeg-exif@1.1.4--a5a54416/LICENSE.txt) |
| `js-yaml` | 4.3.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/js-yaml@4.3.2--aa375950/LICENSE) |
| `json-buffer` | 3.0.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/json-buffer@3.0.1--2788b4ed/LICENSE) |
| `json-schema-traverse` | 1.0.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/json-schema-traverse@1.0.0--bf0c880f/LICENSE) |
| `json5` | 2.2.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/json5@2.2.3--683cf56a/LICENSE.md) |
| `jsonfile` | 6.2.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/jsonfile@6.2.1--a5a7392e/LICENSE) |
| `jszip` | 3.10.2 | production | (MIT OR GPL-3.0-or-later) → MIT | EXACT_VERSION_NOTICES: [LICENSE.markdown](licenses/jszip@3.10.2--7041c1fb/LICENSE.markdown) |
| `keyv` | 4.5.4 | development | MIT | EXACT_PUBLISHED_COPYRIGHT_AND_MIT_DECLARATION: [README-license-excerpt.txt](licenses/keyv@4.5.4--fcf71058/README-license-excerpt.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `lazy-val` | 1.0.5 | development | MIT | EXACT_VERSION_DECLARATION_ONLY: [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `lie` | 3.3.0 | production | MIT | EXACT_VERSION_NOTICES: [license.md](licenses/lie@3.3.0--ce549a49/license.md) |
| `linebreak` | 1.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/linebreak@1.1.0--3906fb87/LICENSE) |
| `base64-js` | 0.0.8 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE.MIT](licenses/base64-js@0.0.8--f8e960f0/LICENSE.MIT) |
| `lodash` | 4.18.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/lodash@4.18.1--f3bde40a/LICENSE) |
| `lop` | 0.4.2 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/lop@0.4.2--888db816/LICENSE) |
| `lowercase-keys` | 2.0.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/lowercase-keys@2.0.0--74740ff3/license) |
| `lru-cache` | 6.0.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/lru-cache@6.0.0--ef019587/LICENSE) |
| `mammoth` | 1.13.0 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/mammoth@1.13.0--979c0849/LICENSE) |
| `matcher` | 4.0.0 | development (optional) | MIT | EXACT_VERSION_NOTICES: [license](licenses/matcher@4.0.0--a2a608e6/license) |
| `math-intrinsics` | 1.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/math-intrinsics@1.1.0--2e6b80fb/LICENSE) |
| `media-typer` | 1.1.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/media-typer@1.1.1--c79520d2/LICENSE) |
| `merge-descriptors` | 2.0.0 | production | MIT | EXACT_VERSION_NOTICES: [license](licenses/merge-descriptors@2.0.0--8d8ef495/license) |
| `mime` | 2.6.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/mime@2.6.0--4c3ef947/LICENSE) |
| `mime-db` | 1.54.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/mime-db@1.54.0--086e8d7d/LICENSE) |
| `mime-types` | 3.0.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/mime-types@3.0.2--8469a1f1/LICENSE) |
| `mimic-response` | 1.0.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/mimic-response@1.0.1--1f56b578/license) |
| `minimalistic-assert` | 1.0.1 | production | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/minimalistic-assert@1.0.1--1bc56548/LICENSE) |
| `minimatch` | 10.2.6 | development | BlueOak-1.0.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/minimatch@10.2.6--f36a1827/LICENSE.md) |
| `minimist` | 1.2.8 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/minimist@1.2.8--085484e4/LICENSE) |
| `minipass` | 7.1.3 | development | BlueOak-1.0.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/minipass@7.1.3--2f778283/LICENSE.md) |
| `minizlib` | 3.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/minizlib@3.1.0--3627c2eb/LICENSE) |
| `mkdirp` | 0.5.6 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/mkdirp@0.5.6--a0f92ce8/LICENSE) |
| `ms` | 2.1.3 | production | MIT | EXACT_VERSION_NOTICES: [license.md](licenses/ms@2.1.3--e411571e/license.md) |
| `multer` | 2.4.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/multer@2.4.0--48b852ae/LICENSE) |
| `media-typer` | 0.3.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/media-typer@0.3.0--2ab34dea/LICENSE) |
| `mime-db` | 1.52.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/mime-db@1.52.0--8206ec9a/LICENSE) |
| `mime-types` | 2.1.35 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/mime-types@2.1.35--2a08b596/LICENSE) |
| `type-is` | 1.6.18 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/type-is@1.6.18--718bbe67/LICENSE) |
| `nanoid` | 6.0.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/nanoid@6.0.2--ef6c34dd/LICENSE) |
| `negotiator` | 1.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/negotiator@1.1.0--915dcd78/LICENSE) |
| `content-type` | 2.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/content-type@2.1.0--02dfde70/LICENSE) |
| `node-abi` | 4.37.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/node-abi@4.37.0--8251d49c/LICENSE) |
| `node-api-version` | 0.2.1 | development | MIT | EXACT_VERSION_DECLARATION_ONLY: [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `node-fetch` | 2.7.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/node-fetch@2.7.0--abf9db53/LICENSE.md) |
| `node-gyp` | 12.4.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/node-gyp@12.4.0--2691dc89/LICENSE), [LICENSE](licenses/node-gyp@12.4.0--2691dc89/gyp/LICENSE), [LICENSE](licenses/node-gyp@12.4.0--2691dc89/gyp/pylib/packaging/LICENSE), [LICENSE.APACHE](licenses/node-gyp@12.4.0--2691dc89/gyp/pylib/packaging/LICENSE.APACHE), [LICENSE.BSD](licenses/node-gyp@12.4.0--2691dc89/gyp/pylib/packaging/LICENSE.BSD) |
| `env-paths` | 2.2.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/env-paths@2.2.1--1fbef68f/license) |
| `isexe` | 4.0.0 | development | BlueOak-1.0.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/isexe@4.0.0--77ce91e5/LICENSE.md) |
| `undici` | 6.29.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/undici@6.29.0--0dd30b31/LICENSE), [LICENSE](licenses/undici@6.29.0--0dd30b31/lib/web/fetch/LICENSE) |
| `which` | 6.0.1 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/which@6.0.1--39d893e9/LICENSE) |
| `node-int64` | 0.4.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/node-int64@0.4.0--036a60a6/LICENSE) |
| `nopt` | 9.0.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/nopt@9.0.0--ec9a1cc6/LICENSE) |
| `normalize-url` | 6.1.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/normalize-url@6.1.0--f6fd10d2/license) |
| `nth-check` | 2.1.1 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/nth-check@2.1.1--96886f98/LICENSE) |
| `object-inspect` | 1.13.4 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/object-inspect@1.13.4--6838057a/LICENSE) |
| `object-keys` | 1.1.1 | development (optional) | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/object-keys@1.1.1--d1dbd3eb/LICENSE) |
| `on-finished` | 2.4.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/on-finished@2.4.1--1ef75324/LICENSE) |
| `once` | 1.4.0 | production | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/once@1.4.0--16a816bf/LICENSE) |
| `opencollective-postinstall` | 2.0.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/opencollective-postinstall@2.0.3--b0c673a9/LICENSE) |
| `option` | 0.2.4 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/option@0.2.4--277d7f49/LICENSE) |
| `p-cancelable` | 2.1.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/p-cancelable@2.1.1--f0a11cf8/license) |
| `p-limit` | 3.1.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/p-limit@3.1.0--7aa4e7e2/license) |
| `pako` | 1.0.11 | production | (MIT AND Zlib) | EXACT_VERSION_NOTICES: [LICENSE](licenses/pako@1.0.11--e48e67e0/LICENSE), [ZLIB-source-notice.txt](licenses/pako@1.0.11--e48e67e0/ZLIB-source-notice.txt) |
| `parse5` | 7.3.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/parse5@7.3.0--24d3390d/LICENSE) |
| `parse5-htmlparser2-tree-adapter` | 7.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/parse5-htmlparser2-tree-adapter@7.1.0--09ca70db/LICENSE) |
| `parse5-parser-stream` | 7.1.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/parse5-parser-stream@7.1.2--fdc34af7/LICENSE) |
| `entities` | 6.0.1 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/entities@6.0.1--d9b5052f/LICENSE) |
| `parseurl` | 1.3.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/parseurl@1.3.3--f80b1a80/LICENSE) |
| `path-is-absolute` | 1.0.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/path-is-absolute@1.0.1--bd7fd0aa/license) |
| `path-key` | 3.1.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/path-key@3.1.1--5fb11649/license) |
| `path-to-regexp` | 8.4.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/path-to-regexp@8.4.2--b738fd2a/LICENSE) |
| `pdfjs-dist` | 6.4.299 | production | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/pdfjs-dist@6.4.299--8d94bac9/LICENSE), [LICENSE](licenses/pdfjs-dist@6.4.299--8d94bac9/cmaps/LICENSE), [LICENSE](licenses/pdfjs-dist@6.4.299--8d94bac9/iccs/LICENSE), [LICENSE_FOXIT](licenses/pdfjs-dist@6.4.299--8d94bac9/standard_fonts/LICENSE_FOXIT), [LICENSE_LIBERATION](licenses/pdfjs-dist@6.4.299--8d94bac9/standard_fonts/LICENSE_LIBERATION), [LICENSE_JBIG2](licenses/pdfjs-dist@6.4.299--8d94bac9/wasm/LICENSE_JBIG2), [LICENSE_OPENJPEG](licenses/pdfjs-dist@6.4.299--8d94bac9/wasm/LICENSE_OPENJPEG), [LICENSE_PDFJS_JBIG2](licenses/pdfjs-dist@6.4.299--8d94bac9/wasm/LICENSE_PDFJS_JBIG2), [LICENSE_PDFJS_OPENJPEG](licenses/pdfjs-dist@6.4.299--8d94bac9/wasm/LICENSE_PDFJS_OPENJPEG), [LICENSE_PDFJS_QCMS](licenses/pdfjs-dist@6.4.299--8d94bac9/wasm/LICENSE_PDFJS_QCMS), [LICENSE_QCMS](licenses/pdfjs-dist@6.4.299--8d94bac9/wasm/LICENSE_QCMS) |
| `pdfkit` | 0.17.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/pdfkit@0.17.2--80719091/LICENSE) |
| `pe-library` | 0.4.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/pe-library@0.4.1--f81a85d3/LICENSE) |
| `pend` | 1.2.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/pend@1.2.0--50e41f60/LICENSE) |
| `picocolors` | 1.1.1 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/picocolors@1.1.1--704e4df8/LICENSE) |
| `picomatch` | 4.0.7 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/picomatch@4.0.7--75ffdfef/LICENSE) |
| `pkijs` | 3.4.1 | development | BSD-3-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/pkijs@3.4.1--e1beff01/LICENSE) |
| `@noble/hashes` | 1.8.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/_noble_hashes@1.8.0--5b81dcd6/LICENSE) |
| `plist` | 3.1.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/plist@3.1.0--32d26fcb/LICENSE) |
| `xmlbuilder` | 15.1.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/xmlbuilder@15.1.1--467b87bb/LICENSE) |
| `png-js` | 1.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/png-js@1.1.0--7c570a71/LICENSE) |
| `postject` | 1.0.0-alpha.6 | development (optional) | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/postject@1.0.0-alpha.6--e30f595b/LICENSE) |
| `commander` | 9.5.0 | development (optional) | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/commander@9.5.0--c67229af/LICENSE) |
| `proc-log` | 6.1.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/proc-log@6.1.0--ce225854/LICENSE) |
| `process-nextick-args` | 2.0.1 | production | MIT | EXACT_VERSION_NOTICES: [license.md](licenses/process-nextick-args@2.0.1--68c9e75c/license.md) |
| `progress` | 2.0.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/progress@2.0.3--ebe2ec39/LICENSE) |
| `promise-retry` | 2.0.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/promise-retry@2.0.1--8b3ce315/LICENSE) |
| `proper-lockfile` | 4.1.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/proper-lockfile@4.1.2--0bfaba64/LICENSE) |
| `proxy-addr` | 2.0.8 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/proxy-addr@2.0.8--7f261d77/LICENSE) |
| `pump` | 3.0.4 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/pump@3.0.4--67114456/LICENSE) |
| `pvtsutils` | 1.3.6 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/pvtsutils@1.3.6--b0d9f403/LICENSE) |
| `pvutils` | 1.2.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/pvutils@1.2.0--be5940e8/LICENSE) |
| `qs` | 6.16.0 | production | BSD-3-Clause | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/qs@6.16.0--0b5a5f35/LICENSE.md) |
| `quick-lru` | 5.1.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/quick-lru@5.1.1--d27788a3/license) |
| `range-parser` | 1.3.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/range-parser@1.3.0--e3fd31cc/LICENSE) |
| `raw-body` | 3.0.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/raw-body@3.0.2--7a3d4724/LICENSE) |
| `iconv-lite` | 0.7.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/iconv-lite@0.7.3--1354fc19/LICENSE) |
| `read-binary-file-arch` | 1.0.6 | development | MIT | EXACT_VERSION_DECLARATION_ONLY: [README-license-excerpt.txt](licenses/read-binary-file-arch@1.0.6--be832d04/README-license-excerpt.txt), [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `readable-stream` | 2.3.8 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/readable-stream@2.3.8--6a0eabf7/LICENSE) |
| `regenerator-runtime` | 0.13.11 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/regenerator-runtime@0.13.11--fad21224/LICENSE) |
| `require-directory` | 2.1.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/require-directory@2.1.1--0653778c/LICENSE) |
| `require-from-string` | 2.0.2 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/require-from-string@2.0.2--e3af7aca/license) |
| `resedit` | 1.7.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/resedit@1.7.2--0a501ede/LICENSE) |
| `resolve-alpn` | 1.2.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/resolve-alpn@1.2.1--1786bb5a/LICENSE) |
| `responselike` | 2.0.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/responselike@2.0.1--851b6c0b/LICENSE) |
| `restructure` | 3.0.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/restructure@3.0.2--8d125fd2/LICENSE) |
| `retry` | 0.12.0 | development | MIT | EXACT_VERSION_NOTICES: [License](licenses/retry@0.12.0--f724fc86/License) |
| `rimraf` | 2.6.3 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/rimraf@2.6.3--07e7a69f/LICENSE) |
| `router` | 2.2.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/router@2.2.0--3f591f9f/LICENSE) |
| `safe-buffer` | 5.1.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/safe-buffer@5.1.2--bce944be/LICENSE) |
| `safer-buffer` | 2.1.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/safer-buffer@2.1.2--d9639c5e/LICENSE) |
| `sanitize-filename` | 1.6.4 | development | WTFPL OR ISC → ISC | EXACT_VERSION_NOTICES: [AUTHORS](licenses/sanitize-filename@1.6.4--d2c70504/AUTHORS), [LICENSE.md](licenses/sanitize-filename@1.6.4--d2c70504/LICENSE.md) |
| `sax` | 1.6.1 | production | BlueOak-1.0.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/sax@1.6.1--45a7cd8e/LICENSE.md) |
| `saxes` | 5.0.1 | production | ISC | EXACT_RELEASE_LICENSE: [LICENSE.txt](source-evidence/lddubeau_saxes/v5.0.1/LICENSE.txt), [SPDX-ISC.txt](license-templates/SPDX-ISC.txt) |
| `semver` | 7.8.5 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/semver@7.8.5--e295d2ab/LICENSE) |
| `send` | 1.2.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/send@1.2.1--dfaab080/LICENSE) |
| `serialize-error` | 8.1.0 | development (optional) | MIT | EXACT_VERSION_NOTICES: [license](licenses/serialize-error@8.1.0--39f1a3b9/license) |
| `serve-static` | 2.2.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/serve-static@2.2.1--165a11af/LICENSE) |
| `setimmediate` | 1.0.5 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/setimmediate@1.0.5--e37b2c25/LICENSE.txt) |
| `setprototypeof` | 1.2.0 | production | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/setprototypeof@1.2.0--64a15ed4/LICENSE) |
| `shebang-command` | 2.0.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/shebang-command@2.0.0--2658f1e7/license) |
| `shebang-regex` | 3.0.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/shebang-regex@3.0.0--06f3113b/license) |
| `side-channel` | 1.1.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/side-channel@1.1.1--bc506c0c/LICENSE) |
| `side-channel-list` | 1.0.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/side-channel-list@1.0.1--c25540f0/LICENSE) |
| `side-channel-map` | 1.0.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/side-channel-map@1.0.1--5afe8e3f/LICENSE) |
| `side-channel-weakmap` | 1.0.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/side-channel-weakmap@1.0.2--5f7ccd73/LICENSE) |
| `signal-exit` | 3.0.7 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/signal-exit@3.0.7--79505baf/LICENSE.txt) |
| `simple-update-notifier` | 2.0.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/simple-update-notifier@2.0.0--820e855f/LICENSE) |
| `source-map` | 0.6.1 | development | BSD-3-Clause | EXACT_VERSION_NOTICES: [LICENSE](licenses/source-map@0.6.1--958e49d9/LICENSE) |
| `source-map-support` | 0.5.21 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/source-map-support@0.5.21--b7757a1b/LICENSE.md) |
| `stat-mode` | 1.0.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/stat-mode@1.0.0--7aa97d11/LICENSE) |
| `statuses` | 2.0.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/statuses@2.0.2--14402378/LICENSE) |
| `streamsearch` | 1.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/streamsearch@1.1.0--bcd81aaa/LICENSE) |
| `string-width` | 4.2.3 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/string-width@4.2.3--0af48960/license) |
| `string_decoder` | 1.1.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/string_decoder@1.1.1--e7ae557c/LICENSE) |
| `strip-ansi` | 6.0.1 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/strip-ansi@6.0.1--b139d9d5/license) |
| `sumchecker` | 3.0.1 | development | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/sumchecker@3.0.1--411a1b46/LICENSE) |
| `supports-color` | 7.2.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/supports-color@7.2.0--f85f2f40/license) |
| `tar` | 7.5.22 | development | BlueOak-1.0.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/tar@7.5.22--8fa34a72/LICENSE.md) |
| `yallist` | 5.0.0 | development | BlueOak-1.0.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/yallist@5.0.0--165ac5c2/LICENSE.md) |
| `temp` | 0.9.4 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/temp@0.9.4--de98b094/LICENSE) |
| `temp-file` | 3.4.0 | development | MIT | EXACT_VERSION_DECLARATION_ONLY: [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `tesseract.js` | 7.0.0 | production | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/tesseract.js@7.0.0--b6379a5c/LICENSE.md) |
| `tesseract.js-core` | 7.0.0 | production | Apache-2.0 | EXACT_PUBLISHED_WASM_BLOBS_AND_SOURCE_COMPONENT_NOTICES: [LICENSE](licenses/tesseract.js-core@7.0.0--38da6a39/LICENSE) |
| `tiny-async-pool` | 1.3.0 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE-MIT](licenses/tiny-async-pool@1.3.0--a56424e6/LICENSE-MIT) |
| `semver` | 5.7.2 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/semver@5.7.2--bfd1e716/LICENSE) |
| `tiny-inflate` | 1.0.3 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/tiny-inflate@1.0.3--b42bb2eb/LICENSE) |
| `tinyglobby` | 0.2.17 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/tinyglobby@0.2.17--e2eef8d8/LICENSE) |
| `tmp` | 0.2.7 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/tmp@0.2.7--6ca3657d/LICENSE) |
| `tmp-promise` | 3.0.3 | development | MIT | EXACT_VERSION_DECLARATION_ONLY: [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `toidentifier` | 1.0.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/toidentifier@1.0.1--2456b6b9/LICENSE) |
| `tr46` | 0.0.3 | production | MIT | EXACT_VERSION_DECLARATION_ONLY: [SPDX-MIT.txt](license-templates/SPDX-MIT.txt) |
| `truncate-utf8-bytes` | 1.0.2 | development | WTFPL | EXACT_VERSION_NOTICES: [AUTHORS](licenses/truncate-utf8-bytes@1.0.2--77f0c331/AUTHORS) |
| `tslib` | 2.8.1 | production | 0BSD | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/tslib@2.8.1--7e89d502/LICENSE.txt) |
| `type-fest` | 0.20.2 | development (optional) | (MIT OR CC0-1.0) → MIT | EXACT_VERSION_NOTICES: [license](licenses/type-fest@0.20.2--c07bde42/license) |
| `type-is` | 2.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/type-is@2.1.0--bb6eb299/LICENSE) |
| `content-type` | 2.1.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/content-type@2.1.0--f306a44a/LICENSE) |
| `underscore` | 1.13.8 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/underscore@1.13.8--0c594637/LICENSE) |
| `undici` | 7.30.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/undici@7.30.0--009540c3/LICENSE), [LICENSE](licenses/undici@7.30.0--009540c3/lib/web/fetch/LICENSE) |
| `undici-types` | 8.9.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/undici-types@8.9.0--caa71619/LICENSE) |
| `unicode-properties` | 1.4.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/unicode-properties@1.4.1--b1df3051/LICENSE) |
| `unicode-trie` | 2.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/unicode-trie@2.0.0--e8734e46/LICENSE) |
| `pako` | 0.2.9 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/pako@0.2.9--b7d0d586/LICENSE), [ZLIB-source-notice.txt](licenses/pako@0.2.9--b7d0d586/ZLIB-source-notice.txt) |
| `universalify` | 2.0.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/universalify@2.0.1--0723d71f/LICENSE) |
| `unpipe` | 1.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/unpipe@1.0.0--a8d5ed3a/LICENSE) |
| `unzipper` | 0.12.5 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/unzipper@0.12.5--9451daa6/LICENSE) |
| `fs-extra` | 11.3.1 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/fs-extra@11.3.1--dffad183/LICENSE) |
| `utf8-byte-length` | 1.0.5 | development | (WTFPL OR MIT) → MIT | EXACT_VERSION_NOTICES: [AUTHORS](licenses/utf8-byte-length@1.0.5--d4c62889/AUTHORS), [LICENSE.MIT.txt](licenses/utf8-byte-length@1.0.5--d4c62889/LICENSE.MIT.txt), [LICENSE.WTFPL.txt](licenses/utf8-byte-length@1.0.5--d4c62889/LICENSE.WTFPL.txt) |
| `util-deprecate` | 1.0.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/util-deprecate@1.0.2--be19f75f/LICENSE) |
| `vary` | 1.1.2 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/vary@1.1.2--3b75c7c5/LICENSE) |
| `wasm-feature-detect` | 1.9.0 | production | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/wasm-feature-detect@1.9.0--f796aba0/LICENSE) |
| `webcrypto-core` | 1.9.2 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/webcrypto-core@1.9.2--6d7601c5/LICENSE) |
| `webidl-conversions` | 3.0.1 | production | BSD-2-Clause | EXACT_VERSION_NOTICES: [LICENSE.md](licenses/webidl-conversions@3.0.1--9ed1aa65/LICENSE.md) |
| `whatwg-encoding` | 3.1.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/whatwg-encoding@3.1.1--9a877be4/LICENSE.txt) |
| `whatwg-mimetype` | 4.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/whatwg-mimetype@4.0.0--a5a0d607/LICENSE.txt) |
| `whatwg-url` | 5.0.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/whatwg-url@5.0.0--280cd055/LICENSE.txt) |
| `which` | 5.0.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/which@5.0.0--8f063900/LICENSE) |
| `word-extractor` | 1.0.4 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/word-extractor@1.0.4--66421bf7/LICENSE) |
| `wrap-ansi` | 7.0.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/wrap-ansi@7.0.0--142e8c61/license) |
| `wrappy` | 1.0.2 | production | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/wrappy@1.0.2--09dbeea1/LICENSE) |
| `xlsx` | 0.20.3 | production | Apache-2.0 | EXACT_VERSION_NOTICES: [LICENSE](licenses/xlsx@0.20.3--16c95d29/LICENSE), [LICENSE](licenses/xlsx@0.20.3--16c95d29/dist/LICENSE) |
| `xml` | 1.0.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/xml@1.0.1--80041f3d/LICENSE) |
| `xml-js` | 1.6.11 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/xml-js@1.6.11--ae4772aa/LICENSE) |
| `xmlbuilder` | 10.1.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/xmlbuilder@10.1.1--b0b86f9a/LICENSE) |
| `xmlchars` | 2.2.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/xmlchars@2.2.0--6214aeda/LICENSE) |
| `y18n` | 5.0.8 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/y18n@5.0.8--9a8ac12d/LICENSE) |
| `yallist` | 4.0.0 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE](licenses/yallist@4.0.0--fb9d2dfa/LICENSE) |
| `yargs` | 17.7.3 | development | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/yargs@17.7.3--bd1626d7/LICENSE) |
| `yargs-parser` | 21.1.1 | development | ISC | EXACT_VERSION_NOTICES: [LICENSE.txt](licenses/yargs-parser@21.1.1--7c4a9dcd/LICENSE.txt) |
| `yauzl` | 2.10.0 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/yauzl@2.10.0--e8560a2d/LICENSE) |
| `yocto-queue` | 0.1.0 | development | MIT | EXACT_VERSION_NOTICES: [license](licenses/yocto-queue@0.1.0--45c7ba43/license) |
| `zlibjs` | 0.3.1 | production | MIT | EXACT_VERSION_NOTICES: [LICENSE](licenses/zlibjs@0.3.1--17c3a59a/LICENSE) |
