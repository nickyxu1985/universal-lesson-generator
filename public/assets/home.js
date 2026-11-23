// 首頁 /：生成表單（Turnstile）＋即時進度輪詢＋最近 10 筆教案
// 契約：POST /api/generate、GET /api/jobs/:id（4 欄）、GET /api/lessons/recent（?category=slug）
(function () {
  'use strict';
  var STORE_KEY = 'active_job_id';
  var POLL_INTERVAL = 4000; // 每 4 秒輪詢（spec §6.1）
  var POLL_TIMEOUT_MS = 30 * 60 * 1000; // L2：輪詢總超時 30 分鐘——逾時未完成即停止追蹤，不無限輪詢
  var pollTimer = null;
  var trackStartAt = null;
  var currentLessonId = null;

  var $ = function (id) { return document.getElementById(id); };
  var form = $('gen-form'), submitBtn = $('submit-btn'), errBox = $('form-error');
  var topicInput = $('topic'), topicCount = $('topic-count');

  // ---- 訊息 ----
  function showFormError(msg) { errBox.textContent = msg; errBox.hidden = false; }
  function clearFormError() { errBox.hidden = true; errBox.textContent = ''; }
  function showNotice(id, ok, msg) {
    var el = $(id);
    el.textContent = msg;
    el.className = 'notice ' + (ok ? 'ok' : 'err');
    el.hidden = false;
  }

  // ---- 主題字數（與後端一致：以字元計）----
  function countChars(s) { return Array.from(s).length; }
  topicInput.addEventListener('input', function () {
    topicCount.textContent = countChars(topicInput.value) + ' / 40';
  });

  // ---- Turnstile（部署端設定點見 index.html 頂部）----
  var turnstileToken = null;
  var turnstileWidgetId = null;
  window.onTurnstileSuccess = function (token) { turnstileToken = token; updateSubmit(); };

  function initTurnstile() {
    var sitekey = (window.TURNSTILE_SITEKEY || '').trim();
    if (!sitekey) {
      // 未設定：不渲染假 widget，明確顯示未設定並停用送出（不報錯當機）
      $('turnstile-notice').hidden = false;
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
    window.onTurnstileLoad = function () {
      turnstileWidgetId = window.turnstile.render('#turnstile-slot', {
        sitekey: sitekey,
        callback: window.onTurnstileSuccess,
        'error-callback': function () { turnstileToken = null; updateSubmit(); },
        'expired-callback': function () { turnstileToken = null; updateSubmit(); },
      });
    };
  }
  function turnstileReady() {
    var sitekey = (window.TURNSTILE_SITEKEY || '').trim();
    if (!sitekey) return false;           // 未設定時一律不送
    return !!turnstileToken;
  }
  function updateSubmit() { submitBtn.disabled = !turnstileReady(); }

  // ---- 表單送出 -> POST /api/generate ----
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearFormError();
    var topic = topicInput.value.trim();
    if (countChars(topic) < 1 || countChars(topic) > 40) {
      showFormError('主題需 1~40 字'); return;
    }
    var duration = Number($('duration').value || '50');
    if (!Number.isInteger(duration) || duration < 1 || duration > 240) {
      showFormError('簡報時間需為 1~240 的正整數（分鐘）'); return;
    }
    if (!turnstileReady()) { showFormError('請先完成人機驗證'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = '驗證並派單中…';
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic,
        audience: $('audience').value,
        style: $('style').value,
        duration: duration,
        turnstile_token: turnstileToken,
      }),
    })
      .then(function (res) { return res.json().then(function (b) { return { status: res.status, body: b }; }); })
      .then(function (r) {
        if (r.status !== 201 || !r.body.job_id) {
          var hints = {
            invalid_topic: '主題需 1~40 字',
            invalid_audience: '受眾值不合法',
            invalid_style: '風格值不合法',
            invalid_duration: '簡報時間需為 1~240 的正整數',
            turnstile_failed: '人機驗證失敗，請重新驗證',
            turnstile_not_configured: '驗證服務未設定（部署端問題）',
            content_rejected: '主題未通過內容審查',
            gatekeeper_unavailable: '審查服務暫時無法使用，請稍後再試',
            ip_rate_limited: '本日生成額度已用完（單一 IP 每日限 3 份）',
            daily_quota_exceeded: '本日全站生成額度已用完',
          };
          showFormError(hints[r.body.error] || ('送出失敗：' + (r.body.error || 'unknown')));
          turnstileToken = null; // 舊 token 已隨本請求消耗：重置 widget 後須重新驗證
          if (turnstileWidgetId !== null && window.turnstile) window.turnstile.reset(turnstileWidgetId);
          updateSubmit();
          submitBtn.textContent = '開始生成';
          return;
        }
        startTracking(r.body.job_id);
        turnstileToken = null; // 舊 token 已隨本請求消耗：重新驗證後才可再送
        if (turnstileWidgetId !== null && window.turnstile) window.turnstile.reset(turnstileWidgetId);
        updateSubmit();
        submitBtn.textContent = '已送出，完成人機驗證後可再生成下一份';
      })
      .catch(function () {
        showFormError('連線失敗，請稍後再試');
        submitBtn.disabled = !turnstileReady();
        submitBtn.textContent = '開始生成';
      });
  });

  // ---- 進度追蹤：localStorage 斷線續追 + 每 4 秒輪詢 ----
  function startTracking(jobId) {
    try { localStorage.setItem(STORE_KEY, jobId); } catch (e) { /* 無痕模式仍可當頁追蹤 */ }
    $('progress-card').hidden = false;
    $('result-actions').hidden = true;
    $('progress-jobid').textContent = 'Job ID: ' + jobId;
    if (pollTimer) clearInterval(pollTimer);
    trackStartAt = Date.now();
    pollNow(jobId);
    pollTimer = setInterval(function () { pollNow(jobId); }, POLL_INTERVAL);
    $('progress-card').scrollIntoView({ behavior: 'smooth' });
  }

  function stopTracking() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    trackStartAt = null;
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function pollNow(jobId) {
    // L2：總輪詢時限檢查——超過 POLL_TIMEOUT_MS 未完成即停止，避免無限輪詢
    if (trackStartAt !== null && Date.now() - trackStartAt > POLL_TIMEOUT_MS) {
      $('progress-msg').textContent = '⏱ 已達輪詢總時限（30 分鐘）仍未完成，停止追蹤。請稍後在「最近生成教案」確認結果，或重新生成。';
      $('progress-msg').className = 'progress-msg';
      stopTracking();
      return;
    }
    fetch('/api/jobs/' + encodeURIComponent(jobId))
      .then(function (res) { return res.json().then(function (b) { return { status: res.status, body: b }; }); })
      .then(function (r) {
        if (r.status === 404) {
          // 任務已不存在（過期／刪除或 id 無效）：明確提示並停止輪詢，不無限重試
          $('progress-msg').textContent = '❌ 找不到此任務（可能已過期或已刪除），請重新生成。';
          $('progress-msg').className = 'progress-msg';
          stopTracking();
          return;
        }
        if (r.status !== 200) { return; } // 網路/暫態問題：下輪再試，不當機
        renderProgress(r.body, jobId);
      })
      .catch(function () { /* 輪詢失敗靜默重試 */ });
  }

  function renderProgress(job, jobId) {
    var progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
    $('progress-bar').style.width = progress + '%';

    // 階段燈（依 spec §6.1：10/30/55/80/100）
    var stages = document.querySelectorAll('#progress-stages .stage');
    stages.forEach(function (el) {
      var s = Number(el.getAttribute('data-stage'));
      el.classList.toggle('done', progress >= s || job.status === 'done');
      el.classList.toggle('now', job.status !== 'done' && job.status !== 'failed' &&
        progress >= s && (s === 100 || progress < nextStage(s)));
    });
    function nextStage(s) {
      var all = [10, 30, 55, 80, 100];
      for (var i = 0; i < all.length; i++) { if (all[i] === s) return all[i + 1] || 101; }
      return 101;
    }

    if (job.status === 'failed') {
      $('progress-msg').textContent = '❌ 生成失敗：' + (job.step_message || '請稍後重試或聯絡管理員');
      $('progress-msg').className = 'progress-msg';
      stopTracking();
      return;
    }
    $('progress-msg').textContent = (job.step_message || '') + '（' + progress + '%）';

    if (job.status === 'done' || (progress >= 100 && job.lesson_id)) {
      $('progress-msg').textContent = '✅ 完成！教案已產出。';
      showResult(job.lesson_id);
      stopTracking();
    }
  }

  function showResult(lessonId) {
    currentLessonId = lessonId;
    $('btn-slides').href = '/s/' + encodeURIComponent(lessonId);
    $('btn-note-view').href = '/api/lessons/' + encodeURIComponent(lessonId) + '/note';
    $('result-actions').hidden = false;
    window.loadRecent(); // 完成後刷新最近清單
  }

  $('btn-note-download').addEventListener('click', function () {
    if (!currentLessonId) return;
    var a = document.createElement('a');
    a.href = '/api/lessons/' + encodeURIComponent(currentLessonId) + '/note';
    a.download = currentLessonId + '.md';
    document.body.appendChild(a); a.click(); a.remove();
  });

  // ---- 最近 10 筆教案（GET /api/lessons/recent）＋分類篩選 ----
  var AUDIENCE_LABELS = { elementary: '國小', junior: '國中', senior: '高中' };
  var STYLE_LABELS = { story: '故事引導', hands_on: '實作演練', exam: '重點攻略', visual: '圖解速覽' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.loadRecent = function (categorySlug) {
    var url = '/api/lessons/recent' + (categorySlug ? '?category=' + encodeURIComponent(categorySlug) : '');
    fetch(url)
      .then(function (res) { return res.json().then(function (b) { return { status: res.status, body: b }; }); })
      .then(function (r) {
        if (r.status !== 200) {
          $('recent-empty').hidden = false;
          $('recent-empty').textContent = '最近教案載入失敗（' + ((r.body && r.body.error) || r.status) + '）。';
          return;
        }
        var items = (r.body && r.body.items) || [];
        var grid = $('recent-grid');
        grid.innerHTML = '';
        $('recent-empty').hidden = items.length > 0;
        items.forEach(function (it) {
          var card = document.createElement('div');
          card.className = 'card lesson-card';
          var cat = it.category_name
            ? '<button class="tag category chip-filter" type="button" data-slug="' + esc(it.category_slug) + '">' + esc(it.category_name) + '</button>'
            : '<span class="tag">未分類</span>';
          card.innerHTML =
            '<div class="title"><a href="/s/' + encodeURIComponent(it.id) + '">' + esc(it.title) + '</a></div>' +
            '<span class="tag">' + (AUDIENCE_LABELS[it.audience] || esc(it.audience)) + '</span>' +
            '<span class="tag">' + (STYLE_LABELS[it.style] || esc(it.style)) + '</span>' + cat +
            '<div class="meta">' + esc(it.created_at || '') + '</div>' +
            '<div class="links"><a href="/s/' + encodeURIComponent(it.id) + '">簡報</a> · ' +
            '<a href="/api/lessons/' + encodeURIComponent(it.id) + '/note" target="_blank" rel="noopener">詳案</a></div>';
          grid.appendChild(card);
        });
        // 分類篩選 chips
        var chips = $('recent-chips');
        chips.innerHTML = '';
        if (categorySlug) {
          var back = document.createElement('button');
          back.type = 'button'; back.className = 'btn secondary'; back.textContent = '← 清除篩選';
          back.addEventListener('click', function () { window.loadRecent(); });
          chips.appendChild(back);
        }
        grid.querySelectorAll('.chip-filter').forEach(function (btn) {
          btn.addEventListener('click', function () { window.loadRecent(btn.getAttribute('data-slug')); });
        });
      })
      .catch(function () {
        $('recent-empty').hidden = false;
        $('recent-empty').textContent = '最近教案載入失敗（API 暫時無回應）。';
      });
  };

  // ---- 初始化 ----
  initTurnstile();
  window.loadRecent();
  $('turnstile-notice') && updateSubmit();

  // 斷線續追：重整/誤關後從 localStorage 恢復
  try {
    var savedJobId = localStorage.getItem(STORE_KEY);
    if (savedJobId) startTracking(savedJobId);
  } catch (e) { /* localStorage 不可用即跳過 */ }
})();
