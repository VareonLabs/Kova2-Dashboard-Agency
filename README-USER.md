# VareonHQ — local business workspace

Open **VareonHQ.app on your Desktop**. It has its own Mac window and includes its Node runtime. Closing the window keeps the app running for schedules; choose VareonHQ → Quit to stop it. The live browser preview is also available at **http://localhost:4317** while the app runs. It listens only on this Mac’s loopback interface.

For development, **Launch VareonHQ.command** runs the same dashboard using Node 24.

## Available now

- Clients with contact information, notes and linked project, contract and email history.
- Projects with dates, tasks, progress and a timeline.
- Contract tracking from draft through signature, with links to external documents. Stages are manually recorded; this is not an electronic-signature service.
- Instagram, LinkedIn and X content drafts, captions, carousel slide previews, local scheduling and text export.
- Local email drafts and an Outlook integration for inbox sync, replies and sending after Microsoft setup.
- An in-app GPT assistant that uses the same validated business actions as the interface. Choose Continue with ChatGPT in Connections and authorise eligible ChatGPT plan usage through OAuth. No API key is requested or used as a fallback. The local Codex sign-in remains available as a separate engine.
- Voice input through supported browser speech recognition or Mac Dictation in the message box, with optional spoken replies. This is not the native ChatGPT Voice interface and does not make paid API transcription calls.
- Codex requests through the official Codex SDK, a dedicated file workspace and local dashboard MCP tools. Uses the local Codex sign-in. Use **Codex → Connections/Open workspace** to compose a request. Live Codex access has been verified: it opened, filled and saved a LinkedIn draft in a separate test workspace.
- One-time, daily and weekly GPT/Codex automations with persistent schedules, pause/resume and run history.
- OAuth 2.1 with PKCE, scoped MCP tools, refresh-token rotation, local connection approval and access revocation for an external ChatGPT connection.

The workspace also includes editable project Markdown memory, shared notes, Kanban boards, a collapsible assistant and live marketing previews. The header shows real Codex plan usage for five-hour and weekly windows when available. These are Codex limits from the local ChatGPT sign-in, not ChatGPT chat or API quotas.

## Finish your connections

**Outlook:** Your mailbox is **hello@vareonhq.com**, created through GoDaddy. We have not verified its Microsoft 365 tenancy. Connections → Outlook → Set up explains Microsoft app registration, delegated permissions and the local redirect URI. Sign in with Microsoft after saving its application ID. Depending on your tenant, administrator consent may be required. Add delegated User.Read, Mail.ReadWrite, Mail.Send and Contacts.Read permissions. A single-tenant app must use its Directory (tenant) ID or verified domain in the setup field, rather than common. Inbox sync loads up to 100 recent messages from a selected Outlook folder and paginates saved contacts, including contact subfolders. Search recipients by name or email in To, Cc and Bcc. Connected folder creation and moves update the real Outlook mailbox; folders created while disconnected are labelled local only. Sending is accepted by Outlook for delivery; it does not prove final delivery. Ambiguous send failures are locked to prevent a duplicate; review Sent Items first.

**GPT inside the app:** Connections → GPT assistant → Continue with ChatGPT. The browser opens the official OpenAI OAuth flow. Grant ChatGPT plan usage if eligible, then return to the app. Credentials are verified with OIDC and PKCE, stored by the native Keychain helper, and renewed with rotating refresh tokens. The model selector above the assistant composer loads the models available to the authorised account. Switch the engine to Codex to choose a separate Codex model; choices persist and apply to the next message and scheduled work. Codex default follows the local Codex configuration. Refresh reloads each connection’s catalog. There is no API-key requirement or API-billing fallback. A completed model request, rather than a Connected badge alone, proves that the account can use the selected model. If the previous build reported a Keychain error, reconnect once to replace the incomplete legacy credential.

Official implementation reference: https://developers.openai.com/siwc/token-sharing-open-source/sign-in

**ChatGPT controlling the app:** The local endpoint is `http://localhost:4317/mcp`. Cloud ChatGPT needs a secure bridge to reach this Mac. Configure your HTTPS tunnel before entering its base URL in Connections. Add the resulting `/mcp` URL as a custom MCP connection in ChatGPT, choose OAuth, and use a public OAuth client with `token_endpoint_auth_method=none` (dynamic registration is supported). Approve the request in the local Connections screen. Dashboard/admin routes are restricted to localhost Host headers and a local session cookie; ensure the tunnel preserves its public Host header. Do not configure a tunnel that rewrites the Host to localhost. If your plan/client requires a different registration method, that adapter still needs implementation. No tunnel is created or publicly exposed automatically.

**Social publishing:** Drafting, carousel previews and scheduling are local. **Direct publishing is not implemented or connected yet.** Scheduled posts remain queued. Meta, LinkedIn and X require developer app credentials, platform permissions and account verification. Instagram publishing may also need a way for Meta to fetch media; local-only files cannot be publicly fetched. There is no pretend “published” state.

**Outlook branding:** Microsoft Graph does not expose your Outlook signature automatically. In Email branding, paste the signature copied from Outlook and confirm it. Every outgoing app email then appends it, and sending is blocked until it is confirmed. The rich-text composer supports common Outlook-style formatting, inline images, tables, links and attachments; it does not replicate every Outlook feature.

**MCP connectors:** Add an HTTPS MCP server in Connections and authenticate with that provider. Connections from the ChatGPT app are not inherited. Higgsfield has a prefilled server option. Tools can read data; external actions wait for review unless you explicitly enable that connector’s action permission. Provider sign-in and live tool calls still need verification with your accounts.

**Signatures:** Choose your preferred signature provider before adding electronic-signature collection and automatic contract updates. Manual stage changes are already available.

**Existing schedules:** This app owns its own schedules. It does not automatically import schedules from ChatGPT or the Codex desktop app.

## Media, prospects and budgets

Media library accepts PNG, JPEG, GIF, WebP and sanitised SVG images/logos, plus MP4, MOV and WebM videos, up to 100 MB per file. Files stay in the data directory’s `media/` folder. Attach and reorder them in a marketing draft; images and video are rendered in the live content panel. Local uploads are not automatically public hosting for social platforms.

Prospects has a Kanban pipeline, research source links, potential value, follow-up dates and conversion to a client while retaining the research record.

Budgets & invoices tracks final invoice amounts, partial payments, outstanding and overdue balances, follow-up dates and project expenses. Project editing includes agreed revenue budget and planned delivery cost. Client details include a financial summary. All amounts are AUD; payment confirmations are recorded manually, not imported from a bank or accounting provider. An invoice cannot be marked paid by editing a status: its recorded payments determine the balance.

Technology links GitHub repositories, Vercel deployments, AWS resources, Supabase projects and PostgreSQL databases to client projects, including preview URLs and monthly cost estimates. GitHub, Vercel and Supabase have prefilled MCP connection options; Supabase is scoped to one project in read-only mode. AWS and standalone PostgreSQL need a configured MCP service or local HTTP bridge. Resource status and cost estimates remain manual until a live connector is connected. They are not automatically included as expenses.

## Web search and coding preview

GPT exposes web search through its authorised Responses connection. Codex enables live web search using its local sign-in, and keeps a resumable conversation per project. Both can use project memory and dashboard tools. Codex can write and run code in its dedicated workspace; GPT can create HTML, CSS and JavaScript through the preview-file tools. Ask it to open the live preview, then use Desktop / Tablet / Mobile controls to inspect the result. Preview files are served through a private capability URL and sandboxed separately from dashboard data. Separate localhost development servers can also be attached. Search and coding were verified with a real Codex request in the isolated test workspace. The GPT OAuth sign-in, account model catalog and a completed assistant reply were also verified. Earlier testing returned a plan-sharing allowance limit; that error is explained with a link to ChatGPT Usage and does not imply the whole subscription is exhausted. Credentials are preserved and there is no API billing fallback.

Existing ChatGPT conversations, every ChatGPT app feature, and plugin sign-ins are not inherited by this app. Voice uses supported browser recognition or Mac Dictation; it does not reproduce ChatGPT Voice.

## Local data and scheduling

The desktop app stores business records under `~/Library/Application Support/VareonHQ/business-data/`. It copies your existing development data on its first independent launch. When a development preview is already running, the desktop app opens that shared workspace instead. Development records live in `data/vareonhq.sqlite`, with generated files in `data/codex-workspace/`. Assistant Markdown lives under the data directory’s `assistant/` folder, including separate project folders. OAuth access/refresh tokens are stored as hashes; mailbox credentials and ChatGPT OAuth credentials live in macOS Keychain. Export business records from Connections. The JSON export excludes secrets and OAuth credentials, and includes media metadata but not the media files themselves. It is a portable business-record export, not a full restore package.

This is a local app, not an offline AI model: ChatGPT, Codex, Outlook and social providers use the internet. Relevant content is sent to the connected provider when requested. A local database does not mean that AI-processed content never leaves your Mac.

Automations run while the app process is running and the Mac is awake. Recurring runs missed during sleep catch up once. A job interrupted by a restart is paused for review to avoid repeating side effects. Jobs use Brisbane/AEST dates. No login item or background service is installed automatically.

## Development and verification

Use Node 24+. `npm install` installs the locked dependencies. `npm start` runs the dashboard; `npm test` runs persistence, validation, scheduling, GPT tool-loop and OAuth/MCP HTTP tests. `npm run typecheck` checks the optional eve integration. `npm run agent:dev` starts the separately configured eve agent. Do not expose that development server publicly.

The preview reloads when UI files change unless a form or composed message is open. Core business state is refreshed periodically when the user is not editing. Account credentials, live email delivery, live GPT subscription requests and voice support and direct social publishing require separate connected-account verification.

## Brand

Use a neutral charcoal dark theme with the approved official VareonHQ lime #C6F432. No purple, sage, olive or cream. The official logo and app icon use VareonHQ brand assets.

The refreshed overview uses neutral dark layered cards, official lime accents, six months of recorded cash flow, task completion, projects, prospects, agreements and notes. Charts reflect saved records, with empty data shown as zero. Page navigation returns to the top; narrow screens keep wide tables and Kanban boards in their own scrolling areas.

## Layout and inbox update (0.4.0)

The sidebar keeps the main pages visible and puts Prospects, Budgets & invoices and Contracts under Business, with less-used pages under Tools. The app fits the window and scrolls inside the content, inbox list, reading pane and chat when needed. Controls share a consistent spacing scale and custom dropdown chevrons. The Overview is titled Business overview; the promotional hero and local-storage notice have been removed. Glass surfaces use neutral charcoal, clear borders, subtle lime glow and the official logo as a faint background mark.

Inbox has separate, independently scrolling message and reading panes. Search covers synced mail in the selected folder by sender, recipient, subject and message text. Filter by read/unread/draft/sent and date; choose newest or oldest first, or set an inclusive date range using Brisbane dates. Messages render in batches of 50. On a narrow screen, open a message and use Messages to return to the list. Compose has grouped icon controls, a collapsible signature preview and a bounded editor.

GPT parses the actual response body rather than trusting Content-Type, including split and multiline event streams. Old failed messages remain in history and are explicitly labelled as earlier failures with their original diagnostic available. A fresh GPT request through the updated dashboard completed successfully on 21 October 2026. No API key or alternate billing was used.


## Website analytics

Open **Business → Website analytics**. VareonHQ is already listed. Use **Add website** for future client sites and link each to its client record.

**Run website audit** checks the public homepage without Google sign-in. SEO and AEO readiness use the visible VareonHQ rubric; they do not measure rankings or AI mentions. Open each check for evidence, and add failed checks to To do. Audit history is stored locally.

To read your existing GA4 and Search Console reports, choose **Connect Google**. The setup screen explains the one-time Google Cloud Desktop OAuth client registration and JSON import. Enable Analytics Data API, Analytics Admin API and Search Console API. Google sign-in opens in your normal browser. Credentials are stored in macOS Keychain. No Google password or paid API key is requested.

After sign-in, choose **Link properties** and select the correct GA4 and Search Console properties for each website. Reports cover 7, 28 or 90 days through yesterday; Search Console final data can lag. Reports are cached for 15 minutes and can be refreshed manually. Missing data or permissions are shown explicitly.

The assistant can read website reports, run public homepage audits and create follow-up tasks when asked.


## Chat files and folders

Use the **+** in the chat input, then **Add files** or **Add folder**. You can also drop files/folders onto the chat input or paste an image. Review the attachment list, open previews and remove individual files or whole folders before sending.

Up to 100 files / 25 MB per message. Supported: PDF, DOCX, XLSX, PPTX, PNG, JPEG, GIF, WebP, UTF-8 text and common source code. Hidden files, credentials, private keys, dependency folders and generated output are excluded and reported. Unsupported files are reported rather than silently treated as readable.

Originals remain untouched. The app saves local copies, and sends selected content to your chosen GPT/Codex connection only when you send the message. Attachments appear in saved chat history. Each chat keeps its own pending attachment list.

GPT receives PDF/image inputs plus readable text; it can request more text from attached documents. Codex receives working copies with folder paths, image inputs and extracted document text. Office extraction includes text/cell values, not embedded charts/images or recalculated formulas. PDF text extraction is limited to 100 pages / 500,000 characters and may omit scanned text; GPT can also inspect the original PDF visually.


### Google “Access blocked” / 403 access_denied

If Google says VareonHQ Local is in testing and can only be accessed by developer-approved testers, open Google Cloud → Google Auth Platform → Audience in the project that owns the Desktop OAuth client. Under Test users, add the exact Google account being used to sign in and save. Project ownership alone does not replace the test-user entry. Start a fresh Sign in with Google request from the dashboard after saving. The selected account also needs access to the GA4/Search Console properties. Testing-mode refresh tokens may expire after seven days.


## Today, client workspaces and reviews

- **Today** is the opening screen. It uses Brisbane dates to gather due and overdue tasks, remaining invoice balances, unread Inbox messages, upcoming deadlines, scheduled content, prospect follow-ups and pending reviews. Business overview is still available from Today and the Business menu.
- **Clients → select a client** opens their workspace. Tabs bring together projects, tasks, email, contracts, recorded finances, marketing content, files, notes, websites and resources. Records linked through the client’s projects are included. Unlinked mail is matched against the client’s exact saved email address and labelled “Email address”; it is not permanently reassigned. Add buttons preselect the client. Client URLs and selected tabs survive a reload.
- **Review queue** opens from the shield button in the top bar or Business menu. Filter pending requests and history, search, inspect proposed changes, add feedback, approve or decline. Posts and contracts have a “Submit saved version for review” action in their editor. Save edits first. Client Content and Contracts tabs also offer Request review.
- Ask GPT or Codex: “Prepare this change and submit it for review without applying it.” Proposed records remain unchanged until approval. Content approval saves locally; it does not publish social posts or send/sign contracts. Existing email-send requests and connector requests appear in the same queue. Email approval sends through Outlook with the confirmed saved signature. Connector approval runs the displayed action. Only the owner can resolve reviews in the local app. Changed records must be submitted again, preventing an older review from replacing newer work.


## Search and prospect follow-ups

Use the magnifying glass in the top bar, or press Command-K, to search saved records, synced email, chats, uploaded file names and text, and workspace/project Markdown memory. Categories and Show more narrow or extend the results. Open a result to return to its record, conversation, file or memory. Search excludes credential stores and deleted emails. It searches locally saved information; sync Outlook for newer messages. Uploaded document text currently searches the first 32,000 extracted characters per file; images and videos match by name and metadata.

Open Business → Prospect follow-ups, or use Follow-ups from the Prospect board. Set an explicit reminder date, or let saved sent mail/logged contact flag unanswered outreach after the prospect’s waiting period (7 days initially, editable on the prospect). A newer saved reply suppresses the automatic unanswered reminder. Explicit reminder dates remain yours to manage. Reminders appear inside the app and Today; they catch up on app load rather than sending notifications while the app is closed.

Log contact records what you confirm happened. Snooze sets a later date, Complete pauses reminders, and Resume re-enables them. History retains contact notes and matched saved emails. Draft with GPT/Codex reads the context, writes the email visibly and submits the saved draft for review. Existing drafts get an Open saved draft or Review draft shortcut to avoid repeated generation. Sending still needs owner approval and the confirmed Outlook signature. When a linked follow-up is accepted by Outlook, its contact history is recorded and its waiting period restarts. Won and Lost prospects are excluded.

Assistant replies now display formatted paragraphs, readable emphasis, lists, tables, links and code without visible Markdown markers. Existing saved replies use the same renderer. New replies are instructed to use direct, conversational Australian English. User-entered text and meaningful code/hashtags are preserved.


## Calendar, workload, forecasts, reports and undo

**Business → Calendar & workload** brings local meetings/focus blocks, task planning dates, project/contract deadlines, invoice dates and recorded publishing schedules into a week or month view. Edit tasks to set estimated hours and an optional planned work date. Capacity sets available hours and workdays. Missing estimates stay unknown; clashes and days above capacity are flagged. This is a local calendar: Outlook Calendar meetings are not synced by the existing email connection.

**Business → Cash-flow forecast** shows estimated 30/60/90-day movements. Enter an opening cash balance manually. Sources are remaining issued invoice balances, unpaid recorded costs, and enabled planned cash-flow items. Add one-off, weekly or monthly planned income/expenses; month-end recurrences retain their original anchor. Draft/void/paid invoices, paid costs, project budgets and hosting estimates are excluded. Undated invoices/costs are shown as exclusions. Overdue dated amounts are assumed today. Late payments shifts estimated income 14 days; this is a scenario, not a prediction. Avoid duplicating an existing invoice/cost with a planned item. An older opening balance is flagged for refresh. No bank balance is read.

**Business → Client reports** generates a branded saved snapshot for a client/date range, with completed work, current projects/tasks/contracts, recorded content, payments/costs in the period, current invoice balances and available website snapshots. Website windows are explicitly labelled and may differ from the work period. Older tasks without completion dates are excluded from period completion totals. Preview, download standalone HTML, or use Print / save PDF. Reports also appear in each client’s Reports tab. Weekly/monthly schedules generate the latest complete period while the app runs and catch up on next launch. Reports are not automatically emailed. Interrupted or failed generation is visible.

**Tools → Action history** records before/after versions and actors for supported local record changes made after this update. Review a change and choose Undo local change. Newer edits and linked-record validation protect existing work. Consecutive supported changes can be undone in reverse order. Deleted local records retain their original IDs when restored. Payments, publishing/scheduled posts, automation schedules, account credentials, sent mail and external connector operations cannot be automatically undone here. Earlier activity remains visible but has no reconstructed undo snapshots. GPT/Codex can read this history and request an undo through the owner’s Review queue; they cannot approve their own undo requests. Local business exports now include the report snapshots, planning assumptions and change history, with no credentials.


## Document library and iPhone

Business → Document library stores contracts, policies, templates, procedures and brand resources. Add a file (up to 25 MB), a link, or written text. Categorise it, assign a folder, client/project, version and review date, and archive old documents. Review dates are recorded metadata; they do not automatically send reminders. Uploaded files remain local and are available to the assistant when requested. Scanned PDFs may need OCR elsewhere.

On iPhone, connect Tailscale and open your private Serve address in Safari. Use the page picker at the top to switch screens and the chat button to open the full-screen assistant. Calendar uses a vertical day list. The inbox switches between list and reading views. Add to Home Screen is available in Safari’s Share menu; the Mac must remain awake and the server running. This is a connected local app, with no offline mode.


## Business operations (0.8.0)

Business now includes Client onboarding, Renewals & reviews, Time & profitability, Meeting notes and Notifications. Tools includes Backups & restore. The desktop app and Tailscale Serve both use localhost:4320; your private address remains https://catlins-macbook-air.tail9bef0e.ts.net/.

- Onboarding templates use one checklist step per line, optionally followed by `| days after start`. Starting a checklist creates real linked tasks, not signed contracts, invoices or payment confirmations.
- Renewal reminders include saved reminders plus document review dates and contract/service renewal dates. Recurring reminders advance by calendar months, with month-end handling. Completing a reminder does not record payment.
- Time entries contain work date, minutes, project and internal hourly cost. One timer can run at a time and is saved across reloads; timers over 24 hours must be discarded and corrected manually. Timer time is attributed to its start date. Profitability subtracts recorded labour and project-linked expenses from issued invoice revenue, not bank cash. Missing labour costs are flagged. Avoid entering labour twice in time and expenses.
- Meeting notes accept text/transcripts and browser recording/dictation. Browser speech support varies; imported audio needs a transcript. Audio stays on the Mac. GPT uses a restricted proposal tool for meeting analysis and cannot create tasks or send mail in that mode. Approve or decline each proposed task or email draft; sending remains separate. Edited source notes invalidate older proposals.
- Notifications are in-app, with read, snooze and dismiss controls. They are derived from current deadlines, renewal dates, invoice follow-ups, automation/report errors and disconnected accounts. Dismissed notifications reappear if the underlying issue changes. There are no external push/email notifications.
- Automatic backups run daily by default while the server is running and catch up after reopening. Keep 14 scheduled copies by default; manual/safety copies remain. Snapshots include SQLite business data, assistant Markdown memory, uploaded chat documents, media, attachments and meeting recordings. Keychain sign-ins and generated coding workspaces are excluded. Restore requires an explicit RESTORE confirmation, verifies checksums, creates a safety copy and retains current account connection settings. Automations, report schedules and scheduled posts are paused afterwards; pending approval requests are not replayed.
- Encrypted downloads use AES-256-GCM with a password-derived key. The password is never saved. Store the exported .vhqbackup file elsewhere yourself; no upload happens automatically. Importing adds it to the backup list without restoring it. Encrypted downloads are limited to 256 MB of source contents; imports are limited to 280 MB encrypted / 512 MB expanded.
