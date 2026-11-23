// PATCH /api/admin/categories/:id {name?, sort_order?} — 修改分類名稱與排序（至少送一個欄位；slug 不變）
// 依 docs/final-spec.md §6.2「ALL /api/admin/*」；契約對齊 public/assets/admin.js 開頭註解（切片 4 已上線）
// 認證由 Cloudflare Access 保護（部署方職責），本程式不自行做認證
// 環境綁定：env.DB（D1）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const NAME_MAX_CHARS = 50; // 與前端 input maxlength=50 一致

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

const countChars = (s) => [...s].length; // 中文字元正確計數

export const onRequestPatch = async ({ request, params, env }) => {
  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: 'invalid_category_id' }, 400);
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

  const updates = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || countChars(name) > NAME_MAX_CHARS) {
      return json({ error: 'invalid_name', hint: 'name 需為 1~50 字' }, 400);
    }
    updates.name = name;
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      return json({ error: 'invalid_sort_order', hint: 'sort_order 需為整數' }, 400);
    }
    updates.sort_order = body.sort_order;
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return json({ error: 'nothing_to_update' }, 400);
  }

  try {
    const existing = await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first();
    if (!existing) {
      return json({ error: 'category_not_found', id }, 404);
    }

    if (updates.name !== undefined) {
      const dup = await env.DB.prepare(
        'SELECT 1 AS x FROM categories WHERE name = ? AND id != ?'
      ).bind(updates.name, id).first();
      if (dup) {
        return json({ error: 'category_name_taken' }, 409);
      }
    }

    const setSql = keys.map((k) => k + ' = ?').join(', ');
    await env.DB.prepare('UPDATE categories SET ' + setSql + ' WHERE id = ?')
      .bind(...keys.map((k) => updates[k]), id)
      .run();

    const row = await env.DB.prepare(
      'SELECT id, name, slug, sort_order FROM categories WHERE id = ?'
    ).bind(id).first();
    return json(row, 200);
  } catch (e) {
    if (String(e?.message || e).includes('UNIQUE')) {
      return json({ error: 'category_name_taken' }, 409);
    }
    console.error('[admin/categories/:id] update error:', e?.message || e);
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
