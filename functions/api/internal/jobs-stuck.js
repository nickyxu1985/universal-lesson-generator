// GET /api/internal/jobs-stuck — 專供 n8n 超時檢查排程呼叫（server-to-server，帶 X-Secret-Token）
// 用途：T5 超時重派。列出在指定進度停留超過 N 分鐘的 job，供排程決定重派或標失敗。
// 查詢參數：progress（必填，35 或 55）、older_than_minutes（選填，預設 12）。
// 回傳：{ jobs: [{ id, topic, audience, style, status, progress, step_message, slack_thread_ts, reassign_count, updated_at }] }
// 環境綁定：env.DB（D1）；env.N8N_SECRET_TOKEN（密鑰，未設定 -> 503 fail closed）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Secret-Token',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export const onRequestGet = async (context) => {
  const { request, env } = context;

  const secret = env.N8N_SECRET_TOKEN || env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return json({ error: 'secret_not_configured' }, 503);
  }
  const token = request.headers.get('X-Secret-Token');
  if (!token || token !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  const url = new URL(request.url);
  const progressRaw = url.searchParams.get('progress');
  const progress = progressRaw === null ? NaN : Number(progressRaw);
  if (!Number.isInteger(progress) || (progress !== 35 && progress !== 55)) {
    return json({ error: 'invalid_progress', hint: 'progress 需為 35 或 55' }, 400);
  }
  const olderRaw = url.searchParams.get('older_than_minutes');
  const olderThan = olderRaw === null ? 12 : Number(olderRaw);
  if (!Number.isInteger(olderThan) || olderThan < 1 || olderThan > 1440) {
    return json({ error: 'invalid_older_than_minutes', hint: 'older_than_minutes 需為 1~1440 的整數' }, 400);
  }

  try {
    // updated_at 為 CURRENT_TIMESTAMP（UTC）；用 SQLite 的 datetime 比較。
    const { results } = await env.DB.prepare(
      "SELECT id, topic, audience, style, status, progress, step_message, slack_thread_ts, reassign_count, updated_at FROM jobs WHERE progress = ? AND status NOT IN ('done', 'failed') AND updated_at <= datetime('now', ?)"
    ).bind(progress, '-' + olderThan + ' minutes').all();
    return json({ jobs: results || [] }, 200);
  } catch (e) {
    console.error('[internal/jobs-stuck] internal error:', e?.message || e);
    return json({ error: 'internal_error' }, 500);
  }
};

export const onRequestOptions = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequest = async () =>
  new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
