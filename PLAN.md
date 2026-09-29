# Plan: KanbanBoard → Project Management System with Node/Express Backend

## 0. Confirmed decisions

| Area | Decision |
|---|---|
| DB / ORM | PostgreSQL 16 (local, running on port 5433) + Prisma |
| Backend | New `backend/` folder, Node + TypeScript + Express |
| Auth | JWT in **httpOnly cookie**, bcrypt password hashing, Vite dev proxy (no CORS pain in dev). Split deploys: `VITE_API_URL` on the frontend + `CLIENT_ORIGIN`/`PUBLIC_URL`/`COOKIE_SAMESITE=none` on the API |
| Realtime | Socket.IO (replaces Supabase `postgres_changes`) |
| Invites | Invite links/codes + optional SMTP email delivery (off until `SMTP_HOST` is set) |
| Notion pages | **Out of scope** — Kanban + rich tasks only |
| Tests | Backend (Vitest + Supertest) + some frontend (Vitest + RTL) |
| Entity naming | Keep `Card` (Trello convention, avoids repo-wide rename); UI copy can say "task" |

**V1 feature scope (confirmed):** teams/workspaces + roles, task fields (assignee, priority, labels, due date), checklists/subtasks, comments & activity log, in-app notifications, multiple views (kanban/list/table/calendar).

---

## 1. Target architecture

```
KanbanBoard/
├── .gitignore  PLAN.md          # repo root — no package.json (each app owns its deps)
├── frontend/                    # SPA — its own package.json / node_modules
│   ├── package.json             # scripts: dev, build, lint, typecheck, test, preview
│   ├── index.html               # entry; /src/main.tsx
│   ├── vite.config.ts           # proxy: /api and /socket.io → localhost:4000
│   ├── vitest.config.ts  tsconfig*.json  eslint.config.js
│   ├── tailwind.config.js  postcss.config.js  .env.example   # VITE_API_URL (build time)
│   └── src/                     # components/, contexts/, hooks/, lib/, pages/
└── backend/                     # NEW
│   ├── package.json          # express, prisma, socket.io, zod, jsonwebtoken, bcrypt...
│   ├── tsconfig.json
│   ├── .env.example          # DATABASE_URL, JWT_SECRET, PORT=4000, CLIENT_ORIGIN,
│   │                         # PUBLIC_URL, COOKIE_SAMESITE, SMTP_*, REDIS_URL, OTP_*
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts           # replaces scripts/seed-database.js
│   ├── src/
│   │   ├── index.ts          # http server + socket.io bootstrap
│   │   ├── app.ts            # express app (importable for supertest)
│   │   ├── config/env.ts
│   │   ├── lib/prisma.ts
│   │   ├── middleware/       # auth.ts, requireRole.ts, errorHandler.ts, validate.ts
│   │   ├── routes/           # auth, users, teams, invites, boards, lists, cards,
│   │   │                     # labels, checklists, comments, notifications
│   │   ├── services/         # boardService, cardService, activityService, positionService
│   │   ├── realtime/socket.ts
│   │   └── tests/
│   └── vitest.config.ts
└── (supabase/  scripts/  src/lib/supabase.ts   # DELETED after the port)
```

**Dev flow (two terminals — no root orchestrator):**
```bash
npm --prefix backend run dev     # Express + socket.io  → :4000
npm --prefix frontend run dev    # Vite                 → :5173
```
Browser talks to same origin; Vite proxies `/api` and `/socket.io` (ws: true) to :4000, so the auth cookie behaves exactly like a same-site deploy.

**Production flow (two Render services):** build the SPA with `VITE_API_URL=<api origin>` (inlined at build) and set `CLIENT_ORIGIN`/`PUBLIC_URL` = the site URL plus `COOKIE_SAMESITE=none` on the API — `*.onrender.com` subdomains are cross-site (onrender.com is a public suffix), so a `lax` cookie would never be sent back.

---

## 2. Data model (Prisma)

Port the existing 3 tables, then extend:

**Existing (ported):**
- `User` — id, email (unique), passwordHash, name, avatarColor, createdAt *(new; replaces `auth.users`)*
- `Board` — id, teamId, title, description, background, createdById, timestamps
- `List` — id, boardId, title, position
- `Card` — id, listId, title, description, position, dueDate, priority (`NONE|LOW|MEDIUM|HIGH|URGENT`), cover, createdById, timestamps

**New:**
- `Team` — id, name, createdById, timestamps
- `TeamMember` — (teamId, userId) PK, role `OWNER|ADMIN|MEMBER`, joinedAt
- `Invite` — id, code (nanoid, unique), teamId, role, createdById, expiresAt, revokedAt, usedByIds
- `Label` — id, boardId, name, color *(replaces `labels text[]` on cards)*
- `CardLabel` — (cardId, labelId) PK
- `CardAssignee` — (cardId, userId) PK *(multi-assignee, Trello-style)*
- `Checklist` — id, cardId, title, position
- `ChecklistItem` — id, checklistId, text, done, position
- `Comment` — id, cardId, authorId, body, timestamps
- `Activity` — id, actorId, boardId, cardId?, type (enum: `CARD_CREATED/CARD_MOVED/CARD_UPDATED/COMMENT_ADDED/MEMBER_JOINED/...`), metadata Json, createdAt
- `Notification` — id, recipientId, actorId, type (`ASSIGNED|COMMENTED|MENTIONED|INVITE_REDEEMED|DUE_SOON`), cardId?, boardId?, readAt?, createdAt

**Schema notes:**
- Indexes: `lists(board_id, position)`, `cards(list_id, position)`, `teamMembers(userId)`, `notifications(recipientId, readAt)`, `activity(boardId, createdAt)`.
- `updated_at` maintained by Prisma `@updatedAt` (replaces SQL triggers).
- Cascade deletes: board → lists → cards → checklists/comments/labels.

---

## 3. Backend API (REST, all under `/api`)

**Auth** (`routes/auth.ts`)
- `POST /auth/register` {email, password, name} → creates user + **auto-creates "Personal" team (OWNER)** + optional "Getting Started" welcome board
- `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`

**Users** — `GET /users?q=` (search for assign/invite)

**Teams**
- `GET /teams` · `POST /teams` · `GET /teams/:id` (with members) · `PATCH /teams/:id` · `DELETE /teams/:id`
- `PATCH /teams/:id/members/:userId` {role} · `DELETE /teams/:id/members/:userId`
- `POST /teams/:id/members` {email} — add existing user directly

**Invites**
- `POST /teams/:id/invites` {role, expiresInDays} → {code, url}
- `POST /teams/:id/invites/email` {email, role, expiresInDays} → creates an invite and emails the link (503 when SMTP is off, 502 when the send fails — the invite is rolled back)
- `GET /teams/:id/invites` → {invites, emailConfigured} · `DELETE /invites/:id` (revoke)
- `GET /invites/:code` (preview: team name/role) · `POST /invites/:code/redeem` (logged-in user joins)

**Boards**
- `GET /boards?teamId=` (only user's teams) · `POST /boards` · `GET /boards/:id` (**full payload: lists + cards + labels + members**) · `PATCH /boards/:id` · `DELETE /boards/:id`

**Lists**
- `POST /boards/:boardId/lists` · `PATCH /lists/:id` · `DELETE /lists/:id`

**Cards**
- `POST /lists/:listId/cards`
- `GET /cards/:id` — full detail: assignees, labels, checklists, comments, recent activity
- `PATCH /cards/:id` {title, description, dueDate, priority, cover}
- `DELETE /cards/:id`
- `POST /cards/:id/move` {listId, index} — **single transaction, reindexes affected lists** (replaces the current N-request `Promise.all` in `Board.tsx:432`)
- `POST /cards/:id/assignees` {userId} · `DELETE /cards/:id/assignees/:userId`
- `POST /cards/:id/labels` {labelId} · `DELETE /cards/:id/labels/:labelId`

**Labels** — `POST /boards/:boardId/labels` · `PATCH/DELETE /labels/:id`

**Checklists** — `POST /cards/:id/checklists` · `PATCH/DELETE /checklists/:id` · `POST /checklists/:id/items` · `PATCH/DELETE /checklist-items/:id`

**Comments** — `GET/POST /cards/:id/comments` · `PATCH/DELETE /comments/:id`

**Notifications** — `GET /notifications?unread=1` · `POST /notifications/:id/read` · `POST /notifications/read-all`

**Cross-cutting:**
- `middleware/auth.ts` — verify JWT from cookie → `req.user`
- Permission model: **board → team → membership**. `requireBoardAccess('MEMBER'|'ADMIN')` attached per route. Rules: MEMBER = read + create/edit cards/lists/comments; ADMIN/OWNER = create/delete boards, manage members/labels/invites; OWNER = delete team. Non-members get **404** (don't leak existence).
- `zod` validation on every body; central `errorHandler` → `{error: {code, message}}`
- `express-rate-limit` on auth + invite routes; `helmet`; activity + notification rows written inside the same service calls as mutations

---

## 4. Realtime (Socket.IO)

**Server:** JWT-cookie auth in handshake (`allowRequest`), join rooms `board:{id}` (on `board:subscribe`) and `user:{id}`. Every mutation service emits:
`list:created|updated|deleted`, `card:created|updated|moved|deleted`, `comment:created`, `label:changed`, `activity:created`, `notification:new`, `member:changed`, `board:updated`.

**Client:** `src/lib/socket.ts` + `SocketProvider`; per-board hook maps events → React Query cache updates. **Echo handling:** include `actorId`/`eventId` on every payload; skip events you originated (current code dedupes by id — keep that as backstop).

---

## 5. Frontend changes

> All `src/...` paths below are relative to `frontend/` — the SPA got its own
> `package.json`/`node_modules` and the root package was dropped (so no more
> `concurrently` / root `db:*` scripts; use `npm --prefix ...`).

### Remove
- `src/lib/supabase.ts`, `supabase/` (migrations already ported to Prisma), `scripts/seed-database.js`
- deps: `@supabase/supabase-js`, `supabase`, `dotenv`
- `.env.example`: drop `VITE_SUPABASE_*`

### Add (deps)
`react-router-dom`, `@tanstack/react-query` (cache + optimistic updates — pairs perfectly with socket invalidation), `concurrently` (root devDep). Keep `@dnd-kit/*`, `date-fns`, `lucide-react`, `react-hot-toast`.

### Rewrite
| File | Change |
|---|---|
| `src/App.tsx` | Router + `QueryClientProvider` + `AuthProvider` + `SocketProvider`. Routes: `/login`, `/`, `/teams/:teamId`, `/boards/:boardId`, `/invite/:code` |
| `src/contexts/AuthContext.tsx` | Fetch-based register/login/logout/me against `/api/auth/*`; `User {id, email, name}` |
| `src/types/index.ts` | Expand: Team, TeamMember, Role, Invite, Label, Priority, Checklist(Item), Comment, Activity, Notification, ApiError |
| `src/components/Board.tsx` (650 lines) | **Split**: `pages/BoardPage` (routing/loading) + `hooks/useBoardData` (React Query) + `hooks/useBoardRealtime` (socket) + view components. All inline `supabase.*` calls → API modules |
| `src/components/AuthForm.tsx` | Add name field (register), router links |
| `src/components/KanbanCard.tsx` | Show assignee avatars, priority badge, checklist progress; click → CardDetailModal (keep inline quick-edit menu) |
| `src/components/CreateBoardModal.tsx` | Team selector (defaults to current team) |

### New frontend pieces
- `src/lib/api.ts` — fetch wrapper: `credentials:'include'`, JSON, typed errors → thrown `ApiError`
- `src/lib/sockets.ts` + `SocketProvider`
- `src/lib/api/*.ts` — authApi, teamsApi, boardsApi, cardsApi, notificationsApi...
- **Pages:** `TeamsPage` (list/create), `TeamDetailPage` (members, roles, invite modal, board list), `BoardsGrid`, `BoardPage`, `InviteRedeemPage`, `LoginPage`
- **Board view switcher:** `BoardView` (existing kanban), `ListView`, `TableView`, `CalendarView` (month grid by `dueDate`) — all fed by the same `useBoardData` query
- **TaskDetailModal:** description, assignees picker, labels picker, priority, due date, checklists, comments, activity feed
- **Shared UI:** `AppShell` (sidebar: teams + boards), `NotificationsBell` (dropdown, unread count, mark read), `Avatar`, `AvatarGroup`, `PriorityBadge`, `DueDateBadge`, `LabelChip`, `MemberManager`, `InviteModal` (copy link), `ConfirmDialog`

---

## 6. Phased execution (each phase ends green)

> **Status (2026-09-28):** Phases 0–8 ✅ complete. Phase 8 verified: frontend lint/tsc/build green, backend 98/98 tests, 33/33 headless-Chrome UI checkpoint ×3 runs (view switcher → ListView groups + inline rename/priority persist → TableView 6 sortable columns with asc/desc + aria-sort + nulls-last due → Calendar month grid, chips on due days, unscheduled bucket, drag-to-schedule persists, view choice survives reload). Next: Phase 9 (RTL tests, README, final polish).

**Phase 0 — Cleanup & setup** (small) ✅
Prune Supabase deps/files, update `.env.example`, add `concurrently`, root scripts (`dev`, `dev:api`, `dev:web`, `db:migrate`, `db:seed`, `db:studio`, `test`) *(later superseded: root package removed, see §1)*. Create Postgres role/db (`kanban`, `kanban_test`) — note: **port 5433**, not 5432. Vite proxy config. Verify `npm run lint` + `npm run build` still pass.

**Phase 1 — Backend skeleton + auth** ✅
`backend/` scaffold, Prisma schema v1 (all models above), initial migration, env config, JWT cookie auth (register/login/logout/me, bcrypt), middleware (auth, validate, errorHandler), health route. Auto-create Personal team on register. **Tests:** auth happy path + duplicate email + weak password + `/me` without cookie.

**Phase 2 — Core CRUD + permissions** ✅
Boards/lists/cards routes incl. `/cards/:id/move` (transactional reindex), `GET /boards/:id` full payload, `requireBoardAccess`, activity writes. **Tests:** member/non-member access (403/404), move reindexes correctly, cascade deletes.

**Phase 3 — Frontend rewiring (app works end-to-end again)** ✅
api client, AuthContext rewrite, router + login page, BoardPage/`useBoardData` replace all Supabase calls, optimistic create/update/delete via React Query. **Checkpoint: single-user kanban fully functional against Express.**

**Phase 4 — Realtime** ✅
Socket.IO server + client provider; replace the three Supabase subscriptions in `Board.tsx` (lines 48–156). **Checkpoint: two browser windows sync live.**

**Phase 5 — Teams & invites** ✅
Teams/invites/members API + UI, boards grid scoped per team, role-gated UI (hide admin controls for MEMBER), `/invite/:code` page, sidebar shell. **Checkpoint: create team → invite link → second user joins → shared board.**

**Phase 6 — Rich tasks** ✅
Labels, assignees, priority, due dates, checklists, comments (API + `TaskDetailModal` + card badges), move to TaskDetailModal UX.

**Phase 7 — Notifications + activity** ✅
Notification generation in services (`ASSIGNED`/`COMMENTED`/`MENTIONED` on assign+comment with @mention parsing, `INVITE_REDEEMED`, hourly `DUE_SOON` sweeper), `user:<id>` socket room + `notification:new`, `GET/POST /api/notifications*` (list, unread filter, read, read-all), bell dropdown in AppShell (live badge, mark read / mark all read), card activity feed in `TaskDetailModal`.

**Phase 8 — Views** ✅
View switcher in board toolbar (Board/List/Table/Calendar, persisted in `localStorage`). ListView (grouped by list, inline title rename + priority select), TableView (sortable columns: title/assignee/priority/due/labels/list, `aria-sort`, due nulls last), CalendarView (month grid, due-date chips, unscheduled bucket, drag a chip onto a day to schedule). All views share the board query cache + realtime and the search filter.

**Phase 9 — Tests, polish, docs**
Frontend tests (RTL): AuthForm submit flow with mocked api, TaskCard badges, TaskDetailModal checklist toggle, `useBoardData` optimistic move. Root `README.md` (setup: DB creation, env, `npm run dev`, `npm run db:migrate && db:seed`). Final `lint` + `tsc` + `build` + full test run.

---

## 7. Risks / gotchas (will hit these)

1. **Postgres is on 5433** — `DATABASE_URL=postgresql://user:pass@localhost:5433/kanban`; must create role/db first (`psql -p 5433`).
2. **Vite proxy must cover `/socket.io` with `ws: true`** or sockets silently fail; cookie auth requires `credentials: 'include'` on every fetch.
3. **Socket echo/dupe** with optimistic updates — dedupe by event id + idempotent upsert.
4. **Position races** on rapid drags — reindex inside a transaction; optionally `SELECT FOR UPDATE` on the lists involved.
5. **`GET /boards/:id` payload size** — fine at this scale; paginate comments/activity only.
6. **Board.tsx split** is the largest refactor — do it in Phase 3 before adding features so new code never touches Supabase.
7. **No `.env` exists currently** — nothing is running against Supabase today, so the cut-over is clean; no data migration needed.

**Estimated shape:** Phase 0–2 (foundation), 3–4 (working app parity), 5–8 (new PM features), 9 (hardening). Phases 5–8 are independently shippable if you want to pause and review.
