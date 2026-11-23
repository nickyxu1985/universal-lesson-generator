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
  var frame = $('slide-frame');
  frame.src = '/api/lessons/' + encodeURIComponent(lessonId) + '/html';
  frame.addEventListener('load', function () {
    $('slide-loading').hidden = true;
    frame.hidden = false;
  });
  // 載入失敗（404/500 回 JSON）時 iframe 不觸發 load 事件內容可辨識 → 以 fetch 先探測
  fetch('/api/lessons/' + encodeURIComponent(lessonId) + '/html', { method: 'HEAD' })
    .then(function (res) {
      if (!res.ok && res.status !== 405) {
        $('slide-loading').innerHTML =
          '<h2 style="margin-top:2rem">找不到這份簡報</h2>' +
          '<p style="color:#adb5bd">lesson_id: ' + esc(lessonId) + '（HTTP ' + res.status + '）</p>' +
          '<p style="color:#adb5bd"><a href="/" style="color:#74c0fc">← 回首頁</a></p>';
        $('toolbar').hidden = true;
      }
    })
    .catch(function () { /* 探測失敗仍交由 iframe 自行顯示 */ });

  $('toolbar').hidden = false;

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

  $('btn-note-toggle').addEventListener('click', function () {
    var overlay = $('note-overlay');
    if (!overlay.hidden) { overlay.hidden = true; return; }
    $('note-body').innerHTML = '<p class="muted">詳案載入中…</p>';
    overlay.hidden = false;
    fetchNote()
      .then(function (md) {
        var html = (window.marked)
          ? window.marked.parse(md)
          : '<pre>' + esc(md) + '</pre>'; // marked CDN 失效時降級
        $('note-body').innerHTML = html;
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
