// GET /api/wiki/:id — 讀取指定 Wiki 的 R2 Markdown 內文、來源網址與關聯教案
// 依 docs/final-spec.md §6.2（Cloudflare Pages Functions）
// 環境綁定（於 wrangler.toml 定義）：
//   env.DB          — Cloudflare D1
//   env.WIKI_BUCKET — Cloudflare R2（存放 wiki/{slug}.md）

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

export const onRequestGet = async (context) => {
  const { params, env } = context;
  const id = String(params.id || '').trim();

  if (!id || id.length > 100) {
    return json({ error: 'invalid_wiki_id' }, 400);
  }

  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  try {
    // 1. 查 wiki_docs 索引
    const doc = await env.DB.prepare(
      'SELECT id, topic, summary, source_urls, r2_key, created_at, updated_at FROM wiki_docs WHERE id = ?'
    ).bind(id).first();

    if (!doc) {
      return json({ error: 'wiki_not_found', id }, 404);
    }

    // 2. 讀取 R2 Markdown 內文（實體檔案不在時仍回傳索引資訊，markdown 為 null）
    let markdown = null;
    if (doc.r2_key) {
      try {
        const object = await env.WIKI_BUCKET?.get(doc.r2_key);
        if (object) {
          markdown = await object.text();
        }
      } catch (e) {
        // R2 讀取失敗不視為整體失敗，僅回傳 null 內文
      }
    }

    // 3. 來源網址（JSON 陣列字串 -> 陣列）
    let sources = [];
    try {
      sources = doc.source_urls ? JSON.parse(doc.source_urls) : [];
    } catch (e) {
      sources = [];
    }

    // 4. 關聯教案（以 wiki_id 反查 lessons）
    const { results: relatedLessons } = await env.DB.prepare(
      'SELECT id, title, audience, style, category_id, created_at FROM lessons WHERE wiki_id = ? ORDER BY created_at DESC'
    ).bind(id).all();

    return json({
      id: doc.id,
      topic: doc.topic,
      summary: doc.summary,
      sources,
      markdown,
      r2_key: doc.r2_key,
      related_lessons: relatedLessons || [],
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    });
  } catch (e) {
    return json({ error: 'internal_error', message: String(e?.message || e) }, 500);
  }
};

export const onRequestOptions = async () => new Response(null, { status: 204, headers: CORS_HEADERS });

// 僅允許 GET / OPTIONS
export const onRequest = async (context) =>
  new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
