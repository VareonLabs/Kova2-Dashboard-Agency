# Platform quality bar

VareonHQ is one adaptable operations platform, with an industry-specific workspace rather than a software-agency interface shown to every business. This document is the acceptance bar for work across the app. It is a build checklist, not a claim that these items already exist.

## Shared experience

- Every area uses the same layout, spacing, typography, controls, empty states, loading states and record actions. Keep the approved flat light theme, white surfaces, thin borders and restrained Vareon lime.
- A person can find any area from navigation or search, create the main record from that area, and return to their prior context. The sidebar stays short through groups and user-selected favourites.
- List-heavy areas provide search, filters, sort, saved views, bulk actions and a useful detail pane. Boards provide the same underlying filters and record actions. Views must remain usable when there are many records.
- The primary action, record status, owner, next step and recent activity are visible without opening multiple screens. Editing must make save state and errors clear.
- Keyboard navigation is practical for frequent desktop work; touch targets, drawers and tables are usable on iPhone through the private Tailscale link. No page should require scrolling merely because its shell is oversized.
- Empty states explain the next useful action. They do not imply that a connector, automation or AI capability exists when it has not been configured.

## Connected data and workflows

- Clients, contacts, opportunities, proposals, contracts, projects, invoices, marketing, communications and support link to one another through durable IDs and a shared activity timeline. A change in one area is reflected in linked views.
- Each major record type can start a workflow. A workflow shows its trigger, conditions, actions, owner, enabled state, recent runs and failures in plain language. Creating a rule from an area starts with that area's trigger.
- Rules support safe internal updates first. External messages, publication, payment, deletion and deployment need explicit approval policy, visible audit evidence and idempotency before autonomous use.
- Delays, branches, retries, schedules and cross-area actions need durable execution and clear recovery when a connector is unavailable. A failed step must be visible and must not silently repeat an external side effect.
- Industry setup changes terms, navigation defaults, templates, fields, dashboards and workflow recipes. Integrations remain available across industries rather than being locked to one vertical.

## Area acceptance

| Area | Minimum usable outcome |
| --- | --- |
| Sales | Leads and opportunities have stages, value, owner, next action, timeline, saved views and stage-based workflows. |
| Communications | Inbox, contact history and follow-ups are linked; AI drafts are reviewable and sending state is unambiguous. |
| Marketing | Content moves from idea to approval and publication with previews, assets, calendar and outcome reporting. |
| Delivery | Projects have scope, tickets or jobs, dependencies, assignees, timelines, evidence, release or handover, and client visibility appropriate to the industry. |
| Money | Quotes, agreements, invoices, payments, costs and retainers reconcile into margin, ageing and forecast views. |
| Operations | Tasks, notes, documents, resources, support and approvals appear in the right person's daily work. |
| AI | Actions are grounded in current records, show what changed and why, surface uncertainty, and respect the configured approval boundary. |
| Reporting | Dashboards expose source records, useful date ranges and filters; users can save a view or act on a finding. |

## Implementation order

1. **Shared shell and record interactions:** audit every current page against the shared experience bar; fix navigation density, forms, boards, list panes, mobile layout and empty states as one system.
2. **Workflow platform:** finish contextual entry points, rule discovery and run history; then add durable delays, branches, retries and approved external actions.
3. **Connected journeys:** prove lead to agreement to deposit to delivery to invoice, and content idea to review to publication to reporting, end to end in the desktop app.
4. **Industry setup:** make terminology, defaults, templates and dashboards adapt during onboarding while keeping the integration catalogue shared.
5. **Autonomous operations:** expand only after each journey has traceable evidence, exception handling and a clear human approval boundary.

## Current first slice

The top bar now offers a contextual **Automate** action on supported pages. It opens the existing rule builder with the area's trigger selected. Client creation, contact creation, marketing status changes, document creation and note creation now have rule triggers alongside the existing sales, inbox, project, finance, form and support triggers. New rules start disabled; no external side effect is enabled by this slice.

The larger quality bar remains open. In particular, the current workflow builder does not yet provide durable delays, branches, retries or external actions, and a page-level audit is still required before claiming the shared experience is complete.
