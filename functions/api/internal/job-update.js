// POST /api/internal/job-update — 專供 n8n 呼叫（server-to-server，帶 X-Secret-Token）
// 依 docs/final-spec.md §6.2：寫入 slack_thread_ts、更新進度、回報完成/失敗。
// 範圍：本端點僅做 jobs 表的驗證＋部分更新（partial update）；
//       「寫入新 Wiki 至 R2/D1、組裝並存入簡報與詳案」不在本切片（後續切片／B 階段處理）。
// 環境綁定：env.DB（D1）；env.N8N_SECRET_TOKEN（密鑰，未設定 -> 503 fail closed；相容沿用 N8N_WEBHOOK_SECRET 命名）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Secret-Token',
};

// 與 generate.js 一致的狀態機（建 job 為 queued / progress 10）
const STATUSES = ['queued', 'processing', 'done', 'failed'];
const JOB_ID_MAX = 100;
const STEP_MESSAGE_MAX_CHARS = 200;
const ERROR_MESSAGE_MAX_CHARS = 500;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

const isNonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';
const countChars = (s) => [...s].length; // 中文正確計數

export const onRequestPost = async (context) => {
  const { request, env } = context;

  // 1. 認證：密鑰未設定 -> 503（fail closed，與 generate.js 的 Turnstile 同一做法）
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

  // 2. Body 解析
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid_body' }, 400);
  }

  // 3. job_id（必填）
  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  if (!jobId || jobId.length > JOB_ID_MAX) {
    return json({ error: 'invalid_job_id' }, 400);
  }

  // 4. 可更新欄位（選填，**只**更新有帶的欄位）
  const updates = {};

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) {
      return json({ error: 'invalid_status', hint: 'status 需為 queued/processing/done/failed' }, 400);
    }
    updates.status = body.status;
  }

  if (body.progress !== undefined) {
    const p = body.progress;
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 100) {
      return json({ error: 'invalid_progress', hint: 'progress 需為 0~100 的整數' }, 400);
    }
    updates.progress = p;
  }

  if (body.step_message !== undefined) {
    if (typeof body.step_message !== 'string' || countChars(body.step_message) > STEP_MESSAGE_MAX_CHARS) {
      return json({ error: 'invalid_step_message', hint: 'step_message 需為 200 字以內字串' }, 400);
    }
    updates.step_message = body.step_message;
  }

  if (body.slack_thread_ts !== undefined) {
    if (!isNonEmptyStr(body.slack_thread_ts)) {
      return json({ error: 'invalid_slack_thread_ts' }, 400);
    }
    updates.slack_thread_ts = body.slack_thread_ts.trim();
  }

  if (body.lesson_id !== undefined) {
    if (!isNonEmptyStr(body.lesson_id)) {
      return json({ error: 'invalid_lesson_id' }, 400);
    }
    updates.lesson_id = body.lesson_id.trim();
  }

  if (body.error_message !== undefined) {
    if (typeof body.error_message !== 'string' || countChars(body.error_message) > ERROR_MESSAGE_MAX_CHARS) {
      return json({ error: 'invalid_error_message', hint: 'error_message 需為 500 字以內字串' }, 400);
    }
    updates.error_message = body.error_message;
  }

  // 5. 除 job_id 外至少要帶一個可更新欄位
  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return json({ error: 'nothing_to_update' }, 400);
  }

  try {
    // 6. job 存在檢查
    const exists = await env.DB.prepare('SELECT id FROM jobs WHERE id = ?').bind(jobId).first();
    if (!exists) {
      return json({ error: 'job_not_found', job_id: jobId }, 404);
    }

    // 7. partial update：SET 子句由白名單欄位動態組成、值一律參數化綁定；
    //    topic / audience / style / client_ip_hash / created_at 不在本函式可更新清單，結構上不可改。
    const setSql = keys.map((k) => k + ' = ?').join(', ') + ', updated_at = CURRENT_TIMESTAMP';
    await env.DB.prepare('UPDATE jobs SET ' + setSql + ' WHERE id = ?')
      .bind(...keys.map((k) => updates[k]), jobId)
      .run();

    // 8. 回傳更新後的 job，公開欄位與 GET /api/jobs/:id 契約一致
    const job = await env.DB.prepare(
      'SELECT id, status, progress, step_message, lesson_id FROM jobs WHERE id = ?'
    ).bind(jobId).first();
    return json(job, 200);
  } catch (e) {
    // 500 一律通用訊息，細節留 log（與切片 1/2 同一做法）
    console.error('[job-update] internal error:', e?.message || e);
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
