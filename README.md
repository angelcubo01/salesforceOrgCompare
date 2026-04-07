# Salesforce Org Compare

A Chrome extension (Manifest V3) that lets you **compare metadata and source code between two Salesforce orgs** using your existing browser session — no CLI, no connected apps, no extra credentials.

All API calls are handled by the extension's **service worker**, so they never appear in the page's Network tab and your session stays private.

## Features

- **Side-by-side diff** powered by Monaco Editor with syntax highlighting for Apex, Visualforce, Lightning (HTML/JS/CSS), XML, JSON, and more.
- **Retrieve metadata** via the Salesforce Metadata API (retrieve ZIP) or Tooling API (source read).
- **Search & add components** across orgs — Apex classes, triggers, Visualforce pages/components, Lightning Web Components, Aura bundles, static resources, flows, and many more metadata types.
- **Generate `package.xml`** from the items you've compared, ready for deployment.
- **Field Dependency panel** — visualise picklist dependencies between fields.
- **Apex Test Hub** — run Apex tests, view results, manage trace flags, and inspect code coverage.
- **Apex Log Viewer** — browse and read debug logs with filtering and search.
- **Export diff as HTML** — download a self-contained HTML file of the current comparison.
- **Internationalisation** — UI available in English and Spanish.
- **Org management** — save multiple orgs, re-authenticate when sessions expire, auto-detect org type.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                     │
├────────────┬────────────────────────┬───────────────────┤
│   popup/   │        code/           │   background.js   │
│  Org list  │  Main compare UI       │  Service Worker   │
│  Settings  │  Monaco editor         │  ┌─────────────┐  │
│            │  Apex tests / logs     │  │ messageHdlr │  │
│            │  Field dependencies    │  │ caches      │  │
│            │  Package.xml generator │  │ orgHelpers  │  │
│            │                        │  │ usageLog    │  │
│            │                        │  │ versionUpd  │  │
├────────────┴────────────────────────┴──┴─────────────┘  │
│                       shared/                           │
│   salesforceApi.js · metadataRetrieve.js · i18n.js      │
│   orgDiscovery.js · cache.js · extensionSettings.js     │
├─────────────────────────────────────────────────────────┤
│                       vendor/                           │
│          Monaco Editor  ·  jsdiff (diff.min.js)         │
└─────────────────────────────────────────────────────────┘
```

## Installation

### From source (developer mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/angelcubo01/salesforceOrgCompare.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the cloned folder.
5. The extension icon will appear in your toolbar. Click it to get started.

### Prerequisites

- Google Chrome (or any Chromium-based browser that supports Manifest V3).
- An active session in at least one Salesforce org (the extension reads the session cookie from your browser).

## Usage

1. Log in to your Salesforce org(s) in Chrome.
2. Click the extension icon — your active orgs will be detected automatically.
3. Open the **Compare** view to start adding metadata items.
4. Select two orgs, pick the metadata type, search for a component, and view the diff.

## Project Structure

```
├── manifest.json              # Extension manifest (MV3)
├── background.js              # Service worker entry point
├── background/                # SW modules: messaging, caches, org helpers, telemetry
├── code/                      # Main comparison UI
│   ├── code.html / .js / .css # Compare page shell
│   ├── core/                  # Bridge, state, persistence, constants
│   ├── editor/                # Monaco integration, diff utilities, export
│   ├── flows/                 # Retrieve & add-item workflows
│   ├── lib/                   # IndexedDB, labels, limits, zip helpers
│   ├── setup/                 # Listeners, version check
│   ├── ui/                    # Panels: tests, package.xml, field deps, search, toasts
│   ├── workers/               # Monaco web workers (CSS, HTML, JSON, TS, editor)
│   ├── apex-coverage-viewer.* # Code coverage viewer page
│   └── apex-log-viewer.*      # Debug log viewer page
├── popup/                     # Extension popup: org list, settings
├── shared/                    # Shared modules: SF API client, metadata, i18n, cache
└── vendor/                    # Third-party: Monaco Editor, jsdiff
```

## Technologies

- **JavaScript ES Modules** — no build step, runs directly in the browser.
- **Chrome Extension Manifest V3** — service worker, `chrome.storage`, `chrome.cookies`, `chrome.alarms`.
- **Salesforce REST & Tooling API** — SOQL queries, metadata retrieves, Apex test execution.
- **Monaco Editor** — full-featured code editor with diff support.
- **jsdiff** — text diff algorithms for large file comparison.
- **IndexedDB** — local storage for Apex viewer data.

## Configuration

### Telemetry endpoint (optional)

The extension can optionally send anonymous usage telemetry to a Google Apps Script endpoint. To enable it, set the `USAGE_LOG_ENDPOINT` constant in:

- `background/config.js`
- `code/core/constants.js`

If left empty (default), no telemetry data is sent.

## License

This project is licensed under the [MIT License](LICENSE).

## Author

**Ángel Picado** — [LinkedIn](https://es.linkedin.com/in/angelcubo01)
