// /s/:id：全螢框簡報（R2 HTML）＋懸浮工具列（詳案預覽／下載）
// 路徑由 Cloudflare Pages _redirects（/s/* -> /s/index.html, 200）落在本頁，
// id 從 location.pathname 解析：/s/<lesson_id>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var parts = location.pathname.split('/').filter(Boolean); // ['s', '<id>']
  var lessonId = parts[0] === 's' && parts[1] ? decodeURIComponent(parts[1]) : null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  if (!lessonId) {
    $('slide-loading').textContent = '網址格式應為 /s/<lesson_id>';
    return;
  }

  // ---- 簡報主框 ----
  // B2 修正：Pages Functions 未實作 HEAD（一律回 405），原 HEAD 預探在真實契約下
  // 永遠不會觸發 404 分支，不存在的教案會在 iframe 內顯示裸 JSON。
  // 改為先以 GET 探測：不存在 → 友善 404 頁（不載入 iframe）；存在 → 才載入簡報。
  var frame = $('slide-frame');
  var slideUrl = '/api/lessons/' + encodeURIComponent(lessonId) + '/html';
  frame.addEventListener('load', function () {
    $('slide-loading').hidden = true;
    frame.hidden = false;
  });
  fetch(slideUrl)
    .then(function (res) {
      if (!res.ok) { showMissing(res.status); return; }
      frame.src = slideUrl;          // 探測成功才載入，避免閃現裸 JSON
      $('toolbar').hidden = false;
    })
    .catch(function () {
      // 網路探測失敗（暫態/離線）：仍交由 iframe 嘗試載入
      frame.src = slideUrl;
      $('toolbar').hidden = false;
    });
  function showMissing(status) {
    $('slide-loading').innerHTML =
      '<h2 style="margin-top:2rem">找不到這份簡報</h2>' +
      '<p style="color:#adb5bd">lesson_id: ' + esc(lessonId) + '（HTTP ' + status + '）</p>' +
      '<p style="color:#adb5bd"><a href="/" style="color:#74c0fc">← 回首頁</a></p>';
    $('toolbar').hidden = true;
    $('note-overlay').hidden = true; // 順手確保 overlay 關閉（B1 的 [hidden] 修正為雙保險）
  }

  // ---- 詳案：預覽切換 ----
  var noteFetched = null; // cache
  function fetchNote() {
    if (noteFetched) return Promise.resolve(noteFetched);
    return fetch('/api/lessons/' + encodeURIComponent(lessonId) + '/note')
      .then(function (res) {
        if (!res.ok) throw new Error('note_' + res.status);
        return res.text();
      })
      .then(function (md) { noteFetched = md; return md; });
  }

  // ---- 安全：Markdown 渲染必經 DOMPurify 消毒後才入 innerHTML ----
  // R2 內容為 LLM 生成之 Markdown，marked 會直通原生 HTML；
  // 任一 CDN（marked/DOMPurify）失效時一律降級為純文字 <pre>，不渲染未消毒 HTML。
  function renderNote(md) {
    if (window.marked && window.DOMPurify) {
      try {
        return window.DOMPurify.sanitize(window.marked.parse(md));
      } catch (e) { /* fall through */ }
    }
    return '<pre>' + esc(md) + '</pre>';
  }

  $('btn-note-toggle').addEventListener('click', function () {
    var overlay = $('note-overlay');
    if (!overlay.hidden) { overlay.hidden = true; return; }
    $('note-body').innerHTML = '<p class="muted">詳案載入中…</p>';
    overlay.hidden = false;
    fetchNote()
      .then(function (md) {
        $('note-body').innerHTML = renderNote(md);
      })
      .catch(function () {
        $('note-body').innerHTML = '<div class="notice err">詳案讀取失敗（.md 可能尚未產出或已下架）。</div>';
      });
  });
  $('btn-note-close').addEventListener('click', function () { $('note-overlay').hidden = true; });

  // ---- 詳案：下載 .md ----
  $('btn-note-dl').addEventListener('click', function () {
    fetchNote()
      .then(function (md) {
        var blob = new Blob([md], { type: 'text/markdown; charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = lessonId + '.md';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      })
      .catch(function () {
        alert('詳案下載失敗（.md 可能尚未產出或已下架）。');
      });
  });
})();
