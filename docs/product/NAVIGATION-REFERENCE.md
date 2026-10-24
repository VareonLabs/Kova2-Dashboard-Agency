# Navigation reference: Linear and HubSpot

Owner request (24 Oct 2026): use Linear's and HubSpot's full menus as reference and inspiration for VareonHQ. This is a map of their structure against ours, not a plan to copy either. Keep the flat light theme, lime for primary actions only, and the Switzer font.

## What each product is teaching us

**Linear: the shape of one workspace.** Few top-level items (Inbox, My issues, Reviews, Agent), then Workspace, then one collapsible "team" per unit of work, each with the same four children (Home, Issues, Projects, Views). Settings is a separate sidebar grouped Personal, then feature areas, then Integrations, then Administration. Team settings repeat that grouping at team level.

**HubSpot: the breadth of a business.** A short pinned sidebar the user curates, plus a "More" menu that holds everything, grouped by job: CRM, Marketing, Content, Sales, Revenue, Service, Data, Agents, Automation, Reporting. A top bar with search, quick-create (+), calls, help, settings and notifications.

**For us:** Linear's sidebar discipline and per-client "teams" (already done), HubSpot's grouped "everything" menu and quick-create, and Linear's settings structure.

## Where we are against each

| Reference area | Linear / HubSpot item | VareonHQ today |
|---|---|---|
| Top level | Inbox, My issues, Reviews, Agent | Inbox, My work, Reviews, Chat: done |
| Workspace | Projects, Views, More | Clients, Pipeline, Projects, Calendar, Team & capacity, Support |
| Per-team children | Home, Issues, Projects, Views | Client page: Overview, Tickets, Activity, Projects and more: done |
| Saved views | Views | Saved list views on most lists: done |
| Quick create (+) | Contact, Company, Deal, Ticket, Task | ⌘K menu has new-record entries; no visible + button |
| CRM | Contacts, Companies, Deals, Tickets, Products | Clients, Pipeline (prospects), Tasks. **No Deals board, Contacts or Products** |
| Marketing | Emails, Forms, Campaigns, Ads, Social, SEO, AEO, Events | Marketing (content), Website analytics, Media library. **No forms, ads, social stats, SEO or AEO** |
| Content | Pages, Blog, Landing pages | Not in scope for an agency CRM; client sites live elsewhere |
| Sales | Calendar, Sequences, Forecast, Documents | Calendar, Prospect follow-ups, Cash-flow forecast, Document library |
| Revenue | Invoices, Payments, Subscriptions, Quotes, Contracts | Budgets & invoices, Contracts, **Proposals, Retainers: done**. Subscriptions not yet |
| Service | Help desk, Knowledge base, Feedback surveys | **Support queue: done**. No knowledge base or surveys |
| Data management | Data model, Enrichment, Quality | Not started |
| Agents | Agent hub, Marketplace | Chat, assistants, Automations |
| Automation | Workflows | Automations rules engine, no visual builder |
| Reporting | Dashboards, Reports | Overview, Portfolio, Client reports. No custom dashboards |
| Development | Projects, Keys, Monitoring, CLI | Technology, Live preview, Codex workspace. No CLI |
| Settings | Linear: Personal, Features, Integrations, Administration. HubSpot: General, Users, Privacy, Billing | One "Workspace setup" page and Connections. **No grouped settings area** |
| Workspace menu | Settings, invite members, switch workspace, log out | Account menu only |
| Notifications, Help, Calls | Top bar | Bell present. No help panel, no calling (Phase 5) |

## Gaps that matter most, in dependency order

1. **Grouped Settings area** (Linear's structure: Personal, Workspace, Integrations, Administration). Everything else needs somewhere to put its configuration, and today there isn't one.
2. **"More" menu grouped by job** (HubSpot's structure) so the sidebar stays short while every page stays reachable. Our current "More" is one flat list of 19 pages.
3. **Quick create (+)** in the top bar.
4. **Deals** as a board with stages and value, fed by Pipeline and Proposals.
5. **Contacts and Companies** as separate records from Clients. Needed before consent-based email, SMS and forms.
6. **Dashboards and reports** the owner can build.
7. Then the second-list items: Workflows builder, Forms, SEO/AEO, Ads, Social, CLI, integrations, Subscriptions in USD.

## Not copying

HubSpot's upgrade-locked items, Marketplace, Academy and Training, Linear's Slack-specific menus and Business-plan gating, and anything that exists only to sell a higher plan. Playbooks, Buyer Intent, Podcasts, Case Studies and Memberships do not suit a one-agency tool.
