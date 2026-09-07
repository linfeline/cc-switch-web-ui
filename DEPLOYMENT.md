# Deployment — cc-switch-web-ui (thin CLI wrapper)

This Web UI wraps an existing `cc-switch` binary. It does **not** write SQLite for
provider/MCP/prompt/skills/config mutations when a CLI path exists; reads without JSON
CLI support use a read-only SQLite adapter.

## Prerequisites

- Node.js ≥ 18
- `cc-switch` 5.10.x on `PATH` or set via `CC_SWITCH_PATH` (common: `~/.local/bin/cc-switch`)
- `sqlite3` CLI on PATH (read-only queries)
- `script` (util-linux) for non-interactive delete confirmations via PTY

## Configure

```bash
cd /path/to/cc-switch-web-ui
cp .env.example .env   # or edit the existing .env
```

Required / recommended env:

| Variable | Purpose | Example |
|----------|---------|---------|
| `CC_SWITCH_PATH` | Binary path | `$HOME/.local/bin/cc-switch` |
| `CC_SWITCH_CONFIG_DIR` | Optional data dir override | `/tmp/cc-switch-web-sandbox` |
| `PORT` / `HOST` | Listen address | `3010` / `127.0.0.1` |
| `ADMIN_PASSWORD` | Bearer token for `/api/*` (except `/api/health`, `/api/auth`) | set a real secret |

**Never** run mutation tests against the real `~/.cc-switch`. Always set
`CC_SWITCH_CONFIG_DIR` to a temp sandbox for write tests.

## Install & build

```bash
cd /path/to/cc-switch-web-ui
npm install
npm run build
```

## Start (development — Vite middleware)

```bash
cd /path/to/cc-switch-web-ui
# Real DB, read-heavy UI (mutations will affect real data — be careful)
# export CC_SWITCH_PATH=$HOME/.local/bin/cc-switch   # optional if auto-detected
# unset CC_SWITCH_CONFIG_DIR
npm run dev
```

Open: http://127.0.0.1:3010  
Health: http://127.0.0.1:3010/api/health  
Auth header: `Authorization: Bearer <ADMIN_PASSWORD>`

## Start (production build)

```bash
cd /path/to/cc-switch-web-ui
export NODE_ENV=production
# export CC_SWITCH_PATH=$HOME/.local/bin/cc-switch   # optional if auto-detected
export HOST=127.0.0.1
export PORT=3010
npm run build
npm start
```

## Sandbox smoke test (safe writes)

```bash
cd /path/to/cc-switch-web-ui
npm run test:sandbox
```

This script creates a temporary `CC_SWITCH_CONFIG_DIR`, runs add/switch/delete via the
adapter (CLI-backed), verifies unsupported edits do not mutate data, exercises WebDAV
set/show/error paths without real credentials, and never touches `~/.cc-switch`.

## Read-only check against real DB

```bash
cd /path/to/cc-switch-web-ui
npm run test:readonly-real
```

Lists providers/MCP/prompts via the SQLite reader against `~/.cc-switch` without mutations.

## Backend mode

- **Mutations**: `cc-switch` CLI (`provider add/switch/delete`, `mcp enable/disable/sync`,
  `deeplink` for MCP/prompt **create**, skills/config/WebDAV commands). Deletes use a PTY confirm wrapper.
- **Unsupported edits**: `provider edit`, `mcp edit`, and prompt **content** edit are interactive-only in
  5.10.4. The web UI returns a clear `Unsupported:` error and does **not** delete+recreate.
  Prompt name/description can use `prompts rename`.
- **WebDAV**: Config page + `/api/config/webdav*` call only
  `cc-switch config webdav` (`show`, `set`, `check-connection`, `upload`, `download`).
  No direct settings-file or SQLite writes for WebDAV.
- **Reads**: read-only `sqlite3 -readonly` against `cc-switch.db` (isolated in `sqlite-reader.ts`),
  with `PRAGMA user_version` detection (expects schema 18; warns otherwise and uses dynamic `enabled_*` columns).
- **JSON CLI**: used where available (`settings show --json`, `provider quota --json`).

## Optional systemd user unit sketch

```ini
[Unit]
Description=cc-switch-web-ui
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/cc-switch-web-ui
Environment=NODE_ENV=production
Environment=CC_SWITCH_PATH=%h/.local/bin/cc-switch
Environment=HOST=127.0.0.1
Environment=PORT=3010
EnvironmentFile=/path/to/cc-switch-web-ui/.env
ExecStart=/usr/bin/node dist/server/index.js
Restart=on-failure

[Install]
WantedBy=default.target
```

Adjust `WorkingDirectory`, `EnvironmentFile`, `CC_SWITCH_PATH`, and `ExecStart` to match
your install (`which node`, `which cc-switch`).
