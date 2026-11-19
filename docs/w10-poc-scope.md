# W10 POC 切片 — 從期末規格書切出來的本次作業範圍

> 來源：期末完整規格書《萬用教案生成器 — 系統開發規格書 (SPEC)》（`workspace/user/files/code_artifact.md`，2026-11-19 Neon 討論版，已按 Nicky 四點修正：受眾 3 檔、handoff.md、Slack 1 Job = 1 Thread、前段 CF 後段 Slack 工廠；Section 9 的 Day 1～11 路線圖僅供參考）。
> 定位：W10 是期末的 POC，先跑通一條線，證明整套流程可行，期末再放大。不要把期末的完整系統塞進 W10。

## 1. W10 作業本體（不變）

- **繳交：2026-11-23 23:59**（遲交到 11/24 16:00），10 分，線上輸入。
- **主題：通用教案產生器 — 以自動流程選型為例**（固定自動流 → 單一 Agent → Multi-Agent，遇到什麼問題怎麼選）。
- **受眾：3 檔**（國小／國中／高中）。
- **評分關鍵**（9–10 分）：Wiki 與簡報內容明確對應、有實際執行與檢查紀錄、能反思哪個節點容易出錯、簡報有清楚的教學結構；簡報須讓原本不熟悉主題的人理解基本概念。

## 2. POC 只跑一條線

**1 個主題 × 1 個受眾 × 1 個風格，完整跑一次。**

- 主題：自動流程選型（固定自動流 → 單一 Agent → Multi-Agent）。
- 受眾：**高中**（代表檔；大學生看高中程度也好理解，其餘兩檔只是換參數，不是新工作）。
- 風格：**story 故事引導**（給新手理解基本概念最合適；其餘三檔 hands_on / exam / visual 是期末再展開的參數）。
- 產出兩件套（照老師要求就好）：LLM-Wiki（本主題）＋ HTML 簡報。Obsidian 教師詳案是期末才加，W10 不做。

## 3. 切進來的（POC 包含，照期末 SPEC）

| 期末 SPEC 節 | POC 採用 |
|---|---|
| §1 三層知識閉環 | 方向照 SPEC，但 POC 只跑兩層：Wiki（事實）→ 簡報（外皮）。中層 Obsidian 詳案（肉）是期末才加，W10 不做 |
| §2 架構：前段 CF、後段 Slack 工廠 | 方向照 SPEC；但 POC 可先用最簡形式跑通（見 §5） |
| §3.1 Repo `specs/`（AGENTS.md、handoff.md、skill.md、task.md、style.md） | 採用（obsidian-note-spec.md 是期末的，W10 不列入）；handoff.md 是 POC 白盒化的關鍵 |
| §3.2 R2 結構 `wiki/`、`lessons/` | 概念照 SPEC；POC 先以 Repo＋檔案交付，R2/D1 上線是期末（`notes/` 是期末才有） |
| §7.1 Slack 專屬教案頻道，1 Job = 1 Thread | 全採：本次 POC 的唯一一個 Job 就開一個 Thread，全部交接留在裡面 |
| §7.2 `handoff.md` 白盒化交接區塊 | 全採：每階段結束都要貼 HANDOFF Block（來源、檢查點、狀態、異常） |
| §7.3 分工：Cue ingest（@cue）、Instinct / Hark Pro 產出、Muse 是 W10 PM（不進產線） | 全採，不變 |
| §7.3 簡報母版分離組裝（Agent 只出 JSON，套母版成 HTML） | 全採，避免 HTML 破版 |
| §7.3 12 分鐘超時改派 | 原則照 SPEC；POC 先以人工盯哨代替自動改派（時間不夠做自動化） |

## 4. 切掉的（期末再做，W10 不做）

- §2／§4 的完整守門員：Turnstile、Workers AI 語意守門、D1 每日總量／IP 限流閘門、X-Secret-Token — POC 沒有輸入口，不用守門員，完整 CF 守門留到期末。
- §5 D1 完整建表（daily_quota、categories、wiki_docs、wiki_fts、lessons、jobs）— POC 不建 D1，進度與紀錄以 Slack Thread＋Repo `docs/handoffs/` 紀錄檔為準（老師只看得到 Repo）。
- §6 的四頁全站（首頁生成表單＋進度條、/wiki 搜尋頁、/s/:id、/admin 後台）— POC 只要兩條連結：Wiki 成果＋HTML 簡報，不做首頁與後台。
- §3.3 Obsidian 教師詳案 `.md`＋obsidian-note-spec.md＋Remotely Save 直連 R2 雙向同步 — 全部是期末，W10 不做。W10 照老師要求：Wiki＋HTML 簡報就好。
- 多受眾 × 多風格矩陣、最近 10 筆、分類管理 — 期末。
- §9 Day 1～11 路線圖 — 僅供參考，實際開工照車隊速度（範圍清楚時一個下午出一版）。

## 5. POC 的實際跑法（最小可行流水線）

1. Nicky 開 Slack 專屬教案頻道（例如 `#lesson-gen-jobs`），本次 Job 開一個 Thread（1 Job = 1 Thread）。
2. Cue（@cue）ingest：抓 5 篇以上官方／技術文件，結構化進 LLM-Wiki，貼 HANDOFF Block 到 Thread。
3. Instinct 驗證＋結構化進 Wiki（與生產者不同人驗證）。
4. Hark 查 Wiki、驗來源＋Wiki，整理重點＋生簡報結構 JSON，套母版成 HTML，貼 HANDOFF Block 到 Thread。
5. Instinct 終驗，Thread 標記完成 ✅。
6. n8n 照舊跑，不用改；POC 在 #taica-w10-hw 開 Thread 派單，**要求不變的是 Thread 裡＋Repo `docs/handoffs/` 都要有完整 handoff 紀錄**（這是反思的證據；老師只看得到 Repo）。

## 6. Loop / Graph（W10 繳交用，照 SPEC §2 簡化）

```
取得資料 → 查詢 Wiki → 整理重點 → 檢查內容 → 產生簡報
   ↑            ↓              ↓            ↓
   └─ 未命中：ingest ──┘   檢查失敗：退回重整   檢查失敗：退回重寫
```

- 重複執行的步驟：查詢 Wiki（每換受眾／風格重查一次）、檢查內容（每階段結束都檢查）。
- 檢查點：階段一驗來源（5 篇是否官方、連結是否有效）、階段二驗受眾對齊（詞彙深度是否符合高中）＋驗簡報結構 JSON 格式。
- 為什麼這樣設計：驗證者永遠與生產者不同人；檢查往前移（來源在 ingest 當下驗，不要等到簡報做好才發現錯）。

## 7. W10 繳交清單（交之前逐項打勾）

- [ ] LLM Wiki 主題與簡短介紹（選型主題）
- [ ] LLM Wiki 連結或成果（5 篇以上官方來源清單）
- [ ] 教學 HTML 簡報連結（高中／story 一版）
- [ ] loop / graph 流程圖或文字說明（§6）
- [ ] 一次執行反思：哪個節點最常出錯、檢查往前移到哪一步、有沒有改 workflow
- [ ] Repo handoff 紀錄檔 `docs/handoffs/w10-poc-001.md`（執行證據，老師看得到）＋ Slack Thread 連結

## 8. 只有 Nicky 能做的（POC 也一樣）

- GitHub UI 建 repo（Muse 無法建倉；repo 名待定：SPEC 寫 `lesson-generator/`，先前另有 `universal-lesson-generator` 候選）。
- 開 Slack 專屬教案頻道。
- n8n 照舊跑，不用改（見 §5 第 6 點）。
- topic.yaml 的 6 個來源 URL 補齊（起手包裡目前是 TODO，填了之後每條要過 HTTP 200＋非空檢查）。

## 9. 另記：W11 是補救作業（與 W10 分開）

- W11 居然是補救作業：前 10 次作業有不滿意或缺交的可以補。
- Nicky 要補的是**期末專案發想作業**（漏了沒做）。這與 W10 無關，另案處理；要補的內容與繳交期限待確認。
