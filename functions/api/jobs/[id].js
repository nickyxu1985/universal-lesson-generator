// GET /api/jobs/:id — 依 id 查一筆任務進度（jobs 表）
// 依 docs/final-spec.md §6.2：公開回傳僅契約欄位 status、progress、step_message、lesson_id
// （slack_thread_ts、error_message 等內部欄位屬 /admin 稽核用途，不對外公開）
// 環境綁定：env.DB（D1）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export const onRequestGet = async ({ params, env }) => {
  const id = String(params.id || '').trim();

  if (!id || id.length > 100) {
    return json({ error: 'invalid_job_id' }, 400);
  }

  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  try {
    const job = await env.DB.prepare(
      `SELECT status, progress, step_message, lesson_id
        FROM jobs WHERE id = ?`
    ).bind(id).first();

    if (!job) {
      return json({ error: 'job_not_found', id }, 404);
    }

    return json(job);
  } catch (e) {
    // 不對外公開內部錯誤細節，僅留 log
    console.error('[jobs/:id] internal error:', e?.message || e);
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
