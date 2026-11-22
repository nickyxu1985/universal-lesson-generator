-- 期末專案 A：D1 schema 初始 migration
-- 依 docs/final-spec.md §5 建立：daily_quota / categories / wiki_docs / wiki_fts(FTS5) / lessons / jobs
-- 套用方式（僅本機或明確授權時執行；本 PR 不部署、不動線上 D1）：
--   npx wrangler d1 execute <DB_NAME> --file=migrations/0001_init.sql [--remote]

PRAGMA foreign_keys = ON;

-- 1. 每日總量與防爆閘門表（鎖死零元上限）
CREATE TABLE IF NOT EXISTS daily_quota (
  date TEXT PRIMARY KEY,              -- 格式：YYYY-MM-DD
  ai_checks INTEGER DEFAULT 0,        -- 當日 Workers AI 審核次數
  lessons_created INTEGER DEFAULT 0   -- 當日派發 n8n 任務數
);

-- 2. 教案分類表（供 /admin 管理與首頁篩選）
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,          -- 例如：資訊科技、自然科學、數學、AI 應用
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0
);

-- 3. LLM-Wiki 知識庫索引表（實體 Markdown 存 R2）
CREATE TABLE IF NOT EXISTS wiki_docs (
  id TEXT PRIMARY KEY,                -- 例如：wiki_sqlite_basics
  topic TEXT NOT NULL,
  summary TEXT,
  source_urls TEXT,                   -- JSON 陣列，記錄 5 篇以上官方來源
  r2_key TEXT NOT NULL,               -- wiki/{slug}.md
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- SQLite 全文檢索虛擬表（零成本取代向量資料庫）
CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
  topic, summary,
  content='wiki_docs',
  content_rowid='rowid'
);

-- FTS5 外部內容表同步 triggers（INSERT / UPDATE / DELETE）
CREATE TRIGGER IF NOT EXISTS wiki_docs_ai AFTER INSERT ON wiki_docs BEGIN
  INSERT INTO wiki_fts(rowid, topic, summary)
  VALUES (new.rowid, new.topic, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS wiki_docs_ad AFTER DELETE ON wiki_docs BEGIN
  INSERT INTO wiki_fts(wiki_fts, rowid, topic, summary)
  VALUES ('delete', old.rowid, old.topic, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS wiki_docs_au AFTER UPDATE ON wiki_docs BEGIN
  INSERT INTO wiki_fts(wiki_fts, rowid, topic, summary)
  VALUES ('delete', old.rowid, old.topic, old.summary);
  INSERT INTO wiki_fts(rowid, topic, summary)
  VALUES (new.rowid, new.topic, new.summary);
END;

-- 4. 教案成品表（首頁最近 10 筆與分類檢索）
CREATE TABLE IF NOT EXISTS lessons (
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

CREATE INDEX IF NOT EXISTS idx_lessons_created_at ON lessons (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lessons_wiki_id ON lessons (wiki_id);
CREATE INDEX IF NOT EXISTS idx_lessons_category_id ON lessons (category_id);

-- 5. 非同步任務進度與白盒追蹤表（首頁進度條輪詢 & Slack Thread 對應）
CREATE TABLE IF NOT EXISTS jobs (
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

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);

-- 預設分類種子資料（可於 /admin 修改）
INSERT OR IGNORE INTO categories (name, slug, sort_order) VALUES
  ('資訊科技', 'information-technology', 1),
  ('自然科學', 'natural-science', 2),
  ('數學', 'mathematics', 3),
  ('AI 應用', 'ai-application', 4);
