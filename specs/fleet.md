# 0元戰隊 — 成員、職責與邊界規格 (Fleet Spec)

> 目的：把戰隊的成員、分工、使用邊界、能力邊界寫死，以後開新 Job 不用重來。活文件，隨實戰更新。
> v1：2026-11-19，由 W10 Job 1–4 的實戰定案。

## 0. 總則

- **零元原則**：只用 plan 額度／免費方案，絕不開 pay-as-you-go。例外只有一件：Hermes #2 的 Gemini 是使用者自己開的 Cloud Billing。
- **短期勞工**：每個 agent 都是短期勞工，能用多久算多久，不押注、不承諾單一 agent。
- **PM 制**：Muse 是專案經理（協調＋派工＋盯場＋回報＋維護 repo 交接紀錄），不進產線。
- **1 Job = 1 Thread**：每件任務一個 Slack Thread；交棒要 Thread + Repo 雙份（`docs/handoffs/<job-id>.md`）。

## 1. 成員一覽

| 成員 | 角色 | 強項 | 限制 |
|---|---|---|---|
| **Muse (PM)** | 專案經理：派工、盯場、回報、維護交接紀錄 | 協調、規格、驗收把關 | 不進產線；GitHub 只能用 connector（不能建 repo、純文字、單次 ~128KB）；Slack @muse 喚醒不可靠（要靠 n8n 旗標） |
| **Cue (Manus)** | Ingest：抓來源、檢索 | 抓取與整理來源 | 沒有 API、不是完整 BOT；觸發靠 Slack @cue → n8n → mail → Manus 回 Slack；mail 是觸發管路不是備用；不能直接推 repo；中國出身（北京 2022、總部新加坡），不碰台灣政府公務／政府資料、不碰 GOVTECH |
| **Hark** | 內容生產：Wiki 結構化、教案、HTML 簡報、美工 | 整理、HTML、美工、CSV 整理 | bot 發的 @ 叫不醒他（要 PM 用使用者帳號手動 @）；從文件提重點進 Wiki 偏精簡（要給字數下限＋五要素，見 final-spec §7.4）；開 PR，不直接 push develop |
| **Instinct** | 專職驗證：每站驗收 | 驗證、查核 | 只驗證不生產（生產者 ≠ 驗證者）；驗收要親自操作（點開、點答案），不能只看截圖認帳 |
| **Hermes #1 (ROCK 3A)** | 顧問（諮詢） | Gemini 4 Hydrogen | 一次只問一台，等它回完再問下一台；中途新訊息會被當修正 |
| **Hermes #2 (OCI)** | 顧問 | Gemini 4 Carbon（2026-12-01 漲價，要切 Hydrogen 或 Neon，使用者決定） | 同上；計費是使用者開的 pay-as-you-go（零元原則的唯一例外） |
| **Hermes #3 (OCI)** | 顧問 | Mistral Large 4 | 同上 |
| **GLM (Mistral Vibe)** | WireLab 主力開發；Slack 單向回報 | 開發 | 中國模型，不碰 GOVTECH；benchmark 滑落但使用者實測 verdict 仍成立 |

**其他／備援**：Jules（收尾中，2026-12-31 關閉，Antigravity 接手）、Antigravity（白盒本地開發，5 Pro 帳號輪替）、GPT-5.6 Sol（M365 Copilot E5，無限暢聊，Mistral 的備援）、Claude、NotebookLM、Obsidian（工具）。

## 2. 使用邊界 (Usage Boundaries)

- **開工令只能由 PM 下**：絕不寫使用者喊「開工」（會變聖旨，agent 只認他本人）。
- **一次只派一隻 agent**；用正式 mention（`<@USER_ID>`，自動完成選出的），不用純文字 @。
- **@ 只用在真正交棒（換手）時**；通知類訊息不用硬 @。
- **Hark 要用使用者帳號 @ 才叫得醒**；bot 發的 @ 叫不醒他（Job 1 3b 卡約 19 分鐘的教訓）。W10 先手動補 @，n8n 轉發留到期末專題。
- **Instinct 每站都要驗**；生產者與驗證者分開。
- **develop 的決定 PM 做；進 main 才要使用者**。
- **討論 ≤3 輪**，沒實質內容就停；除非使用者自己 @（一定回）。
- **Hermes 一次只問一台**，等它回完再問下一台。
- **中國模型（GLM、 Cue）不碰 GOVTECH**；也不碰台灣政府公務／政府資料。
- **Server**：使用者自己動手 SSH；Muse 只給建議（例外：Simular Box 'main'、API、OCI grab、Azure muse-grab）。
- **GitHub**：只能用 connector；不能建 repo；純文字（不要預先 base64）；單次 ~128KB；改動併成一次 push，減少授權卡；讀 repo 用公開 raw URL，不要用 connector 讀（省授權卡）。

## 3. 能力邊界 (Capability Boundaries)

- **Cue**：沒有 API；觸發慢（走 mail，來回要時間）；只能做 ingest／檢索；不能推 repo、不能開 PR。
- **Hark**：能結構化、寫教案、做 HTML、美工、整理 CSV；Wiki 從文件提重點偏精簡（要給明確深度標準）；不能驗自己的產出（要 Instinct 驗）。
- **Instinct**：只能驗證，不能生產；驗收要親自操作，不能只看截圖認帳。
- **Muse**：只能協調／PM／規格／驗收把關；不進產線；GitHub connector 限制（見 §2）；Slack 喚醒不可靠。
- **Hermes**：只能當顧問（諮詢），不進主流程；一次一台；中途新訊息會被當修正（Redirected current run）。
- **GLM**：WireLab 開發主力；Slack 單向回報（不參與討論）；不碰 GOVTECH。

## 4. 派工與驗收流程

1. PM 開 Thread 派工（Job ID、目標、規格、驗收標準、下一棒）。
2. Agent 完成後貼 HANDOFF Block（Job ID、Stage、Status、產出、Self-Audit、Next Action），正式 @ 下一棒。
3. Instinct 驗收（PASS／FAIL）；驗收通過 PM 才合併（develop）／結案。
4. 交棒紀錄：Thread + Repo `docs/handoffs/<job-id>.md` 雙份，PM 維護。
5. **留名**：每個 PR／issue／merge／commit 都要留名（PR／issue 開頭 By \<agent\>，merge 寫執行者，commit 訊息結尾 By \<agent\>）；沒留名＝交接不完整。

## 5. 已知限制與待修

- Bot @ 叫不醒 Hark（PM 手動補 @；n8n 轉發留到期末）。
- Slack 單則多 @ 只喚醒第一個符合者（一次只 @ 一人）。
- Muse 的 Slack 喚醒不可靠（要靠 n8n 旗標；純文字 @ 不算 mention）。
- Hark 的 Wiki 偏精簡（已立深度規格：每頁 ≥2,000 字＋五要素，見 docs/final-spec.md §7.4）。
- n8n API key「muse-dashboard」2026-12-10 前要輪換。
- Hermes #2 Carbon 2026-12-01 漲價，要切 Hydrogen 或 Neon（使用者決定）。

## 6. 版本

- **v1（2026-11-19）**：由 W10 Job 1–4 的實戰定案。活文件，隨實戰更新。
