# Final Project A — Slice 5 Handoff：/api/admin/* 後端

## 狀態

- 進行中（第二輪重審已請求，等待 Instinct 回覆）
- PR #17：https://github.com/nickyxu1985/universal-lesson-generator/pull/17
- 分支：`vibe/final-project-a-admin` → `develop`
- Builder：Vibe Code / Mistral Large 4
- Reviewer：Instinct（相同 harness）
- PM：Muse

## 內容

切片 5 實作 `/api/admin/*` 後端：分類 CRUD、教案中繼資料（PATCH）、刪除＋R2 清理、quota、jobs。契約對齊 `public/assets/admin.js`（切片 4 已上線）與 `docs/final-spec.md` §5 / §6.2 第 214 行。另附 lessons.tags migration（`migrations/0002_add_lesson_tags.sql`，只交檔、未執行）。

端點：

- `GET /api/admin/categories` → `{ items:[{id,name,slug,sort_order}] }`
- `POST /api/admin/categories {name}` → 201（slug 衍生；重名 → 409 `category_name_taken`）
- `PATCH /api/admin/categories/:id {name?, sort_order?}`（至少一個欄位，否則 400；不存在 → 404）
- `GET /api/admin/lessons?limit=50` → `{ items:[{id,title,audience,style,category_id,category_name,tags,created_at}] }`（limit 非法 → 400）
- `PATCH /api/admin/lessons/:id {category_id?, tags?}`（`category_id: number|null`，null＝清除分類；tags 字串陣列 ≤20、每個 1–50 字，存 JSON 字串）
- `DELETE /api/admin/lessons/:id`（刪 D1 列＋清 R2 `r2_html_key`／`r2_note_key`；不刪 `wiki_docs`；200 `{ok:true,id}`，不存在 → 404）
- `GET /api/admin/quota` → `{ date, ai_checks, ai_daily_limit:100, lessons_created, lessons_daily_limit:20 }`
- `GET /api/admin/jobs?limit=50` → `{ items:[{id,topic,audience,style,status,progress,slack_thread_ts,lesson_id,created_at}] }`
- 認證：SPEC §6.2＝Cloudflare Access（部署方職責），程式碼內不做認證。

## 時間線

- 2026-11-23 13:01：派給 Vibe Code（Mistral Large 4）。
- 13:06：完成。PR #17，head `2fbcfcb1`，7 個新檔、+615 行（6 個 admin API 檔＋migration）。冒煙 43/43（mock D1＋mock R2）。
- 14:00：PM 核對 head 與 `lessons/[id].js` 鍵值邏輯，請 Instinct 重審。
- 14:07：重審不通過（Instinct，PR #17 issuecomment-7093020595）。
  - P1：DELETE 時 R2 delete 拋例外仍回 200 並刪 D1 列，兩物件殘留；重試只回 404，已失去 API 清理依據。真實 Chromium 也顯示「下架成功」，無失敗提示。要求：失敗可見＋保留可重試的 keys／清理狀態，或持久化補償工作；不要求跨 D1/R2 原子交易。
  - P2：R2 已刪但 D1 刪除失敗，留下成品遺失的教案列。
  - 通過：分類、null 清除、tags 契約；78 項 API／資料庫＋9 項瀏覽器斷言。
- 14:08：修正派回 Vibe Code（同一分支、同一支 PR；冒煙須補失敗路徑）。
- 14:12：修正完成。新 head `dbffa8e5`，只改 `functions/api/admin/lessons/[id].js` 的 DELETE（+26/−16）。冒煙 55/55（原 43 項＋新增 12 項失敗路徑）。
  - P1 修正：R2 任一 key 刪除拋例外 → 回 502 `{ error: 'r2_delete_failed' }`，不刪 D1 列、保留 `r2_html_key`／`r2_note_key`；同一 DELETE 可重試（已刪 key 在 R2 為 no-op）。
  - P2 修正：順序改為先清 R2、全部成功後才刪 D1 列；D1 DELETE 失敗 → 回 500 `internal_error`，列與 keys 仍在、可重試。
  - 不做跨 D1/R2 原子交易。
- 14:32：PM 核對新 head 與 DELETE 邏輯（GitHub API），請 Instinct 第二輪重審。

## 模型備註

- Mistral Large 4（Vibe Code）：速度極快（切片 5 初版 5 分鐘、修正 2 分鐘），happy-path 完整；但第一版一樣要修一輪（失敗路徑盲點）。
- Vibe Work 的 GLM 底層是 glm-5-latest-short（輕量版），不是完整 GLM 5.3；切片 4 的五輪是在輕量版＋Fast 模式下跑的，不能當 GLM 能力的基準。
- Vibe Code 可以跑完整 GLM 5.3，能力與輕量版不是同一層級。
- 備案：若第二輪重審也不過，切到 Vibe Code 的完整 GLM 5.3（開新 session 才能換模型），同一分支、同一支 PR 繼續修。

## 合併門檻

重審通過 → PM 先套用 migration（`migrations/0002_add_lesson_tags.sql`）到 D1 → 合併到 develop → 部署 → 部署後冒煙。未通過前不合併、不部署。

## 連結

- PR #17：https://github.com/nickyxu1985/universal-lesson-generator/pull/17
- 第一輪審查：PR #17 issuecomment-7093020595
- 修正說明：PR #17 issuecomment-7093101330
- Slack 協調串：#universal-lesson-generator（thread_ts 1795366490.109509）
