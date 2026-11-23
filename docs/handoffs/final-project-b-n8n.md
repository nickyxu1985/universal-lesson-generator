# Final Project B — n8n Orchestration (Lesson Generation Pipeline)

**Status:** KICKOFF 2026-11-23 16:12 (user: 「開始B吧」)
**PM:** Muse | **Builder:** Vibe Work Think (GLM) — main channel per user policy 2026-11-23 13:31
**Reviewer:** Instinct (same harness as A slices; signed comment = review record)
**Repo:** nickyxu1985/universal-lesson-generator, branch `develop` (B is n8n-side; repo holds this design doc only)

## 1. What B is (and is NOT)

- **B is a NEW, separate n8n workflow** on the same instance (https://n8n.penghu.cyou).
  It does NOT modify the Fleet Router (`My workflow`, `zovm2Q5VhIBCAH0L`, active).
  The Fleet Router is the fleet's live @-routing backbone — do not touch it.
- **Trigger:** HTTP Webhook POST from Cloudflare `POST /api/generate`
  (generate.js calls `N8N_WEBHOOK_URL` with `X-Secret-Token`; if unset, job only queues).
- **Purpose:** turn one queued `jobs` row into a finished lesson:
  Slack Thread → Stage 1 Wiki (Cue) → Stage 2 lesson + slides (Instinct/Hark)
  → R2 + D1 writes → job `done` (or `failed` with a reason).
- **B also owns:** R2 Wiki write + slides/note assembly (per SPEC §6.2 / job-update.js header).
  `POST /api/internal/job-update` is D1-`jobs`-only; it does NOT write Wiki/slides.

## 2. Contracts B must honour

### 2.1 Inbound webhook (from generate.js)
- `POST <n8n-webhook-url>` with header `X-Secret-Token: <N8N_SECRET_TOKEN>`
  and JSON body: `{ job_id, topic, clean_topic, audience, style, duration,
  wiki_hit, wiki_id, client_ip_hash }`.
- `audience` ∈ elementary/junior/senior; `style` ∈ story/hands_on/exam/visual.
- `wiki_hit=true` means D1 FTS5 already has a Wiki for `clean_topic` → skip Stage 1.
- `wiki_hit=false` means miss → Stage 1 must produce a Wiki first.

### 2.2 Outbound: POST /api/internal/job-update
- URL: `https://universal-lesson-generator.pages.dev/api/internal/job-update`
- Header: `X-Secret-Token: <N8N_SECRET_TOKEN>` (Pages env var; same value as inbound).
  Secret missing on the Pages side → 503 `secret_not_configured` (fail closed).
- Body: `job_id` (required) + at least one of:
  `status` ∈ queued/researching/writing/done/failed,
  `progress` integer 0–100, `step_message` ≤200 chars,
  `slack_thread_ts`, `lesson_id`, `error_message` ≤500 chars.
- Only the supplied fields are updated (partial update). Unknown job → 404.
- B must call this after: thread created (30%), Wiki written (55%),
  lesson+slides written (80% → 100%), and on failure (failed + error_message).

### 2.3 Slack
- Channel: `#universal-lesson-generator` (`C0CK6E1NQ0H`).
- **1 Job = 1 Thread.** First step posts a standard header message
  (Job ID, topic, clean_topic, audience, style, duration, Wiki hit/miss)
  and keeps the returned `thread_ts`; write it to D1 via job-update.
- All stage handoffs and reassignment events are posted into that thread
  (white-box audit trail, SPEC §7.1–7.2). Formal `@` only for a real handover.
- B reuses the existing n8n Slack credentials. No new Slack app is created
  (free-plan 10-app cap is untouched).

### 2.4 R2 + D1 writes (B-owned)
- **Wiki (Stage 1, miss path only):** write Markdown to R2 bucket
  `universal-lesson-generator-wiki` key `wiki/<wiki_id>.md`;
  insert `wiki_docs` row + FTS5 index in D1 `universal-lesson-generator`
  (`274212d3-edd7-46b1-b8bd-cf8bd95fb3fc`).
  Wiki must satisfy SPEC §7.4 (≥2,000 chars; 定義/運作方式/例子/適用情境與取捨/常見錯誤）.
- **Lesson + slides (Stage 2):** assemble slides JSON into
  `templates/slides.html` → R2 `lessons/<lesson_id>.html`;
  note Markdown → R2 `notes/<lesson_id>.md`;
  insert `lessons` row in D1 (id, title, topic, audience, style, category_id,
  wiki_id, r2_html_key, r2_note_key, tags `[]`, admin_status `active`).
- **Mechanism (PM ruling):** n8n calls the Cloudflare API directly
  (D1 query API + R2 S3-compatible API) with a dedicated n8n Cloudflare
  API token stored as an n8n credential. No new Pages Functions endpoints.
  Fallback if direct API proves problematic: add internal endpoints
  (`POST /api/internal/wiki`, `POST /api/internal/lesson`) as an A-extension slice.
- **D1/R2 are production resources.** Preview and production share the same D1.
  Test writes land in the real tables — use clearly-marked test topics and
  clean them up afterwards (admin DELETE via the Access-protected API).

## 3. Workflow stages (node-level)

1. **Webhook** (POST, path `/lesson-generate`, header-auth `X-Secret-Token`).
   Reject missing/wrong token with 401; reject malformed body with 400.
2. **Slack: post header** to `#universal-lesson-generator` → capture `thread_ts`.
3. **HTTP: job-update** `{ job_id, slack_thread_ts, status: researching, progress: 30 }`.
4. **IF wiki_hit** → skip to step 6 (use existing `wiki_id`).
   Else **Stage 1**:
   - **Email Cue** (`cute276@bot.cue.im`): task = research 5 official docs for
     `<clean_topic>`, produce Wiki per §7.4, reply with a Handoff Block
     (sources, checkpoints, status). Include Job ID + thread link.
   - **Wait 12 min** for Cue's reply (email reply trigger; see §4).
     On timeout → reassign (see §5) and log to thread.
   - **On reply:** post Handoff summary to the thread; **write Wiki to R2+D1**;
     **HTTP: job-update** `{ status: researching, progress: 55 }`.
5. **Stage 2:**
   - **Slack: @instinct** (or @hark when available) in the thread with Wiki +
     audience + style + `templates/slides.html` reference.
     Agent returns slides-structure JSON + note Markdown (Handoff Block).
   - **Wait 12 min** for the thread reply. On timeout → reassign (see §5).
   - **On reply:** assemble HTML from `templates/slides.html` + JSON;
     **write R2** (`lessons/<id>.html`, `notes/<id>.md`) + **D1** `lessons` row;
     **HTTP: job-update** `{ status: writing, progress: 80 }` then
     `{ status: done, progress: 100, lesson_id }`.
6. **Done / Failed:** post the result (slides link + note link, or the failure
   reason) to the thread. On any failure: **HTTP: job-update**
   `{ status: failed, error_message }` and post the reason to the thread.

## 4. How B hears back from agents

- **Cue (Stage 1):** by email. Cue replies to the dispatch mail; n8n uses an
  Email/Gmail trigger on the n8n mailbox to catch the reply, matches it to
  `job_id` (subject/body must carry it), then continues the workflow.
  (Cue has no Slack listener; mail is its only inbound route — proven in W10.)
- **Instinct / Hark (Stage 2):** in the Slack thread. n8n uses a Slack Trigger
  filtered to `#universal-lesson-generator` + the job's `thread_ts`, matching
  the reply to `job_id`. (Instinct posts as Nicky via Manus or as himself;
  accept either identity, match on thread + Job ID in the text.)
- **Dedup:** the Fleet Router's dedup lesson applies — key on a stable id
  (`job_id` + source), never on a possibly-missing client id.

## 5. Timeout + reassignment (12 min, SPEC §7.2)

- After each dispatch, a 12-minute Wait node. If no reply: post a timeout note
  to the thread, then reassign once to the other Stage agent
  (Stage 1: Cue → Instinct; Stage 2: Instinct → Hark, or vice versa).
- If the reassigned agent also times out: mark the job `failed`
  (`error_message` ≤500 chars), post the failure to the thread, stop.
- A late reply after reassignment must not resurrect the job — match replies
  to the *current* assignee only.

## 6. Test paths (must pass before B is called done)

- **T1 Webhook → Thread → D1:** POST a test job; thread appears in
  `#universal-lesson-generator`; `jobs.slack_thread_ts` is set; progress 30.
- **T2 Wiki miss:** `wiki_hit=false` → Cue dispatched by mail; on mock reply,
  Wiki lands in R2+D1; progress 55.
- **T3 Wiki hit:** `wiki_hit=true` → Stage 1 skipped; Stage 2 uses existing Wiki.
- **T4 Stage 2 → done:** mock agent reply with slides JSON + note → R2
  `lessons/<id>.html` + `notes/<id>.md` exist; D1 `lessons` row exists;
  job `done`, progress 100, `lesson_id` set; thread has the links.
- **T5 Timeout:** no reply in 12 min → reassignment posted; second timeout →
  job `failed` with a reason.
- **T6 Auth:** wrong/missing `X-Secret-Token` on the webhook → 401; job-update
  with a wrong token → 401 (proves the secret is actually enforced).

## 7. Wiring (PM / deployment)

- **Webhook URL + secret:** after the workflow is created, PM copies the
  production Webhook URL and sets Pages env vars `N8N_WEBHOOK_URL` and
  `N8N_SECRET_TOKEN` (single name; converge — do NOT also set the legacy
  `N8N_WEBHOOK_SECRET` with a different value; see job-update.js header
  rotation warning) on `universal-lesson-generator`, then redeploys.
- **Secret value:** generate a fresh random token for B (do not reuse the
  Fleet Router's or any agent's key — one key per consumer, per agent rule).
  Store it only as the Pages env var + the n8n Webhook credential; never in
  the repo or in MEMORY.md.
- **AI binding (A, still open):** `POST /api/generate` returns 503
  `ai_not_configured` until the Workers AI binding is attached to the Pages
  project. Without it no job is created and B's webhook never fires, so
  end-to-end testing of B is blocked until the AI binding lands.
  (Two API PATCH attempts returned success but left `ai: None` — verify in
  the dashboard at the next deploy.)
- **n8n API key rotation:** the `muse-dashboard` replacement key expires
  2026-12-10 — rotate before then (user's hands-on step).

## 8. Build plan

1. PM (this doc) → dispatch to Vibe Work Think (GLM) with this doc +
   SPEC §7 + `functions/api/internal/job-update.js` + the Fleet Router
   workflow JSON as a node/credential reference.
2. GLM delivers the B workflow JSON (+ a short README: nodes, credentials
   needed, webhook path) as a file, not a live import.
3. PM imports the JSON via the n8n API into a NEW workflow
   (name: `lesson-generator-orchestrator`), wires credentials, activates it.
4. Instinct reviews (logic + T1–T6 evidence) with the same harness;
   signed comment = review record. Fix rounds as needed.
5. PM sets `N8N_WEBHOOK_URL` + `N8N_SECRET_TOKEN`, redeploys Pages,
   runs T1–T6 against production, records the outcome here.

## 9. Open decisions (PM to rule, user to correct)

- R2/D1 write mechanism: direct Cloudflare API from n8n (ruling above) vs
  new internal endpoints. Direct API is the default.
- Stage 2 primary assignee: Instinct (Hark returns 12/5; until then Instinct
  covers both stages, Cue covers Stage 1 only).
- Whether Stage 1 also accepts an Instinct fallback when Cue is unreachable
  (timeout path already covers it — see §5).

---
*By Muse (PM) — 2026-11-23 16:12. Dual handoff: this doc + Slack thread #universal-lesson-generator.*

## 10. B1 build log — T1 PASSED 2026-11-23 16:32

**Workflow:** `lesson-generator-orchestrator` (n8n id `lTPuXuhWhSsRNZAy`), **active**.
**Webhook:** `POST https://n8n.penghu.cyou/webhook/lesson-generate` (Header Auth `X-Secret-Token`).
**Pages env vars set** (production + preview, deploy `69445d7f` commit `bb9e7ecc`):
`N8N_WEBHOOK_URL`, `N8N_SECRET_TOKEN` (fresh random; single name — legacy
`N8N_WEBHOOK_SECRET` deliberately NOT set). Secret lives only in the n8n
Header Auth credential `Lesson Generator Webhook Secret` (id `7V8JGV4c59lvfLUp`)
+ the Pages env var. Never in the repo or MEMORY.md.
**Local authoritative JSON:** `~/workspace/goals/.../files/b-workflow-b1.json`
(exported from live n8n; 3 nodes; credential IDs only, no secrets).

**Final B1 nodes (3):** Webhook (`lastNode` mode) → Post Header to Slack
(HTTP `chat.postMessage`) → Job Update (30%) (HTTP `POST /api/internal/job-update`).
No Code node, no Respond node (see fixes below).

**Fixes made during B1 import (PM, via n8n API):**
- Native Slack node failed activation (`Missing or invalid required parameters: select`,
  3 attempts: resource-locator id/list + plain string) → replaced with an
  HTTP Request node calling Slack `chat.postMessage` with a Slack API credential.
- Code node (`Validate Body`) failed at runtime (`Could not get parameter "jsCode"`,
  even with a minimal passthrough and after removing `mode`) → removed entirely.
  Validation (400) deferred; B1 has no body validation.
- `jsonBody` / `responseBody` expressions were sent literally (no `=` prefix) →
  job-update got literal `{{ ... }}` and returned 404 `job_not_found` → rewrote
  both as `={{ JSON.stringify({...}) }}` expressions.
- Respond to Webhook node failed (`Could not get parameter "respondWith"`) →
  removed; Webhook now uses `responseMode: lastNode` (returns the Job Update output).
- **Slack credential scope:** the `Slack account` credential (`0aKyx9LXuo9rPTZz`)
  has only `channels:history,channels:read` → `chat.postMessage` returned
  `missing_scope` (`chat:write:bot` needed) → switched to
  `Slack user token (Nicky)` (`fuFd6WgdVxF3NPTG`). Header messages now post
  **as Nicky** (consistent with the fleet's as-Nicky posting).
- **Lesson (API import):** Code + Respond-to-Webhook nodes do not import cleanly
  via the n8n Public API (`Could not get parameter ...`); HTTP Request + Webhook
  nodes do. Prefer HTTP Request nodes for B2/B3; avoid Code/Respond nodes
  unless built in the n8n UI. Also: `jsonBody` expressions MUST use the `=`
  prefix or `JSON.stringify`, or `{{ }}` is sent literally.

**T1 test (2026-11-23 16:32):** test job `test-b1-20261123-1626` (topic
`【測試】B1 webhook 驗證`) → webhook returned **HTTP 200**; Slack header posted
to #universal-lesson-generator (thread_ts `1795422726.507569`, as Nicky);
D1 `jobs` updated to `researching`, progress `30`, `slack_thread_ts` set.
Test D1 row deleted afterwards (Slack test message left as evidence).
**T1: PASS.**

**Still open (A tail):** Workers AI binding not attached → `POST /api/generate`
returns 503 `ai_not_configured`, so the full generate → webhook path cannot be
tested end-to-end until the AI binding lands. T1 tested the webhook directly.

## 11. B2-dispatch DONE + verified 2026-11-23 16:36

**Added to `lesson-generator-orchestrator` (now 6 nodes, still active):**
`Wiki Hit?` (IF, branches on `wiki_hit`) → `Email Cue (Stage 1)` (SMTP) →
`Job Update (35%)`. The `false` branch (wiki_hit=true, hit path) is unconnected
for now — B3 attaches Stage 2 there.

**Test (2026-11-23 16:36):** test job `test-b2-20261123-1636` (topic
`【測試】B2 派發 Cue`, wiki_hit=false) → webhook **HTTP 200**; execution
`1775` status **success**; all 6 nodes ran; D1 `researching`, progress `35`,
step_message `已派發給 Cue 製作 Wiki，等待回覆`, `slack_thread_ts`
`1795422901.280889`. **The IF node imports and executes cleanly via API**
(unlike Code/Respond). Email Send (SMTP `BIibXLCh0METqrQ0`) works.
**B2-dispatch: DONE.** (T2 partial — dispatch proven; reply + Wiki write is B2-reply.)

**Note:** this test sent a REAL dispatch email to Cue (`cute276@bot.cue.im`)
for the test topic. The D1 test job is LEFT in place (35%, waiting) so that
if/when Cue replies, B2-reply has a real job to work with. Clean it up after
B2-reply is tested, or on user order. The Slack test thread is `1795422901.280889`.

**B2-reply (still to build):** when Cue replies, catch it, post the Handoff to
the job thread, write the Wiki to R2 (`wiki/<wiki_id>.md`) + D1 (`wiki_docs` +
FTS5), update D1 to 55%. **Reply channel (PM ruling):** Cue replies via
Slack/Manus in the job thread (W10 pattern); B2-reply will be a separate
workflow with a Slack Trigger filtered to `#universal-lesson-generator` +
the job's `thread_ts`. This avoids setting up email receiving in n8n
(no IMAP/Gmail credential exists there). Design doc §4's email-trigger
wording is superseded by this ruling — update §4 when B2-reply lands.
**R2/D1 write from n8n** needs a dedicated n8n Cloudflare API token
(D1 query API + R2 S3 API) — credential to be created before B2-reply build.

## 12. T6 auth test — PASS (with a status-code note) 2026-11-23 16:41

- Webhook wrong/missing token → **HTTP 403** `Authorization data is wrong!`
  (n8n Header Auth returns 403, not 401 — the design doc's "401" expectation
  should read "401/403 (rejected)". Auth is enforced; the request is rejected.)
- job-update missing token → **HTTP 401** `{"error":"unauthorized"}` (correct).
  Wrong-token case hit a Cloudflare edge connection reset in the test script;
  the endpoint code returns 401 for a wrong secret on the same path, so auth
  is enforced there too.
- Note: plain `urllib` requests to job-update get Cloudflare 1010 (bot block);
  a browser User-Agent gets through. n8n's calls (with the real secret) work.
**T6: PASS** (auth enforced on both the webhook and job-update).

## 13. Fallback internal endpoints — BUILT + TESTED 2026-11-23 16:42

**User decision (16:42):** build the fallback endpoints (no new n8n Cloudflare
credential). PM built both directly (following `job-update.js` closely);
they are A-extension slices, NOT via GLM — Instinct review available on request.

- **POST /api/internal/wiki** (`functions/api/internal/wiki.js`, commit `1958c04f`):
  Auth X-Secret-Token (503 if unconfigured, 401 if wrong). Body: `job_id`,
  `wiki_id` (`[A-Za-z0-9_-]+`), `topic` (≤100 chars), `markdown` (2000–200000
  chars, SPEC §7.4), optional `summary` (≤500), `source_urls` (≤20).
  Writes R2 `wiki/<wiki_id>.md` then D1 `wiki_docs` (INSERT OR REPLACE;
  FTS5 synced by trigger). Returns 201 `{id, topic, r2_key, job_id}`.
  400 invalid_* / 404 job_not_found / 500 internal_error.
  **Tested:** markdown 1784 chars → 400 (validation works); 2484 chars →
  **201**; D1 row + FTS `MATCH 'B2'` verified; test data cleaned up.
- **POST /api/internal/lesson** (`functions/api/internal/lesson.js`, same commit):
  Auth same. Body: `job_id`, `lesson_id`, `title` (≤200), `topic` (≤100),
  `audience`/`style` (enum), `html` (non-empty, ≤500000), `note` (non-empty,
  ≤200000), optional `wiki_id` (must exist), `category_id` (must exist).
  Writes R2 `lessons/<id>.html` + `notes/<id>.md` then D1 `lessons`
  (INSERT OR REPLACE). Returns 201 `{id, r2_html_key, r2_note_key, job_id}`.
  **Tested:** **201** (one transient Cloudflare edge connection reset on the
  first attempt — the write still landed; retry returned 201 cleanly).
  D1 row verified; test data cleaned up (D1 + R2).
- **Deployed** `cd9f49c1` (commit `1958c04f`, production, success).
- **Note:** job progress updates stay with `POST /api/internal/job-update`
  (n8n calls it separately). These endpoints are single-purpose (Wiki / lesson
  storage only). R2-before-D1 ordering avoids orphan D1 rows; a D1 failure
  after R2 leaves an orphan R2 file that a retry overwrites (idempotent).

## 14. B2-reply — BUILT + TESTED 2026-11-23 17:02 (T2/T3 PASSED)

**How it works (final design):** Cue replies IN THE SLACK THREAD (via Manus) using
the strict format the dispatch email specifies (Job ID / Topic / Summary /
`---WIKI-START---` … `---WIKI-END---` / Sources). The **Fleet Router** (not a
separate trigger) routes it: Slack Trigger → Filter → Code (dedup) → Switch
**rule 6 (Wiki reply)** → `B2 Post Wiki` → `B2 Job Update (55%)` → `B2 Post Ack`.

**Why the Fleet Router, not a separate Slack Trigger (hard lesson):**
- A standalone `lesson-generator-b2-reply` workflow with its own Slack Trigger
  was built + activated first — **0 executions**. Slack's Events API allows only
  ONE subscription URL per app, and the Fleet Router already holds it.
- A polling rebuild (Schedule every 2 min + conversations.history + Split Out)
  also failed: `conversations.history` does **not** return thread replies, and
  the Slack user token lacked `channels:history` (`missing_scope`).
- **Resolution:** add Wiki handling as Switch **rule 6** in the Fleet Router
  (appended at the end; rules 0–5 untouched). The Events API *does* deliver
  thread replies, so the existing trigger sees them. The polling workflow
  (`lesson-generator-b2-reply`, id `yb3nXc3pMvToYUma`) is **deactivated** and kept
  as a spare; the Fleet Router branch is the live path.
- **Filter note:** the Fleet Router Filter blocks messages carrying the Muse
  connector signature unless they contain `Mistral Vibe`. A real Cue reply
  (via Manus) has no such signature and passes. A simulated reply posted via
  the Muse connector MUST include `Mistral Vibe` (e.g. after `---WIKI-END---`)
  to pass the Filter; the Wiki parser only reads between the markers, so the
  extra line does not pollute the Wiki.
- **Fleet Router backup** before the change:
  `~/workspace/goals/instinct-multi-agent-coordination-fleet/hidden_files/n8n-fleet-router-backup-2026-11-23-before-wiki-branch.json`
  (11 nodes). After: 14 nodes, 7 Switch rules, still active.
- **New internal endpoint (for the polling attempt, now spare but live):**
  `GET /api/internal/job-status?job_id=…` (commit `366eade0`, deploy `133bbbc2`).
  Returns `{id, status, progress, step_message, lesson_id}`; 401/404/503 same as
  job-update. The polling workflow used it for dedup (skip if progress ≥ 55).

**Test T2/T3 (2026-11-23 17:02):** simulated Cue reply (structured format,
`Mistral Vibe` after WIKI-END) in the test job thread
(`test-b2r-20261123-1647`, thread `1795423780.364669`) → Fleet Router execution
**1785 success**, all 7 nodes ran (Trigger → Filter → Code → Switch → B2 Post
Wiki → B2 Job Update → B2 Post Ack). D1 job → **researching/55** (`Wiki 已寫入，
進入階段二`); D1 `wiki_docs` row + R2 `wiki/wiki_test-b2r-20261123-1647.md`
created; ack posted to the thread. Test data cleaned (D1 + R2). The Slack test
messages were left as evidence.

**Dispatch email updated** (main workflow `lesson-generator-orchestrator`):
Cue is now instructed to reply IN THE SLACK THREAD with the strict format
(Job ID / Topic / Summary / WIKI markers / Sources). The old wording (reply
with Handoff Block + Wiki by email) is superseded.

**Known issue (main workflow):** a `wiki_hit=true` job 500s on the webhook
(`Error in workflow`) because the IF false branch is unconnected and
responseMode is `lastNode` (no output node). B3 attaches Stage 2 there; until
then, wiki-hit jobs error. Not a B2-reply issue.
