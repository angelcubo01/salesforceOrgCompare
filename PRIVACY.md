# Privacy

Salesforce Org Compare is a browser extension that helps you compare and work with Salesforce org metadata. This document summarizes how the extension handles your data. It does not replace the full legal privacy policy.

**Full privacy policy:** [salesforceorgcompare.com/privacy-policy](https://salesforceorgcompare.com/privacy-policy)

## Direct communication with Salesforce

The extension communicates **only between your browser and Salesforce** for org operations (metadata retrieve, SOQL, deploy, etc.). Salesforce org data is not routed through our servers for processing.

## Session authentication

- The extension reads your Salesforce session cookie (`sid`) at runtime to call Salesforce APIs on your behalf.
- Session tokens are **not** written to `chrome.storage` or sent to third parties.
- API access is limited to what your logged-in Salesforce user is allowed to do.

## Local storage

The following may be stored in `chrome.storage.local` on your device:

- Saved org aliases and display preferences
- UI settings (theme, language, layout)
- Locally cached metadata and comparison state
- Extension configuration (export/import supported from settings)

This data stays on your device unless you explicitly export it.

## Optional telemetry

When enabled (and you can opt out in extension settings), anonymous usage events may be sent to **PostHog (EU)** to help improve the product. This includes:

- Feature usage and navigation patterns
- Error reports for debugging (sanitized; no Salesforce record payloads)

Telemetry does **not** include Account, Contact, or other Salesforce record data.

## Permissions

| Permission | Why |
|------------|-----|
| `cookies` | Read Salesforce session for API calls |
| `storage` | Save org list, preferences, and local cache |
| `tabs` | Detect the active Salesforce org from the current tab |
| `alarms` | Background refresh and scheduled tasks |
| `notifications` | Optional status notifications |

Host permissions are limited to Salesforce domains, the project website, PostHog EU, and Salesforce trust status API.

## Verification

You can verify this behavior by:

1. Inspecting the extension source code in this repository.
2. Monitoring network requests in Chrome DevTools while using the extension.
3. Reviewing what is stored under `chrome.storage` in the extension's service worker inspector.

## Contact

For privacy questions, use the contact options on [salesforceorgcompare.com](https://salesforceorgcompare.com/).
