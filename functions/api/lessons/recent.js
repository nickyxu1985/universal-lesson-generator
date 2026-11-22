// GET /api/lessons/recent — spec §6.2 契約路徑（與 functions/api/lessons/index.js 行為一致）
// 依 docs/final-spec.md §6.2（Cloudflare Pages Functions）
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

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const category = (url.searchParams.get('category') || '').trim();

  if (category.length > 100) {
    return json({ error: 'invalid_category' }, 400);
  }

  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  try {
    let rows;
    if (category) {
      const result = await env.DB.prepare(
        `SELECT l.id, l.title, l.topic, l.audience, l.style, l.category_id,
                 c.name AS category_name, c.slug AS category_slug,
                 l.wiki_id, l.created_at
          FROM lessons l
          LEFT JOIN categories c ON c.id = l.category_id
          WHERE c.slug = ?
          ORDER BY l.created_at DESC
          LIMIT 10`
      ).bind(category).all();
      rows = result.results;
    } else {
      const result = await env.DB.prepare(
        `SELECT l.id, l.title, l.topic, l.audience, l.style, l.category_id,
                 c.name AS category_name, c.slug AS category_slug,
                 l.wiki_id, l.created_at
          FROM lessons l
          LEFT JOIN categories c ON c.id = l.category_id
          ORDER BY l.created_at DESC
          LIMIT 10`
      ).all();
      rows = result.results;
    }

    return json({ count: rows.length, items: rows });
  } catch (e) {
    // 不對外公開內部錯誤細節（D1/SQLite 例外可能含 schema/SQL 片段），僅留 log
    console.error('[lessons/recent] internal error:', e?.message || e);
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
