-- 期末專案 A 切片 5 P2 修正：lessons 加 admin_status 欄位（TEXT），隔離「清理中／清理失敗」的教案
-- 值域：'active'（預設，公開可見）、'deleting'（管理員已按下刪除，R2 清理進行中）、
--       'cleanup_failed'（R2 或 D1 刪除拋例外，列與 keys 保留，可重試）
-- 公開端點（/api/lessons、/api/lessons/recent、/api/lessons/:id/html、/api/lessons/:id/note）
-- 只服務 admin_status = 'active' 的教案；既有序列預設 'active'，不影響既有流程。
-- 契約對齊 PR #17 與 docs/final-spec.md §6.2。
--
-- 套用方式（僅本機或明確授權時執行；本 PR 只交 migration 檔、不部署、不動線上 D1）：
--   npx wrangler d1 execute <DB_NAME> --file=migrations/0003_add_lesson_admin_status.sql --remote
-- 或由部署方統一套用 migrations_dir（wrangler.toml 已設 migrations_dir = "migrations"）：
--   npx wrangler d1 migrations apply <DB_NAME> --remote

ALTER TABLE lessons ADD COLUMN admin_status TEXT NOT NULL DEFAULT 'active';
