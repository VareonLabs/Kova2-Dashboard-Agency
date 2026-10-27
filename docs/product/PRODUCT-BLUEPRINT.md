# VareonHQ product blueprint

Version: 1.0 draft · 23 October 2026 · Owner: CJ Perry

## Product direction

Kova is an AI operations platform that helps a business complete its work with human oversight. The same shared platform and integration catalogue support different industries; each industry profile shapes the records, terminology, workflows, templates, views and assistant guidance. Integrations remain available across profiles and are not hidden by industry.

Software delivery remains the internal proving ground. Field Services, using cleaning as its first example, is the first distinct customer-facing profile. VareonHQ is the working local installation; commercial readiness must be demonstrated separately.

## Product principles

1. Shared client and project records are the source of truth across modules.
2. Every core workflow remains usable manually when AI is unavailable.
3. Show essentials first; open detail in contextual panels. Avoid a separate menu item for every feature.
4. Distinguish proposed, attempted, verified and completed actions.
5. Record evidence for completion and explain blockers and missing data.
6. Preserve business data, sign-ins and existing workflows through upgrades.
7. The current VareonHQ visual requirement is a flat light neutral theme, official lime #C6F432 used sparingly, official logo, and consistent spacing and radii. No purple, sage, olive, cream or neumorphic shadows.
8. Desktop and iPhone are separate layout requirements, not scaled versions of the same screen.
9. Current installation stays local on the Mac, bound to localhost:4320 behind private Tailscale Serve.
10. Every installed update is verified at https://catlins-macbook-air.tail9bef0e.ts.net/.

## Current implementation baseline

Reviewed against version 0.8.0 source. These are implemented capabilities, not certification of production readiness or proof that every external account is authorised.

| Area | Implemented foundation | Remaining boundary |
| --- | --- | --- |
| Workspace | Today, search, approvals, notes, activity, notifications | Unified navigation and contextual workspace redesign |
| Clients and sales | Clients, prospects, follow-up reminders, onboarding templates | Complete relationship timeline, service catalogue and proposals |
| Work | Project/task/contract/content boards, calendar, workload | Connected work items, dependencies, tickets, PRDs and workflow gates |
| Communications | Outlook mail/contacts/folders, signatures, drafts and sync | Campaign sending, SMS, phone system and always-on inbound infrastructure |
| Finance | Invoices, confirmed payments, expenses, cash assumptions and time profitability | Accounting integrations, retainers and reconciliation |
| Marketing | Drafts, media and previews | Approved direct social publishing and campaign automation |
| Analytics | GA4/Search Console integration and custom website audits | GBP access, monitoring and broader analytics |
| Documents | Library, uploaded files, categories, versions as metadata, review dates | True content version comparison, OCR and knowledge relationships |
| AI | GPT/Codex connections, model selection, chats, memory, tools and visible editors | Enforced software delivery process and commercial AI access model |
| Meetings | Notes, browser recording/dictation, proposed tasks/email drafts | Reliable imported recording transcription; browser support varies |
| Reliability | Local backups, checksums, restore review, encrypted exports/imports | Recovery drills, monitored upgrades and commercial operations |
| Product | Mac app, private Tailscale access, phone layouts | Team permissions, tenant isolation, licensing and reusable onboarding |

## Target information architecture

- Today: priorities, quick-add, next actions, notifications, approvals and recent work.
- Clients & sales: contacts, prospects, proposals, contracts and relationship history.
- Work: projects, boards, delivery plans, software tickets, requirements and environments.
- Marketing: content, campaigns, email marketing, GBP and analytics.
- Business: finances, time, profitability, resources, reporting and administration.

A client workspace contains overview, communication timeline, projects, contracts, documents, finance and reporting. A project workspace contains overview, plan/PRD, board/backlog, documents, discussion, time/costs and delivery. Software projects additionally expose repositories, environments, checks and releases.

Search, quick-add, the assistant and approval controls remain reachable across all areas. Advanced modules are optional. Phone navigation prioritises the current workspace and a compact area picker.

## Shared domain model

Organisation → people/roles → clients/contacts → services/opportunities → proposals/contracts → projects → requirements/epics/work items → deliverables/releases → invoices/retainers/support.

Documents, messages, assets, meetings, decisions, time entries, expenses, approvals, environments and automation runs link to these shared IDs. Avoid making detached copies per module. Relationships require validation, deletion protection, provenance, activity events and migration tests.

Organisation identity is a future boundary, not a claim of existing tenant isolation. Add explicit isolation tests before multi-agency hosting.

## Primary end-to-end journeys

### Agency delivery

Enquiry → qualified prospect → proposal → agreement/deposit checks → onboarding → project/template → deliverables/review → invoice/handover → retainer/support.

### Software delivery

Brief → PRD → architecture and decisions → epics/tickets/dependencies → implementation branch → review and checks → staging verification → approved release → handover and maintenance.

### Marketing and customer communications

Authorised contact/consent → audience segment → approved content or sequence → scheduled delivery → actual delivery events → replies/conversions → linked follow-up.

A central next-action layer derives blockers and required decisions from actual linked records: missing deposits, incomplete acceptance testing, scope changes, exhausted retainers and staging approval. It must explain the source and must not infer a payment or deployment success.

## Full capability inventory

Each item below is planned or an extension unless identified in the baseline above. A heading is not a promise that all items already exist.

### Workspace and work management

Quick-add; custom dashboards; favourites; recent items; command palette; saved views; daily/weekly planning; custom fields/tags; common work items; subtasks; checklists; comments; attachments; owners/reviewers; estimates; dependencies; blockers; bulk review; history; Kanban/table/list/calendar/timeline/workload; backlogs; milestones; optional cycles; configurable transitions; required fields; WIP limits; project portfolios; templates and recurring work.

### Clients, sales and services

Multiple contacts; decision-makers; relationship timeline; prospect research with sources; scoring with reasons; pipeline forecasts; attribution; duplicate merging; referrals; client preferences/health; onboarding/offboarding; service catalogue; deliverables/pricing packages; proposals/quotes; revision comparison; electronic signatures; clause library; variations; scope requests; renewal/notice tracking; win-rate reporting.

### Agency delivery and resources

Project templates; deliverables; milestones; staff/contractor skills, availability and capacity; risk/issue registers; scope tracking; budget/schedule alerts; review stages; launch QA; handover packs; retrospective decisions; asset/ownership register; domains, repositories, hosting, licences and access handover references; post-launch support tickets, warranty and retainer links.

### Software engineering

Project-scoped PRDs; requirement IDs; architecture decisions; epics/features/stories/tasks/bugs/spikes/technical debt; acceptance criteria; severity; dependencies; ticket Kanban; branches/commits/PRs; checks/evidence; local/preview/staging/production environments; live previews; migrations; release approvals; flags; release notes; rollback references; incidents; standard versions and exceptions. The separate engineering standard defines the proposed gates.

### Finance, time and retainers

Timers/manual entries; billable categories; role-specific internal costs; estimates versus actuals; retainer allowances/rollover/overages; utilisation; unbilled work; timesheet approval; time-to-invoice drafts; effective rates; client/project/service profitability; revenue concentration; invoice generation/numbering/line items; deposits/schedules; recurring invoices; credits; receipts/OCR; suppliers/contractors/POs; ageing; follow-up drafts; accounting/payment/bank integrations; subscription spend; cash scenarios; accountant exports.

### Email, phone and campaigns

Outlook shared mailboxes/sender identities; rich compose/signatures; snippets; scheduled sending; draft approval; attachment filing; messages to work items; calendar/availability; Teams/Slack connectors. Campaign-specific visual email builder, brand templates, lists/tags/segments, forms/landing pages, welcome/nurture sequences, triggers, tests, delivery/click/conversion/unsubscribe reporting, suppression lists, consent evidence, domain authentication and bounce processing. Business number rental/porting, two-way SMS/MMS, in-app calls, forwarding, business hours, voicemail, missed-call workflows, recording/transcription where supported, number ownership/port-out and client-level usage metering. Provider/country/permission dependencies apply; the current Outlook inbox is not a bulk campaign service.

### Marketing, GBP and websites

Campaign boards; content pillars/audiences; brand voice; reusable post/carousel/video templates; platform previews; repurposing; approvals; supported publishing; retry controls; rights/credits/expiry; asset libraries; hashtags/CTAs; UTM attribution; newsletters; social/ad reporting; creative connectors. GBP authorised accounts/locations, reviews inbox, reply drafts and available performance reporting first; posts/media/profile edits afterwards. Google API approval and separate authorisation are prerequisites. Multi-site GA4/Search Console; scheduled audits; broken links/redirects; uptime; SSL/domain expiry; speed/Core Web Vitals; indexing/sitemaps; landing pages/conversions; content optimisation; structured data; accessibility; local SEO; annotations; sourced comparisons; transparent SEO/AEO methodology and AI-search visibility where measurable.

### Knowledge, meetings and AI

Document revisions/comparison; OCR; full-text search; wiki; SOPs; policy owners/review cycles/acknowledgements; briefs/PRDs; decisions; brand packs; handover generation; source-linked answers. Agendas; calendar links; recordings/transcription; imported audio; speaker identification where supported; summaries/decisions/actions; owner/date suggestions for review; transcript search; voice capture and visible command previews. Scoped chats; memory review/history; prompt/workflow libraries; specialised roles; visible plans; change previews; permissions; run recovery; supported model/usage reporting; authorised connected search; proactive suggestions and appropriate approvals.

### Automation, reporting and next actions

Visual triggers/actions; conditions/branches; record/date/connector events; workflow templates; dry runs; approvals; retries/idempotency; execution history; daily/weekly briefs; monthly client reports; sales/delivery/finance reporting; custom reports; schedules; targets/trends. Cross-module next actions grounded in source records.

### Mobile, collaboration and commercial operations

One-handed capture; camera uploads/scanning; share sheet; Home Screen installation; mobile boards/forms/chat; sync recovery/status; future secure offline capture; optional supported push; access lock. Client approval portal; questionnaires/uploads; feedback; status pages; contractor access; support requests; satisfaction surveys. Invitations/roles/permissions; audit; migration/import; API/webhooks; integration framework; accessibility; time zones/currencies/localisation; data ownership/export/deletion/retention; regional hosting decisions; support/help/diagnostics; adoption/feedback; monitoring; failed-job recovery; sync conflicts; safe updates/rollback; startup and power controls; encrypted backups and restore drills.

### White-label and commercial foundations

Brand tokens/assets/business details; branded documents/email; module/navigation configuration; agency templates/terminology/fields; repeatable installation; owned data/credentials/memory; portable configuration; migrations/update channels; diagnostics; licensing/entitlements/billing. Separate installations first. Hosted tenant isolation, hosted authentication/roles, client portals and reseller operations require explicit design and verification before launch.

## Commercial model — agreed direction, not launched billing

Platform subscription + monthly phone-number rental + separately metered communications usage + optional paid services/setup. Show rates, usage, spending caps, low-balance alerts and optional reseller markup. Own-brand installations and rights to resell are different commercial products. Pricing hypotheses are unvalidated. Do not promise unlimited communications or bundle unsupported redistribution of ChatGPT/Codex subscription access.

## Boundaries and dependencies

- No public hosting, Funnel, tenant sharing or client portal deployment is authorised by this blueprint.
- Commercial AI access, telephony, sending providers, legal/compliance policies and vendor access require separate verification before implementation/release.
- Reliable incoming communications and campaigns need an always-on backend; do not imply laptop sleep-dependent service is a commercial availability solution.
- Do not send, publish, buy numbers, deploy production or change account permissions merely to populate a feature.
- Unknown dates, costs, deployment status and measured outcomes remain unknown until supported by records or evidence.

## Product success measures

Measure observed completion time for one client/project journey, repeated entry avoided, missed follow-ups, blocked work, setup/support effort, successful recovery and returning agency usage. Establish a baseline before setting numeric targets. Feature count alone is not success.

## Immediate implementation scope

Phase 1 redesign of Today, client workspace and project workspace; then shared work items and enforceable software delivery foundations. See the roadmap and engineering standard. This document is a draft specification, not evidence that the proposed process is already enforced by the app.
