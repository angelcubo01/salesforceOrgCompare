# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Chrome/Chromium extension built with Manifest V3, vanilla web UI, and ES modules; packaged and tested with Node.js/npm, Vitest (unit) and Playwright (end-to-end, accessibility, visual, performance).

## Users

Primary users are Salesforce admins, developers, and release managers who work across multiple orgs and need to compare metadata, debug logs, permissions, and deployment-related information without switching to a separate CLI workflow. Secondary users are QA engineers, architects, and consultants who move between many client orgs.

## Product Purpose

Salesforce Org Compare helps users compare Salesforce orgs and run the surrounding development, debugging, access-management, and monitoring workflows directly from the browser session they already have open. The product exists to make org comparison, log investigation, permission changes, and release readiness checks faster and less dependent on CLI setup, Connected Apps, or extra credentials.

## Positioning

The product's differentiator is that it reuses an existing Salesforce browser session rather than requiring a new authentication flow or separate tooling. It is positioned as a practical, browser-based workbench for day-to-day Salesforce admin and developer work: one place to compare, test, query, edit, debug, audit, and monitor several orgs.

## Operating Context

The product is used in Chrome while the user is already signed into Salesforce. Users save orgs with aliases and groups, compare and work with them inside the extension app (the Workbench), and can optionally extend compatible Salesforce Setup and Lightning pages with SFOC actions. The opt-in UI integration supports Debug Logs, User Trace Flags, deployment diagnostics and source navigation, Quick Links with Record Quick Actions, a Setup Command Palette that also manages users, and a shortcut to open the current record in Record Viewer. The extension stores local preferences and saved org data in browser storage and supports optional telemetry and AI-assisted features. It runs in normal and incognito windows, each with its own Salesforce session.

## Capabilities and Constraints

Confirmed capabilities include:

- Compare metadata and code across saved Salesforce orgs, with a single-view mode and HTML export
- Generate and compare `package.xml` manifests and compare all members of a metadata type
- Run and analyze Apex tests (by class or method, reusable profiles, slowest methods, logs as ZIP), compare coverage, and inspect logs, source, and related developer workflows
- Edit, validate, and deploy Apex, Visualforce, LWC, and Aura from the browser; run Anonymous Apex; query with SOQL/SOSL; call REST endpoints; subscribe to Platform and Change Events
- Compare and edit permissions: Permission Diff for Profiles and Permission Sets, effective permissions per user, and bulk object and field access changes with preview and per-target results
- Edit records, import data (CSV, Excel, JSON), and inspect, clone, or delete a record in Record Viewer; save Record Quick Actions
- Monitor environment status, limits, deployments (with executed tests and archived packages), bulk jobs, setup audit trail, field history, and an on-demand Health Monitor with PDF export
- Open native Setup Debug Logs in SFOC; improve User Trace Flags; inspect failed deployments inline and navigate to Apex source from supported deployment pages when UI integration is enabled
- Open configured SFOC tools or same-org paths from Lightning Quick Links, and search Setup pages, saved scripts, configured links, SFOC tools, and users through the Setup Command Palette, including user management (permission sets and groups, public groups, trace flags, user edits, password, Login As)
- Persist compared items, queries, scripts, and test profiles locally; back up and restore settings
- Offer optional AI-assisted log analysis through Logi, which is opt-in and can use either a secure proxy or a user-provided OpenRouter key

Confirmed constraints include:

- The product depends on the user's existing Salesforce browser session and relevant Salesforce domain access
- The extension is designed for Chrome/Chromium and uses Manifest V3
- Every action runs with the logged-in user's Salesforce permissions
- Writes pass through a guard: orgs marked read-only are blocked, and deploys to production are blocked. Object & Field Access updates Profiles through a metadata deployment, so it is subject to the same rules
- Some advanced features are optional and may require user opt-in or additional configuration; some tools can be hidden or marked beta remotely through feature controls
- UI integrations are individually opt-in; operations against Salesforce data require an active browser session and, except for DOM-only affordances, a saved org
- Login As in incognito requires the extension to be allowed in incognito windows
- The product is a third-party tool and is not affiliated with or endorsed by Salesforce

## Brand Commitments

The existing brand is Salesforce Org Compare. The product language emphasizes browser-session access, no CLI requirement, and practical admin/developer workflows. The repository also preserves a clear privacy and third-party positioning note.

## Evidence on Hand

Repository evidence used to write this record includes:

- README.md for product purpose, user audiences, workflows, and feature summary
- manifest.json for platform, permissions, version, incognito behavior, and supported Salesforce integration surfaces
- code/workbench/workspaceRegistry.js for the tool and workspace inventory
- sfInject/lib/registry.js for the shipped UI-integration capabilities
- package.json for stack, tooling, and test/build workflow
- PRIVACY.md, docs/RELEASE_NOTES_*.md, and the rest of docs for privacy, release history, and optional AI/telemetry behavior

## Product Principles

- Reuse the browser session the user already has rather than introducing a new authentication path
- Support multi-org workflows for admins and developers in one place
- Keep the core experience practical and fast for daily comparison and debugging work
- Show the effect of a change before it is made (previews, queues, confirmations) and report partial failures per item
- Preserve opt-in behavior for advanced or experimental features so the baseline experience remains lightweight

## Accessibility & Inclusion

The interface is tested for accessibility: Playwright specs run axe checks and the light theme targets WCAG A/AA, with `prefers-reduced-motion` and `forced-colors` adaptations, focus management for dialogs, and combobox/listbox semantics in the command palette. The product ships in English and Spanish. New work should keep following these expectations.
