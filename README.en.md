# Biaoxi — local tender document analysis

[中文说明](README.md)

Biaoxi reads tender documents and attachments, preserves source references, and prepares 14 analysis categories plus four review outputs: rejection risks, scoring requirements, mandatory commitments, and a bidding feasibility assessment. Its interface and procurement rules primarily target Chinese documents.

**Source version: 0.5.6. This is a local open-source candidate, not a published release. No new installers are included.** Automated checks do not establish accuracy on real tenders, company eligibility, or production readiness.

Candidate 2 fixes multiple scoring rules within a paragraph, repeated performance scores and shared-cap boundaries, and replaces two vulnerable dependency chains with scoped overrides. Raw policy originals and QA images are excluded from source distribution; the offline catalog remains available. See the [policy provenance and explicit caching guide](assets/policies/README.md).

## Quickstart

Use Node.js 22, at least 22.13, with npm 10.9.8 and the Git CLI for source checks and regression tests. The candidate preparation environment used Node.js 22.23.2 and npm 10.9.8; other versions require separate verification.

Run from the source directory:

```sh
npm ci
npm run dev:safe
```

Open [http://127.0.0.1:43221](http://127.0.0.1:43221); confirm the actual URL printed by the process. For the Electron development app:

```sh
npm run start:safe
```

In this candidate, `npm run dev` and `npm start` also use the isolated launcher. Browser data stays under `candidate-data/web`; desktop user data stays under `candidate-data/desktop`, with reports in its `data` subdirectory. The launcher replaces inherited production data-directory variables. Use these npm entry points for development.

If the browser port is occupied, keep the existing service running and choose an unused `BIAOXI_PORT`. Platform-specific commands and packaging requirements are in the [development guide](docs/development.md).

## Features and limits

- Offline PDF, DOC, DOCX, XLSX, XLS, image and TXT extraction, with bundled Chinese and English OCR.
- Local company evidence, report snapshots, human review, and PDF / Word exports.
- Optional user-configured model APIs and experimental desktop automation for Doubao / DeepSeek websites.

Default analysis is local. Starting an online task sends the selected materials to the chosen provider. Website automation depends on platform controls and availability; it is not an official provider integration. Missing evidence remains pending review, and scoring cannot override eligibility failures. See [features and limits](docs/features-and-limits.md) for details.

## Checks and contribution

```sh
npm run check:source
npm test
npm run test:ocr
```

CI uses local and synthetic fixtures, without model keys or platform accounts. Real APIs, live website workflows, packaged builds, and device-specific acceptance are separate checks. See the [validation record](docs/validation.md), [contribution guide](CONTRIBUTING.md), and [security policy](SECURITY.md). Never include confidential tenders, company records, credentials, or personal data in contributions.

Original project code is licensed under [MIT](LICENSE). Dependencies and resources retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). This license does not grant trademark rights or rights to third-party documents and provider content.
