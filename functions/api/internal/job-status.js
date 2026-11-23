// GET /api/internal/job-status — 專供 n8n 呼叫（server-to-server，帶 X-Secret-Token）
// 用途：B2-reply 輪詢時查詢 job 目前進度，避免重複處理已寫入的 Wiki。
// 範圍：僅讀取 jobs 表（id / status / progress / step_message / lesson_id）。
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
  const jobId = (url.searchParams.get('job_id') || '').trim();
  if (!jobId || jobId.length > 100) {
    return json({ error: 'invalid_job_id' }, 400);
  }

  try {
    const job = await env.DB.prepare(
      'SELECT id, status, progress, step_message, lesson_id FROM jobs WHERE id = ?'
    ).bind(jobId).first();
    if (!job) {
      return json({ error: 'job_not_found', job_id: jobId }, 404);
    }
    return json(job, 200);
  } catch (e) {
    console.error('[internal/job-status] internal error:', e?.message || e);
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
