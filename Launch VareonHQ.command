#!/bin/zsh
cd -- "${0:A:h}" || exit 1
VAREON_NODE="$(command -v node)"
if [[ -z "$VAREON_NODE" ]] || ! "$VAREON_NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
  VAREON_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$VAREON_NODE" ]]; then
  print "VareonHQ needs Node.js 24 or newer. Install it, then open this launcher again."
  read -k 1
  exit 1
fi
if /usr/bin/curl --silent --fail --max-time 2 http://localhost:4317/ >/dev/null; then
  /usr/bin/open http://localhost:4317
  exit 0
fi
print "VareonHQ is starting. Keep this window open while using the app."
(sleep 2; /usr/bin/open http://localhost:4317) &
"$VAREON_NODE" server/server.mjs
