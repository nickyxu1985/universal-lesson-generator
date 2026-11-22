// GET /api/lessons/:id/html — 串流回傳 R2 內之簡報 HTML（Content-Type: text/html）
// 依 docs/final-spec.md §6.2（Cloudflare Pages Functions）
// 環境綁定：env.DB（D1）、env.WIKI_BUCKET（R2，路徑前綴 lessons/、notes/、wiki/ 區分）

const CORS_HEADERS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type"};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export const onRequestGet = async ({ params, env }) => {
  const id = String(params.id || '').trim();

  if (!id || id.length > 100) {
    return json({ error: 'invalid_lesson_id' }, 400);
  }

  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  try {
    // 1. 先以 D1 驗證教案存在（冪等防掃 R2）
    const lesson = await env.DB.prepare(
      'SELECT id, r2_html_key AS r2_key FROM lessons WHERE id = ?'
    ).bind(id).first();

    if (!lesson) {
      return json({ error: 'lesson_not_found', id }, 404);
    }

    // 2. 讀取 R2 物件
    const object = await env.WIKI_BUCKET?.get(lesson.r2_key);
    if (!object) {
      return json({ error: 'r2_object_not_found', id, r2_key: lesson.r2_key }, 404);
    }

    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...CORS_HEADERS,
      },
    });
  } catch (e) {
    return json({ error: 'internal_error', message: String(e?.message || e) }, 500);
  }
};

export const onRequestOptions = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequest = async () =>
  new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
