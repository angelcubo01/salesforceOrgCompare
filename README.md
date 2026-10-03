# Salesforce Org Compare

[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/mpocihehhnklfhplkdlmahmopinjnpcg?label=chrome%20web%20store)](https://chromewebstore.google.com/detail/salesforce-org-compare/mpocihehhnklfhplkdlmahmopinjnpcg)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/mpocihehhnklfhplkdlmahmopinjnpcg)](https://chromewebstore.google.com/detail/salesforce-org-compare/mpocihehhnklfhplkdlmahmopinjnpcg)
[![Chrome Web Store Rating](https://img.shields.io/chrome-web-store/rating/mpocihehhnklfhplkdlmahmopinjnpcg)](https://chromewebstore.google.com/detail/salesforce-org-compare/mpocihehhnklfhplkdlmahmopinjnpcg)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-salesforceorgcompare.com-0176d3)](https://salesforceorgcompare.com/)

**Compare Salesforce orgs with the browser session you already have — no Salesforce CLI, no Connected App, no API keys.**

[Website](https://salesforceorgcompare.com/) · [Privacy](PRIVACY.md) · Built for admins, developers, and release managers who live in multiple orgs every day.

![Salesforce Org Compare — multi-org, browser session, no CLI](media/readme/hero-marketing-v2.png)

---

## Why teams choose the browser

Skip Connected Apps, API keys, and CLI installs for day-to-day compare and debug work. Use the Salesforce session you already have open in Chrome.

![Why teams choose the browser session over CLI or manual XML](media/readme/value-browser-session.png)

| | |
|---|---|
| **Your session, not new credentials** | Reuses the Salesforce tab you already logged into |
| **Multi-org in one place** | Save PRO, UAT, and sandboxes with aliases and jump between them |
| **Diff on screen** | Metadata and code comparison — export HTML when you need a report |
| **Dev hub in Chrome** | Apex tests, SOQL, Quick Edit, REST, debug logs, and more |
| **Free** | Available on the Chrome Web Store |

---

## How it works

![Get started — log in, save orgs, compare or debug](media/readme/flow-get-started.png)

1. **Log into Salesforce** in Chrome.
2. **Save orgs** from the extension popup (aliases, groups).
3. **Compare, debug, or open logs** from the main app — or jump in from Setup when UI Integration is enabled.

---

## Usage flows

### Compare orgs before a release

Sandbox → UAT → PRO: pull metadata, see what changed, ship with confidence.

![Multi-org comparison flow: Sandbox, UAT, PRO into Diff](media/readme/flow-compare-orgs.png)

### Debug faster with Logi ![Beta](https://img.shields.io/badge/Logi-Beta-0176d3)

From a raw Apex debug log to parsed analysis to an optional AI assist (**Logi**: summarize, debug, suggest fixes). Free tier or BYOK OpenRouter. Opt-in.

Access is invite-only during beta — [request access](https://salesforceorgcompare.com/solicitar-acceso-logi/) with your installation ID (Settings → About).

![Debug flow: Apex log → parse & analyze → Logi](media/readme/flow-debug-logi.png)

### Salesforce UI Integration ![Beta](https://img.shields.io/badge/Beta-0176d3)

Bring SFOC into the Salesforce pages where you work. Enable the master switch and the capabilities you want in **Settings → Salesforce UI Integration**. Each capability is opt-in; actions that use Salesforce data require a saved org and an active Salesforce session. The deployment-source links can still be displayed before you select a saved target org.

#### Debug Logs, ready for analysis

Open a native Setup Debug Log in the SFOC Apex Log Viewer with one click. On the same page, place Debug Logs above User Trace Flags to reduce scrolling.

![Setup Debug Logs → Open in SFOC](media/readme/flow-sf-inject.png)

#### Keep User Trace Flags useful

Show the active and recently expired traces that matter, and extend or reactivate an eligible trace without leaving Setup.

![Salesforce User Trace Flags → SFOC enhancements](media/readme/flow-sf-trace-flags.png)

#### Understand failed deployments where they happen

Expand failed deployments for inline component and test errors. From the status page or the deployment-detail page, choose a saved org and Ctrl/Cmd-click an Apex reference to open its source in SFOC.

![Salesforce Deployment Status → SFOC diagnostics](media/readme/flow-sf-deployments.png)

#### From deployment error to Apex source

On the deployment-detail page, select a saved org and Ctrl/Cmd-click a component, test, or stack-trace reference to open the relevant class directly in SFOC.

![Salesforce Deployment detail → SFOC Apex source](media/readme/flow-sf-deployment-source.png)

#### Your SFOC tools from any Lightning page

Add personal Quick Links in the global Lightning header for SFOC tools or same-org custom paths. Use the configurable Setup Command Palette shortcut (default `Ctrl+K`) to search Setup pages, configured links, saved scripts, and SFOC tools.

![Salesforce Lightning → SFOC Quick Links](media/readme/flow-sf-quick-links.png)

![Salesforce Setup → SFOC Command Palette](media/readme/flow-sf-setup-palette.png)

> **Trademark notice:** Salesforce Org Compare is a third-party tool and is not affiliated with or endorsed by Salesforce, Inc.

---

## Table of contents

**Product**

- [Why teams choose the browser](#why-teams-choose-the-browser)
- [How it works](#how-it-works)
- [Usage flows](#usage-flows)
- [Features](#features)

**Technical**

- [Security and Privacy](#security-and-privacy)
- [Technical Architecture](#technical-architecture)
- [Installation](#installation)
- [Troubleshooting](#troubleshooting)
- [Contributions](#contributions)
- [Development](#development)
- [Project Structure](#project-structure)
- [Third-Party Libraries](#third-party-libraries)
- [About](#about)
- [License](#license)

---

## Features

### Metadata Comparator

- Search and index metadata across saved orgs
- Retrieve source and compare side by side with Monaco Editor
- Export diffs to HTML
- Support for Apex, LWC, Aura, Visualforce, Permission Sets, Profiles, FlexiPages, and more
- Persist compared items locally between sessions

### Workbench & productivity

- Optional Workbench navigation with Home, favorites, recent tools, contextual actions, and guided onboarding
- Command palette to jump to tools, metadata, and saved scripts with `Ctrl/Cmd+K`
- Saved SOQL/SOSL queries, Anonymous Apex scripts, Apex test profiles, and pinned work items
- Backup and restore for orgs, preferences, favorites, saved work, queries, scripts, and test profiles

### Development

| Tool | Description |
|------|-------------|
| **Apex Tests** | Run tests, manage jobs and reuse named test profiles |
| **Apex Coverage Compare** | Compare coverage between orgs and inspect covered lines |
| **Quick Edit** | Retrieve, edit, validate, and deploy Apex or Visualforce source |
| **Lightning Quick Edit** | Retrieve, edit, validate, and deploy LWC and Aura bundles |
| **Anonymous Apex** | Execute and keep reusable Anonymous Apex scripts |
| **Query Explorer** | Build, run, save, and share SOQL or SOSL queries |
| **REST Explorer** | Interact with Salesforce REST APIs |
| **Debug Log Browser** | Browse logs, manage traces, and open detailed analysis |
| **Event Monitor** | Subscribe to Platform Events in real time |

### Analysis

| Tool | Description |
|------|-------------|
| **Field Dependency** | Explore dependent-picklist relationships |
| **Dependency Explorer** | Analyze metadata dependencies and their graph |
| **Permission Diff** | Compare permission sets and profiles |
| **Object Describe** | Inspect object and field metadata |
| **Data Workbench** | Create and edit records, plus import CSV data |
| **Custom Settings Compare** | Diff custom settings across orgs |
| **Custom Metadata Compare** | Diff custom metadata types |
| **Record Compare** | Compare individual records |

### Monitoring

| Tool | Description |
|------|-------------|
| **Environment Status** | Review Trust status, instance health, and environment signals |
| **Org Limits** | Review org limits, consumption, and warning thresholds |
| **Deploy Status** | Track metadata deployments |
| **Bulk Job Monitor** | Monitor bulk API jobs |
| **Setup Audit Trail** | Review setup change history |
| **Field History** | Inspect field history tracking |

### Manifests

| Tool | Description |
|------|-------------|
| **Generate Package.xml** | Build `package.xml` from selected metadata |
| **Metadata Type Compare** | Compare all members of a metadata type |

### Standalone Viewers

- **Apex Log Viewer** — advanced debug log parsing and analysis
- **Logi** ![Beta](https://img.shields.io/badge/Logi-Beta-0176d3) — optional AI advisor inside the Apex Log Viewer (summarize, chat, quick actions). [Request beta access](https://salesforceorgcompare.com/solicitar-acceso-logi/).
- **Apex Coverage Viewer** — coverage visualization
- **Apex Source Viewer** — focused Apex source inspection

### Salesforce UI Integration (`sfInject`)

- **Debug Logs:** Open each native Setup log in the Apex Log Viewer and optionally place Debug Logs above User Trace Flags.
- **User Trace Flags:** Filter to relevant active/recently expired traces and extend or reactivate eligible user traces.
- **Deployments:** Expand errors inline; select an org and Ctrl/Cmd-click Apex references in status or deployment-detail errors to open source in SFOC.
- **Quick Links:** Add a global Lightning-header menu for SFOC tools and same-org custom URLs.
- **Setup Command Palette:** Use a configurable shortcut (default `Ctrl+K`) to search Setup, Quick Links, saved scripts, and SFOC tools.


### Popup & Settings

- Manage saved orgs (aliases, groups, drag-and-drop ordering)
- Detect the org from the active browser tab
- Optional Workbench navigation, light/dark appearance, and theme controls
- Language (EN/ES), telemetry opt-out, and export/import settings
- Favorites and recent tools in the main app

---

## Security and Privacy

The Salesforce Org Compare extension communicates **directly between your browser and Salesforce**. Org data is not sent to third-party servers for processing (except when you explicitly use optional features such as Logi).

- Authentication reuses your existing Salesforce browser session (session cookie read at runtime; never stored in extension storage).
- API calls use the official Salesforce REST and Metadata APIs with the permissions of the logged-in user.
- Preferences, saved org aliases, and locally cached metadata are stored in `chrome.storage.local` on your device.
- Optional usage telemetry is sent to PostHog (EU region) and can be disabled in extension settings. Telemetry does not include Salesforce record data.
- Logi (when enabled and used) sends log excerpts / chat to an LLM via a secure proxy or your own OpenRouter key — only when you invoke Logi.
- Salesforce UI Integration is opt-in and runs as a local DOM enhancement on matching Lightning and Setup pages. Data actions require a saved org and active session; DOM-only actions and deployment source links follow their own documented constraints.
- The extension requires cookie access for Salesforce domains to obtain the session token used by the Salesforce UI.

For a full summary, see [PRIVACY.md](PRIVACY.md). The complete privacy policy is available at [salesforceorgcompare.com/privacy-policy](https://salesforceorgcompare.com/privacy-policy).

To validate this description, inspect the source code or monitor network traffic in your browser DevTools.

---

## Technical Architecture

- **Chrome Manifest V3:** `background.js` is the service-worker entry point; the popup, settings, main application, and standalone viewers are local extension pages.
- **Salesforce access:** The extension reuses the active browser session and calls Salesforce REST, Tooling, and Metadata APIs with the logged-in user's permissions. Saved orgs carry their selected API version; the current default is API `63.0`.
- **Local state:** Preferences, saved orgs, cached comparison state, saved queries/scripts, and UI-integration configuration live in Chrome storage. Session credentials are read at runtime and are not persisted there.
- **Salesforce UI Integration:** `sfInject/content/bundle.js` is a generated content-script bundle. Its host checks URL, frame, user settings, and org/session requirements before mounting individual injectors. It uses namespaced DOM and styles, observes Lightning re-renders, and removes controls when they are disabled or no longer applicable.
- **Offline-friendly UI:** Monaco Editor, icons, and other browser assets are packaged with the extension; the product UI does not need remote fonts, scripts, styles, or icon requests.

For the detailed capability and runtime matrix, see [docs/SF_UI_INTEGRATIONS.md](docs/SF_UI_INTEGRATIONS.md).

---

## Installation

### Get the extension

Visit **[salesforceorgcompare.com](https://salesforceorgcompare.com/)** for the latest release and Chrome Web Store link.

### Local installation (from source)

1. Clone this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the **root directory** of this repository (the folder containing `manifest.json`).

---

## Troubleshooting

- **Extension not detecting your org** — Make sure you are logged into Salesforce in the same browser profile and refresh the Salesforce tab.
- **Org not found after enabling My Domain** — Restart your browser or clear the old `sid` cookie for the previous Salesforce domain.
- **Missing icons when loading unpacked** — Ensure the `icons/` folder with `icon-16.png`, `icon-32.png`, `icon-48.png`, and `icon-128.png` is present (required by `manifest.json`).
- **Salesforce UI Integration not visible** — Enable the master switch and the relevant capability in Settings, confirm that the org is saved, and refresh a supported Lightning or Setup page. Quick Links also needs at least one configured link.

---

## Contributions

Contributions are welcome! Please open an issue to discuss significant changes before starting development.

**Before submitting a pull request:**

1. Describe the problem or feature clearly in the issue.
2. Keep changes focused and follow existing code style.
3. Run unit tests (`npm test`) and test the extension manually in Chrome after loading unpacked.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) with npm

### Setup

```bash
npm install
```

`npm install` runs `prepare`, which rebuilds the Salesforce UI Integration content bundle via `sfInject/bundle.mjs` (the committed `sfInject/content/bundle.js` is what the extension loads).

### Load in Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository root.

### Build & package

```bash
npm run build:sf-inject   # Rebuild sfInject content bundle
npm run minify:extension  # Minify for production
npm run pack:chrome       # Package for Chrome Web Store (Windows PowerShell)
```

### Telemetry config (local only)

Copy `shared/telemetryConfig.example.js` to `shared/telemetryConfig.js` and fill in your PostHog key if needed. This file is gitignored and must never be committed.

### Unit tests

```bash
npm test
npm run test:e2e          # Playwright extension tests
```

Unit tests use Vitest and live under `tests/`; end-to-end coverage uses Playwright under `e2e/`.

---

## Project Structure

| Path | Purpose |
|------|---------|
| `manifest.json` | Chrome MV3 extension manifest |
| `background.js` | Service worker entry point |
| `background/` | Message handlers, org auth, caches, telemetry |
| `popup/` | Extension popup and settings UI |
| `code/` | Main app — comparator, tools, Monaco editor |
| `sfInject/` | Salesforce UI Integration (content scripts, injectors, `bundle.mjs`) |
| `shared/` | Shared APIs, i18n, feature controls |
| `vendor/` | Third-party libraries (Monaco Editor, etc.) |
| `media/readme/` | README marketing and usage images |
| `icons/` | Extension icons |
| `tests/` | Unit tests (Vitest) |

---

## Third-Party Libraries

This extension uses third-party open-source libraries. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and license details.

---

## About

Built by **[Ángel Picado](https://es.linkedin.com/in/angelcubo01)**.

- Website: [salesforceorgcompare.com](https://salesforceorgcompare.com/)
- LinkedIn: [es.linkedin.com/in/angelcubo01](https://es.linkedin.com/in/angelcubo01)

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Ángel Picado
