# VareonHQ phased product roadmap

Version: 1.0 draft · 23 October 2026

Product definition: docs/product/PRODUCT-BLUEPRINT.md
Software delivery standard: docs/product/AGENCY-ENGINEERING-STANDARD.md

Phase ordering expresses dependencies, not delivery-date promises. Feature descriptions are planned unless verified in the blueprint baseline. Preserve the current usable installation throughout.

## Phase 0 — Definition and baseline

Deliver: current-capability inventory, consolidated product blueprint, agency engineering standard draft and prioritised implementation backlog.
Exit: distinguish implemented features from planned work; record dependencies and commercial boundaries; make these documents available inside the dashboard.

## Phase 1 — Connected experience and design foundation

1. Define charcoal/lime design tokens, density, accessibility and white-label configuration boundaries.
2. Introduce Today / Clients & sales / Work / Marketing / Business navigation without losing existing routes.
3. Redesign Today around priorities, quick-add, approvals, next actions and recent work.
4. Redesign the client workspace with communication timeline and linked delivery/finance/docs.
5. Redesign the project workspace with overview, plan, board, documents, time and delivery tabs.
6. Verify iPhone navigation, touch controls, keyboard layout and contextual assistant behaviour.
Exit: one complete manual client/project journey works through the three flagship screens; desktop and phone checks pass; existing data and all current modules remain accessible.

## Phase 2 — Shared work and software delivery

1. Extend the shared work item model with acceptance criteria, subtasks, dependencies, comments, files and history.
2. Add software project PRDs, requirement links, epics/tickets/backlog and project Kanban.
3. Add repository, environment and release records with evidence-backed status.
4. Implement the engineering standard as server-side transition gates and assistant tools.
5. Add Codex planning/ticket/status/evidence workflows and manual equivalents.
6. Integrate actual repository checks, preview/staging references and approved release processes.
Exit: a scoped feature can move from brief → PRD → tickets → implementation → verified delivery, with blocked transitions, review evidence and no invented deployment success.

## Phase 3 — Complete agency delivery

Service catalogue; proposals/scopes/variations; connected agreements/deposit checks; client communication timeline; resource/contractor planning; retainers and unbilled work; asset ownership/handover; support/maintenance; next-action rules. Extend existing invoices/time/onboarding instead of duplicating them.
Exit: one service moves from enquiry to accepted delivery, billing and support with shared IDs and traceable decisions.

## Phase 4 — Marketing and growth

Google Business Profile connections/reviews/reporting first, gated by Google API approval and OAuth. Then approved posting/media/profile changes. Campaign planning, creative connectors, approved social publishing, richer GA4/Search Console and website health monitoring. Evidence-based SEO/AEO reporting.
Exit: authorised data is labelled accurately; public changes have previews/approval; no simulated external success.

## Phase 5 — Communications and campaign infrastructure

Consent/suppression/contact foundations → sending-domain and email-provider setup → campaign builder/sequences/reporting → two-way SMS → business numbers/calling. Design always-on inbound processing, event retries, abuse controls and usage metering before launch.
Commercial model: platform subscription + monthly number rental + metered messaging/calls/email + optional services/setup; clear rates, spending caps and reseller rules. Do not purchase numbers or send campaigns as part of planning.

### Making calls and sending texts from the platform (owner intent, 24 Oct 2026)
Users will eventually call and text from VareonHQ itself. What exists: logged calls and texts per client, recordings with a told-them gate, per-contact email and text consent, automatic STOP opt-out, phone lines that cannot be marked Connected by hand, and `canText()` for the sender to call. What it needs:
- **Sending texts** is the simpler half: a server-side Twilio call, run only for outgoing messages whose contact passes `canText()`, written back through `saveRecord(..., {provider:true})` so statuses (Queued, Sent, Delivered, Failed) come from Twilio's status callbacks, never from a click.
- **Calling from the app** needs Twilio's browser calling SDK: a server route that mints short-lived access tokens, a Twilio app that points at us, microphone permission in the desktop app, and an in-app dialer with the client and contact attached so the call logs itself and recordings attach automatically.
- **Inbound calls and texts** need Twilio to reach us, so a public webhook address. The private-only rule forbids that today; it needs the owner's explicit design sign-off, signature checking on every request, and nothing else exposed.
- **Credentials** (account SID, auth token or API key) go in the `-v2` Keychain entries through the native helper, never in settings or notes.
- **Compliance gates before launch:** the recording notice (spoken or played at the start of recorded calls), text consent and STOP/HELP, Australian number and sender registration, quiet hours, and a suppression list that wins over everything.
- **More than one user** means: which user owns which number, who may call or text which clients, per-user call and text history, and usage metering (calls and texts cost money). That ties into roles and permissions (white-label phase) and the USD subscription work.

## Phase 6 — Commercial pilots and white-label installations

Reusable branding/configuration; agency setup/migration; supported AI access; roles/permissions; accessibility; diagnostic/support tools; licensing/entitlements; reproducible updates; recovery drills and verified backups. Start with separately owned agency installations and paid pilots. Validate time saved, repeat usage, onboarding and support effort before setting mature pricing.
Exit: a second agency can be provisioned and maintained without sharing credentials/data or custom source forks.

## Phase 7 — Hosted collaboration and scale

Only after explicit design/authorisation: hosted agency isolation, always-on operations, client/contractor portal, regional data policies, self-service subscriptions, reseller management, external push, APIs/webhooks and supported extensions.
Exit: isolation/security/recovery/billing tests pass; reliability and support obligations are defined. Do not expose the current private Mac installation publicly.

## Permanent preview requirement

Every installed update remains accessible and verified at https://catlins-macbook-air.tail9bef0e.ts.net/. Tailscale Serve proxies localhost:4320. Preserve the loopback binding, owner/session/origin checks and current business data. Document-only planning updates can be published through the existing Document library without a runtime deployment.
