# Salesforce Org Compare

[![Version](https://img.shields.io/badge/version-3.0.0-blue)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Website](https://img.shields.io/badge/website-salesforceorgcompare.com-0176d3)](https://salesforceorgcompare.com/)

**[salesforceorgcompare.com](https://salesforceorgcompare.com/)**

Chrome extension to compare Salesforce org metadata using your browser session — no separate OAuth setup required. Built for administrators, developers, and integrators who work across multiple orgs every day.

- [Features](#features)
- [Security and Privacy](#security-and-privacy)
- [Installation](#installation)
- [Troubleshooting](#troubleshooting)
- [Contributions](#contributions)
- [Development](#development)
- [Project Structure](#project-structure)
- [Third-Party Libraries](#third-party-libraries)
- [About](#about)
- [License](#license)

## Features

### Metadata Comparator

- Search and index metadata across saved orgs
- Retrieve source from orgs and compare side by side with Monaco Editor
- Export diffs to HTML
- Support for Apex, LWC, Aura, Visualforce, Permission Sets, Profiles, FlexiPages, and more
- Persist compared items locally between sessions

### Development

| Tool | Description |
|------|-------------|
| **Apex Tests** | Run and manage Apex test jobs |
| **Apex Coverage Compare** | Compare code coverage between orgs |
| **Quick Edit** | Edit and deploy Apex classes |
| **Lightning Quick Edit** | Deploy Lightning bundles |
| **Anonymous Apex** | Execute anonymous Apex |
| **Query Explorer** | Build and run SOQL queries |
| **REST Explorer** | Interact with Salesforce REST APIs |
| **Debug Log Browser** | Browse and filter debug logs |
| **Event Monitor** | Subscribe to Platform Events in real time |

### Analysis

| Tool | Description |
|------|-------------|
| **Field Dependency** | Explore field dependencies |
| **Dependency Explorer** | Analyze metadata dependencies |
| **Permission Diff** | Compare permission sets and profiles |
| **Object Describe** | Inspect object and field metadata |
| **Data Workbench** | Import, export, and edit records |
| **Custom Settings Compare** | Diff custom settings across orgs |
| **Custom Metadata Compare** | Diff custom metadata types |
| **Record Compare** | Compare individual records |

### Monitoring

| Tool | Description |
|------|-------------|
| **Environment Status** | Trust status and instance health |
| **Org Limits** | View org limits and usage |
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
- **Apex Coverage Viewer** — coverage visualization
- **Apex Source Viewer** — focused Apex source inspection

### Popup & Settings

- Manage saved orgs (aliases, groups, drag-and-drop ordering)
- Detect the org from the active browser tab
- Theme, language (EN/ES), telemetry opt-out, export/import settings

## Security and Privacy

The Salesforce Org Compare extension communicates **directly between your browser and Salesforce**. Org data is not sent to third-party servers for processing.

- Authentication reuses your existing Salesforce browser session (session cookie read at runtime; never stored in extension storage).
- API calls use the official Salesforce REST and Metadata APIs with the permissions of the logged-in user.
- Preferences, saved org aliases, and locally cached metadata are stored in `chrome.storage.local` on your device.
- Optional usage telemetry is sent to PostHog (EU region) and can be disabled in extension settings. Telemetry does not include Salesforce record data.
- The extension requires cookie access for Salesforce domains to obtain the session token used by the Salesforce UI.

For a full summary, see [PRIVACY.md](PRIVACY.md). The complete privacy policy is available at [salesforceorgcompare.com/privacy-policy](https://salesforceorgcompare.com/privacy-policy).

To validate this description, inspect the source code or monitor network traffic in your browser DevTools.

## Installation

### Get the extension

Visit **[salesforceorgcompare.com](https://salesforceorgcompare.com/)** for the latest release and Chrome Web Store link.

### Local installation (from source)

1. Clone this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the **root directory** of this repository (the folder containing `manifest.json`).

## Troubleshooting

- **Extension not detecting your org** — Make sure you are logged into Salesforce in the same browser profile and refresh the Salesforce tab.
- **Org not found after enabling My Domain** — Restart your browser or clear the old `sid` cookie for the previous Salesforce domain.
- **Missing icons when loading unpacked** — Ensure the `icons/` folder with `icon-16.png`, `icon-32.png`, `icon-48.png`, and `icon-128.png` is present (required by `manifest.json`).

## Contributions

Contributions are welcome! Please open an issue to discuss significant changes before starting development.

**Before submitting a pull request:**

1. Describe the problem or feature clearly in the issue.
2. Keep changes focused and follow existing code style.
3. Test the extension manually in Chrome after loading unpacked.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) with npm (for optional build scripts)

### Setup

```bash
npm install
```

### Load in Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository root.

### Build & package

```bash
npm run minify:extension   # Minify for production
npm run pack:chrome        # Package for Chrome Web Store (Windows PowerShell)
```

### Telemetry config (local only)

Copy `shared/telemetryConfig.example.js` to `shared/telemetryConfig.js` and fill in your PostHog key if needed. This file is gitignored and must never be committed.

### Unit tests

Unit tests are maintained locally and are **not included in this public repository**. The `npm test` script requires a local `tests/` folder.

## Project Structure

| Path | Purpose |
|------|---------|
| `manifest.json` | Chrome MV3 extension manifest |
| `background.js` | Service worker entry point |
| `background/` | Message handlers, org auth, caches, telemetry |
| `popup/` | Extension popup and settings UI |
| `code/` | Main app — comparator, tools, Monaco editor |
| `shared/` | Shared APIs, i18n, feature controls |
| `vendor/` | Third-party libraries (Monaco Editor, etc.) |
| `scripts/` | Build and packaging scripts |

## Third-Party Libraries

This extension uses third-party open-source libraries. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and license details.

## About

Built by **[Ángel Picado](https://es.linkedin.com/in/angelcubo01)**.

- Website: [salesforceorgcompare.com](https://salesforceorgcompare.com/)
- LinkedIn: [es.linkedin.com/in/angelcubo01](https://es.linkedin.com/in/angelcubo01)

## License

[MIT](LICENSE) — Copyright (c) 2026 Ángel Picado
