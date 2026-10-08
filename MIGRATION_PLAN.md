# CallCRM Migration Plan — Cloudflare → Oracle VPS

**Scope:** Infrastructure only. Same product, new hosting. No feature, UI, workflow, label, or business-rule changes.
**Status:** APPROVED & in execution — **Phase 0 complete** (recovered + verified, §12) and **local verification complete** (backend runs under `wrangler dev`, full agent flow green, §13). Blocked on Phase 1 prerequisites (§11: Oracle VPS + CF DNS access).

---

## 0. Principles

- Same CallCRM application, new infrastructure. NOT a rebuild.
- API contracts frozen exactly as the existing frontend + mobile app already speak them.
- Google Sheets remains ★ GOD LEAD FILE ★ (source of truth for lead data).
- Cloudflare = DNS/domain only (lakshmiclub.com already on Cloudflare).
- Validate fully before switching any traffic.

---

## 1. Inspection Findings (what exists today)

### 1.1 Clients (intact, in `crm-app/`)

| Client | State | Notes |
|---|---|---|
| Admin web (`frontend/`) | Working, built | All API calls are **relative** (`/api/*`, `/ws/chat`) + cookie auth (`credentials: "include"`, httpOnly `crm_token`) |
| Android agent app (`mobile/`) | Source intact | Absolute base URL placeholder `https://YOUR-BACKEND.example.com` + `wss://…/ws/chat?token=` (Bearer auth) |

### 1.2 Previous backend (deleted per earlier instruction — recoverable)

The Cloudflare Worker + D1 were destroyed (no live copy). However, **the full backend source is recoverable from this tool's session database** (`opencode.db`, 53k messages): every file was read/edited in prior sessions. Known recoverable tree:

```
src/api/index.ts, types.ts
src/api/db/schema.ts, migration.sql, seed.sql, index.ts
src/api/routes/ auth, leads, leads-admin, sessions, devices, agents, dashboard,
               followups, chat, notifications, audit, sheets, sync, pools, export, import
src/api/lib/   auth, utils, google-auth, google-sheets, sheet-helpers
src/api/services/ google-sheets-sync, push-notifications, followup-assign
src/api/durable/ lead-reservation, chat-room
```

Also recoverable: `wrangler.toml`, exact route table, D1 schema (`migration.sql`), seed data (`seed.sql`), Sheet sync logic, DO/queue/cron behavior.

### 1.3 Data

| Data | Status | Source for new system |
|---|---|---|
| Leads (2,934 rows) | ✅ intact | GOD Sheet `Super Lead` tab (verified accessible via service account) |
| VIP leads | ✅ intact | Sheet `VIP⭐` tab |
| Responses | ✅ intact | Sheet `Responses` tab |
| Audit history | ✅ intact | Sheet `Audit` tab (Timestamp, User, Action, Details, IST Timestamp) |
| Attendance history | ⚠️ tab exists but empty | nothing to migrate |
| Users/agents, passwords, devices, sessions, chat, notifications, pools, sync cursors | ❌ lost with D1 (deleted as instructed, no backup) | re-seed: admin account, agent accounts (new device codes), config defaults from recovered `seed.sql` |

Sheet columns (`Super Lead`/`VIP⭐`): `Account, Account Type, Date, Name, POI, Phone, Address, Email` — **no Lead-ID or status columns**, so the new sync must introduce the stable `LEAD-######` identity mapping (§8 of spec), keyed on data (phone+account), never on row number.

### 1.4 DNS

- `lakshmiclub.com`, `www` → already Cloudflare (proxied). ✅ CF as DNS provider confirmed.
- `crm.`, `api.` → do not exist yet (to be created, DNS-only/unproxied, pointing at the VPS).

### 1.5 Tooling on this machine

node 24 ✅, git ✅, ssh ✅ — docker/psql/openssl not installed locally (VPS-side install; local only needed for code + tests).

---

## 2. Target Architecture

```
Google Sheets ★ GOD LEAD FILE ★
        │ incremental sync (both directions, idempotent, queued retries)
        ▼
Oracle Always-Free VPS  (Docker Compose)
        ├── nginx            :443/80  → TLS (Let's Encrypt), static admin web, reverse proxy
        ├── callcrm-api      :8080    → REST API + WebSocket (same codebase, ported)
        ├── callcrm-sync     —        → Google Sheets sync service (separate container/process)
        ├── postgres         :5432    → internal only (not published to internet)
        └── (volumes)        pgdata, certs, logs
                │
   crm.lakshmiclub.com → static admin + /api + /ws (proxied to api container)
   api.lakshmiclub.com → Android agent app (https + wss)
```

Key decisions (chosen to keep clients 100% unchanged):

1. **Same-origin admin**: nginx serves the admin SPA and proxies `/api/*` and `/ws` to the API container → relative URLs and cookie auth work exactly as before, **zero frontend changes**.
2. **Mobile**: one config line `BASE_URL/WS_URL → https://api.lakshmiclub.com` (infrastructure configuration, allowed) + APK rebuild.
3. **Cloudflare**: A records for `crm` and `api` in DNS-only mode; certificates via certbot on the VPS (Cloudflare not in the traffic path).

---

## 3. Component Mapping (old → new)

| Cloudflare (old) | Oracle (new) | Behavior preserved by |
|---|---|---|
| Worker (Hono-style router, `src/api/routes/*`) | Node.js API container | Recovered source; routes/contracts copied verbatim, only I/O layer swapped |
| Cloudflare D1 (SQLite) | PostgreSQL 16 (internal) | Recovered `migration.sql`/`schema.ts` ported D1→PG; same tables/columns/constraints (incl. `sessions` CHECK `ACTIVE/PAUSED/ENDED`) |
| Durable Object `LeadReservation` | PG-backed reservation (atomic `UPDATE … WHERE` + TTL sweep, single-node lock) | Same one-lead-at-a-time reservation semantics |
| Durable Object `ChatRoom` | in-process WS hub (`ws`) + PG message store | Same chat/online/last-seen semantics |
| Queue `notification-queue` | PG job/outbox table + worker loop (retry with backoff) | Same push-notification delivery behavior |
| Cron trigger | Scheduler inside api/sync containers (restart-safe) | Same scheduled jobs (follow-up assignment etc.) |
| Workers Assets (static hosting) | nginx serving `frontend/dist` | Identical SPA |
| `env.*` secrets | Docker env / `.env` file (chmod 600, never in repo/image) | — |
| Workers WebSocket (Durable Objects) | `ws` behind nginx `Upgrade` | `/ws/chat` (cookie, web) and `/ws/chat?token=` (mobile) |

Framework note: exact runtime framework is confirmed in Phase 0 from recovered source; if it is Hono, it runs on Node nearly unchanged (`@hono/node-server`), minimizing any porting risk.

---

## 4. Function-Preservation Matrix (spec §10–13)

| Existing function | Preserved via | Verified by |
|---|---|---|
| Lead eligibility, DNC, converted, reserved, attempts, pools, calling hours, priority, one-at-a-time | Recovered route/service logic (`leads.ts`, `lead-reservation`, `pools.ts`, `followup-assign.ts`) runs unchanged over PG | Lead-flow tests (§16 items 14–17) |
| Device registration, codes, binding, status lifecycle, force logout, crypto identity | `devices.ts` + `auth.ts` ported verbatim; device keys stored in PG | Items 13 (registration/login) |
| Attendance: OUT→IN, timestamps, pause/resume, working time, reopen recovery | `sessions.ts` ported; PG persists sessions | Item 14 |
| Chat admin↔agent, history, read/unread, online/last-seen, lead refs | `chat.ts` + WS hub | Item 18 |
| Notifications + push (Expo) | `notifications.ts` + `push-notifications.ts` + PG job queue | Item 19 |
| Audit logs | `audit.ts` (writes to PG; Sheet `Audit` tab sync preserved) | Item 20 |
| Sheets connect/status, sync now, sync status | `sheets.ts`, `sync.ts`, `google-sheets-sync.ts` ported | Item 9 |
| Roles/permissions (SUPERADMIN/ADMIN/AGENT), cookie + Bearer auth | `lib/auth.ts` (same secret env, same tokens/cookies) | Items 11–12 |
| Dashboard stats, export/import | `dashboard.ts`, `export.ts`, `import.ts` | Items 10, 21 |

**Frozen API inventory** (from client code; exact methods/bodies cross-checked against recovered routes in Phase 0):

```
auth:     POST /api/auth/login|logout|device-login, GET /api/auth/me|profile
agents:   GET/POST /api/agents, agent mutation endpoints, POST /api/agents/generate-code
devices:  GET /api/devices, POST register-code|register|delete|assign|push-token, /api/devices/{action}
sessions: GET /api/sessions/current, POST clock-in|pause|resume|clock-out,
          POST /api/sessions/{id}/heartbeat, GET attendance|attendance/history
leads:    GET /api/leads/next|current|search|{id}|{id}/history,
          POST /api/leads/{id}/respond,
          GET /api/leads/admin/all|responses|followups, GET /api/leads/my/responses
followups:GET /api/followups, /api/followups/mine
chat:     GET conversations|online|{id}/messages, POST {id}/read|conversations, WS /ws/chat
notify:   GET /api/notifications, unread-count; POST {id}/read|read-all|broadcast
audit:    GET /api/audit
sheets:   GET /api/sheets/status, POST /api/sheets/connect
sync:     GET /api/sync/status, POST /api/sync/now
dashboard:GET /api/dashboard/stats
+ routes recovered from source: pools, export, import
```

---

## 5. Data Migration

1. **Schema**: port recovered `migration.sql` → PostgreSQL (same table/column/constraint names; D1 type equivalents only).
2. **Leads**: bootstrap from GOD Sheet (2,934 + VIP rows):
   - Assign permanent `LEAD-000001…` IDs on first import (deterministic, unique).
   - Maintain `sheet_row_map (lead_id, tab, row_key)` — row position is never identity.
   - Add a `Lead ID` column written back to the Sheet so identity survives row inserts/sorts/deletes (spec §8).
3. **Responses / Audit**: import from Sheet tabs (they are the surviving copies of that history).
4. **Re-seed** (D1 data lost): SUPERADMIN login, agent accounts (fresh device registration codes — the *workflow* is unchanged, just new activations), config/pool defaults from recovered `seed.sql`, empty chat/notifications/sessions.
5. Lead status fields (attempts, DNC, etc.) — the Sheet does not carry them, so after bootstrap they live in PG and are surfaced back per existing sync behavior (confirmed against recovered sync source in Phase 0).

---

## 6. Sync Design (spec §5–9)

Ported from recovered `google-sheets-sync.ts`, extended only where the spec demands:

- **Sheet → PG (incremental):** change detection via per-tab cursor (modified-time/range watermark) + content hashing; only changed rows applied; `updated_at`/`version` per row; unique constraints prevent duplicates; upsert keyed by `lead_id` (never row index).
- **PG → Sheet (background):** CRM writes PG first, returns immediately; outbox jobs push responses/follow-ups/DNC/conversions to the Sheet asynchronously (user never waits on Google).
- **Idempotency:** every job keyed (`job_key = op + entity + version`), applied exactly once; write-backs guarded to prevent loops (a Sheet-origin change never re-triggers a Sheet write for the same version).
- **Outage handling:** PG is authoritative for operations during Sheet downtime; pending outbox retained with retry/backoff; sync resumes automatically; nothing is discarded; sync status visible via existing `/api/sync/*` endpoints.
- **Sheet remains authoritative for lead identity/core fields** per GOD-file rule; conflicts resolved by the same precedence rules the recovered code already implements (verified in Phase 0).

---

## 7. Security (spec §14–15)

- HTTPS only via certbot + nginx; HTTP→HTTPS redirect.
- PostgreSQL: bound to docker internal network only, no published port; strong password in `.env`.
- Secrets (Google service-account key, JWT secret, DB URL) only in VPS `.env` (0600) — never in repo, image, web bundle, or APK.
- Google credentials used **only** by the api/sync containers; frontend/mobile never see them (current state already true — preserved).
- Firewall (UFW): 22/80/443 only.

---

## 8. Deployment & Operations (spec §18–19)

- `docker-compose.yml`: postgres (volume + healthcheck), api (depends_on healthy pg), sync, nginx; `restart: unless-stopped` everywhere → VPS reboot self-recovers (pg → api → sync → pending sync resumes).
- Nightly `pg_dump` (retention 14 days) + optional off-box copy; Sheet remains an independent lead-data recovery source.
- Structured logs per container + sync log; `docker compose logs` + log rotation.
- Health endpoints exposed (`/api/health`, pg healthcheck) for monitoring.
- Deploy = `git pull`-free flow (rsync/build on VPS or buildx images), `docker compose up -d` for safe restarts.

---

## 9. Phased Execution (with validation gates)

| Phase | Work | Gate before proceeding |
|---|---|---|
| **0. Recover** | Extract backend source from session DB → reconstruct `src/api/` in `crm-app/server/`; diff every route vs frontend/mobile call sites | Route inventory 100% matches client contracts; `migration.sql`/`seed.sql` present |
| **1. Provision** | Oracle Always-Free VPS, SSH keys, docker compose, firewall, base dirs | SSH + docker + empty compose stack running |
| **2. Port** | D1→PG, DO→PG locks, queue→PG jobs, cron→scheduler, env config; **no route/logic edits** | Unit smoke: server boots, all routes registered, schema applies |
| **3. Data bootstrap** | Sheet→PG lead import, IDs, Responses/Audit import, re-seed users/config | Row counts match Sheet (2,934+VIP), IDs unique, admin login works locally |
| **4. Sync** | Incremental Sheet↔PG both directions, outbox/retry, loop/idempotency tests | Offline/online outage tests pass; no duplicates; no loops |
| **5. Pre-cutover validation** | Run full checklist (§16 items 9–22) on VPS over `http://<vps-ip>` + mobile against api host via staging: auth, devices, attendance, lead assignment, calling, responses, follow-ups, chat, notifications, audit, admin UI, restrictions, import/export | **All items pass; zero regressions vs approved app** |
| **6. Cutover** | Cloudflare DNS: `crm`/`api` A records (DNS-only) → VPS; certbot certs; HTTPS live; rebuild APK with `https://api.lakshmiclub.com`; smoke-test prod | Production smoke suite passes on both clients |
| **7. Harden** | Backups verified (restore test), reboot test, log rotation, monitoring | Reboot restores full service incl. pending sync |

Rollback: DNS records can be repointed instantly; nothing live is replaced before Phase 6 (the old CF stack was already removed earlier, so clients are currently dark — cutover only adds service).

---

## 10. Explicit Non-Goals

- No UI/design/workflow/label changes (except the one infrastructure URL config in the mobile app).
- No new features, no removals, no "improvements" to business logic.
- No change to Google Sheets structure beyond the added `Lead ID` identity column (required by spec §8).
- Cloudflare stays DNS-only — no Workers, no D1, no CF backend.

---

## 11. Prerequisites / Open Items

1. **Oracle Cloud**: account + Always-Free VPS (IP, SSH user/key) — provision manually or I guide it.
2. **DNS access**: ability to add two A records for `crm.` / `api.` in the Cloudflare zone for `lakshmiclub.com` (dashboard, or a scoped API token).
3. **Google service account** key exists locally (`dialing-crm-b6c13a49695c.json`) and is verified working → will be moved to VPS `.env` only.

---

## 12. Phase 0 — Recovery & Verification Record (2026-10-08)

### 12.1 Recovery method

Backend source replayed from `opencode.db` (tool history) by `recover8.js`: chronological read/edit/write ops, edits with replace-all semantics, a bootstrap wipe at `t=1789405685670` and 16 dev-phase file deletions re-applied, destruction phase excluded via `T_CUT=1790555375811` (first `Remove-Item wrangler.toml`). Output: 37 files in `crm-app/server/`.

### 12.2 Verification results

| Check | Result |
|---|---|
| Byte-identical to last full read (ground truth) | 24 / 37 files |
| Built from ground-truth read + successfully replayed edits after it | 12 files (single audit-era edit each, all replayed OK) |
| `package.json` | only diff was a local `--save-exact` pin → reverted to `^0.44.0` |
| Failed replays (5 edits: leads.ts ×1, devices.ts ×2, sessions.ts ×2) | **benign** — all 5 succeeded originally but were later clobbered by full re-reads; each of the 3 files has 5–17 successful full reads *after* the failed edits and all post-read edits replayed OK |
| Files never read from history | only `node_modules/**` + `package-lock.json` (both regenerable) |
| `npx tsc --noEmit` | 4 pre-existing errors in `src/api/services/google-sheets-sync.ts` (db.batch typing, lines 181/201/217/253) — file is **byte-identical to ground truth**, so errors exist in the original code; harmless because wrangler deployed via esbuild. Will be rewritten in Phase 2 with the PG port anyway |
| Install | `npm install --legacy-peer-deps` (wrangler@4 pulls workers-types v5 vs project pin ^4) |

### 12.3 Route inventory vs client contracts (gate)

Backend mounts (`src/api/index.ts`): `/api/{auth,agents,devices,sessions,leads,sheets,dashboard,audit,export,followups,leads-admin,leads/admin,sync,chat,notifications}` + `GET /api/health` + `GET /ws/chat` (cookie-or-query token → ChatRoom DO).

Every client call site resolves to a recovered route:

| Client calls | Backend route(s) |
|---|---|
| `POST auth/login`, `POST auth/logout`, `GET auth/me`, `POST auth/device-login`, `GET auth/profile` | ✓ all |
| `agents` GET/POST/PATCH/DELETE `/`, `POST /generate-code` | ✓ all |
| `devices` GET `/`, `POST /register-code|register|assign|delete|push-token`, `POST /devices/{approve,revoke,force-logout,reactivate}` | ✓ all |
| `sessions` `GET /current|attendance|attendance/history`, `POST /clock-in|clock-out|pause|resume|:id/heartbeat` | ✓ all |
| `leads` `GET /current|search|:id|:id/history|my/responses`, `POST /next|:id/response|:id/respond`, `followups/mine`, `leads/admin/{all,responses,followups}` | ✓ all |
| `dashboard/stats`, `audit`, `sheets/{status,connect}`, `sync/{status,now}` | ✓ all |
| `chat` `conversations` GET/POST, `…/:id/messages`, `…/:id/read`, `online` | ✓ all |
| `notifications` `GET /?category`, `POST /:id/read|read-all|broadcast`, `GET /unread-count` | ✓ all |
| `WS ws(s)://host/ws/chat` (web, cookie) / `?token=` (mobile) | ✓ |

Backend-only routes kept (no client callers, preserved for fidelity): `auth/refresh`, `devices/challenge|verify|my`, `leads/release`, `leads-admin/stats`, `followups` admin `GET /`, `sheets/preview`, `export`, `notifications POST /`.

**Phase 0 gate: MET** — route inventory matches client contracts 100%; `db/migration.sql` + `db/seed.sql` present.

---

## 13. Local Verification Record (2026-10-08) — pre-Phase-1 checkpoint

User chose "run locally to check" before VPS provisioning. Backend runs unmodified (except one defect fix, below) under `wrangler dev` local mode.

### 13.1 How to run locally

```
cd crm-app/server
npm install --legacy-peer-deps          # once
npx wrangler d1 execute crm-d1 --local --file=src/api/db/migration.sql   # once (baseline)
# then apply the prod-alignment SQL (Temp\opencode\local-align.sql — see 13.3)
npx wrangler dev --port 8787            # worker: http://localhost:8787
cd ../frontend
$env:VITE_API_TARGET="http://localhost:8787"; npx vite --port 5173   # UI: http://localhost:5173
```

Notes: `server/frontend` is a directory junction → `../frontend` (satisfies wrangler.toml `assets.directory` without editing the original file). `wrangler.toml` was restored byte-identical from session history (it was destroyed with the rest). Cron does not auto-fire in dev: `curl http://127.0.0.1:8787/cdn-cgi/local/scheduled`.

### 13.2 Results — all green

| Area | Result |
|---|---|
| Boot / bindings | D1, both DOs, queue, cron, assets all `local` |
| Schema | local D1 = **prod-final 15 tables** (see 13.3) |
| Auth | admin login (cookie+Bearer), /me, refresh-ready JWT (HS256, `dev-secret`) |
| Sheet sync | `sheets/connect` → live GOD Sheet `CRM DIALER` (5 tabs); `sync/now` imported **2,934 leads in 1s, HEALTHY, 0 errors**; cron path runs clean |
| Dashboard / leads | totalLeads 2934, leads-admin pages, followups, audit-adjacent endpoints 200 |
| WebSocket chat | `/ws/chat` connects, presence broadcast received (after fix, 13.3-b) |
| Web UI plumbing | vite:5173 → proxy → worker, login sets `crm_token` (HttpOnly/Secure/SameSite=Lax), cookie-authed /me + dashboard through proxy |
| **Full agent flow** | create agent → device register → approve → device-login → clock-in → **leads/next (DO reservation)** → leads/current → sessions/current → dashboard agentsIn=1 → clock-out — **11/11 PASS** |
| Notifications / devices / attendance | 200, empty-state correct |

Not yet exercised (Phase 5 checklist on VPS): response **submit** (writes to the live Sheet's Responses tab — intentionally skipped locally), push-notification delivery, export, attendance history with data, mobile app against local worker.

### 13.3 Pre-existing defects discovered (ground truth for Phase 2/3)

1. **`seed.sql` bcrypt hash is invalid** — `admin123` does not verify against the stored hash (hash was written into the seed without ever being generated; no generation command exists in history). Local DB was seeded with a freshly generated valid hash for `admin@crm.com`/`admin123`. **Phase 3 must regenerate the seed hash**, keep the file otherwise.
2. **`/ws/chat` was broken by construction** — `stub.fetch(urlString)` creates a request without `Upgrade: websocket`, so the DO's 101 response is rejected by workerd (same binary in prod ⇒ chat WS could never have worked). Minimal fix applied in `server/src/api/index.ts`: `stub.fetch(new Request(wsUrl, { headers: { Upgrade: 'websocket' } }))`. No contract/behavior change — restores intended behavior (spec chat feature).
3. **Schema drift: `migration.sql` ≠ prod schema** — prod-final D1 had exactly **15 tables**: `users, devices, agent_sessions, session_pauses, lead_reservations, audit_logs, settings, leads, responses, sync_state, chat_conversations, chat_participants, chat_messages, notifications` (+ internal). `migration.sql` lacks `leads/responses/sync_state/chat_*/notifications` (they were created by ad-hoc DDL recorded in session history) and contains 5 tables **never in prod** (`call_activities, dnc_suppression, lead_pools, agent_pools, import_batches` — no code references them), and its `users` CHECK omits `SUPERADMIN` (prod recreated users to allow it; devices also gained `push_token`/`platform` via ALTER). The prod-alignment SQL (adds + drops + ALTERs) is preserved at `Temp\opencode\local-align.sql`. **Phase 2 must build the PG schema from prod-final, not from `migration.sql`.**
4. **`package.json` `db:seed` script references `src/api/db/seed.ts` which never existed.**
5. **Lead IDs** produced by sync are of the form `sheet_<rowref>_<n>` (e.g. `sheet_1nkrzx_1`), not `LEAD-######` — §6 wording should follow the actual generator in `google-sheets-sync.ts`.

Note: `admin@crm.com` logins and test-agent creation append rows to the Sheet **Audit** tab (designed behavior of the app while connected to the live Sheet).
