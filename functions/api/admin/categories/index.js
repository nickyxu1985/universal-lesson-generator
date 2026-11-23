// GET  /api/admin/categories      — 分類清單（依 sort_order、id 排序）→ { items:[{id,name,slug,sort_order}] }
// POST /api/admin/categories {name} — 新增分類，後端由 name 衍生唯一 URL-safe slug → 201 {id,name,slug,sort_order}
// 依 docs/final-spec.md §6.2「ALL /api/admin/*」；契約對齊 public/assets/admin.js 開頭註解（切片 4 已上線）
// 認證由 Cloudflare Access 保護（部署方職責），本程式不自行做認證
// 環境綁定：env.DB（D1）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const NAME_MAX_CHARS = 50; // 與前端 input maxlength=50 一致
const SLUG_MAX = 60;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

const countChars = (s) => [...s].length; // 中文字元正確計數

// 由 name 衍生 URL-safe slug：NFKD 去重音 → 小寫 → 非 [a-z0-9] 併成 '-' → 收合首尾；
// 純中文等無法拉丁化的名稱會得到空字串，改用 cat-<亂數> 兜底
function slugify(name) {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return s || 'cat-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

async function slugExists(env, slug) {
  const row = await env.DB.prepare('SELECT 1 AS x FROM categories WHERE slug = ?').bind(slug).first();
  return !!row;
}

async function uniqueSlug(env, base) {
  let slug = base;
  for (let i = 2; i <= 100 && (await slugExists(env, slug)); i++) {
    slug = base.slice(0, SLUG_MAX - String(i).length - 1) + '-' + i;
  }
  if (await slugExists(env, slug)) {
    slug = base.slice(0, SLUG_MAX - 9) + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  return slug;
}

export const onRequestGet = async ({ env }) => {
  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }
  try {
    const { results } = await env.DB.prepare(
      'SELECT id, name, slug, sort_order FROM categories ORDER BY sort_order ASC, id ASC'
    ).all();
    return json({ items: results || [] });
  } catch (e) {
    console.error('[admin/categories] list error:', e?.message || e);
    return json({ error: 'internal_error' }, 500);
  }
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid_body' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || countChars(name) > NAME_MAX_CHARS) {
    return json({ error: 'invalid_name', hint: 'name 需為 1~50 字' }, 400);
  }

  try {
    const dup = await env.DB.prepare('SELECT 1 AS x FROM categories WHERE name = ?').bind(name).first();
    if (dup) {
      return json({ error: 'category_name_taken' }, 409);
    }

    const slug = await uniqueSlug(env, slugify(name));
    const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').first();
    const sortOrder = Number(maxRow?.m || 0) + 1;

    const res = await env.DB.prepare(
      'INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)'
    ).bind(name, slug, sortOrder).run();

    const row = await env.DB.prepare(
      'SELECT id, name, slug, sort_order FROM categories WHERE id = ?'
    ).bind(res.meta.last_row_id).first();

    return json(row, 201);
  } catch (e) {
    // UNIQUE 競態（同名同線被併發插入）→ 409；不洩漏內部訊息
    if (String(e?.message || e).includes('UNIQUE')) {
      return json({ error: 'category_name_taken' }, 409);
    }
    console.error('[admin/categories] create error:', e?.message || e);
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
