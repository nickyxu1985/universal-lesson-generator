// POST /api/internal/wiki — 專供 n8n 呼叫（server-to-server，帶 X-Secret-Token）
// 依 docs/handoffs/final-project-b-n8n.md §7 fallback：n8n 不直連 Cloudflare API，
// 改由本端點寫入 Wiki（R2 + D1），避開 n8n 需自備 Cloudflare token 的問題。
// 範圍：寫入 R2 wiki/<wiki_id>.md + D1 wiki_docs（FTS5 由 trigger 自動同步）。
//       Job 進度（55%）由 n8n 另呼 POST /api/internal/job-update。
// 環境綁定：env.DB（D1）；env.WIKI_BUCKET（R2）；env.N8N_SECRET_TOKEN（密鑰，未設定 -> 503 fail closed）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Secret-Token',
};

const JOB_ID_MAX = 100;
const WIKI_ID_MAX = 100;
const TOPIC_MAX_CHARS = 100;
const SUMMARY_MAX_CHARS = 500;
const MARKDOWN_MIN_CHARS = 2000; // SPEC §7.4：Wiki 至少 2000 字
const MARKDOWN_MAX_CHARS = 200000;
const SOURCE_URLS_MAX = 20;

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

  // 1. 認證：密鑰未設定 -> 503（fail closed，與 job-update.js 同一做法）
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
  if (!env.WIKI_BUCKET) {
    return json({ error: 'r2_not_configured' }, 500);
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

  // 3. 必填欄位
  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  if (!jobId || jobId.length > JOB_ID_MAX) {
    return json({ error: 'invalid_job_id' }, 400);
  }
  const wikiId = typeof body.wiki_id === 'string' ? body.wiki_id.trim() : '';
  if (!wikiId || wikiId.length > WIKI_ID_MAX || !/^[A-Za-z0-9_-]+$/.test(wikiId)) {
    return json({ error: 'invalid_wiki_id', hint: 'wiki_id 需為英數、底線、連字號組成的字串' }, 400);
  }
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic || countChars(topic) > TOPIC_MAX_CHARS) {
    return json({ error: 'invalid_topic', hint: 'topic 需為 100 字以內非空字串' }, 400);
  }
  const markdown = typeof body.markdown === 'string' ? body.markdown : '';
  if (countChars(markdown) < MARKDOWN_MIN_CHARS || countChars(markdown) > MARKDOWN_MAX_CHARS) {
    return json({ error: 'invalid_markdown', hint: 'markdown 需為 2000~200000 字的字串（SPEC §7.4）' }, 400);
  }

  // 4. 選填欄位
  let summary = null;
  if (body.summary !== undefined && body.summary !== null) {
    if (typeof body.summary !== 'string' || countChars(body.summary) > SUMMARY_MAX_CHARS) {
      return json({ error: 'invalid_summary', hint: 'summary 需為 500 字以內字串' }, 400);
    }
    summary = body.summary.trim() || null;
  }
  let sourceUrls = null;
  if (body.source_urls !== undefined && body.source_urls !== null) {
    if (!Array.isArray(body.source_urls) || body.source_urls.length > SOURCE_URLS_MAX ||
        body.source_urls.some((u) => typeof u !== 'string' || !u.trim())) {
      return json({ error: 'invalid_source_urls', hint: 'source_urls 需為最多 20 筆的非空字串陣列' }, 400);
    }
    sourceUrls = JSON.stringify(body.source_urls.map((u) => u.trim()));
  }

  const r2Key = 'wiki/' + wikiId + '.md';

  try {
    // 5. job 存在檢查（寫 Wiki 必須對應一個已建立的 job）
    const job = await env.DB.prepare('SELECT id FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job) {
      return json({ error: 'job_not_found', job_id: jobId }, 404);
    }

    // 6. 寫入 R2（先寫 R2，失敗則不動 D1，避免孤兒列）
    await env.WIKI_BUCKET.put(r2Key, markdown, {
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
    });

    // 7. 寫入 D1 wiki_docs（INSERT OR REPLACE，允許同一 wiki_id 覆寫；FTS5 由 trigger 同步）
    await env.DB.prepare(
      'INSERT OR REPLACE INTO wiki_docs (id, topic, summary, source_urls, r2_key, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
    ).bind(wikiId, topic, summary, sourceUrls, r2Key).run();

    return json({ id: wikiId, topic, r2_key: r2Key, job_id: jobId }, 201);
  } catch (e) {
    // R2 已寫、D1 失敗時，R2 檔案會成為孤兒；回 500 並記錄，n8n 可重試同一 wiki_id（覆寫冪等）
    console.error('[internal/wiki] internal error:', e?.message || e);
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
