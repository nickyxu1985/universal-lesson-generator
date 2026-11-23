-- 期末專案 A 切片 5：lessons 加 tags 欄位（TEXT，存 JSON 陣列字串，例如 '["標籤1","tag2"]'）
-- 依 docs/final-spec.md §5：lessons 表原本沒有 tags 欄位；/api/admin/lessons/:id 的 PATCH tags 由切片 5 後端讀寫
-- 契約見 public/assets/admin.js 開頭註解。既有列預設為 '[]'，不影響 slices 1–3 既有流程。
--
-- 套用方式（僅本機或明確授權時執行；本 PR 只交 migration 檔、不部署、不動線上 D1）：
--   npx wrangler d1 execute <DB_NAME> --file=migrations/0002_add_lesson_tags.sql --remote
-- 或由部署方統一套用 migrations_dir（wrangler.toml 已設 migrations_dir = "migrations"）：
--   npx wrangler d1 migrations apply <DB_NAME> --remote

ALTER TABLE lessons ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
