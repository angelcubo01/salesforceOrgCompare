# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Chrome/Chromium extension built with Manifest V3, vanilla web UI, and ES modules; packaged and tested with Node.js/npm and Vitest.

## Users

Primary users are Salesforce admins, developers, and release managers who work across multiple orgs and need to compare metadata, debug logs, and deployment-related information without switching to a separate CLI workflow.

## Product Purpose

Salesforce Org Compare helps users compare Salesforce orgs and inspect related development and debugging workflows directly from the browser session they already have open. The product exists to make org comparison, log investigation, and release readiness checks faster and less dependent on CLI setup, Connected Apps, or extra credentials.

## Positioning

The product’s differentiator is that it reuses an existing Salesforce browser session rather than requiring a new authentication flow or separate tooling. It is positioned as a practical browser-based companion for day-to-day Salesforce admin and developer work.

## Operating Context

The product is used in Chrome while the user is already signed into Salesforce. Users save orgs with aliases and groups, compare them inside the extension app, and can optionally integrate with Salesforce Setup pages for direct navigation into debug log workflows. The extension stores local preferences and saved org data in browser storage and supports optional telemetry and AI-assisted features.

## Capabilities and Constraints

Confirmed capabilities include:

- Compare metadata and code across saved Salesforce orgs
- Inspect Apex tests, coverage, logs, source, and related developer workflows
- Open log and setup-related workflows from Salesforce Setup pages when UI integration is enabled
- Export comparison results to HTML and persist compared items locally between sessions
- Offer optional AI-assisted log analysis through Logi, which is opt-in and can use either a secure proxy or a user-provided OpenRouter key

Confirmed constraints include:

- The product depends on the user’s existing Salesforce browser session and relevant Salesforce domain access
- The extension is designed for Chrome/Chromium and uses Manifest V3
- Some advanced features are optional and may require user opt-in or additional configuration
- The product is a third-party tool and is not affiliated with or endorsed by Salesforce

## Brand Commitments

The existing brand is Salesforce Org Compare. The product language emphasizes browser-session access, no CLI requirement, and practical admin/developer workflows. The repository also preserves a clear privacy and third-party positioning note.

## Evidence on Hand

Repository evidence used to write this record includes:

- README.md for product purpose, user audiences, workflows, and feature summary
- manifest.json for platform, permissions, and supported Salesforce integration surfaces
- package.json for stack, tooling, and test/build workflow
- PRIVACY.md and docs for privacy and optional AI/telemetry behavior

## Product Principles

- Reuse the browser session the user already has rather than introducing a new authentication path
- Support multi-org workflows for admins and developers in one place
- Keep the core experience practical and fast for daily comparison and debugging work
- Preserve opt-in behavior for advanced or experimental features so the baseline experience remains lightweight

## Accessibility & Inclusion

No product-specific accessibility or inclusion requirements were documented in the repository evidence. Future work should follow standard web and browser-extension accessibility expectations.
