# VareonHQ — implementation handover and detailed work programme

Updated: 23 October 2026, Australia/Brisbane.
Owner: CJ Perry. This is the continuation entry point for Claude or Codex.

## 1. Read this first

The user wants a connected agency platform: operations, clients, sales, marketing, documents, software delivery and AI working on the same records. Future commercial/white-label ambition does not authorise exposing this private installation or claiming every planned feature exists.

Continue implementation, not another long brainstorming cycle. Deliver bounded, usable increments. Keep progress updates concise and frequent. Preserve other agents' work. The owner confirmed Claude had finished editing before Codex resumed this batch. If files start changing during your turn, establish ownership before editing shared files.

Read AGENTS.md, PRODUCT-ROADMAP.md, docs/product/PRODUCT-BLUEPRINT.md and docs/product/AGENCY-ENGINEERING-STANDARD.md. CLAUDE.md currently points to AGENTS.md. The blueprint contains the full feature inventory; this document turns it into ordered implementation packages.

## 2. Exact paths and runtime

Source root:
`/Users/cjperry/.codex/.chatgpt-projects/g-p-6aa9dcaa9b3481918a2df3104a3a2105/vareonhq-app`

Parent `sources/` is synced, read-only reference material. Never modify it.

Installed app: `/Users/cjperry/Desktop/VareonHQ.app`
Second existing copy: `/Users/cjperry/Desktop/untitled folder/VareonHQ.app`
Build output: `desktop-dist/mac-arm64/VareonHQ.app`
Live business data: `/Users/cjperry/Library/Application Support/VareonHQ/business-data/`
Database: `vareonhq.sqlite` inside that live directory.

Do not replace live data with source `data/`. Do not seed test content into live data. Use a fresh temporary directory for QA.

Permanent private preview:
`https://catlins-macbook-air.tail9bef0e.ts.net/`
Tailscale Serve proxies `http://127.0.0.1:4320`. Server must remain bound to loopback. Preserve owner identity, session, Origin and mutation-header checks in private-access/server code. Never enable Funnel or public hosting. Every installed update must work through this same URL.

Node 24: `/Users/cjperry/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`
For npm/build PATH also include `/Users/cjperry/.nvm/versions/node/v20.20.2/bin`.

Stack: vanilla JavaScript browser modules, Express, SQLite, Electron desktop wrapper; not React. package.json still says 0.8.0, so version alone cannot distinguish the recent builds.

## 3. Current state — do not confuse source with installed build

### Confirmed installed before this batch

- Grouped navigation: Today and Inbox shortcuts; Clients & sales, Work, Marketing, Business groups.
- Shared charcoal/lime foundation, compact Today cards and quick-add actions.
- Project detail workspace opened by clicking a project name: Overview, Plan, Board, Documents, Time, Delivery.
- Project-linked tasks, notes, documents/contracts, time and technology resources; creation forms preselect the project.
- Raised charcoal cards and inset tabs: the first dark neumorphic treatment.
- Desktop and narrow mobile browser views checked. Physical iPhone Safari testing remains outstanding.

### Claude's changes found and preserved

- server/claude-engine.mjs: local Claude Code CLI adapter, sign-in/out, model selection, streaming, session continuation and reported plan usage.
- server/assistant.mjs, server/server.mjs, server/conversations.mjs, server/scheduler.mjs and server/mcp-stdio.mjs: engine integration.
- public/app.js, public/assistant-models.js, public/services.js: connections, engine/model picker and usage widgets.
- tests/claude-engine.test.mjs: four focused tests pass.
- The running desktop was observed with Claude usage in the top bar. Do not replace this with an older source snapshot.
- Live account authentication is owned by the user. Mock tests do not prove a live reply works.

### Codex PRD/ticket batch: implemented, tested and INSTALLED (verified 23 Oct 2026 evening)

Files edited: server/domain.mjs, public/app.js, public/workspace.js, public/library.js.
New test: tests/tickets.test.mjs.

Implemented:
- PRD category on existing document records. A PRD requires a project.
- Project Plan tab lists linked PRDs and offers New PRD with a draft/version 1.0 starter outline.
- Outline: problem/goals, users, scope, exclusions, requirement references, acceptance criteria, risks and implementation plan.
- Task fields: type, prdId, requirement, acceptanceCriteria, parentTaskId, dependencyIds.
- Types: Task, Epic, Feature, Story, Bug, Spike, Technical debt.
- Server-issued stable ticketKey on first save, currently T- plus eight random hexadecimal characters. Old untouched tasks have no new key until saved. This is not a sequential project ticket number.
- Board cards show the key and type when present.
- PRD and ticket selectors limited to the current project at editor opening.
- Server rejects missing/cross-project links, circular parent/dependency graphs, moving referenced records between projects, and deletion of referenced PRDs/tasks.
- Existing generic assistant record tools inherit the expanded schemas. A dedicated autonomous delivery workflow is NOT implemented.

Limitations to address next:
- PRD is an ordinary document with editable version metadata and existing record history, not immutable published revisions.
- Requirement reference is text, not a separately validated requirement entity.
- Dependencies are recorded and checked for integrity, but do not yet enforce status transitions.
- Parent links exist; there is no nested child-ticket UI yet.
- Ticket edit form still uses the generic long form. Project changes require saving and reopening to refresh relationship choices. Improve this before calling the editor polished.
- Eight-character random identifiers need an explicit uniqueness guarantee or transactional sequence strategy before commercial use.
- Delivery tab still describes PRD-linked automated checks/release gates as future; update wording to distinguish newly available PRD links from remaining gates.
- Project detail selection is in-memory; refresh returns to the project board. Add durable project/tab routes.
- Existing schema defaults preserve old records on save; no bulk migration has been run.

Validation completed for combined source:
- Syntax checks passed.
- Typecheck passed.
- Full suite: 84 tests, 83 passed, one optional native Keychain test skipped, zero failures.
- Browser QA in isolated data: created PRD; created Story linked to that PRD with REQ-001 and acceptance criteria; saved card showed its key/type; reopened editor retained all values.
- Package build completed successfully with the combined Claude and ticket source.
- Logs: `/private/tmp/vareon-ticket-tests.log`, `/private/tmp/vareon-ticket-build.log`.
- Installed: both desktop copies and desktop-dist were compared with source (`public/` and `server/` identical) after the later client-workspace redesign. The permanent Tailscale URL serves the same operations.js and foundation.css as source, the server listens on 127.0.0.1:4320 only, and unauthenticated API access returns 403. Re-compare timestamps/diffs before installing again.

### Client workspace redesign: implemented, tested and INSTALLED
- Files: public/operations.js, public/operations-data.js, public/foundation.css, tests/operations.test.mjs. Codex session ran out of usage after install and before updating this file.
- Compact contact header, quick actions, clickable summary cards, relationship timeline (saved emails, meeting notes, client notes only for the selected client), and a dedicated Documents tab with a client-preselected form. Deep routes like `#client/<id>/documents`.
- Checked in an isolated data directory at desktop and narrow mobile widths: client isolation, document save appears under the client. Full suite 84 tests, 83 pass, 1 optional Keychain skip.
- Not done: Today redesign beyond quick-add, project workspace refinement, shared component/token pass, physical iPhone Safari testing, timeline entries for contracts/finance/projects.

## 4. Immediate continuation checklist

1. Read this handover and inspect current files for changes after it was written. Do not assume Git provides a clean baseline: most app code is untracked in the original repository. Avoid git reset/clean/stash operations that could lose work.
2. Finish the narrow PRD/ticket quality gaps: improve relationship selectors on project changes; show ticket key in editor; show parent/dependency and PRD summary on cards/details; correct Delivery copy; add deep project/tab navigation.
3. Add uniqueness protection for ticket keys and tests; decide whether to retain random keys or introduce stable per-project sequences without renumbering existing keys.
4. Verify create/edit PRD → create linked ticket → parent/dependency → move card → reload/reopen. Include invalid link/cycle/deletion cases and project isolation.
5. Preserve Claude engine UI and run its tests alongside ticket tests. Avoid unexpected real AI calls or sign-in changes during QA.
6. Run meaningful checks, rebuild if source changed, close the owned desktop app, update both existing copies, reopen canonical Desktop/VareonHQ.app.
7. Verify the permanent Tailscale URL, authenticated project records, loopback listener, and rejection of unauthenticated API access.
8. Record exact completion and limits here and in the project backlog. Then start package B below.

The owner's request for a handover interrupted deployment; do not say the PRD/ticket batch is already live without verifying it.

## 5. Ordered implementation packages

### A. Complete the manual PRD and ticket foundation — current priority

Deliver:
- PRD editor with meaningful sections, requirement references and linked tickets.
- Ticket details with stable ID, type, description, acceptance criteria, priority, estimate, project, parent and dependencies.
- Search/filter by ticket ID, type, priority and status; show relationship counts and unresolved dependencies.
- Child-ticket view, checklist, comments and attachments linked to existing storage.
- Clear persisted project/tab routes; back navigation and mobile detail view.
- Project-scoped selectors update immediately when project changes; invalid links explained before save.
- Existing task data retained; document schema changes and rollback assumptions.
Acceptance: manual PRD-to-ticket journey persists across reload, no cross-project leakage/cycles, no accidental deletion of linked work, works without an AI connection.
Dependencies: current source batch above.

### B. Versioned requirements and agency engineering standard

Deliver:
- Structured requirement records with stable IDs and acceptance criteria.
- Draft/reviewed PRD revisions; preserve the revision a ticket was planned against.
- Change comparison, amendment reason and impacted-ticket list when requirements change.
- Project standard version, approved exceptions, repository conventions and definition of done.
- Distinguish proposed AI changes from owner-approved requirements/standards.
Acceptance: changing a PRD cannot silently rewrite previously accepted scope; tickets and evidence link to a known revision; manual approval remains available.
Dependencies: A.

### C. Evidence and server-enforced workflow

Deliver:
- Software-specific statuses: Backlog → Ready → In progress → In review → QA / staging → Ready for release → Done; Blocked/Cancelled with reasons.
- Keep ordinary agency tasks compatible; do not blindly replace existing statuses globally.
- Transition policy enforced at server boundary for UI, API and assistant tools.
- Ready: clear scope/criteria and dependency decision. In progress: implementation plan/workspace context.
- In review: reviewable diff/reference, test results and acceptance mapping.
- QA/release: actual environment/evidence and required human review.
- Done: verified deliverable/release evidence, documentation, no outstanding acceptance blocker.
- Evidence records include result, timestamp, revision, source/check and limitations; failed checks remain failed.
Acceptance: direct API/AI calls cannot bypass gates; meaningful negative tests; no deployment invented for non-deployed deliverables.
Dependencies: A/B.

### D. Repository, environment and release workspace

Deliver:
- Connect authorised repositories; select repository/branch/ref per software project.
- Link tickets to branches, commits and pull requests; retain reviewer/check status with source and update time.
- Local/preview/staging/production records: provider IDs, URL, owner, actual deployed commit, health and verified-at evidence.
- Embedded live preview with appropriate sandbox/origin handling; clear loading/error states.
- Release records with included tickets, changelog, migrations, approval, checks, rollback reference and post-deploy verification.
- Explicit boundaries between creating a record, provisioning infrastructure and actually deploying.
Acceptance: reported deployment state matches provider evidence; failed deployment cannot complete a release; production action follows owner authorisation.
Dependencies: C and provider credentials/access. No public deployment of this dashboard implied.

### E. Codex/Claude/GPT delivery orchestration

Deliver:
- Read scoped project brief, PRD revision, standard, repository instructions and current code.
- Generate a reviewable implementation plan, epics/tickets and dependency order.
- Start only eligible work, update status visibly and record blockers.
- Implement through supported coding-engine capabilities; show progress and live preview.
- Attach checks, acceptance evidence, review references and documentation.
- Resume interrupted runs without duplicate tickets or replaying external actions.
- Dedicated scoped tools; engine parity where supported; server gates remain authoritative.
- Show plan/model/context and usage honestly. Do not silently switch to paid API billing.
Acceptance: one real scoped feature completes the approved journey with visible records; manual equivalent works when AI is unavailable; AI cannot approve its own protected action.
Dependencies: B/C/D. This is the requested agency-standard coding workflow, not a prompt-only feature.

### F. Finish the connected user experience

Deliver:
- Complete Today: priorities, recent work, approvals, upcoming deadlines and explained next actions.
- Redesign client workspace: relationship timeline, linked emails/meetings/projects/contracts/docs/finance/reporting.
- Refine project workspace: notes/discussion, requirements, board, time/costs and delivery in a coherent layout.
- Shared components/tokens for cards, buttons, inputs, menus, tables, dialogs and empty/error/loading states.
- Saved views, favourites, quick-add, command search, bulk actions and keyboard focus.
- iPhone: compact navigation, scrollable tabs/boards, full-screen details/chat, touch targets, safe areas and keyboard handling.
Acceptance: one enquiry/client/project journey works on desktop and phone without duplicate entry or page overflow. Physical Safari verification, not only narrow browser screenshots.
Dependencies: can proceed incrementally alongside A–E, avoiding shared-file collisions.

### G. Agency sales and delivery lifecycle

Deliver:
- Multiple client contacts and decision-makers; prospect attribution, source evidence, deduplication and next actions.
- Service catalogue/packages/deliverables; proposal/quote revisions and scopes.
- Contract/signature integration, clause/templates, variations and scope-change tracking.
- Deposit/agreement readiness tied to real records; onboarding templates produce linked work.
- Milestones, deliverables, approvals, risk/issue registers and launch checklists.
- Staff/contractor skills/capacity, allocation and workload.
- Asset ownership register and handover packs for domains/repos/hosting/licences.
- Offboarding, warranty, support requests and maintenance/retainer links.
Acceptance: enquiry → scope → agreement → onboarding → delivery → invoice/handover → support with shared client/project IDs. Never infer payment/signature from a draft or status label.
Dependencies: core work model; signing/payment provider access where needed.

### H. Finance, time and commercial reporting

Deliver:
- Retainer allowances, rollover, overages and unbilled work.
- Time estimates versus actuals, billable categories, internal role rates, utilisation and approvals.
- Time-to-invoice drafts; invoice numbering/line items/deposits/schedules/credits/recurrence.
- Receipts/OCR, suppliers/contractors, purchase orders and accounting exports/integrations.
- Payment reconciliation with source provenance; overdue reminders remain reviewable.
- Client/project/service margins, effective rates, recurring revenue, concentration and cash scenarios.
Acceptance: no double-counted labour/payment, correct partial payments/credits/rounding, recorded revenue distinct from cash and estimates.
Dependencies: preserve and extend existing finance/time modules.

### I. Marketing, Google Business Profile and website intelligence

Deliver:
- GBP OAuth/API approval, authorised locations, review inbox, reply drafts and performance reports first.
- Later supported GBP posts/media/profile edits with previews and approval.
- Campaigns/content pillars/brand voice/templates/repurposing; social previews and approval flow.
- Authorised Instagram/LinkedIn/X publishing where provider access permits; actual status, retries and duplicate protection.
- Media rights/credits/expiry, creative MCP connectors such as Higgsfield, source-linked assets.
- Multi-client GA4/Search Console; scheduled site audits, uptime, SSL/domain expiry, redirects/broken links, indexing, speed and accessibility.
- Transparent SEO/AEO rubric, dated sources and limitations; do not present checklist score as measured AI visibility.
Acceptance: real authorised data labelled with freshness; public posting only with required authorisation; no simulated success.
Dependencies: provider approvals/account scope. Existing VareonHQ Google connection does not grant all GBP APIs.

### J. Knowledge, meetings and assistant quality

Deliver:
- Document revisions/diffs, OCR/full-text search, wiki/SOPs, policy owners/reviews and acknowledgements.
- Decisions/brand packs and source-linked answers; memory review and revision history.
- Calendar-linked agendas, reliable recording/imported-audio transcription, summaries and reviewed action extraction.
- Voice capture on supported devices; clear microphone/data/provider controls.
- Scoped chat context includes actual selected project/client/ticket; files/folders, visible editor actions and recoverable runs.
- Prompt/workflow libraries, model usage explanations, traceable citations and clean rendered responses.
Acceptance: source documents are treated as data, not authority; no unsupported recording/transcription claims; no silent cross-project context mixing.
Dependencies: existing document/meeting/chat modules; provider choice for transcription.

### K. Automation and cross-module next actions

Deliver:
- Visual triggers/actions/conditions, reusable workflow templates and dry-run previews.
- Record/date/connector events, approval steps, retries, idempotency and execution history.
- Explainable next actions: missing agreement/deposit, stale follow-up, blocked requirement, exhausted retainer, failed sync/build.
- Daily/weekly owner brief and scheduled client reports with actual source data.
- Recovery for restarts/offline periods; do not replay already-completed sends or deployments.
Acceptance: dry run cannot create external side effects, retries do not duplicate work, failures are visible and actionable.
Dependencies: existing scheduler/reporting plus reliable event model.

### L. Email campaigns, business numbers, SMS and calling

Deliver in order:
1. Consent/preferences/suppression evidence and contact segmentation.
2. Sending-domain/provider configuration, branded email builder/templates and test previews.
3. Campaigns/sequences/forms, unsubscribe/bounce processing and delivery/click/conversion reporting.
4. Business number rental/porting; two-way SMS/MMS; inbox association with client/project.
5. Calling/forwarding/business hours/voicemail/missed-call workflows; optional supported recording/transcription.
6. Metering, rate display, monthly number rental, usage charges, caps/alerts and reseller markup controls.
Acceptance: suppression applies across sends, billing reconciles to provider events, number ownership/port-out supported, retries safe.
Dependencies: chosen providers/country access/verified compliance and always-on infrastructure. Do not use Outlook as a bulk campaign sender or purchase numbers merely to test a UI.
Commercial direction: platform subscription + extra monthly number rental + metered communications, not unlimited bundled phone usage.

### M. Reliability and release discipline

Deliver:
- Reproducible builds/version identifiers and a clear source-to-installed mapping.
- Backup/restore drills, encrypted export/import verification and documented recovery.
- Schema migration checks, update rollback and preservation of Keychain/data.
- Sync health/conflicts, job diagnostics, log redaction, performance/accessibility checks.
- Safe startup/power controls; explicit limits of Mac sleep/offline availability.
Acceptance: recovery tested with isolated copies, no credential leakage, no obsolete app copy silently serving stale code, permanent private URL verified each release.
Dependencies: ongoing across every package, not postponed until launch.

### N. White-label pilot foundations

Deliver:
- Configurable logo/brand tokens/business details/documents/email, optional modules and terminology.
- Agency templates, repeatable setup/import, portable configuration and separate credentials/data/memory.
- Supported commercial AI access model verified against provider terms; no assumed resale of personal ChatGPT/Claude subscriptions.
- Roles/permissions/audit, licensing/entitlements, support/diagnostics/help and update channels.
- Paid pilots with measured onboarding time, support load, repeat usage and time saved.
Acceptance: second independently owned installation provisions without source forks or shared customer secrets. Pricing remains a hypothesis until validated.
Dependencies: stable delivery product and provider/legal decisions.

### O. Hosted collaboration and scale — later, separately authorised

Deliver:
- Tenant isolation, hosted auth/invitations/roles, always-on jobs/inbound webhooks.
- Client/contractor portals for approvals/uploads/status/support.
- Regional storage/retention/export/deletion, monitoring and incident recovery.
- Subscription billing/reseller administration, public integration API/webhooks.
- Secure mobile offline capture/push/share-sheet features where supported.
Acceptance: isolation/security/recovery/billing tests, defined support/reliability obligations, independent explicit hosting authorisation. Never turn the current Mac dashboard public as a shortcut.

## 6. Design contract

- Dark neutral charcoal, official VareonHQ logo and lime #C6F432.
- User explicitly likes neumorphism: restrained raised surfaces, inset inputs/tab wells, tactile states, subtle glow. Preserve visible boundaries and accessible text contrast.
- No purple, sage, olive or cream. Do not import the reference collage's colours wholesale.
- Shared spacing/radius/type scale; no unnecessary body scrolling; menus compact; dropdown chevrons balanced with padding.
- Assistant collapsible/resizable, clear input separation; input font/radius consistent with dashboard.
- Inbox remains split list/reading view with search/filter/sort and responsive phone navigation.
- No decorative mock financial metrics, fake deployment badges or pretend integrations.

## 7. Code map

- public/app.js: shell/nav, generic forms, state refresh, assistant UI. Large/shared; inspect before edits.
- public/workspace.js: project detail, boards, notes, memory and visible editor behaviour.
- public/foundation.css: latest foundation/project neumorphic additions.
- public/operations.js and operations-data.js: Today/client/reviews.
- public/library.js: document list/upload enhancement.
- public/business-operations.js: onboarding, renewals, time, meetings, backups.
- server/domain.mjs: schemas and save/delete integrity checks, latest tickets/PRDs.
- server/store.mjs: SQLite records, versions/history and transactions.
- server/actions.mjs: shared assistant actions derived from schemas.
- server/assistant.mjs and claude-engine.mjs: engine runs/streaming.
- server/server.mjs: owner API/session checks and integration routes.
- server/private-access.mjs: private Tailscale checks; preserve.
- desktop/main.cjs: app lifecycle, localhost4320, bundled backend startup.
- desktop/prepare.mjs and package.json: build/bundling.
- tests/tickets.test.mjs: latest relationship tests; claude-engine.test.mjs: Claude adapter tests.

## 8. Backlog and documentation records

Existing project: VareonHQ platform evolution, ID `a0837caa-583f-41c1-be22-7774eccb3f86`.
Existing tasks VHQ-001 through VHQ-012 describe the first foundation/delivery work. Their prefixes are titles, not the new ticketKey mechanism. Read actual current statuses before changing them; do not mark entire phases complete from one screen.

Existing library folder: `VareonHQ / Product strategy`, containing blueprint, phased roadmap and engineering standard, version 1.0 draft.

Maintain this handover after each completed increment: source changes, installed status, checks, user-visible result, remaining limitations and exact next action. Keep broader inventory in PRODUCT-BLUEPRINT.md; do not repeatedly rebuild the same list from memory.

## Progress log — 23 Oct 2026 (late)

### Neumorphic redesign: INSTALLED
- New `public/neumorphism.css`, loaded last in index.html: one charcoal surface, raised/inset shadow tokens, lime only for the active or primary item, Avenir Next, denser spacing, ops-grid no longer stretches cards. Assistant panel now defaults to collapsed below 1280px wide.
- Reviewed on Today, client workspace, project board, edit dialog and phone Projects only. Other pages inherit shared styling but are unreviewed. Project board overflows sideways when the assistant is open.

### Package A progress: INSTALLED (both desktop copies, private URL verified)
- Ticket keys: new keys are checked against every saved ticket before issue; a save cannot overwrite an issued key; deleted keys are not reused. Test added (86 tests, 85 pass, 1 optional skip).
- Task editor: title shows the ticket key; PRD, parent and dependency selectors refresh when the project changes (selections restore if you return to the original project); helper text corrected.
- Board cards show PRD, requirement, parent key, "Waiting on N" for unfinished dependencies and child-ticket counts.
- Delivery tab copy corrected (PRD links exist via the Plan tab; checks/release gates not built).
- Durable routes: `#project/<id>/<tab>` restores the project and tab after reload (replaceState, no back-button history).
- Browser-verified in isolated data: unique keys, cycle / cross-project / delete-referenced rejections, reload restores Board tab, editor relinking.

### Still open in package A
Search/filter by ticket ID, type, priority, status; relationship counts and unresolved-dependency view beyond card chips; child-ticket view and checklist; comments and attachments on tickets; mobile ticket detail; nested-parent UI; status transitions still unenforced (package C). Then package B.

### Package A, second batch: INSTALLED (private URL verified)
- Project Board tab: ticket search (ID, title, requirement, criteria, notes), Type / Priority / Status filters, "Waiting on dependencies" toggle, "N of M tickets" count and Clear filters. Filter state is in memory only (not in the URL).
- Ticket editor: Child tickets section with done/total progress, a checkbox per child that sets Done / To do, links that open the child, and Add child ticket (parent, project, PRD and client preset).
- Browser-verified in isolated data: each filter, ID search, focus kept while typing, empty state, child progress update, add-child presets.
- Still open in A: comments and attachments on tickets, mobile ticket detail, nested-parent tree view, filters in the URL/saved views, filters on the global To do page. Next: package B.

### Package A, third batch — ticket comments and files: INSTALLED (private URL verified)
- Storage: new `ticketComments` collection in the existing SQLite records table (tracked in action history); ticket files reuse the existing chat-files store (same upload path as document library files) via a new `attachmentIds` array on tasks.
- Rules (server, tests added — 88 tests, 87 pass, 1 optional skip): comment author is set by the server from the actor and cannot be supplied; only the author can reword a comment (undo/restore excepted); only the author or the owner can delete; a comment cannot move to another ticket; comments are removed when their ticket is deleted; attachment IDs must reference stored files and are de-duplicated.
- Assistant tools gain `save_ticketComments` automatically from the schema, so GPT/Claude/Codex can comment as themselves.
- UI: ticket editor has Files (upload several, download, unlink) and Comments (post, ⌘↩, delete with confirm) sections that save immediately, separately from the form; board cards show file and comment counts. New tickets show "save first" instead.
- Browser-verified in isolated data: post, ⌘↩ post, delete, upload two files, download content, unlink, and that saving the ticket form keeps attachments. Unauthenticated file download on the private URL returns 403.
- Known limits: no comment editing in the UI (server supports it); unlinked files stay in local storage; assistant `save_tasks` applies schema defaults, so an AI update that omits attachmentIds/dependencyIds can clear them (pre-existing behaviour for all task fields; fix before package E).
- Still open in A: mobile ticket detail, nested-parent tree view, saved/URL filters, filters on the To do page. Next: package B.

### Assistant update bug fixed: INSTALLED
- Cause: every `save_<collection>` assistant tool validated `record` with the full schema, so zod filled omitted fields with defaults ('' / [] / first enum) before the merge with the saved record. AI updates silently reset untouched fields, including attachmentIds and dependencyIds. Affected GPT (actions.execute) and Claude/Codex (MCP SDK validates the same schema).
- Fix: `patchSchema()` in server/actions.mjs builds a tool-boundary schema with every field optional and no defaults. saveRecord still validates the merged record with the full schema, so creates keep defaults and required fields, and bad values are still rejected.
- Tests: tests/assistant-patch.test.mjs covers the GPT path, creates, descriptors without defaults, and a real MCP stdio round-trip. 92 tests, 91 pass, 1 optional skip.

### Package A finished: INSTALLED (private URL verified)
- Filters in the URL: `#project/<id>/board?type=Bug&view=tree`, `#todo?priority=High&project=<id>`. Reload or a shared link restores them. Filters are scoped per board (each project, and To do) and reset when you move between boards.
- Saved views: new `savedViews` collection (name, scope, projectId — empty for To do — and filter). Synced through the database, so views work on the Mac and phone. Server validates the filter and project; a project's views are deleted with the project. Test added.
- To do page now uses the same ticket bar across all projects, with an extra Project filter (replaces the old generic search toolbar there).
- Tree view (Board | Tree toggle): nested parent/child hierarchy, done/total per parent, "Waiting" flags, done tickets struck through. When filters are active, unmatched parents are shown dimmed for context.
- Phone: every record editor (tickets included) opens as a full-screen sheet with a sticky header and save bar, 16px inputs (no iOS zoom), safe-area padding. Overrides mobile-library.css's `!important` overlay padding.
- Verified in isolated data: URL restore of type/view, clear, save/apply/delete view, board/tree switch, To do cross-project filter and restore, phone sheet edge-to-edge with no sideways scroll. 93 tests, 92 pass, 1 optional skip.
- Not covered: physical iPhone Safari check; tree has no collapse/expand; saved views are not renameable (delete and save again). Next: package B.

### Package B, first batch — versioned requirements: INSTALLED (private URL verified)
- New `requirements` collection: per-PRD stable codes (REQ-001…, server-issued from a per-PRD counter, never reused, cannot be supplied), title, statement, acceptance criteria, priority (Must/Should/Could/Won’t), Active/Retired, `lastEditedBy` set from the actor. Cannot move between PRDs.
- New `prdRevisions` records: immutable snapshots of a PRD's overview text and requirements. Created only by `POST /api/prds/:id/revisions` → `approvePrdRevision()` (owner only; no schema, no generic route, no assistant tool). First approval needs ≥1 requirement; later ones need a change and a reason. Approving sets the PRD version to `<n>.0`.
- Integrity: a requirement in any approved revision can only be retired, not deleted; tickets must be unlinked first; a PRD with requirements or revisions cannot be deleted, recategorised or moved.
- Tickets: `requirementIds` (must belong to the linked PRD) and `plannedRevisionId` (set to the latest approved revision when the PRD is linked; ordinary edits never change it; only re-planning to the latest approved revision is accepted).
- Shared `public/requirements.js`: scope snapshot, diff (added/removed/changed fields, overview text), impacted tickets (planned on an older revision whose linked requirements changed, or the overview changed).
- UI: Plan tab shows each PRD with its requirements, unapproved-change markers ("Proposed by Claude" when an assistant edited it), Review changes, Approve revision N (reason prompt), revision history with Compare, and the impacted-ticket list with Re-plan. Ticket editor: Requirements picker (refreshes on PRD change) and a Planned scope section with Compare / Re-plan. Cards show requirement codes and "PRD changed since plan".
- Assistant instructions say assistants may draft requirements but only the owner approves revisions.
- Tests: tests/requirements.test.mjs (codes, approval rules, owner-only, immutability, impact, re-plan rules). 97 tests, 96 pass, 1 optional skip. Browser-verified the full journey in isolated data.
- Still open in B: project engineering standard (version, definition of done, repository conventions, approved exceptions); requirement-level evidence links come with package C.

### Package B finished — project engineering standard: INSTALLED (private URL verified)
- `projectStandards`: one draft per project (based-on version, definition of done, repository conventions, review/approval policy, notes; `lastEditedBy` from actor). "Start from agency standard" prefills from `agencyStandard` in public/requirements.js, distilled from docs/product/AGENCY-ENGINEERING-STANDARD.md.
- `standardRevisions`: immutable, owner-only via `POST /api/projects/:id/standard/revisions` → `approveStandardRevision()`. First approval needs a definition of done; later ones need a change and a reason. No schema, generic route or assistant tool can create or edit them.
- `standardExceptions`: anyone may propose (assistant-created ones are forced to Proposed, `proposedBy` recorded). Only the owner approves or rejects; approval records the standard revision in force. Decided exceptions are frozen; approved ones can only be withdrawn by the owner; proposers can withdraw their own proposals. Expiry shown as Expired after `expiresOn`.
- Tickets: `standardRevisionId` follows the same rule as `plannedRevisionId` (set to the latest approved revision on project link; ordinary edits keep it; only "Follow revision N" to the latest is accepted).
- Projects with a standard, revisions or exceptions cannot be deleted (linked records).
- UI (project Delivery tab): standard sections with Unapproved markers, Edit draft, Review changes, Approve revision N (reason prompt), history with Compare, count of open tickets on an older revision; Approved exceptions panel with Propose / Approve / Reject / Withdraw. Ticket editor shows the standard revision followed, with Compare and Follow revision N.
- Assistant instructions updated. Tests: tests/standards.test.mjs. 101 tests, 100 pass, 1 optional skip. Browser-verified the full journey in isolated data.
- Package B acceptance: changing a PRD or standard cannot rewrite accepted scope (approved revisions are immutable); tickets link to the PRD and standard revisions they were planned under; approval is manual and owner-only; AI edits are shown as proposals. Evidence links to revisions arrive with package C.
- Next: package C (evidence and server-enforced workflow).

### Package C — evidence and server-enforced workflow: INSTALLED (private URL verified)
- Projects gain `workflow` (Simple default | Software). Simple projects keep Backlog / To do / In progress / In review / Blocked / Done (+ Cancelled). Software projects use Backlog → Ready → In progress → In review → QA / staging → Ready for release → Done, plus Blocked and Cancelled. Switching to Software converts To do → Backlog and keeps history; switching back is refused while tickets sit in software-only statuses.
- Shared `public/workflow.js` (`gateProblems`) is enforced in `saveRecord`, so the dashboard, the API, `move_card`, `save_tasks` and MCP tools all hit the same gates. Forward moves must pass every gate on the way; moving back is free; leaving Blocked/Cancelled re-checks all gates; Blocked/Cancelled need written reasons. Gates: Ready = acceptance criteria (+ linked requirement for Epic/Feature/Story); In progress = implementation plan + dependencies Done; In review = a Change record + at least one check; QA / staging = latest review is an owner approval; Ready for release = passing acceptance covering every linked requirement; Done = owner-verified release/deliverable. Failing checks (latest result per check name) block any move to In review or later.
- `ticketEvidence` (Change, Check, Review, Acceptance, Environment, Release, Documentation; Passed/Failed/Info; reference; environment; requirement coverage): permanent (no edit/delete), server-set recordedBy/recordedAt/sequence and the ticket status, planned PRD revision and standard revision in force. Only the owner can record a passing Review or Release. Tickets with evidence cannot be deleted (cancel instead).
- Tasks gain implementationPlan, blockedReason, cancelReason. Cancelled counts as closed in planning, client views and project counts.
- UI: per-project board lanes and stage menus; the ticket editor's status list follows the project's workflow; software tickets get a Workflow and evidence section (step bar, what the next gate still needs or "Move to …", permanent evidence log, Record evidence form). Child checkboxes are disabled for software tickets. Refused moves show the gate message.
- Assistant instructions cover recording real evidence and reporting refusals.
- Tests: tests/workflow.test.mjs (full journey, skipping, Blocked/Cancelled, requirement coverage, permanence, assistant and move_card paths, workflow switching). 108 tests, 107 pass, 1 optional skip. Browser-verified the full journey including a failing then passing check.
- Not yet: approved standard exceptions do not waive gates; evidence is entered by hand (repository/CI/deployment links are package D); no bulk "re-check" of tickets that were already past a gate before a project switched to Software.
- Next: package D (repository, environment and release workspace).

### Package D — repository, environment and release workspace: INSTALLED (private URL verified)
- `server/github.mjs`: read-only GitHub client (repository/branch verification, pull request with reviews and check runs + commit statuses, branch, commit, latest deployment per environment name) and `checkEnvironment()` (real GET with 15 s timeout: health, HTTP status, embeddability from X-Frame-Options / CSP frame-ancestors). Public repositories work without a token; an optional fine-grained read-only token is stored in Keychain (`github-token`), validated against /user, sent only to api.github.com and never written to records. Connections → "GitHub (read-only)".
- `server/delivery.mjs`: owner-triggered verify / sync / check actions that store results with source and time. `importEvidence` turns a synced link into permanent evidence recorded by "GitHub" (change + every finished check; requested changes as failed reviews; other reviewers' approvals never count as the owner's review; pending checks wait; de-duplicated by source ID). Only the sync can mark evidence as GitHub-sourced.
- New records: `repositories` (verified fields cleared when owner/name/branch change), `ticketLinks` (PR number / branch / commit SHA validated; stale sync cleared when the reference changes), `environments` (Local/Preview/Staging/Production, URL, provider, provider ID, owner, repository + GitHub environment name; health and deployment cleared when their inputs change), `releases`.
- Release rules: new releases start as Draft; only drafts can be edited or deleted; Draft → Approved is owner-only and needs a target environment, tickets, a changelog and (for production) a rollback reference; Approved → Released needs a Healthy check after approval, no failed latest deployment, and when a commit is named a GitHub deployment synced after approval whose SHA matches and whose state is success; production releases are marked released by the owner only; Failed/Rolled back need notes; Failed can never become Released. Tasks in a release and environments targeted by releases cannot be deleted.
- UI (Delivery tab): Releases, Environments (cards with health, deployed commit and its source/time, Check now, Sync deployment, embedded Preview with sandboxed iframe or open-in-tab fallback), Repositories (verify), then the engineering standard, exceptions and unverified Other links. Ticket editor: Code section to link PRs/branches/commits, sync, and add as evidence. "Record release evidence on tickets" lets the owner sign off included tickets.
- Tests: tests/delivery.test.mjs (fake GitHub: verification, private-repo message, PR sync and import, forged-source rejection, health checks, full release rules, failed/mismatched deployments, token handling). 114 tests, 113 pass, 1 optional skip. Live smoke test against public GitHub (octocat/Hello-World, vercel/next.js deployments) and https://example.com. Browser-verified the full journey in isolated data.
- Not yet: GitHub App/OAuth (token only); Vercel/AWS APIs directly (deployments are read via GitHub's deployments API, which Vercel reports to); no automatic background re-sync; releases do not auto-move tickets to Done (owner records release evidence, then moves tickets).
- Next: package E (Codex/Claude/GPT delivery orchestration).

### Package E — AI delivery orchestration: INSTALLED (private URL verified; no live AI run yet)
- `server/delivery-runs.mjs`. `deliveryRuns` and `deliveryPlans` are not generic records (no schema, no generic route, no auto tool).
- Scoped assistant tools (same for GPT in-process and Claude/Codex over MCP): `get_delivery_context` (approved PRD revisions and active requirements, approved standard and unexpired exceptions, repositories, environments, every ticket with evidence and what its next gate needs), `propose_delivery_plan` (validates requirement codes against approved revisions, refs, single-PRD per item, cycles; supersedes earlier proposals; refuses after approval), `start_delivery_ticket` (only this run's Ready tickets, one in progress at a time, normal gates), `submit_delivery_ticket` (→ In review, run waits for the owner), `block_delivery_ticket`, `report_delivery_progress`.
- Owner-only HTTP: start run (software projects only, one active run per project, refuses while the assistant is busy, records engine and model), approve plan (creates tickets in dependency order with parent/dependency/requirement links, tags them with the run, tries Ready; idempotent across repeats/interruptions), reject plan with reason, resume (same conversation, resume prompt reads recorded state first), cancel (stops the run's in-flight turn; keeps tickets/evidence), complete (only when every run ticket is Done or Cancelled).
- Run prompt: plan first and stop; after approval, one ticket at a time; real evidence only; never record passing reviews/releases, claim deployments or mark done; block instead of guessing. Runs use the owner's plan allowance (no API billing).
- UI: Delivery tab "Delivery runs" panel: start form (engine with sign-in note, goal, agreed-scope summary), run cards (status, model, plan tree with requirement codes and dependencies, Approve / Ask for changes, created ticket keys and statuses, run log, Resume / Continue after review / Mark complete / Cancel).
- Tests: tests/delivery-runs.test.mjs (simulated engines: plan before tickets, validation, idempotent approval, one-at-a-time gated work, waiting for review, blocking, resume/cancel, real MCP round-trip). 120 tests, 119 pass, 1 optional skip. Browser-verified approving a simulated proposal creates linked Ready tickets.
- Not yet verified: a real end-to-end run with GPT, Claude or Codex (needs the owner's go-ahead; uses plan allowance). Coding happens in each engine's own workspace with the live preview tools; nothing is pushed to GitHub.
- Next: package F (connected UX), unless the owner wants the live run first.

### Package F, first batch — connected experience: INSTALLED (private URL verified)
- Today: "Needs you" panel at the top, from shared `nextActions()` in public/operations-data.js (also returned by `get_today` for assistants): delivery plans to approve, runs needing attention, tickets awaiting the owner's review, release sign-offs, failing checks, blocked tickets, approved releases to verify, proposed exceptions, assistant-edited requirements, overdue tasks — each with the reason and an Open button straight to the ticket or project tab. Cancelled tasks no longer count as due.
- Client timeline now includes projects, agreements, invoices, payments and documents alongside emails, meetings and notes.
- Favourites: pin projects and clients (star in their headers, `PUT /api/favourites`, up to 12, stored in settings); pinned items show on Today on desktop and phone.
- Bulk ticket actions: Select on any ticket bar → select cards or all shown → move status and/or set priority; each ticket still passes its own gates and refusals are listed with reasons; refused tickets stay selected.
- Phone: swept all 32 pages plus every project and client tab at 375 px with no content outside the viewport; larger touch targets for row checkboxes, record links and text buttons.
- Tests: tests/next-actions.test.mjs. 121 tests, 120 pass, 1 optional skip.
- Still open in F: list → detail drawer instead of modals; Cmd+K actions (not just search); saved views beyond tickets; owner portfolio/health dashboard; physical iPhone Safari check.
- Owner shared research (agency-platform-crm-research.md, Oct 2026) comparing GoHighLevel, Monday, Jira, Linear, HubSpot, Attio, Pipedrive, ClickUp, Notion, Asana. Key asks: per-client workspaces with templates ("snapshots" with versioning and push-updates), deal-won → delivery hand-off, Linear-style speed and Cmd+K, one automation builder, progressive disclosure, rebilling/white-label, owner portfolio dashboards.

## Plan from the owner's competitor research (24 Oct 2026)

Goal: GoHighLevel's breadth with Linear's speed and simplicity. Ordered work, each item shipped and verified before the next:

1. **Speed and navigation (now).** Records open in a right-hand drawer so the board or list stays in view (full-screen sheet on phone). ⌘K becomes a command menu: jump to any project, client, ticket or page, create records, switch assistant, and fall back to full search.
2. **Deal-won hand-off with client templates.** Versioned client/project templates (onboarding steps, kickoff tickets, default workflow and engineering standard, folders). Marking a prospect Won creates the client, project, onboarding and kickoff tickets from the chosen template version in one owner-confirmed step; template updates can be reviewed and pushed to projects created from earlier versions.
3. **Owner portfolio dashboard.** Health per client and project (overdue, blocked, failing checks, budget versus recorded cost, last activity), team capacity from estimates and time, revenue per client.
4. **One automation builder (package K).** Plain-language when → if → then rules across CRM, delivery and marketing events, with dry runs, history and no duplicate side effects.
5. **Progressive disclosure.** Module switches so an agency sees only what it uses; advanced settings shown on request; agency and client settings for the same thing on one screen.
6. **Later, with the white-label pilot (N) and comms (L):** branded client portal, usage rebilling with markup, resale.

### Plan item 1 — speed and navigation: INSTALLED (private URL verified)
- Record editors open as a right-hand drawer on screens wider than 700 px (sticky header and save bar, two-column form), so the board or list stays visible; phones keep the full-screen sheet. Email composers, post editors (live preview sits on the right) and assistant-controlled editors keep the centred dialog. No animation, so it can never stall half-visible.
- ⌘K / Ctrl+K and the top-bar search button open a command menu (`public/command.js`): create any common record, go to any page, jump to projects, clients, tickets (by key or title) and prospects, switch assistant engine, toggle the assistant, or fall back to full search for the typed text. Arrow keys, Enter, Esc; fuzzy matching prefers prefixes. Everything it opens uses the normal editors and routes.
- Tests: tests/command.test.mjs. 122 tests, 121 pass, 1 optional skip. Browser-verified: open, filter, Enter opens a ticket in the drawer, jump to project, new-record command, Esc closes, search fallback.
- Next: plan item 2 (deal-won hand-off with versioned client templates).

### Plan item 2 — deal-won hand-off with versioned templates: INSTALLED (private URL verified)
- `server/templates.mjs`. `projectTemplates` are editable drafts (name, workflow, typical length, onboarding checklist, kickoff lines `Type: Title | days after start | acceptance criteria`, draft-standard option, brief). `templateVersions` are immutable owner-only snapshots (`POST /api/project-templates/:id/publish`): first needs content, later ones need a change and a reason. Templates with published versions cannot be deleted; onboarding checklists used by a template cannot be deleted.
- Hand-off (`POST /api/prospects/:id/win`, owner only): client (reuses an existing linked client), prospect marked Won, project (workflow, start, due from length, brief, template version recorded), onboarding tasks and record from the version's checklist snapshot, kickoff tickets (Backlog in software projects), and a draft engineering standard if chosen. Each step is recorded in `handoffs`, so a retry resumes without duplicates; a completed hand-off cannot run twice. Nothing is sent to the client and no invoices, contracts or repositories are created.
- Template updates: `GET/POST /api/projects/:id/template-update` compares the project's version with the latest; applying adds only missing kickoff tickets and onboarding steps (matched by title), never edits or deletes existing ones, and moves the project to the new version. Owner only. Today's "Needs you" lists projects with an update available.
- UI: Project templates panel on the Client onboarding page (create, publish with reason, usage and how many projects are behind); "Set up client and project" in every prospect's editor with a preview of exactly what will be created; update banner on project Overview with Apply.
- Tests: tests/templates.test.mjs (parsing, owner-only publish/win/apply, immutability, full hand-off, resume without duplicates, safe updates) plus a Today test. 128 tests, 127 pass, 1 optional skip. Browser-verified: create and publish a template, set up a prospect (11 tickets created from checklist and kickoff), publish v2, banner, apply.
- Not yet: templates do not create repositories, environments or analytics properties (GitHub access is read-only; Vercel and AWS are excluded). The onboarding record from a template has no live checklist link (it stores the version's snapshot).
- Next: plan item 3 (owner portfolio dashboard).

### Plan item 3 — owner portfolio: INSTALLED (browser-checked 24 Oct; revenue table moved to full width)
- `server/portfolio.mjs` + `GET /api/portfolio` + assistant tool `get_portfolio`; new Portfolio page (Business group, `public/portfolio.js`). Rule-based health per project with reasons (past due, due soon with low progress, budget use ≥85%/100% from labour time cost + expenses, overdue tasks, blocked tickets, failing checks, 14 days idle; notes when due date or budget is missing). Client view: health, active projects, invoiced, received, outstanding, overdue, margin. Capacity: next four weeks from the calendar model (task estimates + meetings vs working hours).
- Tests: tests/portfolio.test.mjs. Browser-checked with isolated data: health reasons, capacity bars and revenue figures render correctly.
- Next: plan item 4 (automation builder).

### Plan item 4 — automation rules: INSTALLED (private URL verified)
- `public/rules.js` (triggers, condition fields, actions, plain-language `describeRule`), `server/rules.mjs` (engine), `public/rules-ui.js` (builder on the Automations page; the existing scheduled assistant prompts stay below as "Scheduled work").
- Triggers: task/ticket created, status changed, became overdue; a check fails; prospect or contract stage changed; invoice overdue; project created; release status changed. Conditions: is / is not / contains / greater than on trigger-specific fields (new and previous status, priority, type, title, source, value, amount…). Actions (local only): create a task (title template, due in N days, priority, same project/client), add a note, set a task's priority, comment on the ticket, flag on Today ("Needs you", with Dismiss).
- Engine: runs after every successful `saveRecord` (dashboard, API and assistants) and on the 15 s scheduler tick for overdue triggers. Each firing has a key, so retries and restarts never repeat; overdue rules fire once per record and due date. Changes made by rules are attributed "Automation: <rule>" and never trigger other rules (no loops). Failures are recorded and never block the original save. Undo/restore saves don't fire rules.
- Safety: assistants can draft rules (`save_automationRules`) but they are forced off, and any assistant edit switches a rule off until the owner switches it back on. Dry run shows matching records and planned actions without writing anything.
- Tests: tests/rules.test.mjs. 135 tests, 134 pass, 1 optional skip. Browser-verified: build a rule, preview sentence, dry run, switch on, block a task, rule creates the High-priority unblock task and logs the run.
- Not yet: rules cannot send email/SMS or call external services (by design for now); no per-rule history page beyond the recent-activity list; no time-of-day triggers beyond overdue.
- Next: plan item 5 (progressive disclosure: module switches, advanced settings on request).

### Plan item 5 — show only what's used: INSTALLED (private URL verified)
- `public/modules.js`: optional areas (Sales pipeline, Inbox, Marketing, Finance and time, Meetings, Software delivery, Automation), all on by default so nothing changed for existing use. Owner-only `PUT /api/modules` (validated keys, booleans; no assistant tool). New "Workspace setup" page (Business group) with switches.
- Switching an area off hides it from the sidebar, flyouts, phone menu, ⌘K, Today's tiles and sections, and project tabs (Delivery for software, Time for finance). Visiting a hidden page shows "Switched off" with a link back. No records are deleted.
- Record editors put rarely used fields behind "More fields (n)", per collection (tasks: PRD/requirements, parent, dependencies, implementation plan, reasons, planned date, estimate, client; others similar). It opens itself when any of those fields has a value, and when a task's status is set to Blocked or Cancelled it opens and focuses the reason.
- Tests: tests/modules.test.mjs (catalogue, owner-only HTTP route, validation). 137 tests, 136 pass, 1 optional skip. Browser-verified switching areas off and on, nav/⌘K/Today/tabs, the switched-off page, More fields.
- Not yet: agency-level vs client-level versions of the same setting on one screen (no per-client settings exist yet); first-run setup wizard.
- Research plan items 1–5 are done. Item 6 (client portal, rebilling, white-label) belongs with packages L and N. Remaining handover packages: G (sales/delivery lifecycle), H (finance/time), I (marketing/GBP), J (knowledge/meetings), K (automation beyond rules), L, M, N, O.

### 24 October 2026 — Light neutral theme (Codex)
Owner explicitly replaced dark-theme preference with light neutral + subtle neumorphism. AGENTS.md now records that direction. Shared neumorphism tokens changed to cool grey, white highlights, charcoal text; added final `public/light.css` for legacy feature overrides, light logo variant (official geometry retained), light native titlebar and native control colour scheme. Preserve this preference; do not restore dark branding. No business logic, integrations, access checks or user records changed.

Validation: TypeScript passed; existing regression suite 136 passed, 1 optional skipped (137 total). Mac arm64 package built. Visually inspected Today, client overview at 377px, project Kanban, inbox split view and assistant at desktop width. This is the theme foundation, not a claim that every populated module or physical iPhone state has received exhaustive visual QA. Permanent deployment remains localhost:4320 behind the existing private Tailscale Serve hostname.

### 24 October 2026 — Flat light theme finished (Claude, after Codex ran out)
- Owner direction: light theme, and "remove the neumorphism". AGENTS.md and memory updated: flat light, no paired shadows or inset wells.
- `public/neumorphism.css` tokens now mean flat: white surfaces (`--n-base`), grey canvas (`--n-canvas` #f3f5f7), thin borders (`--n-line` #e1e5ea, `--n-line-strong` #c9d0d8); raise/inset/press tokens are border rings, modals and menus keep one soft drop shadow. `public/light.css` (Codex) cleaned of paired shadows and extended: white inputs with focus ring, grey tab tracks with white selected tab, grey board lanes with white cards, dashed empty states, red destructive buttons.
- `public/light-fixes.css` (generated once): ~600 overrides for every dark-era text/surface colour rule in the older stylesheets (light grey text → muted/ink, dark surfaces → white, lime used as text → dark accent #405b08), then lime-filled elements re-asserted on top. Loaded after light.css.
- Verified: automated contrast scan across all 34 pages went from hundreds of failures to none (after fixing the breadcrumb separator and calendar backdrop); screenshots of Today, project board, ticket drawer, inbox with assistant, phone Today. Desktop window title bar matches the canvas. 137 tests, 136 pass, 1 optional skip.
- Not covered by the scan: inline styles set in JS (a few colour hints such as error text) and states only reached after real data (e.g. email HTML, analytics charts with data).

### 24 October 2026 — Linear-style redesign (Claude): INSTALLED, not committed
- **Design system:** `docs/design/system-source.css` is the single source (compile with `node docs/design/compile-system-css.mjs` → `public/system.css`, loaded last). Values from the owner's Linear reference (4px grid, 13px base, 28/32px controls, 244px sidebar, 44px header, 24px card inset), with VareonHQ colours and the Switzer font. Edit the source, never `system.css`.
- **Layout audit:** `docs/design/layout-audit.js` checks every screen (40) for off-centre text, dropdown padding, double lines, overlapping controls and clipped text, with the desktop title strip simulated. Run it at 1440, 1280 (assistant open and closed), 1100 and phone width before calling layout work done; it should report 0. Serve it temporarily as `public/__layout-audit.js` in the QA copy and delete it afterwards.
- **Navigation:** sidebar is Linear-shaped: Inbox, My work (Today + Tasks), Reviews, Chat; foldable Workspace / Your clients / Business / Marketing sections; each active or pinned client folds open to Overview, Tickets, Projects, Documents. Open/closed state is per viewer (localStorage). Pages renamed: Prospects→Pipeline, To do→Tasks, Today→My work.
- **Chat page** (`public/chat-page.js`) is the default screen: centred composer, example cards, recent chats, "New chat ▾" switcher in the top bar listing every GPT/Claude/Codex chat. Reuses the side assistant's composer and send logic; the side panel is hidden on this page only.
- **Client and project pages:** breadcrumb with pin/settings, pill tabs with the tab's action on the right, title + description, right-hand rail (Details / Go to). Clients have a new Tickets tab. Rail drops under the content when the page (not the window) is narrow, using a container query on `.main`.
- **List pages:** shared `heading()` now renders one line of context plus the main action (page name lives in the top bar; h1 kept for screen readers); `toolbar()` renders pill views with search opposite; tables are one-line 40px rows.
- **Top-bar usage:** one slim ring chip per plan (GPT, Claude); hover shows 5-hour and weekly bars with reset times; click opens the existing dialog.
- **Desktop gotcha:** the Electron window adds a 36px title strip (`--desktop-titlebar`); fixed overlays must offset by it. The browser preview does not show it.
- **Not done:** private URL is down (Tailscale stopped on this Mac; Serve config gone). Nothing is committed. Board pages (Projects, Pipeline, Contracts, Marketing) keep their column layout with the new header.

### 24 October 2026 — Design references, board review, and saved list views (Codex)
- Read Claude's final handover and inspected the installed light redesign. Kova is explicitly deferred at the owner's request.
- Added project Design tab for Figma file references, notes, and owner-only immutable approval records of the reference link/notes. This is a reference workflow, not Figma OAuth or a frozen copy of the remote design. Search opens design records. See `server/domain.mjs`, `server/server.mjs`, `public/workspace.js`, `public/discovery.js`, `server/search.mjs`, and `tests/designs.test.mjs`.
- Inspected Pipeline, Contracts, and Marketing visually in the desktop app. Compacted completely empty Kanban boards in `docs/design/system-source.css` and recompiled `public/system.css`.
- Added `listViews` records and one-click saved-view pills to the common toolbar for Clients, Projects, Contracts, Marketing, Pipeline, Notes, and invoice list. Search/platform or status filters can be saved and reopened. Built-in quick filters show overdue invoices and prospects with no outgoing contact in the past seven days. Prospect logic uses logged touches and sent mail; invoice logic uses the finance report's computed `Overdue` state. See `public/list-views.js`, `public/app.js`, `public/business.js`, `server/domain.mjs`, `server/store.mjs`, and `tests/list-views.test.mjs`. Other specialized lists still need this treatment if “any list” is interpreted literally across the entire app.
- TypeScript passed; five focused design/view tests passed. Full suite: 144 passed, one optional skipped, zero failures (with localhost access for HTTP tests). Installed the update into both existing desktop copies and opened `/Users/cjperry/Desktop/VareonHQ.app`. The usual electron-builder packaging hit a network lookup failure; the already unpacked app bundle was updated, signed in the workspace, and copied into place. Normal `codesign --verify --deep` passes. macOS provenance attributes on the Desktop copy cause `codesign --force` to complain, but the installed app launches and normal signature verification passes.
- Tailscale Serve is running privately at `https://catlins-macbook-air.tail9bef0e.ts.net/` → `http://127.0.0.1:4320`. The server listens on loopback only. Private URL home returns 200 and unauthenticated `/api/state` returns 403. Served `app.js` hash matches the source.
- Do not run a first live AI delivery plan without explicit owner go-ahead because it uses plan allowance. Ask for one small project. The owner's next Phase 3 list: service catalogue/proposals; signed agreements → deposit invoice/payment gate; retainers/unbilled time; communication timeline; resource/contractor capacity; handover/support. Later: GBP and growth; consent-based communications; white-label installs; hosted version only after design sign-off. Do not expose this Mac install publicly.

### 24 October 2026 — Specialist saved views continued (Codex)
- Extended `listViews` scopes and common saved-view controls to Document library, Media library, Technology resources, Meeting notes, Client onboarding, Renewals & reviews, Time & profitability project cards, Cash-flow planned items, and recurring Client reports. The view search filters each page's relevant record list; summary figures and provider cards remain visible.
- Document library now uses the same toolbar for search, category (including PRD), and exact Draft/Current/Archived status. Saved document views retain all three. Verified visually in the installed desktop app that Current shows only the Current document and All restores the full list.
- `public/list-views.js`, `public/app.js`, `public/business.js`, `public/business-operations.js`, `public/library.js`, `public/planning.js`, `server/domain.mjs`, CSS source/compiled output, and `tests/list-views.test.mjs` changed. Full suite: 145 passed, one optional skipped, zero failures; TypeScript passes.
- Updated both existing Desktop app copies and reopened the primary app. Private Tailscale Serve URL remains tailnet-only, proxying `127.0.0.1:4320`; home is 200, unauthenticated API is 403, and served `app.js` hash matches source. No live delivery plan was started. Kova remains deferred.

### 24 October 2026 — Service catalogue, proposals and deposit gate (Claude)
- New collections `services`, `proposals`, `variations`; page **Proposals** (Business group, Sales module). Proposal lines come from the catalogue; **Accept and raise agreement** (owner only, `POST /api/proposals/:id/accept`) freezes the scope and creates one Draft contract carrying `proposalId`. Accepted proposals cannot be edited or deleted; changes go through variations (owner approves/rejects; decisions are permanent). See `server/domain.mjs`, `public/proposals.js`, `tests/proposals.test.mjs`.
- Contracts gain `depositPercent`, `depositInvoiceId`, `depositWaived`. Signing raises one Draft deposit invoice (never auto-issued). Tickets cannot move into In progress or later on a project whose deposit invoice is not issued and fully paid, unless the owner waives it (`depositHold`/`depositState`). Contract cards show deposit status.
- 153 tests (152 pass, 1 optional skipped), TypeScript clean, layout audit 0 findings on Proposals, Contracts, Finance. **Not yet installed into the desktop app and not committed.**

### 24 October 2026 — Retainers, team capacity, handover and support (Claude)
- **Retainers & unbilled work** (`retainers`, page Retainers): monthly amount, included hours, one draft invoice per month (`POST /api/retainers/:id/invoice`), hours used vs included. Time entries gained `billRate` and `invoiceId`; `POST /api/clients/:id/invoice-time` raises one draft invoice from priced billable time and locks those entries until the invoice is voided or deleted. Entries with no rate are flagged, never silently skipped.
- **Client timeline** now includes proposals, variations and retainers (`public/operations-data.js`).
- **Team & capacity** (`people`, `tasks.assigneeId`, `public/people.js`): hours by week against weekly capacity, overdue, undated and unassigned buckets. Inactive people cannot receive new assignments; people with tickets cannot be deleted.
- **Assets & handover** (`clientAssets`) and **Support** (`supportRequests`) in `public/service-desk.js`. Assets must belong to the client, stamp a handover date, and refuse anything that looks like a password (password-manager names such as 1Password are allowed). Support due dates come from priority (urgent 1 day, normal 3, low 7); waiting-on-client pauses overdue.
- 164 tests (163 pass, 1 optional skipped), TypeScript clean, layout audit 0 findings. Installed into both Desktop copies; private URL 200, unauthenticated API 403, served `app.js` hash matches source.
- **Build gotcha:** `desktop/prepare.mjs` copies whichever Node runs it into the bundle. Build with Node 24 (`PATH=/usr/local/bin:$PATH npm run pack:mac`); the default shell Node is 20 and lacks `node:sqlite`, so the app's server will not start. Sign the build in `desktop-dist` (`codesign --force --deep --sign -`) and copy with `ditto --norsrc --noextattr --noacl`; signing inside the iCloud-synced Desktop fails.
- Owner's second list (not started): AEO, SEO, Ads manager (Google, Meta), Social media manager, Workflows, Forms and form builder, Deals, Subscriptions in USD (for users paying to use the product, so part of the hosted phase), CLI in the user's terminal, every possible integration (see `INTEGRATION-WISHLIST.md`), Linear × HubSpot styling. Owner said finish the original list first.
- Not committed yet.

### 24 October 2026 — Grouped navigation (Claude)
- The sidebar is now one item per area, and each area's pages are underlined tabs at the top of the page. Defined in `SECTIONS` in `public/app.js`: Clients (Clients, Onboarding, Assets & handover, Support, Reports), Sales (Pipeline, Follow-ups, Proposals, Contracts), Projects (Projects, Calendar, Team & capacity, Meeting notes), Finance (Invoices, Retainers, Time & profit, Cash flow, Renewals), Marketing (Content, Website analytics, Media), Knowledge (Documents, Notepad), Automation (Automations, AI project, Technology, Live preview, Codex), Insights (Overview, Portfolio), Settings at the bottom (Connections, Workspace, Notifications, Backups, Action history). My work keeps Today and Tasks as tabs. Routes (`#proposals` etc.) are unchanged; every page is still in ⌘K. Tabs hide with their module; an area with no visible tabs disappears. The breadcrumb reads "Area / Tab".
- Tabs are not shown on client or project detail pages, which have their own tabs.
- Also fixed: saved-view pill gap (6px to 8px, flagged by the audit), phone toolbar (an older rule forced a column, so the search box overflowed), and left-aligned page descriptions on phones.
- Layout audit: 39 pages, 0 findings at 1280 (assistant open) and phone. 164 tests (163 pass, 1 optional skipped). Installed in both Desktop copies; private URL verified (200, API 403, `app.js` and `system.css` hashes match).
- Backup of the previous `app.js`: `/private/tmp/claude-501/app.js.before-sections`. Not committed.
