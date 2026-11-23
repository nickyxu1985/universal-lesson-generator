// POST /api/internal/lesson — 專供 n8n 呼叫（server-to-server，帶 X-Secret-Token）
// 依 docs/handoffs/final-project-b-n8n.md §7 fallback：n8n 不直連 Cloudflare API，
// 改由本端點寫入教案成品（R2 + D1），避開 n8n 需自備 Cloudflare token 的問題。
// 範圍：寫入 R2 lessons/<lesson_id>.html + notes/<lesson_id>.md + D1 lessons 列。
//       簡報 HTML 與詳案 Markdown 由上游（Stage 2 agent）組裝完成後傳入，本端點只做儲存。
//       Job 完成（done/100 + lesson_id）由 n8n 另呼 POST /api/internal/job-update。
// 環境綁定：env.DB（D1）；env.WIKI_BUCKET（R2）；env.N8N_SECRET_TOKEN（密鑰，未設定 -> 503 fail closed）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Secret-Token',
};

const JOB_ID_MAX = 100;
const LESSON_ID_MAX = 100;
const TITLE_MAX_CHARS = 200;
const TOPIC_MAX_CHARS = 100;
const WIKI_ID_MAX = 100;
const HTML_MAX_CHARS = 500000;
const NOTE_MAX_CHARS = 200000;
const AUDIENCES = ['elementary', 'junior', 'senior'];
const STYLES = ['story', 'hands_on', 'exam', 'visual'];

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
  const lessonId = typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
  if (!lessonId || lessonId.length > LESSON_ID_MAX || !/^[A-Za-z0-9_-]+$/.test(lessonId)) {
    return json({ error: 'invalid_lesson_id', hint: 'lesson_id 需為英數、底線、連字號組成的字串' }, 400);
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || countChars(title) > TITLE_MAX_CHARS) {
    return json({ error: 'invalid_title', hint: 'title 需為 200 字以內非空字串' }, 400);
  }
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic || countChars(topic) > TOPIC_MAX_CHARS) {
    return json({ error: 'invalid_topic', hint: 'topic 需為 100 字以內非空字串' }, 400);
  }
  if (typeof body.audience !== 'string' || !AUDIENCES.includes(body.audience)) {
    return json({ error: 'invalid_audience', hint: 'audience 需為 elementary/junior/senior' }, 400);
  }
  if (typeof body.style !== 'string' || !STYLES.includes(body.style)) {
    return json({ error: 'invalid_style', hint: 'style 需為 story/hands_on/exam/visual' }, 400);
  }
  const html = typeof body.html === 'string' ? body.html : '';
  if (!html.trim() || countChars(html) > HTML_MAX_CHARS) {
    return json({ error: 'invalid_html', hint: 'html 需為非空且 500000 字以內的字串' }, 400);
  }
  const note = typeof body.note === 'string' ? body.note : '';
  if (!note.trim() || countChars(note) > NOTE_MAX_CHARS) {
    return json({ error: 'invalid_note', hint: 'note 需為非空且 200000 字以內的字串' }, 400);
  }

  // 4. 選填欄位
  let wikiId = null;
  if (body.wiki_id !== undefined && body.wiki_id !== null) {
    if (typeof body.wiki_id !== 'string' || !body.wiki_id.trim() || body.wiki_id.trim().length > WIKI_ID_MAX) {
      return json({ error: 'invalid_wiki_id' }, 400);
    }
    wikiId = body.wiki_id.trim();
  }
  let categoryId = null;
  if (body.category_id !== undefined && body.category_id !== null) {
    if (typeof body.category_id !== 'number' || !Number.isInteger(body.category_id) || body.category_id < 1) {
      return json({ error: 'invalid_category_id' }, 400);
    }
    categoryId = body.category_id;
  }

  const r2HtmlKey = 'lessons/' + lessonId + '.html';
  const r2NoteKey = 'notes/' + lessonId + '.md';

  try {
    // 5. job 存在檢查
    const job = await env.DB.prepare('SELECT id, progress FROM jobs WHERE id = ?').bind(jobId).first();
    if (!job) {
      return json({ error: 'job_not_found', job_id: jobId }, 404);
    }
    // 遲到防護（T5）：job 須在 Stage 2（55 <= progress < 100）才接受教案；
    // Stage 1 未完成（<55）或已完成（100）時拒收，避免遲到的簡報復活已結案的 job。
    if (job.progress < 55 || job.progress >= 100) {
      return json({ error: 'stage_not_ready', hint: 'job 不在 Stage 2，不接受教案' }, 409);
    }

    // 6. wiki_id 若有帶，須存在
    if (wikiId) {
      const wiki = await env.DB.prepare('SELECT id FROM wiki_docs WHERE id = ?').bind(wikiId).first();
      if (!wiki) {
        return json({ error: 'wiki_not_found', wiki_id: wikiId }, 404);
      }
    }

    // 7. category_id 若有帶，須存在
    if (categoryId !== null) {
      const cat = await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(categoryId).first();
      if (!cat) {
        return json({ error: 'category_not_found', category_id: categoryId }, 404);
      }
    }

    // 8. 寫入 R2（先寫 R2，失敗則不動 D1，避免孤兒列）
    await env.WIKI_BUCKET.put(r2HtmlKey, html, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    });
    await env.WIKI_BUCKET.put(r2NoteKey, note, {
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
    });

    // 9. 寫入 D1 lessons（INSERT OR REPLACE，允許同一 lesson_id 覆寫；冪等重試安全）
    await env.DB.prepare(
      'INSERT OR REPLACE INTO lessons (id, title, topic, audience, style, category_id, wiki_id, r2_html_key, r2_note_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(lessonId, title, topic, body.audience, body.style, categoryId, wikiId, r2HtmlKey, r2NoteKey).run();

    return json({ id: lessonId, r2_html_key: r2HtmlKey, r2_note_key: r2NoteKey, job_id: jobId }, 201);
  } catch (e) {
    // R2 已寫、D1 失敗時，R2 檔案會成為孤兒；回 500 並記錄，n8n 可重試同一 lesson_id（覆寫冪等）
    console.error('[internal/lesson] internal error:', e?.message || e);
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
