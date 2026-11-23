// /admin：分類管理、教案管理、daily_quota 用量、任務 slack_thread_ts 稽核
// 後端 /api/admin/* 屬切片 5（尚未上線）：所有呼叫一律優雅降級，
// fetch 失敗／404 時顯示該區塊的「尚未上線」提示（admin-offline），不報錯當機。
//
// 本頁依 SPEC §6.2「ALL /api/admin/*：分類管理（CRUD）、教案中繼資料修改、
// 刪除異常教案與 R2 檔案清理」假設之契約（供切片 5 後端實作對齊）：
//   GET    /api/admin/categories            -> { items:[{id,name,slug,sort_order}] }
//   POST   /api/admin/categories  {name}    -> 201 {id,...}
//   PATCH  /api/admin/categories/:id {name?, sort_order?}
//   GET    /api/admin/lessons?limit=50      -> { items:[{id,title,audience,style,category_id,category_name,created_at}] }
//   PATCH  /api/admin/lessons/:id {category_id?, tags?: string[]}
//     （spec §6.1「修改教案所屬分類與標籤」；只送「有變動」的欄位，未變動不送、
//       完全沒有變動時不發 PATCH；category_id 型別 number|null，null＝清除分類
//       （設為未分類）——§5 D1 lessons.category_id 本來就允許 null，切片 5 後端請對齊此契約；
//       注意 §5 D1 lessons 表目前尚無 tags 欄位，tags 的儲存 schema 需由切片 5 後端
//       + D1 遷移定義，本頁先照此契約送出）
//   DELETE /api/admin/lessons/:id          （R2 清理由後端負責）
//   GET    /api/admin/quota                 -> { date, ai_checks, ai_daily_limit, lessons_created, lessons_daily_limit }
//   GET    /api/admin/jobs?limit=50         -> { items:[{id,topic,audience,style,status,progress,slack_thread_ts,lesson_id,created_at}] }
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 404 / network error -> 視為「尚未上線」，打開該區 offline 提示
  function apiCall(path, opts, offlineElId) {
    return fetch(path, opts)
      .then(function (res) {
        if (res.status === 404) { offline(offlineElId); return null; }
        return res.json().then(function (b) { return { status: res.status, body: b }; });
      })
      .catch(function () { offline(offlineElId); return null; });
  }
  function offline(id) {
    if (id) { $(id).hidden = false; }
  }
  function notice(msg) { return '<div class="notice err">' + esc(msg) + '</div>'; }

  var AUDIENCE_LABELS = { elementary: '國小', junior: '國中', senior: '高中' };
  var STATUS_LABELS = { queued: '排隊中', researching: '蒐集資料', writing: '撰寫中', done: '完成', failed: '失敗' };

  // L1 修正：Slack 網頁版 thread 連結格式為 /archives/<channel>/p<秒10碼><小數補滿6位>，
  // 例：ts "1795401325.715629" → p1795401325715629；小數不足 6 位時右補零，不可直接用原 ts。
  function threadPermalink(base, ts) {
    var m = String(ts).replace('.', '');
    while (m.length < 16) m += '0';
    return base + '/p' + m;
  }

  // ---------- ① 分類管理 ----------
  function loadCategories() {
    apiCall('/api/admin/categories', null, 'cat-offline').then(function (r) {
      if (!r) return;
      if (r.status !== 200) { $('cat-list').innerHTML = notice('讀取分類失敗：' + (r.body.error || r.status)); return; }
      var items = r.body.items || [];
      // 注意：HTML 不允許 <form> 直接包住表格列（form-in-tr 會被瀏覽器重排而失效），
      // 這裡每列用 <tr data-id> 包 input，按「儲存」按鈕時回讀該列欄位送 PATCH。
      var html = '<table><tr><th>名稱</th><th>slug</th><th>排序</th><th>操作</th></tr>';
      items.forEach(function (c) {
        html += '<tr class="cat-row" data-id="' + esc(c.id) + '">' +
          '<td><input type="text" class="cat-name" value="' + esc(c.name) + '" maxlength="50"></td>' +
          '<td>' + esc(c.slug) + '</td>' +
          '<td><input type="number" class="cat-sort" value="' + esc(c.sort_order) + '" style="width:70px"></td>' +
          '<td><button type="button" class="btn secondary" data-act="save">儲存</button></td></tr>';
      });
      html += '</table><small class="hint">排序數字越小越前面（sort_order）。</small>';
      $('cat-list').innerHTML = html;
      $('cat-list').querySelectorAll('tr.cat-row').forEach(function (tr) {
        tr.querySelector('[data-act="save"]').addEventListener('click', function () {
          var id = tr.getAttribute('data-id');
          apiCall('/api/admin/categories/' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: tr.querySelector('.cat-name').value.trim(),
              sort_order: Number(tr.querySelector('.cat-sort').value) || 0,
            }),
          }, 'cat-offline').then(function (r2) {
            if (r2 && r2.status !== 200) alert('更新失敗：' + (r2.body.error || r2.status));
            loadCategories();
          });
        });
      });
    });
  }

  $('cat-add-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = $('cat-name').value.trim();
    if (!name) return;
    apiCall('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name }),
    }, 'cat-offline').then(function (r) {
      if (r && r.status !== 201) alert('新增失敗：' + (r.body.error || r.status));
      $('cat-name').value = '';
      loadCategories();
    });
  });

  // ---------- ② 教案管理（改分類與標籤 / 下架刪除） ----------
  function loadLessons() {
    apiCall('/api/admin/lessons?limit=50', null, 'lesson-offline').then(function (r) {
      if (!r) return;
      if (r.status !== 200) { $('lesson-admin-list').innerHTML = notice('讀取教案失敗：' + (r.body.error || r.status)); return; }
      // 需要分類清單做下拉；若分類 API 尚未上線則降級為純文字顯示
      apiCall('/api/admin/categories', null, null).then(function (rc) {
        var cats = (rc && rc.status === 200 && rc.body.items) || [];
        var items = r.body.items || [];
        var html = '<table><tr><th>標題</th><th>受眾/風格</th><th>目前分類</th><th>標籤（逗號分隔）</th><th>建立時間</th><th>操作</th></tr>';
        items.forEach(function (l) {
          // B3 修正：未分類教案（category_id 為 null/undefined）也要有對應的「未分類」選項，
          // 否則 select 會預設落在第一個分類上，按「儲存變更」就會把未分類教案誤寫入 category_id。
          var opts = '<option value=""' + (!l.category_id ? ' selected' : '') + '>未分類</option>' +
            cats.map(function (c) {
              return '<option value="' + esc(c.id) + '"' + (c.id === l.category_id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
            }).join('') + '</select>';
          var tags = Array.isArray(l.tags) ? l.tags.join(', ') : '';
          // B3 修正（下半）：把「載入時的原始值」存在 dataset，儲存時據此做變動比對，
          // PATCH 只送有變動的欄位（未動任何欄位 → 不發 PATCH，杜絕靜默覆寫）。
          var origTags = JSON.stringify(Array.isArray(l.tags) ? l.tags.map(String) : []);
          html += '<tr class="row-actions" data-id="' + esc(l.id) + '"' +
            ' data-cat="' + esc(l.category_id == null ? '' : l.category_id) + '"' +
            ' data-tags="' + esc(origTags) + '">' +
            '<td>' + esc(l.title) + '</td>' +
            '<td><span class="tag">' + (AUDIENCE_LABELS[l.audience] || esc(l.audience)) + '</span><span class="tag">' + esc(l.style) + '</span></td>' +
            '<td>' + (cats.length
              ? '<select class="lesson-cat">' + opts
              : esc(l.category_name || '未分類')) + '</td>' +
            '<td><input type="text" class="lesson-tags" value="' + esc(tags) + '" placeholder="標籤1, 標籤2" maxlength="200"></td>' +
            '<td>' + esc(l.created_at || '') + '</td>' +
            '<td><button type="button" class="btn secondary" data-act="setcat">儲存變更</button> ' +
            '<button type="button" class="btn" style="background:var(--err)" data-act="del">下架刪除</button></td></tr>';
        });
        html += '</table>';
        $('lesson-admin-list').innerHTML = html;
        $('lesson-admin-list').querySelectorAll('tr.row-actions').forEach(function (tr) {
          var id = tr.getAttribute('data-id');
          // 儲存變更：PATCH 只送「有變動」的欄位
          tr.querySelector('[data-act="setcat"]').addEventListener('click', function () {
            var sel = tr.querySelector('.lesson-cat');
            var tagsInput = tr.querySelector('.lesson-tags');
            var origCat = tr.getAttribute('data-cat') || '';      // '' = 載入時未分類
            var origTags = JSON.parse(tr.getAttribute('data-tags') || '[]');
            var body = {};
            // B3 修正（上半）：分類欄位一律與「載入時原始值」比對，有變動才送：
            //   - 所選分類非空且不同 → 送該分類 id（Number）
            //   - 已分類教案改選「未分類」(value '') → 送 PATCH {category_id: null}（清除分類；
            //     D1 category_id 允許 null，null＝未分類，此為對切片 5 後端的契約定義）
            //   - 本來就未分類且仍是未分類 → 沒有變動，不送
            // 標籤解析成陣列後與原始值逐項比對，不同才送。完全沒有變動 → 不發 PATCH。
            if (sel) {
              if (sel.value === '') {
                if (origCat !== '') body.category_id = null;   // 已分類 → 改回未分類
              } else if (String(sel.value) !== origCat) {
                body.category_id = Number(sel.value);
              }
            }
            if (tagsInput) {
              var newTags = tagsInput.value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);
              var tagsChanged = newTags.length !== origTags.length ||
                newTags.some(function (t, i) { return origTags[i] !== t; });
              if (tagsChanged) body.tags = newTags;
            }
            if (!Object.keys(body).length) { alert('欄位沒有變更，未送出更新。'); return; }
            apiCall('/api/admin/lessons/' + encodeURIComponent(id), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }, 'lesson-offline').then(function (r2) {
              if (r2 && r2.status !== 200) alert('更新失敗：' + (r2.body.error || r2.status));
              else loadLessons();
            });
          });
          tr.querySelector('[data-act="del"]').addEventListener('click', function () {
            if (!window.confirm('確認下架並刪除此教案（含 R2 檔案）？此操作不可復原。')) return;
            apiCall('/api/admin/lessons/' + encodeURIComponent(id), { method: 'DELETE' }, 'lesson-offline')
              .then(function (r2) {
                if (r2 && r2.status !== 200 && r2.status !== 204) alert('刪除失敗：' + ((r2.body && r2.body.error) || r2.status));
                else loadLessons();
              });
          });
        });
      });
    });
  }

  // ---------- ③ 每日額度 ----------
  function loadQuota() {
    apiCall('/api/admin/quota', null, 'quota-offline').then(function (r) {
      if (!r) { $('quota-box').textContent = ''; return; }
      if (r.status !== 200) { $('quota-box').innerHTML = notice('讀取額度失敗'); return; }
      var q = r.body;
      $('quota-box').innerHTML =
        '<div><b>' + esc(q.date) + '</b>' +
        '　AI 審核：<b>' + esc(q.ai_checks) + '</b> / ' + esc(q.ai_daily_limit || 100) +
        '　派單：<b>' + esc(q.lessons_created) + '</b> / ' + esc(q.lessons_daily_limit || 20) + '</div>';
    });
  }

  // ---------- ④ 任務列表（slack_thread_ts 稽核） ----------
  function loadJobs() {
    apiCall('/api/admin/jobs?limit=50', null, 'jobs-offline').then(function (r) {
      if (!r) return;
      if (r.status !== 200) { $('jobs-table').innerHTML = notice('讀取任務失敗'); return; }
      var items = r.body.items || [];
      var base = (window.SLACK_CHANNEL_URL || '').trim().replace(/\/+$/, '');
      var html = '<table><tr><th>Job ID</th><th>主題</th><th>受眾/風格</th><th>狀態</th><th>進度</th><th>Slack Thread</th><th>建立時間</th></tr>';
      items.forEach(function (j) {
        var ts = j.slack_thread_ts;
        var slackCell;
        if (ts && base) {
          slackCell = '<a href="' + esc(threadPermalink(base, ts)) + '" target="_blank" rel="noopener">' + esc(ts) + ' ↗</a>';
        } else if (ts) {
          slackCell = esc(ts) + ' <small class="hint">(於本頁頂部設定點填 SLACK_CHANNEL_URL 即可點回 Slack)</small>';
        } else {
          slackCell = '<span class="muted">—</span>';
        }
        html += '<tr><td>' + esc(j.id) + '</td><td>' + esc(j.topic) + '</td>' +
          '<td><span class="tag">' + (AUDIENCE_LABELS[j.audience] || esc(j.audience)) + '</span><span class="tag">' + esc(j.style) + '</span></td>' +
          '<td>' + (STATUS_LABELS[j.status] || esc(j.status)) + '</td><td>' + esc(j.progress) + '%</td>' +
          '<td>' + slackCell + '</td><td>' + esc(j.created_at || '') + '</td></tr>';
      });
      html += '</table>';
      if (items.length === 0) html += '<div class="muted">目前沒有任務紀錄。</div>';
      $('jobs-table').innerHTML = html;
    });
  }

  loadCategories();
  loadLessons();
  loadQuota();
  loadJobs();
})();
