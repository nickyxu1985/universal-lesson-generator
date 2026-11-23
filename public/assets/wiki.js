// /wiki：關鍵字即時搜尋（GET /api/wiki?q=）＋點擊條目讀取 R2 Markdown（GET /api/wiki/:id）
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var searchTimer = null;
  var currentId = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- 清單 / 搜尋（debounce 300ms，即時）----
  function loadList(q) {
    var url = '/api/wiki' + (q ? '?q=' + encodeURIComponent(q) : '');
    $('wiki-status').textContent = q ? ('搜尋「' + q + '」中…') : '載入清單中…';
    fetch(url)
      .then(function (res) { return res.json().then(function (b) { return { status: res.status, body: b }; }); })
      .then(function (r) {
        if (r.status !== 200) {
          $('wiki-list').innerHTML = '<div class="notice err">查詢失敗：' + esc(r.body.error || 'unknown') + '</div>';
          $('wiki-status').textContent = '';
          return;
        }
        var items = r.body.items || [];
        $('wiki-status').textContent = q
          ? ('「' + q + '」找到 ' + items.length + ' 筆')
          : ('共 ' + items.length + ' 筆');
        var list = $('wiki-list');
        list.innerHTML = (items.length === 0) ? '<div class="muted">找不到符合的條目。</div>' : '';
        items.forEach(function (it) {
          var el = document.createElement('div');
          el.className = 'wiki-item' + (it.id === currentId ? ' selected' : '');
          el.setAttribute('data-id', it.id);
          el.innerHTML = '<div class="t">' + esc(it.topic) + '</div>' +
            '<div class="s">' + esc((it.summary || '').slice(0, 120)) + '</div>';
          el.addEventListener('click', function () { loadDoc(it.id); });
          list.appendChild(el);
        });
      })
      .catch(function () {
        $('wiki-list').innerHTML = '<div class="notice err">連線失敗，請稍後再試。</div>';
        $('wiki-status').textContent = '';
      });
  }

  // ---- 單筆條目：GET /api/wiki/:id -> marked.js 渲染 + 來源與關聯教案 ----
  // 安全：R2 Markdown 內容為 LLM 生成，marked 會直通原生 HTML，
  // 輸出必經 DOMPurify 消毒後才入 innerHTML；
  // 任一 CDN（marked/DOMPurify）失效時一律降級為純文字 <pre>，不渲染未消毒 HTML。
  function renderMarkdown(md) {
    if (window.marked && window.DOMPurify) {
      try {
        return window.DOMPurify.sanitize(window.marked.parse(md));
      } catch (e) { /* fall through */ }
    }
    return '<pre>' + esc(md) + '</pre>';
  }

  function loadDoc(id) {
    currentId = id;
    $('wiki-detail').innerHTML = '<div class="muted">載入中…</div>';
    fetch('/api/wiki/' + encodeURIComponent(id))
      .then(function (res) { return res.json().then(function (b) { return { status: res.status, body: b }; }); })
      .then(function (r) {
        if (r.status !== 200) {
          $('wiki-detail').innerHTML = '<div class="notice err">讀取失敗：' + esc(r.body.error || 'unknown') + '</div>';
          return;
        }
        var d = r.body;
        var sources = (d.sources || []);
        var related = (d.related_lessons || []);
        var html = '<h2>' + esc(d.topic) + '</h2>';
        if (d.summary) html += '<p class="muted">' + esc(d.summary) + '</p>';
        html += '<div class="markdown-body">' +
          (d.markdown ? renderMarkdown(d.markdown) : '<div class="notice info">此條目的 Markdown 原件尚無法讀取（可能尚未同步至 R2）。</div>') +
          '</div>';
        html += '<h2>引用來源（' + sources.length + ' 篇）</h2>';
        if (sources.length === 0) {
          html += '<div class="muted">本條目未登錄來源網址。</div>';
        } else {
          html += '<ul class="sources-list">' + sources.map(function (u) {
            var href = typeof u === 'string' ? u : (u && u.url) || '#';
            var label = (u && u.title) ? u.title : href;
            return '<li><a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label) + '</a></li>';
          }).join('') + '</ul>';
        }
        html += '<h2>關聯教案（' + related.length + ' 份）</h2>';
        if (related.length === 0) {
          html += '<div class="muted">尚無教案引用此條目。</div>';
        } else {
          html += related.map(function (l) {
            return '<div class="wiki-item"><a href="/s/' + encodeURIComponent(l.id) + '">' + esc(l.title) + '</a>' +
              ' <span class="muted">' + esc(l.created_at || '') + '</span></div>';
          }).join('');
        }
        $('wiki-detail').innerHTML = html;
      })
      .catch(function () {
        $('wiki-detail').innerHTML = '<div class="notice err">連線失敗，請稍後再試。</div>';
      });
  }

  $('wiki-q').addEventListener('input', function () {
    var q = this.value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { loadList(q); }, 300);
  });

  loadList('');
})();
