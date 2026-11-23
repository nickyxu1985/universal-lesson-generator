// PATCH  /api/admin/lessons/:id {category_id?, tags?} — 只更新有送的欄位；category_id: number|null（null＝清除分類）
// DELETE /api/admin/lessons/:id — 刪除教案列並清理 R2 上的 r2_html_key、r2_note_key（wiki_docs 是共享知識庫，不刪）
// 依 docs/final-spec.md §6.2「ALL /api/admin/*」；契約對齊 public/assets/admin.js 開頭註解（切片 4 已上線）
// 認證由 Cloudflare Access 保護（部署方職責），本程式不自行做認證
// 環境綁定：env.DB（D1）、env.WIKI_BUCKET（R2；lessons/、notes/、wiki/ 共用前綴區分）
// lessons.tags 欄位由 migrations/0002_add_lesson_tags.sql 加入（存 JSON 陣列字串）
// lessons.admin_status 欄位由 migrations/0003_add_lesson_admin_status.sql 加入（'active'/'deleting'/'cleanup_failed'）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const LESSON_ID_MAX = 100;
const TAGS_MAX = 20;
const TAG_MAX_CHARS = 50;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

const countChars = (s) => [...s].length; // 中文字元正確計數

function parseTags(raw) {
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (e) {
    return [];
  }
}

function validLessonId(params) {
  const id = String(params.id || '').trim();
  return id && id.length <= LESSON_ID_MAX ? id : null;
}

async function readLessonWithCategory(env, id) {
  return env.DB.prepare(
    `SELECT l.id, l.category_id, c.name AS category_name, l.tags
     FROM lessons l LEFT JOIN categories c ON c.id = l.category_id
     WHERE l.id = ?`
  ).bind(id).first();
}

export const onRequestPatch = async ({ request, params, env }) => {
  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  const id = validLessonId(params);
  if (!id) {
    return json({ error: 'invalid_lesson_id' }, 400);
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

  if (body.category_id !== undefined) {
    if (body.category_id === null) {
      updates.category_id = null; // null＝清除分類（設為未分類）；D1 lessons.category_id 本來就允許 null
    } else if (
      typeof body.category_id === 'number' &&
      Number.isInteger(body.category_id) &&
      body.category_id > 0
    ) {
      updates.category_id = body.category_id;
    } else {
      return json({ error: 'invalid_category_id', hint: 'category_id 需為正整數或 null' }, 400);
    }
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > TAGS_MAX) {
      return json({ error: 'invalid_tags', hint: 'tags 需為字串陣列（至多 ' + TAGS_MAX + ' 個）' }, 400);
    }
    const tags = body.tags.map((t) => (typeof t === 'string' ? t.trim() : ''));
    if (tags.some((t) => !t || countChars(t) > TAG_MAX_CHARS)) {
      return json({ error: 'invalid_tags', hint: '每個標籤需為 1~' + TAG_MAX_CHARS + ' 字' }, 400);
    }
    updates.tags = JSON.stringify(tags);
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return json({ error: 'nothing_to_update' }, 400);
  }

  try {
    const existing = await env.DB.prepare('SELECT id FROM lessons WHERE id = ?').bind(id).first();
    if (!existing) {
      return json({ error: 'lesson_not_found', id }, 404);
    }

    if (updates.category_id !== null && updates.category_id !== undefined) {
      const cat = await env.DB.prepare(
        'SELECT 1 AS x FROM categories WHERE id = ?'
      ).bind(updates.category_id).first();
      if (!cat) {
        return json({ error: 'invalid_category_id', hint: '分類不存在' }, 400);
      }
    }

    const setSql = keys.map((k) => k + ' = ?').join(', ');
    await env.DB.prepare('UPDATE lessons SET ' + setSql + ' WHERE id = ?')
      .bind(...keys.map((k) => updates[k]), id)
      .run();

    const row = await readLessonWithCategory(env, id);
    return json({
      id: row.id,
      category_id: row.category_id,
      category_name: row.category_name,
      tags: parseTags(row.tags),
    }, 200);
  } catch (e) {
    console.error('[admin/lessons/:id] update error:', e?.message || e);
    return json({ error: 'internal_error' }, 500);
  }
};

export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }
  if (!env.WIKI_BUCKET) {
    return json({ error: 'r2_not_configured' }, 500);
  }

  const id = validLessonId(params);
  if (!id) {
    return json({ error: 'invalid_lesson_id' }, 400);
  }

  let lesson;
  try {
    lesson = await env.DB.prepare(
      'SELECT id, r2_html_key, r2_note_key FROM lessons WHERE id = ?'
    ).bind(id).first();
  } catch (e) {
    console.error('[admin/lessons/:id] read error:', e?.message || e);
    return json({ error: 'internal_error' }, 500);
  }
  if (!lesson) {
    return json({ error: 'lesson_not_found', id }, 404);
  }

  // P2 修正：動手清 R2 之前先把教案改為非公開（admin_status='deleting'），之後無論哪一步失敗
  // （含第一個 key 成功、第二個 key 失敗），公開 recent／教案頁都不會再露出只剩殘鑰的 404 教案。
  // 既有列預設 'active'，此欄位由 migrations/0003_add_lesson_admin_status.sql 加入
  try {
    await env.DB.prepare(
      "UPDATE lessons SET admin_status = 'deleting' WHERE id = ?"
    ).bind(id).run();
  } catch (e) {
    console.error('[admin/lessons/:id] mark deleting error:', e?.message || e);
    return json({ error: 'internal_error' }, 500);
  }

  const markCleanupFailed = async () => {
    try {
      await env.DB.prepare(
        "UPDATE lessons SET admin_status = 'cleanup_failed' WHERE id = ?"
      ).bind(id).run();
    } catch (e) {
      console.error('[admin/lessons/:id] mark cleanup_failed error:', e?.message || e);
    }
  };

  // 先清 R2、成功後才刪 D1 列（不做跨 D1/R2 原子交易，但失敗必須可見且可重試）：
  // 任一 key 刪除拋例外部 → 回 502、標記 cleanup_failed、保留 lessons 列與兩個 r2 keys，
  // 管理員可用同一 DELETE 重試（重試時已刪掉的 key 在 R2 為 no-op，不會誤刪）
  for (const key of [lesson.r2_html_key, lesson.r2_note_key]) {
    if (!key) continue;
    try {
      await env.WIKI_BUCKET.delete(key);
    } catch (e) {
      console.error('[admin/lessons/:id] r2 delete error:', e?.message || e);
      await markCleanupFailed();
      return json({ error: 'r2_delete_failed' }, 502);
    }
  }

  // R2 清掉後才刪 lessons 列（wiki_docs 是共享知識庫不刪、jobs 歷史保留）；
  // D1 刪除失敗也回錯並標記 cleanup_failed（列與 keys 仍在、可重試），
  // 不讓「檔已刪但列殘留」靜默發生
  try {
    await env.DB.prepare('DELETE FROM lessons WHERE id = ?').bind(id).run();
  } catch (e) {
    console.error('[admin/lessons/:id] d1 delete error:', e?.message || e);
    await markCleanupFailed();
    return json({ error: 'internal_error' }, 500);
  }

  return json({ ok: true, id }, 200);
};

export const onRequestOptions = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequest = async () =>
  new Response(JSON.stringify({ error: 'method_not_allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
