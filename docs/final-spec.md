# 萬用教案生成器 — 系統開發規格書 (SPEC)

## 1. 專案總覽與設計原則

本專案目標為建置一套**零月費落地營運、系統與資料徹底解耦、封閉式 AI 流程白盒化、並結合個人 Obsidian 知識圖譜**的自動化教案生成平台。使用者於首頁輸入教學主題並選擇受眾（國小／國中／高中）與風格檔位後，系統自動檢索既有知識庫（LLM-Wiki）；若無現成資料，則透過自動化調度驅動 AI Agent 蒐集 5 篇以上官方／技術文件並結構化入庫，最終同步產出**「Obsidian 教師詳案（`.md`）」**與**「互動式課堂簡報（`.html`）」**。

### 核心設計原則
* **三層知識閉環**：底層事實（`wiki/*.md`）保持中立且與受眾／風格解耦，可供不同年段重複利用；中層產出給老師備課用的 Obsidian 詳案（`notes/*.md`，含 `[[wiki]]` 雙向連結）；表層產出給學生觀看的精簡 HTML 簡報（`lessons/*.html`）。
* **系統與資料徹底解耦**：GitHub Repo 僅存放程式碼、Agent 規則與交接規範（`specs/`）及 HTML 簡報母版；所有動態產出之 Wiki、詳案、簡報與任務狀態全數存於 Cloudflare D1 / R2，確保 Repo 永遠輕量乾淨。
* **封閉式 AI 白盒化（`handoff.md` + Slack Thread 隔離）**：於 Slack 建立專屬教案頻道，**每次教案生成開啟一個獨立 Thread**；所有封閉式 Agent 必須嚴格遵循 Repo 內的 `handoff.md` 交接協議，在該 Thread 內留下結構化交接紀錄（來源清單、檢查點、交接狀態與異常原因），讓黑盒子的執行過程完全透明可稽核。
* **非同步工單制與零元防爆鎖**：前端透過 D1 狀態機與定時輪詢顯示即時進度；後端以 Cloudflare 免費額度、自架 n8n 與 0 元購封閉式 Agent 運作，並於程式層建立 D1 每日總量閘門物理鎖死帳單上限。

---

## 2. 系統架構與資料流

```text
[使用者瀏覽器] (Cloudflare Pages)
   ├─ 首頁 (/)       ：主題輸入(限40字) + 受眾(國小/國中/高中) + 風格選單 + 即時進度條 + 最近10筆
   ├─ 知識庫 (/wiki) ：瀏覽與搜尋 R2 內之 LLM-Wiki (前端 marked.js 渲染)
   ├─ 簡報頁 (/s/:id)：全螢幕 HTML 簡報 + 切換檢視/下載 Obsidian 教師詳案 (.md)
   └─ 管理頁 (/admin)：分類管理、教案編輯與刪除 (Cloudflare Access 零信任保護)
         │
         ▼
[Cloudflare Pages Functions (內建 REST API，免額外後端主機)]
   ├─ 1. 第一層防護：Turnstile 驗證 + 字數/白名單檢查 + D1 每日總量/IP 限流閘門
   ├─ 2. 第二層防護：呼叫內建 env.AI (Workers AI 免費額度)
   │      └─ 18禁/安全/K-12適齡審查 + Prompt 注入偵測 + 提煉乾淨主題 (clean_topic)
   ├─ 3. 直連 D1 (SQLite FTS5) 查詢 llm-wiki 是否命中，建立 job_id (10%, queued)
   └─ 4. Server-to-Server (帶 X-Secret-Token) 觸發 n8n Webhook，立即回傳 job_id
         │
         ▼
[現有自架 n8n 調度中心] ◄──(各階段呼叫 /api/internal/job-update 更新 D1 進度)──┐
   │                                                                           │
   ├─ (啟動) 於 Slack 專屬教案頻道發起一則主訊息，取得 thread_ts 寫回 D1 jobs   │
   │         (本任務所有 Agent 互動與 handoff.md 交接皆隔離於此 Thread 內)      │
   │                                                                           │
   ├── [階段一：Wiki 未命中] ──────────────────────────────────────────────────┤
   │     派單給 cue (信箱觸發) 或 instinct / hark pro (Slack Thread 內 @ 呼叫) │
   │     (Agent 讀取 Repo 之 skill.md / task.md / handoff.md，嚴禁 Commit)     │
   │     -> 抓取 5 篇以上官方/技術文件 -> 產出結構化 Markdown + Handoff 紀錄    │
   │     -> n8n 將階段一 Handoff 摘要貼入該 Slack Thread 存證                   │
   │     -> n8n 呼叫內部 API 寫入 [CF R2: wiki/] 並建索引進 [CF D1]             │
   │                                                                           │
   └── [階段二：Wiki 已命中 / 階段一完成] ─────────────────────────────────────┤
         n8n 讀取 R2 Wiki + 受眾(國小/國中/高中) + 風格檔位 + 現有分類清單     │
         於同一 Slack Thread 派單給 instinct / hark pro (完整 Bot 身分)         │
         (Agent 依 style.md / obsidian-note-spec.md / handoff.md 產出：         │
          A. Obsidian 教師詳案 .md [含 [[wiki]] 連結、教學節奏與逐字稿]         │
          B. HTML 簡報結構 JSON [由 n8n/Worker 套入 Repo 母版組裝為 .html]      │
          C. 階段二 Handoff 驗收紀錄 [留存於該 Slack Thread])                   │
         -> n8n 呼叫內部 API 存入 [CF R2: notes/ & lessons/] + [CF D1]          │
         -> 更新 job 狀態為 100% done，於 Thread 標記完成 ✅                    │
         └─────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ (S3 相容 API 雙向同步，免經 Git)
                                      ▼
                        [本機 / 平板 Obsidian Vault]
                     (透過免費外掛 Remotely Save 直連 R2)
                   老師備課、編修詳案、檢視知識圖譜 (Graph View)
```

---

## 3. 系統與資料解耦設計

### 3.1 GitHub Repo 目錄規劃（唯讀程式碼與規則層）
Repo 開啟 `main` 分支保護（Branch Protection），禁止任何 Agent 直接 `git push` 覆寫規則或將動態產出寫入版本庫。

```text
lesson-generator/
├── public/                     # Cloudflare Pages 靜態前端資源 (首頁, /wiki, /admin)
├── functions/                  # Cloudflare Pages Functions (內建 REST API)
│   └── api/
│       ├── generate.js         # 表單驗證 + D1限流 + Workers AI 審核 + 觸發 n8n
│       ├── jobs/[id].js        # 前端進度條輪詢接口
│       ├── lessons/            # 最近 10 筆清單、簡報串流、詳案讀取
│       ├── wiki/               # Wiki 清單、FTS5 搜尋、R2 Markdown 讀取
│       ├── admin/              # 分類 CRUD、教案管理 (受 Cloudflare Access 保護)
│       └── internal/
│           └── job-update.js   # 專供 n8n 回報進度、thread_ts 與寫入 R2/D1
├── specs/                      # Agent 運作與產出規範 (封閉式 Agent 唯讀參考)
│   ├── AGENTS.md               # Agent 權限邊界、資料標籤防注入原則、禁 Commit 規範
│   ├── handoff.md              # 封閉式 AI 白盒化交接協議（輸入/輸出/檢查點/異常格式）
│   ├── skill.md                # 5 篇以上官方文件檢索標準與結構化提煉技能
│   ├── task.md                 # 階段一與階段二標準作業流程與回傳格式契約
│   ├── style.md                # 四大風格檔位定義 (story / hands_on / exam / visual)
│   └── obsidian-note-spec.md   # 教師詳案 YAML Frontmatter、[[wiki]] 連結與章節規範
└── templates/
    └── slides.html             # 單檔響應式 HTML 簡報母版 (保留 JSON 資料注入點)
```

### 3.2 Cloudflare R2 儲存結構（動態檔案與 Obsidian 同步層）
* `wiki/{topic_slug}.md`：中立技術知識原件，含 5 篇以上官方引用來源。
* `notes/{lesson_id}.md`：Obsidian 教師詳案，開頭強制包含標準 YAML Frontmatter（`title`、`audience`、`style`、`category`、`wiki_ref: "[[主題]]"`、`slides_url`、`job_id`），方便搭配 Obsidian Dataview 自動建表。
* `lessons/{lesson_id}.html`：由母版組裝完成之獨立 HTML 簡報檔。

### 3.3 Obsidian 雙向同步策略
利用 Cloudflare R2 原生 S3 相容介面，於本機／平板 Obsidian 安裝免費社群外掛 **Remotely Save**，直接同步 `wiki/` 與 `notes/` 資料夾。老師於 Obsidian 編修之詳案或 Wiki 同步回 R2 後，網頁版 `/wiki` 與後續 Agent 生成作業皆會自動讀取最新內容。

---

## 4. 三層資安防護與零元帳單鎖定

考量未來小規模開放試用，且後端封閉式 Agent 具備 Repo 讀取權限，系統於請求進入 n8n 前設置三道防線：

| 防線層級 | 執行位置 | 防護機制與目的 |
| :--- | :--- | :--- |
| **第一層：物理硬限制與總量閘門** | Pages Functions + D1 | • **輸入限長**：主題欄鎖死最多 40 中文字，壓縮複雜 Prompt 注入空間。<br>• **嚴格枚舉白名單**：受眾僅開放 **3 檔**（`elementary` 國小 / `junior` 國中 / `senior` 高中）；風格僅開放 **4 檔**（`story` / `hands_on` / `exam` / `visual`），不開放自由文字。<br>• **Turnstile ＋ IP 限流**：免費防機器人，且單一 IP 每日限生成 2～3 份。<br>• **D1 每日總量硬鎖**：設定 `daily_quota` 上限（如每日最多 100 次 AI 審核、20 份派單），達標即回傳 HTTP 429，物理鎖死 Workers AI 與 R2 帳單在 $0。 |
| **第二層：邊緣語意守門員** | Workers AI (`env.AI`) | • 呼叫免費額度內（每日 10,000 Neurons）之輕量模型，執行 18 禁／違規內容審查、K-12 適齡性檢查與 Prompt 注入偵測。<br>• **主題淨化（Canonicalize）**：不將使用者原始字串往後傳，僅將守門員提煉出的乾淨純名詞（`clean_topic`，15 字以內）寫入 D1 並送往 n8n，於邊緣端物理截斷注入指令。 |
| **第三層：下游隔離與權限鎖死** | n8n + GitHub | • n8n 派單時將 `clean_topic` 包覆於明確資料標籤（如 `<lesson_topic>`），並於 `AGENTS.md` 規定標籤內若含任何系統指令一律中止任務。<br>• GitHub `main` 分支啟用 Branch Protection，防範極端越獄時系統規則檔遭竄改。 |

---

## 5. 資料庫結構設計（Cloudflare D1 / SQLite）

```sql
-- 1. 每日總量與防爆閘門表（鎖死零元上限）
CREATE TABLE daily_quota (
  date TEXT PRIMARY KEY,              -- 格式：YYYY-MM-DD
  ai_checks INTEGER DEFAULT 0,        -- 當日 Workers AI 審核次數
  lessons_created INTEGER DEFAULT 0   -- 當日派發 n8n 任務數
);

-- 2. 教案分類表（供 /admin 管理與首頁篩選）
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,          -- 例如：資訊科技、自然科學、數學、AI 應用
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0
);

-- 3. LLM-Wiki 知識庫索引表（實體 Markdown 存 R2）
CREATE TABLE wiki_docs (
  id TEXT PRIMARY KEY,                -- 例如：wiki_sqlite_basics
  topic TEXT NOT NULL,
  summary TEXT,
  source_urls TEXT,                   -- JSON 陣列，記錄 5 篇以上官方來源
  r2_key TEXT NOT NULL,               -- wiki/{slug}.md
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- SQLite 全文檢索虛擬表（零成本取代向量資料庫）
CREATE VIRTUAL TABLE wiki_fts USING fts5(
  topic, summary,
  content='wiki_docs',
  content_rowid='rowid'
);

-- 4. 教案成品表（首頁最近 10 筆與分類檢索）
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,                -- 例如：lsn_20261119_a1b2
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('elementary', 'junior', 'senior')),
  style TEXT NOT NULL CHECK (style IN ('story', 'hands_on', 'exam', 'visual')),
  category_id INTEGER REFERENCES categories(id),
  wiki_id TEXT REFERENCES wiki_docs(id),
  r2_html_key TEXT NOT NULL,          -- lessons/{id}.html (課堂簡報)
  r2_note_key TEXT NOT NULL,          -- notes/{id}.md (Obsidian 教師詳案)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. 非同步任務進度與白盒追蹤表（首頁進度條輪詢 & Slack Thread 對應）
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,                -- 經守門員淨化後的 clean_topic
  audience TEXT NOT NULL CHECK (audience IN ('elementary', 'junior', 'senior')),
  style TEXT NOT NULL CHECK (style IN ('story', 'hands_on', 'exam', 'visual')),
  status TEXT NOT NULL,               -- queued / researching / writing / done / failed
  progress INTEGER DEFAULT 0,         -- 0 ~ 100
  step_message TEXT,                  -- 首頁顯示之中文即時狀態
  slack_thread_ts TEXT,               -- Slack 教案頻道之獨立 Thread ID，供白盒稽核追溯
  lesson_id TEXT,                     -- 完成後填入 lessons.id
  error_message TEXT,
  client_ip_hash TEXT,                -- 雜湊後之 IP，用於每日限流
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. 前端頁面規劃與 REST API 契約

### 6.1 四大頁面功能
1. **首頁（`/`）**：
   * 頂部導覽列：直達 **LLM-Wiki 知識庫（`/wiki`）** 與 **管理後台（`/admin`）**。
   * 生成表單：
     * 主題輸入框（限 40 中文字）。
     * **受眾選擇器（固定 3 檔）**：國小（`elementary`）／國中（`junior`）／高中（`senior`）。
     * **風格選擇器（固定 4 檔）**：故事引導風（`story`）／實作演練風（`hands_on`）／重點攻略風（`exam`）／圖解速覽風（`visual`）。
     * **簡報時間選擇器（可指定）**：簡報長度由使用者指定（例如 30 分鐘；預設 50 分鐘，上限 240 分鐘，須為正整數，超過回傳 400）。教案與簡報都按指定時間排節奏，每段幾分鐘寫進教案與簡報。
     * Turnstile 驗證與送出按鈕。
   * **即時生成進度區**：送出後展開進度條，每 4 秒輪詢 `GET /api/jobs/:id`，同步將 `active_job_id` 寫入 `localStorage`（誤關或重整頁面可無縫續看）。階段進度：`10%` 檢索知識庫 → `30%` 派發 Agent 蒐集 5 篇官方文件 → `55%` 寫入 LLM-Wiki → `80%` 依受眾與風格撰寫詳案與簡報 → `100%` 完成並亮出「開啟 HTML 簡報」與「檢視／下載教師詳案」按鈕。
   * **最近生成 10 個教案**：卡片式呈現標題、受眾標籤、風格標籤、分類與建立時間，支援點擊分類快速篩選。
2. **LLM-Wiki 知識庫（`/wiki`）**：支援關鍵字即時搜尋（D1 FTS5），點擊條目即時讀取 R2 `.md` 並透過 `marked.js` 渲染，頁尾列出引用之 5 篇以上官方來源網址與關聯教案。
3. **簡報與詳案檢視頁（`/s/:id`）**：預設全螢幕顯示 R2 內的獨立 HTML 簡報；右上角提供懸浮工具列，可一鍵切換預覽或下載對應之 Obsidian 詳案 `.md`。
4. **教案管理後台（`/admin`）**：由免費 **Cloudflare Access** 保護，提供分類新增／改名／排序、修改教案所屬分類與標籤、下架刪除異常教案、檢視 `daily_quota` 用量，並列出各任務對應的 `slack_thread_ts` 方便直接點回 Slack 查核生成紀錄。

### 6.2 Pages Functions REST API 規格

| 方法與路徑 | 權限 | 功能說明 |
| :--- | :--- | :--- |
| `POST /api/generate` | 公開（含 Turnstile） | 執行第一、二層防護 → 查 D1 FTS5 → 建 `jobs` → 非同步觸發 n8n → 回傳 `job_id`。 |
| `GET /api/jobs/:id` | 公開 | 回傳任務 `status`、`progress`、`step_message` 及完成後的 `lesson_id`。 |
| `GET /api/lessons/recent` | 公開 | 撈取最近 10 筆教案（支援 `?category=slug` 篩選）。 |
| `GET /api/lessons/:id/html` | 公開 | 串流回傳 R2 內之簡報 HTML（`Content-Type: text/html`）。 |
| `GET /api/lessons/:id/note` | 公開 | 回傳 R2 內之 Obsidian 教師詳案 Markdown（支援檢視與下載）。 |
| `GET /api/wiki` | 公開 | 撈取 Wiki 清單，或透過 `?q=keyword` 執行 D1 FTS5 全文檢索。 |
| `GET /api/wiki/:id` | 公開 | 讀取指定 Wiki 的 R2 Markdown 內文、來源網址與關聯教案。 |
| `POST /api/internal/job-update` | 內部密鑰（`X-Secret-Token`） | 專供 n8n 呼叫：寫入 `slack_thread_ts`、更新進度百分比。本端點僅做 D1 jobs 表的更新；R2 Wiki 寫入與簡報／詳案組裝由 B 階段 n8n 端處理。 |
| `ALL /api/admin/*` | Cloudflare Access | 分類管理（CRUD）、教案中繼資料修改、刪除異常教案與 R2 檔案清理。 |

---

## 7. n8n 調度、Slack Thread 隔離與 `handoff.md` 白盒化協議

### 7.1 Slack 專屬教案頻道與單一任務獨立 Thread 機制
* 於 Slack 建立專屬頻道（例如 `#lesson-gen-jobs`），所有自動化任務統一集中於此頻道管理。
* **1 Job = 1 Thread**：n8n 收到 Webhook 後，第一步先在頻道發送一則標準化主訊息（標註 `Job ID`、`主題`、`受眾`、`風格`、`Wiki 命中狀態`），取得 Slack 回傳的 `thread_ts` 並透過 `/api/internal/job-update` 存入 D1 `jobs.slack_thread_ts`。
* 該教案後續的階段一派單、階段二派單、Agent 回覆、交接摘要與錯誤警示，**全部強制回覆在同一個 `thread_ts` 內**，徹底避免多任務並發時上下文污染，也讓管理者隨時可點開任一 Thread 完整回放整份教案的誕生過程。

### 7.2 透過 `specs/handoff.md` 將封閉式 AI 白盒化
封閉式 Agent（`cue`、`instinct`、`hark pro`）內部推理不可見，因此透過 Repo 內的 `specs/handoff.md` 強制規範每個階段結束時必須輸出**固定結構的交接區塊（Handoff Block）**並記錄於該 Slack Thread 內：

```markdown
### [HANDOFF] Stage: <stage_1_wiki | stage_2_lesson>
- **Job ID**: <job_id>
- **Agent**: <cue | instinct | hark_pro>
- **Status**: <PASS | FAIL | NEEDS_RETRY>
- **Inputs Used**: <引用的 Wiki ID 或搜尋關鍵字>
- **Sources Verified (Stage 1)**: <5 篇以上官方/技術文件標題與 URL 清單>
- **Audience & Style Check (Stage 2)**: <確認已對齊 國小/國中/高中 詞彙深度與對應 style.md 規則>
- **Artifacts Produced**: <Markdown / JSON 區塊位置與字數/頁數統計>
- **Self-Audit Checklist**:
  - [x] 未包含任何未經查證之幻覺數據或無效連結
  - [x] 未對 GitHub Repo 執行任何 commit / push
  - [x] 符合 obsidian-note-spec.md Frontmatter 規範
- **Next Action / Notes**: <交接給下一階段的重點提醒，或失敗原因說明>
```

* **白盒化效益**：
  1. **來源可稽核**：階段一抓了哪 5 篇官方文件、有沒有混入農場文，在 Slack Thread 一目了然。
  2. **除錯可定位**：若產出的教案品質不佳或格式解析失敗，打開該 `job_id` 對應的 Thread 即可立刻看出是哪一隻 Agent、在哪一個檢查點出錯。
  3. **跨 Agent 無縫接力**：即使階段一由 `cue`（信箱觸發：Slack @cue → n8n 發信給 Cue）執行，n8n 收到回信後將其 Handoff 摘要貼進 Slack Thread，階段二的 `instinct` / `hark pro` 就能直接讀取前手交接狀態繼續執行。

### 7.3 Agent 職責分配與穩定性防呆
* **階段一（深度爬蟲 5+ 篇官方文件 → 寫入 LLM-Wiki）**：優先派發給 **`cue`（信箱觸發：Slack @cue → n8n 發信，最穩定不易漏單；也可直接 mail）**，或於 Slack Thread 內派發給 **`instinct` / `hark pro`**。
* **階段二（依受眾與風格產出 Obsidian 詳案 ＋ HTML 簡報 JSON）**：於同一 Slack Thread 內 `@instinct` 或 `@hark pro`（完整 Bot 身分與 MCP），n8n 監聽該 Thread 收件。
* **`muse` 排除於主幹道**：因僅能透過旗標喚醒且漏接率高，不納入面向前端使用者的自動化流程。
* **簡報母版分離組裝**：Agent 僅產出乾淨的簡報結構 JSON，由 n8n 或 `job-update` API 注入 `templates/slides.html` 母版後存進 R2，徹底根治 HTML 破版問題。
* **超時自動改派（Timeout Fallback）**：n8n 派單後掛載 12 分鐘 Wait 節點，逾時未回自動重試或改派另一隻封閉式 Agent（必要時可選配 Gemini 4 Hydrogen API 墊檔），並於 Slack Thread 記錄改派事件。

### 7.4 產出品質規格（Wiki 深度、簡報時間、風格參照）

（2026-11-19 由 W10 v1 的反思定案：v1 的 Wiki 太薄、簡報沒給時間、風格只有預設配色。）

* **Wiki 深度下限**：每頁 Wiki 不得低於 2,000 字（字元），且每頁必須包含：定義、運作方式、至少一個例子、適用情境與取捨、常見錯誤。字數是下限不是目標——不灌水也不精簡。驗收時 Instinct 同時檢查字數與五要素。
* **簡報時間可指定**：簡報長度是使用者輸入（首頁表單，見 §6.1），不是 Agent 預設。教案與簡報都按指定時間排節奏，每段幾分鐘寫進教案與簡報。
* **風格參照內建**：簡報母版內建風格參照——開源圖示／icon 庫、公開配色方案（例如開源 icon 庫與配色），並在簡報或範本裡註明參照來源。不只靠預設配色。

---

## 8. 落地營運成本精算

以個人使用加上小規模公開試用（預估月產 100～300 份教案）計算：

| 項目 | 方案與免費額度 | 預估實際用量 | 預估月費 |
| :--- | :--- | :--- | :--- |
| **Cloudflare Pages + Functions** | 無限頻寬、每日 10 萬次請求 | 含進度輪詢每日低於 2,000 次 | **$0** |
| **Cloudflare Workers AI** | Workers Free 方案每日 10,000 Neurons（硬上限不扣款） | 每日審核低於 100 次（約耗 1,500 Neurons） | **$0** |
| **Cloudflare D1 (SQLite)** | 5 GB、每日 500 萬讀 / 10 萬寫 | 每日低於 3,000 讀 / 200 寫 | **$0** |
| **Cloudflare R2** | 10 GB 儲存、免流量費、含 S3 API | 約 100 MB（純文字與 HTML） | **$0** |
| **Cloudflare Access + Turnstile** | 50 人以內免費零信任保護 + 無上限防機器人 | 個人管理後台 + 表單驗證 | **$0** |
| **Obsidian + Remotely Save** | 免費版軟體 + 開源同步外掛 | 直連 R2 S3 接口 | **$0** |
| **Slack + GitHub + n8n + 封閉式 Agent** | 現有免費/自架環境與 0 元購主力 Agent | 現有額度內運作 | **$0** |
| **總計** | | | **$0 / 月** |

> **Workers AI 計費前提（Paid 超額風險註記）**：上表 $0 結論以 Workers **Free** 方案為前提——Free 額度用盡時超額請求直接失敗硬停（不扣款）。若帳號實際為 **Paid（Standard）** 方案，Workers AI 超額部分按 $0.011／1,000 Neurons 計費且**無硬頂**，此時 §4 第一層的 D1 `daily_quota` 每日總量閘門（每日 100 次 AI 審核、20 份派單）即為防止帳單失控的主要程式鎖。帳號實際方案部署時，以 Cloudflare dashboard 核實為準。

---

## 9. 分階段實作路線圖

### Phase 1：基礎設施與規格檔定案（Day 1～2）
1. 建立 GitHub Repo 並開啟 `main` 分支保護；撰寫 `specs/` 底下所有規範檔（`AGENTS.md`、`handoff.md`、`skill.md`、`task.md`、`style.md`、`obsidian-note-spec.md`）與 `templates/slides.html` 母版。
2. 於 Cloudflare 建立 Pages 專案、D1 資料庫（執行第 5 節 SQL 建表與預設分類種子資料）與 R2 Bucket。
3. 於 Slack 建立專屬教案頻道（如 `#lesson-gen-jobs`），邀請 `instinct`、`hark pro` 與 n8n Bot 加入。
4. 設定 Obsidian Remotely Save 外掛直連 R2，驗證 `wiki/` 與 `notes/` 雙向同步正常。

### Phase 2：核心 API 與安全守門員開發（Day 3～5）
1. 實作 `POST /api/generate`（整合 Turnstile、40 字上限、3 檔受眾與 4 檔風格枚舉檢查、`daily_quota` 閘門與 Workers AI 主題淨化）。
2. 實作 `GET /api/jobs/:id`、`POST /api/internal/job-update`（`job-update` 本體僅做 D1 jobs 表更新：`slack_thread_ts` 寫入、進度更新；R2 存檔與 HTML 母版組裝由 B 階段 n8n 端處理，非本端點職責）。
3. 使用 Mock 請求驗證表單送出、D1 寫入、AI 攔截異常輸入與狀態更新閉環。

### Phase 3：n8n 工作流、Slack Thread 隔離與白盒交接串接（Day 6～8）
1. 建立 n8n Webhook 接收器，實作「發起 Slack 頻道主訊息 → 取得 `thread_ts` → 回寫 D1」流程。
2. 串接階段一與階段二封閉式 Agent，強制驗證回傳內容是否符合 `specs/handoff.md` 交接區塊格式，並完整留存於該 `thread_ts` 內。
3. 加上 12 分鐘超時改派與錯誤回報機制，實測「Wiki 未命中」與「Wiki 已命中（同主題換受眾／風格）」兩條路徑。

### Phase 4：前端四頁面整合與後台鎖定（Day 9～11）
1. 完成首頁（含 3 檔受眾、4 檔風格、`localStorage` 斷線續追進度條與最近 10 筆卡片）、`/wiki` 與 `/s/:id`。
2. 完成 `/admin` 管理介面（含 `slack_thread_ts` 稽核連結），並套用 Cloudflare Access 零信任保護。
3. 進行端到端測試（含 Prompt 注入測試、18 禁與 K-12 適齡攔截測試、Slack Thread 白盒紀錄查核、Obsidian 雙向同步測試），正式上線。