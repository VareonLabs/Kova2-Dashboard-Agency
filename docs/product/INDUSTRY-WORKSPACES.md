# Industry workspaces

Status: product direction agreed 24 October 2026. The first cross-industry workspace profile and first-run industry setup are being implemented. The existing Simple, Software and Field service project workflows remain available; the new workspace profile is the layer that adapts the broader platform.

## Product rule

Kova is an AI operations platform. A workspace should help a business complete its real work from intake through delivery and follow-up. Client and contact records provide context for that work; they are not the product's organizing principle.

Every industry can use the same integration catalogue. An industry profile configures the work model around those connections: terminology, records, workflow stages, templates, checklists, dashboards, automations and assistant guidance. Choosing an industry must not remove access to a supported integration. A workflow may make an integration useful or surface it prominently, while connection availability remains shared.

## First-run setup and workspace profile

New workspaces start with a guided setup before the dashboard. The owner can choose a starter or enter any industry in free text, describe the business, name its customers and main work items, define work-step labels and stages, and select the areas that belong in daily navigation. Starters are editable starting points, not a closed list of industries. The same profile can be changed later in Settings without forcing existing records into a new workflow.

The current profile foundation changes primary navigation terminology, recommended/visible workspace areas, the stages and completion label on newly created industry-profile work, and the operating context supplied to GPT, Codex and Claude. Existing records retain their saved workflow. Shared Connections stay reachable whatever the profile says. Profile changes do not claim a provider is connected or create industry-specific integrations automatically.

This is a platform foundation, not yet a complete industry implementation. Rich industry-specific records, permissions, starter templates, checklist libraries, dashboards and validated automations still need to be built as reusable profile packs. The profile should eventually be versioned and attachable to a workspace and individual workstream so mixed-industry businesses can use more than one model safely.

Businesses can start with one profile and enable another when needed. A project or workstream can use the appropriate profile when a business spans industries. Changing a profile must not delete or silently rewrite existing records. Old records retain the profile and workflow version that created them.

## Shared platform layer

The shared layer owns:

- Identity, people, clients, contacts and permissions.
- Tasks/work items, activity, files, approvals, notifications and search.
- Money, time, documents, communications, automation and reporting primitives.
- A common integration catalogue, connection state, credentials, scopes, sync history and provider evidence.
- AI planning, visible actions, memory boundaries, run history and human approval controls.

Integrations are not bundled inside an industry pack. Outlook, accounting, calendars, storage, analytics, telephony, code hosting and other supported providers remain available through the same Connections area. The UI must distinguish an integration that is available, configured, authorised, syncing, and verified; a profile must not imply a provider is connected.

## Industry profile definition

An industry profile is a versioned configuration bundle, not a separate application fork. It defines:

- Display names and terminology for work objects.
- Work object types and industry-specific fields, with links to shared clients, people, money and documents.
- Statuses, permitted transitions, required information, approvals and completion evidence.
- Starter templates, checklists, dashboards, saved views and automations.
- Assistant instructions and the actions it may propose or perform at each approval level.
- Optional modules to feature in navigation and onboarding defaults. These are preferences, not integration permissions.
- Profile version, migration notes and upgrade behaviour.

Profiles cannot loosen platform safety controls, bypass authorisation, mark unverified external results as complete, or approve their own guarded actions.

## First two profiles

### Software delivery

This is the internal proving ground and has an existing foundation: PRDs, requirements, ticket types, dependencies, evidence-gated status changes, engineering standards and delivery plans. The next work is to make the workflow a proper profile while preserving current project data and gates.

The end-to-end outcome is an approved brief becoming a planned, implemented, checked and reviewed deliverable, with honest release evidence where deployment exists.

### Field services

This is the first customer-facing profile that differs from software. Cleaning is the initial example of the profile, not a one-customer custom build. The first workflow slice adds job categories, work location, visit date, active team assignment, completion note/photo evidence, scheduled visits and invoice/cost panels. The server checks requirements for schedule and completion stages, and only the owner can close a job. The full profile should support a service lifecycle such as:

`Request or booking → scheduled job → assigned team member → work in progress → checklist and evidence complete → ready to invoice → completed`

The durable work objects should include a service location/property, a booking or appointment, a job, job checklist items and evidence, assignment, and links to the client and invoice. Calendar sources can populate bookings after provider setup; a changed booking should be traceable to the jobs it changed. Mobile field use is a first-order requirement for checklists, notes, photos and status updates.

Do not model every property or job as a software project. Reuse shared clients, people, files, calendar, invoicing and automation primitives, while keeping field-service records and transitions suited to on-site work. Specific provider connections, two-way sync, accounting behaviour, offline use and public staff access require separate implementation and verification.

## Acceptance tests for the architecture

- Software and Field Services can be enabled in one product without duplicate client, person, file, invoice or integration records.
- Switching or upgrading a profile preserves existing records and makes the source profile/workflow version visible.
- A field-service user can complete the primary job lifecycle without seeing coding tools in the day-to-day work view.
- A business can still open the shared Connections area and configure any supported provider regardless of profile.
- AI actions use the active work context, respect industry-specific transitions and record evidence; manual completion remains possible.
- A profile cannot claim bookings, sends, payments, deployment or other provider actions succeeded without provider evidence.
- Desktop and iPhone users can finish the same core workflow, including field photo capture and checklist completion where supported.

## Build order

1. Update the shared product/domain model to distinguish an industry profile from a project workflow and from an integration connection.
2. Version profile definitions and preserve the current Simple and Software projects as compatible records.
3. Make workflow transitions and required evidence data-driven, while keeping server-side checks authoritative.
4. Implement the Software profile against its current delivery journey.
5. Implement the Field Services data model and mobile job lifecycle as the first distinct customer-facing profile.
6. Add provider-backed booking and accounting connections only after their individual permissions, sync rules, conflict handling and evidence are defined.

Do not expand into many industries until these two profiles prove the shared model works without special-case forks.
