// GET /api/admin/quota — 今日 daily_quota 用量與上限
//   → { date, ai_checks, ai_daily_limit, lessons_created, lessons_daily_limit }
// 依 docs/final-spec.md §6.2「ALL /api/admin/*」；上限常數與 functions/api/generate.js 一致
// 契約對齊 public/assets/admin.js 開頭註解（切片 4 已上線）
// 認證由 Cloudflare Access 保護（部署方職責），本程式不自行做認證
// 環境綁定：env.DB（D1）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 與 generate.js 一致（SPEC §4 第一層硬限制）
const AI_DAILY_LIMIT = 100;      // 每日 Workers AI 審核次數上限
const LESSONS_DAILY_LIMIT = 20;  // 每日派發（jobs）上限

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

export const onRequestGet = async ({ env }) => {
  if (!env.DB) {
    return json({ error: 'db_not_configured' }, 500);
  }

  const date = todayUTC();

  try {
    const row = await env.DB.prepare(
      'SELECT ai_checks, lessons_created FROM daily_quota WHERE date = ?'
    ).bind(date).first();
    return json({
      date,
      ai_checks: row?.ai_checks ?? 0,
      ai_daily_limit: AI_DAILY_LIMIT,
      lessons_created: row?.lessons_created ?? 0,
      lessons_daily_limit: LESSONS_DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[admin/quota] read error:', e?.message || e);
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
