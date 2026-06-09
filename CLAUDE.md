# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Overlord is a multi-component remote agent management platform. The server is TypeScript on **Bun** (not Node.js). The client agent is Go. Operators use a web panel or Tauri desktop app; agents connect over encrypted WebSockets with MessagePack serialization.

## Repository Layout

| Directory | Language | What it is |
|---|---|---|
| `Overlord-Server/` | TypeScript/Bun | Web server, REST API, WebSocket handler, plugin runtime |
| `Overlord-Client/` | Go | Agent binary with capture, keylogger, file ops, plugins |
| `Overlord-Desktop/` | Rust + HTML (Tauri) | Desktop fat client wrapping the web UI |
| `BackstageCapture/` | C++ | DXGI screen capture DLL |
| `BackstageInjection/` | C++ | DLL injection component |
| `plugins/` | Multi-language | Plugin framework and samples (C, C++, Rust, Go) |
| `stress/` | JavaScript | WebSocket load/soak tests (10k–50k connections) |

## Build & Dev Commands

### Server (Overlord-Server/)

```bash
bun install                    # install deps
bun run dev                    # watch mode (bun --watch src/index.ts)
bun run start                  # build + run (build:css + vendor + bundle, then run dist/index.js)
bun run build                  # full build (CSS + vendor + bundle)
bun run build:bundle           # TS compile only → dist/index.js + worker-host.js
bun run build:css              # Tailwind CSS → public/assets/tailwind.css
bun run watch:css              # Tailwind watch mode
bun run build:prod:win         # compile to Windows .exe
bun run build:prod:linux       # compile to Linux binary
```

### Client (Overlord-Client/)

```bash
go mod tidy
go build ./cmd/agent           # build agent
go run ./cmd/agent             # run agent
```

Optional build tags: `overlord_webrtc` (WebRTC streaming), `turbojpeg` (faster JPEG encoding).

### Desktop (Overlord-Desktop/)

```bash
bun install
bun run vendor                 # copy fonts + icons
bun tauri dev                  # dev mode
bun run build:win              # NSIS installer
bun run build:mac              # DMG
bun run build:linux            # AppImage
```

### Full Dev Environment (from repo root)

```bash
start-dev.bat                  # Windows: starts server + client in separate terminals
./start-dev.sh                 # Linux/macOS equivalent
```

Sets `OVERLORD_DISABLE_AGENT_AUTH=true` and `OVERLORD_AGENT_TOKEN=dev-token-insecure-local-only` for local development.

### Docker

```bash
docker compose -f docker-compose.windows.yml up -d   # Windows/macOS
docker compose up -d                                   # Linux (host networking)
```

Default panel: `https://localhost:5173`, login `admin`/`admin`.

### Tests

```bash
# Server tests (Bun's built-in test runner)
cd Overlord-Server && bun test ./src

# Client tests (Go standard testing)
cd Overlord-Client && go test ./...
```

No linter or formatter is configured. TypeScript strict mode is enabled.

### Other Build Scripts (repo root)

- `build-clients.bat/.sh` — cross-compile agent for all OS/arch targets
- `build-prod-package.bat/.sh` — production package
- `generate-certs.bat/.sh` — self-signed TLS certs
- `build-backstage-capture-dll.bat/.sh` — C++ capture DLL
- `build-backstage-dll.bat/.sh` — C++ injection DLL

## Architecture

### Runtime & Database

The server runs on **Bun**, using `bun:sqlite` for an embedded SQLite database at `data/overlord.db`. There is no ORM — all queries are direct parameterized SQL via `db.run()` and `db.query()`. The Go workspace (`go.work`) ties `Overlord-Client` and `plugins/sample-go/native` together.

### Communication Protocol

Agents and the server communicate over WebSocket using **MessagePack** binary serialization (`@msgpack/msgpack` and `msgpackr`). Key message types: `hello`, `ping/pong`, `command`, `command_result`, `frame`, `status`, `plugin_event`, `notification`. The handshake begins with a `hello` containing client capabilities, followed by `hello_ack` from the server.

### Client Registry

Connected clients live in an **in-memory Map** (`clientManager.ts`), synced to SQLite in batches. Offline transitions use a grace period (default 7s) to avoid thrashing. A maintenance loop prunes stale clients (no activity > 60s) and sweeps heartbeats in configurable batches.

### Authentication & RBAC

JWT (HS256 via `jose`) with 500ms token verification cache. Three roles: `admin`, `operator`, `viewer`. Granular permissions per user: client allowlists/denylists, feature gates, plugin scope. MFA is TOTP-based. Sessions are tracked in the DB with IP/UA metadata and revocation support.

### HTTP Routes

38+ route handler modules in `src/server/routes/`. Each handler receives `(Request, URL, serverContext)` and returns `Response | null`. Routes cover auth, client control, builds, plugins, chat, file sharing, WebRTC negotiation, notifications, auto-scripts, and deployment.

### Plugin System

Plugins are zip bundles with native binaries (`.so`/`.dll`/`.dylib`) + web assets (HTML/CSS/JS) + optional `server.js`. Server-side plugin code runs in a dedicated **Bun Worker** thread with RPC (30s timeout). Each plugin gets an isolated SQLite DB at `plugins/{id}/data/plugin.db`. Plugins support C, C++, Rust, and Go via C-ABI shared libraries.

### Build Pipeline

The server can compile Go agent binaries on demand. Builds are mutex-locked per agent, rate-limited per user, and signed with JWT build tags. The agent validates the build tag on connection.

### Configuration

Config sources (precedence): environment variables (`OVERLORD_*`) → `data/save.json` (persisted runtime config) → defaults. See `.env.example` and `Overlord-Server/config.json.example` for all options.

### Frontend

Vanilla JavaScript (no framework) served from `Overlord-Server/public/`. Uses xterm.js (terminal), Monaco/Ace (editors), Chart.js, Tabulator, Cytoscape (network graph), GridStack (dashboard layout). Tailwind CSS for styling.
