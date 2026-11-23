-- 期末專案 B（T5 超時重派）：jobs 表新增 reassign_count
-- 用途：記錄一則 job 被超時重派的次數（0 = 未重派，1 = 已重派一次，>=2 不再重派，改標失敗）。
-- 套用方式：npx wrangler d1 execute <DB_NAME> --file=migrations/0004_reassign_count.sql --remote
ALTER TABLE jobs ADD COLUMN reassign_count INTEGER NOT NULL DEFAULT 0;
