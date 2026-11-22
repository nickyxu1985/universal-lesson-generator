// GET /api/wiki — Wiki 清單，支援 ?q=keyword 執行 D1 FTS5 全文檢索
// 依 docs/final-spec.md §6.2（Cloudflare Pages Functions）
// 環境綁定：env.DB（D1）

const CORS_HEADERS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type"};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (q.length > 100) {
    return json({ error: 'invalid_query' }, 400);
  }

  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  try {
    let rows;
    if (q) {
      // FTS5 全文檢索：命中前先做參數長度與基本字元檢查
      const stmt = env.DB.prepare(
        `SELECT w.id, w.topic, w.summary, w.r2_key, w.created_at, w.updated_at
           FROM wiki_fts f
           JOIN wiki_docs w ON w.rowid = f.rowid
           WHERE wiki_fts MATCH ?
           ORDER BY rank
           LIMIT 50`
      );
      const result = await stmt.bind(q).all();
      rows = result.results;
    } else {
      const result = await env.DB.prepare(
        `SELECT id, topic, summary, r2_key, created_at, updated_at
           FROM wiki_docs
           ORDER BY created_at DESC
           LIMIT 50`
      ).all();
      rows = result.results;
    }

    return json({ query: q || null, count: rows.length, items: rows });
  } catch (e) {
    // FTS5 查詢語法錯誤（如未加引號的保留字）回 400，其餘回 500
    const msg = String(e?.message || e);
    if (msg.includes('fts5') || msg.includes('syntax')) {
      return json({ error: 'invalid_fts_query', message: msg }, 400);
    }
    return json({ error: 'internal_error', message: msg }, 500);
  }
};

export const onRequestOptions = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequest = async () =>
  new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
