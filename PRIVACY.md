# Privacy

Salesforce Org Compare is a browser extension that helps you compare and work with Salesforce org metadata. This document summarizes how the extension handles your data. It does not replace the full legal privacy policy.

**Full privacy policy:** [salesforceorgcompare.com/privacy-policy](https://salesforceorgcompare.com/privacy-policy)

## Direct communication with Salesforce

The extension communicates **only between your browser and Salesforce** for org operations (metadata retrieve, SOQL, deploy, etc.). Salesforce org data is not routed through our servers for processing.

**Exception — Logi AI advisor (optional):** When you use the Apex log AI advisor, log excerpts and chat messages you send are transmitted to **OpenRouter** (directly with your own API key, or via our Cloudflare Worker proxy for free-tier models). This is separate from normal metadata compare operations.

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
- Optional BYOK OpenRouter API keys for Logi (if you configure them)

Short-lived JWT session tokens for the Logi proxy may be stored in `chrome.storage.session` (cleared when the browser session ends). Legacy shared proxy tokens are no longer stored in the extension.

This data stays on your device unless you explicitly export it or send it through Logi/OpenRouter as described above.

## Telemetry and error reporting

### Usage telemetry (opt-out)

When enabled in **Settings → Usage telemetry**, anonymous usage events are sent to **PostHog (EU)**. This includes feature usage and navigation patterns. You can disable this at any time.

Usage telemetry does **not** include Account, Contact, or other Salesforce record payloads.

### Technical error reports (always on when PostHog is configured)

Sanitized technical error reports (`$exception`) are sent to PostHog to improve stability **even when usage telemetry is disabled**. These reports exclude credentials, session tokens, and chat/log content; only error type, message, and truncated stack traces from extension code are included.

### Session replay

Session replay may be enabled remotely via PostHog feature flags for a subset of users. When active, it records extension UI interactions (not Salesforce page content).

## Permissions

| Permission | Why |
|------------|-----|
| `cookies` | Read Salesforce session for API calls |
| `storage` | Save org list, preferences, and local cache |
| `tabs` | Detect the active Salesforce org from the current tab |
| `alarms` | Background refresh and scheduled tasks |
| `notifications` | Optional status notifications |

Host permissions include Salesforce domains, the project website, PostHog EU, the Logi proxy Worker (`sfoc-logi-proxy.angelpicadocuadrado.workers.dev`), OpenRouter (BYOK), and the Salesforce trust status API.

## Verification

You can verify this behavior by:

1. Inspecting the extension source code in this repository.
2. Monitoring network requests in Chrome DevTools while using the extension.
3. Reviewing what is stored under `chrome.storage` in the extension's service worker inspector.

## Contact

For privacy questions, use the contact options on [salesforceorgcompare.com](https://salesforceorgcompare.com/).
