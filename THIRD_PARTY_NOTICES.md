# Third-Party Notices

Salesforce Org Compare bundles the open-source components listed below, or reimplements patterns from them. Each component remains under its own license. The extension is not affiliated with or endorsed by any of these projects, nor by Salesforce, Inc.

## Summary

| Component | Version | License | Where it is used | Location |
|-----------|---------|---------|------------------|----------|
| Monaco Editor | 0.52.0 | MIT | Code editor and side-by-side diff | `vendor/monaco-editor/` |
| Tabulator | 6.6.1 | MIT | Data grids in Query Explorer and Data Import | `vendor/tabulator/` |
| jsPDF | 4.2.1 | MIT | PDF export of the Health Monitor report | `vendor/jspdf/` |
| read-excel-file | 9.3.12 | MIT | Reading `.xlsx` files in Data Import | `vendor/read-excel-file/` |
| Vanilla Calendar Pro | 3.3.2 | MIT | Date and time selector for filters and Trace Flags | `vendor/vanilla-calendar-pro/` |
| Driver.js | 1.8.0 | MIT | Guided onboarding tours | `vendor/driver.js/` |
| Tabler Icons | 3.46.0 | MIT | Interface icon sprite (subset) | `code/assets/tabler-icons.svg` |
| PostHog JS | 1.379.0 | Apache-2.0 | Optional usage telemetry, error reports, surveys | `vendor/posthog-js/` |
| DOMPurify (embedded) | 3.0.5 (inside Monaco) | MPL-2.0 OR Apache-2.0 | HTML sanitization used internally by Monaco Editor | inside `vendor/monaco-editor/` |
| Salesforce Inspector Reloaded | — | MIT | Reimplemented patterns (see below) | `shared/`, `background/` |

Exact versions of the npm-managed libraries are pinned in `package.json` and `package-lock.json`; the `vendor:*` npm scripts copy them into `vendor/`.

---

## Components under the MIT License

The following components are distributed under the MIT License below. Each is © its respective authors.

- **Monaco Editor** — Copyright (c) Microsoft Corporation. https://github.com/microsoft/monaco-editor
- **Tabulator** — Copyright (c) 2015-2026 Oli Folkerd. https://tabulator.info/ · https://github.com/olifolkerd/tabulator
- **jsPDF** — Copyright (c) 2010-2025 James Hall, https://github.com/MrRio/jsPDF; (c) 2015-2025 yWorks GmbH, https://www.yworks.com/
- **read-excel-file** — Copyright (c) 2018 catamphetamine. https://gitlab.com/catamphetamine/read-excel-file
- **Vanilla Calendar Pro** — Copyright (c) Yury Uvarov. https://github.com/uvarov-frontend/vanilla-calendar-pro
- **Driver.js** — Copyright (c) Kamran Ahmed. https://driverjs.com/ · https://github.com/nilbuild/driver.js
- **Tabler Icons** — Copyright (c) 2020-2026 Paweł Kuna. https://tabler.io/icons. The license text is kept at `code/assets/TABLER-ICONS-LICENSE.txt`.
- **Salesforce Inspector Reloaded** — Copyright (c) Thomas Prouvot and contributors (forked from Søren Krabbe and Jesper Kristensen). https://github.com/tprouvot/Salesforce-Inspector-reloaded

### The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

---

## PostHog JS

- **Repository:** https://github.com/PostHog/posthog-js
- **License:** Apache License 2.0
- **Copyright:** Copyright 2020 PostHog / Hiberly, Inc.; portions Copyright 2015 Mixpanel, Inc.
- **Usage:** Optional usage telemetry (which can be disabled in Settings), sanitized technical error reports, and surveys. See [PRIVACY.md](PRIVACY.md) for what is and is not sent.

Licensed under the Apache License, Version 2.0. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0. Unless required by applicable law or agreed to in writing, the software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. The full license text ships with the `posthog-js` npm package (`node_modules/posthog-js/LICENSE`).

## DOMPurify

- **Repository:** https://github.com/cure53/DOMPurify
- **License:** Apache License 2.0 or Mozilla Public License 2.0 (dual-licensed)
- **Copyright:** Copyright Cure53 and other contributors
- **Usage:** Embedded inside the Monaco Editor bundle and used by it internally; the extension does not call it directly. (jsPDF can load DOMPurify as an optional dependency, but it is not bundled with the extension.)

---

## Salesforce Inspector Reloaded — what was reimplemented

Ported logic is reimplemented in vanilla JavaScript modules under `shared/` and `background/` to fit this extension's architecture. It covers: the Event Monitor (CometD replay extension and channel discovery queries), Data Import (SOAP batch import patterns), and the *Show All Data*-style record editor UX that inspired Record Viewer.

---

## Trademarks

Salesforce, Apex, Lightning, Visualforce and related marks are trademarks of Salesforce, Inc. Chrome and Chromium are trademarks of Google LLC. All other names are the property of their respective owners and are used only to describe compatibility.
