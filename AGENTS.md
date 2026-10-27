# eve Agent App

This project uses the eve framework: an agent is a directory of files under `agent/`, and eve compiles and runs it.

For a content-only change to the root agent's identity, purpose, tone, or response guidelines, edit its existing authored instructions. Fresh projects use `agent/instructions.md`; a project may instead use `agent/instructions.ts` or files under `agent/instructions/`. You do not need to read the framework docs for a content-only instructions change. A fresh project already has its selected model in `agent/agent.ts`; preserve that file unless the user asks to change the model.

## Read the docs before writing code

```sh
ls node_modules/eve/docs
```

Start with `docs/README.md`: it maps each task to the page that covers it. Read that page before authoring tools, connections, channels, skills, subagents, schedules, or deployment. In a workspace or local package install, resolve the installed `eve` package location first. If the package docs are missing, use https://eve.dev/docs.

Use a bounded authoring loop:

1. Read the relevant page and inspect only files you will modify or need to imitate.
2. Stop discovery once the file location, imports, and definition shape are clear. Implement the smallest complete behavior the user requested.
3. Run one narrow verification. Expand investigation only when it fails or the request needs project-specific details.

Follow links or inspect public types only when the routed page leaves the task unanswered. Do not recursively glob `node_modules`, enumerate the entire docs tree, or read unrelated scaffold files when the direct path is known. Package-manager links can hide files from recursive glob tools even though direct reads work.

## Prefer an existing integration

When a task names an external product or service, search the registry before implementing its integration. For a generic capability, author a tool instead.

```sh
eve registry search <query> --json
eve registry view <item>
```

Prefer items whose `implementation` is `native`; use Chat SDK adapters when no native channel fits. `registry view` links the item's documentation.

Install without driving interactive prompts:

```sh
eve add <item> --non-interactive
```

Exit code 0 means setup completed, 1 failed, and 2 needs an answer or a prerequisite. On exit 2, run the `next.command` from the final NDJSON event. For a non-secret question, replace its `<JSON value>` answer placeholder with the answer you collected; string values need JSON quotes. Never pass a secret in `--answer`. See `docs/install-integrations.mdx` for setup prerequisites.

## Use eve for Vercel operations

Use eve to link and deploy Vercel projects:

```sh
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

A setup may report `eve link` as a prerequisite; run it, then retry the continuation. When a completed setup event has `deploymentRequired: true`, run the `next` command it reports.

## Validate the change

Run the validation the task requests. When it does not establish the behavior you changed, run the narrowest relevant check.

## VareonHQ design preferences

The owner now requires the Linear arrangement in a light theme (27 Oct 2026; a charcoal version was tried and rejected, the owner prefers light): the whole screen is one light colour (`--n-screen` #eceef1) and only the main content card is slightly lighter (`--n-base` #f8f9fb), rounded, with the only border, at low opacity. The sidebar and assistant sit on the screen colour with no borders or fills; panels inside the card are white with no outline. Type scale is fixed: H1 20px, H2 16px, H3 14px, H4 12px, H5 10px; nothing else. Official VareonHQ lime (#C6F432) is for primary actions and the active item; dark text on lime. No purple, no sage/olive/cream. Use the official VareonHQ logo. Check with `docs/design/layout-audit.js` (it also checks type scale and WCAG AA contrast). Edit `docs/design/system-source.css`, then run `node docs/design/compile-system-css.mjs`.

## Desktop runtime and business data

The installed app is `/Users/cjperry/Desktop/VareonHQ.app`. Its active business data is `/Users/cjperry/Library/Application Support/VareonHQ/business-data/`; the original `data/` directory is a preserved migration source, not necessarily current. Do not replace current business data with the development copy. Prefer reusing the active app on localhost:4317. Keep test content in an isolated temporary data directory. The desktop build bundles Node 24 and requires no development server. Rebuild after runtime source changes, close the owned app before replacing its bundle, then reopen it.

## Subscription and credential requirements

The GPT engine must use official ChatGPT-plan OAuth, never ask for an API key or silently fall back to API billing. Codex uses the local ChatGPT sign-in. The native helper `desktop/keychain.swift` handles full credential data over stdin/stdout; do not restore the broken `security -i` writer. Bundle the helper with the desktop app. Credentials use versioned `-v2` Keychain entries; failed legacy Outlook/GPT entries must be replaced by fresh sign-in. Run the opt-in native Keychain regression check when changing credential handling, using synthetic test entries only.

## Permanent private preview
The owner requires every update to be accessible and verified at https://catlins-macbook-air.tail9bef0e.ts.net/. Tailscale Serve proxies localhost:4320. Keep the backend bound to loopback, preserve the private-access owner checks, and make the desktop app reuse port 4320. Do not create public hosting or Funnel.
