// GET /s/:id — 簡報檢視器。
// _redirects 的靜態改寫（/s/* → /s/index.html）在直接上傳部署下未生效
// （實測：/s/<id> 會回首頁，連不存在的路徑也回首頁），改由 Functions
// 直接回傳檢視器 HTML。前端 public/assets/s.js 會從網址路徑解析
// lesson_id，再經 GET /api/lessons/:id/html 把 R2 簡報載入 iframe。
export async function onRequest(context) {
  const { env } = context;
  const url = new URL(context.request.url);
  // 以靜態資源繫結取 public/s/index.html（目錄 /s/ 的 index）。
  const assetRes = await env.ASSETS.fetch(new URL('/s/', url.origin));
  const html = await assetRes.text();
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
