// GET /api/admin/jobs?limit=50 — 任務列表（含 slack_thread_ts 稽核，created_at 倒序）
//   → { items:[{id,topic,audience,style,status,progress,slack_thread_ts,lesson_id,created_at}] }
// 依 docs/final-spec.md §6.2「ALL /api/admin/*」；契約對齊 public/assets/admin.js 開頭註解（切片 4 已上線）
// 認證由 Cloudflare Access 保護（部署方職責），本程式不自行做認證
// 環境綁定：env.DB（D1）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 200;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get('limit');
  let limit = LIMIT_DEFAULT;
  if (rawLimit !== null && rawLimit !== '') {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1 || n > LIMIT_MAX) {
      return json({ error: 'invalid_limit', hint: 'limit 需為 1~' + LIMIT_MAX + ' 的整數' }, 400);
    }
    limit = n;
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, topic, audience, style, status, progress,
              slack_thread_ts, lesson_id, created_at
       FROM jobs
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    ).bind(limit).all();
    return json({ items: results || [] });
  } catch (e) {
    console.error('[admin/jobs] list error:', e?.message || e);
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
