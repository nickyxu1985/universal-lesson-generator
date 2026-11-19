# universal-lesson-generator — 萬用教案生成器

> 零月費、系統與資料解耦的自動化教案生成平台。老師輸入主題、選受眾與風格，系統檢索既有知識庫（LLM-Wiki）；沒有資料就由 AI Agent 蒐集 5 篇以上官方／技術文件結構化入庫，最終產出教學 HTML 簡報；期末再加 Obsidian 教師詳案。

## 現在是哪個階段：W10 POC

- **W10 繳交：2026-11-23 23:59**（遲交到 11/24 16:00），10 分，線上輸入。
- **W10 只做兩件套**（照老師要求）：LLM-Wiki＋教學 HTML 簡報，外加 loop／graph 說明與一次執行反思。**Obsidian 教師詳案是期末才加，W10 不做；首頁輸入口也是期末才做**，W10 的「輸入口」就是 Slack Thread 手動派單。
- **主題**：通用教案產生器 — 以自動流程選型為例（固定自動流 → 單一 Agent → Multi-Agent，遇到什麼問題，怎麼選）。
- **受眾**：國小／國中／高中。**風格（POC）**：story 故事引導（高中一版先跑通）。
- POC 範圍全文見 `docs/w10-poc-scope.md`；期末完整規格見 `docs/final-spec.md`。

## 流程（一條線）

```
取得資料 → 查詢 Wiki → 整理重點 → 檢查內容 → 產生簡報
```

入口先跑查 Wiki（3a），有才做教案；不夠才回頭跑 ingest（1）→ 進 Wiki（2）。驗證永遠是不同隻 agent：同一隻驗自己做的東西看不出盲點。完整流程與迴圈說明見 `workflow/WORKFLOW.md`。

## 分工（定案）

| 角色 | 負責 | 不做的事 |
|---|---|---|
| Instinct | 專職驗證＋結構化進 Wiki（驗 ingest、驗最終 HTML） | 不生產教案、不做美工 |
| Hark | 查 Wiki、驗來源＋Wiki、整理重點、產 HTML＋美工 | 不碰 ingest |
| Cue | ingest 找資料、檢索（Slack @cue 派工：n8n 轉發信箱；或直接 mail） | — |
| Muse | W10 PM：任務協調＋專案 PM（不進產線；Slack @ 不穩定，在主對話對齊） | 不接任何一站（只做協調、追蹤、驗收） |
| 使用者 | n8n 照舊跑（不用改）；開 Slack 期末教案頻道；W10 派工在 #taica-w10-hw；驗收 | — |

## Repo 結構

```
README.md               本檔
.env.example            環境變數範本（key 放 CF 後台，絕不寫進程式碼、不推上 repo）
.gitignore              擋 .env
agents/                 各站工作說明：ingest.md、wiki.md、retriever.md（3a）、
                        lesson.md（3b）、slides.md、verifier.md
workflow/WORKFLOW.md    流程圖＋迴圈說明，n8n 匯出也放這
topics/topic.yaml       主題＋受眾＋來源清單（6 個來源 URL 待補，見下）
specs/handoff.md        封閉式 AI 白盒化交接協議（每階段結束的 HANDOFF 格式）
wiki/                   LLM-Wiki 內容，按選型問題分章（ingest 跑完才有內容）
slides/                 教學 HTML 簡報（終驗過了才放進來，現為空）
logs/                   ingest、驗證、檢索紀錄（作業要的檢查紀錄與反思素材）
docs/
  w10-poc-scope.md      W10 POC 切片：做什麼、不做什麼
  final-spec.md         期末完整系統開發規格書（SPEC）
```

## 分支：develop / main

- 平常工作都在 **`develop`**。docs／feature 從 `develop` 開出、合併回 `develop`。
- **`main` 只收來自 `develop` 的 PR**，且只在功能驗收＋使用者明確同意後合併。沒有驗收、沒有同意，絕不合併到 `main`。
- 這個 repo 會從 W10 POC 成長成期末專案：W10 交件時打 tag 留版，期末繼續在同一個 repo 上加功能，不另開 repo。

## T0：開工前要先打開的基礎建設

1. 定 repo 名 → 已定：`universal-lesson-generator`（2026-11-19）。
2. GitHub UI 建 repo → 已建（使用者）。
3. 推起手包到 `develop` → 本次推送。
4. 開 Slack 期末教案頻道 #universal-lesson-generator（1 Job = 1 Thread）→ 已開（使用者）；W10 派工仍在 #taica-w10-hw。
5. 補 `topics/topic.yaml` 裡 6 個來源 URL（以 Slack #taica-w10-hw 討論串核對清單為準，每篇過 HTTP 200＋內文非空檢查）→ 待使用者。
6. n8n 照舊跑，不用改（春川；Cue 的 @cue 通道與每站 timeout 警報照舊）→ W10 在 #taica-w10-hw 開 Thread 派單。

## 成本：$0 / 月

Cloudflare Pages＋Functions＋D1＋R2、Workers AI、n8n 自架、封閉式 Agent 全部在免費額度內；程式層另有 D1 每日總量閘門鎖死帳單上限。金鑰放 CF 後台環境變數，絕不進 repo。
