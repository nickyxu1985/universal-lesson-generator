// GET /api/admin/lessons?limit=50 — 教案清單（created_at 倒序，category_name 由 JOIN categories 得來，tags 解析為陣列）
//   → { items:[{id,title,audience,style,category_id,category_name,tags,created_at}] }
// 依 docs/final-spec.md §6.2「ALL /api/admin/*」；契約對齊 public/assets/admin.js 開頭註解（切片 4 已上線）
// 認證由 Cloudflare Access 保護（部署方職責），本程式不自行做認證
// 環境綁定：env.DB（D1）；lessons.tags 欄位由 migrations/0002_add_lesson_tags.sql 加入（存 JSON 陣列字串）

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

// tags 欄位存 JSON 陣列字串；壞資料一律退回 []，不讓列表炸掉
function parseTags(raw) {
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (e) {
    return [];
  }
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
      `SELECT l.id, l.title, l.audience, l.style, l.category_id,
              c.name AS category_name, l.tags, l.created_at
       FROM lessons l
       LEFT JOIN categories c ON c.id = l.category_id
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ?`
    ).bind(limit).all();
    const items = (results || []).map((r) => ({ ...r, tags: parseTags(r.tags) }));
    return json({ items });
  } catch (e) {
    console.error('[admin/lessons] list error:', e?.message || e);
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
