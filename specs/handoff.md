# handoff.md — 封閉式 AI 白盒化交接協議

> 後端 Agent（Cue、Instinct、Hark Pro）是封閉式的，內部推理看不到。這份協議強制每個階段結束時輸出固定結構的交接區塊（Handoff Block），留在該教案的 Slack Thread 內，讓黑盒子的執行過程完全透明、可稽核。

## 1. Thread 隔離：1 Job = 1 Thread

- 每個教案生成任務在 Slack 教案專用頻道開一個獨立 Thread（期末：n8n 收到 Webhook 後第一步先發主訊息，取得 `thread_ts` 寫回 D1 `jobs.slack_thread_ts`；W10：由 PM 在 #taica-w10-hw 開 Thread 派單）。
- 該任務後續的派單、Agent 回覆、交接摘要、錯誤警示，**全部強制回覆在同一個 `thread_ts` 內**，避免多任務並發時上下文污染，也讓任何人點開任一 Thread 就能完整回放整份教案的誕生過程。
- Thread 內只放當次交接：題目、受眾、job id、做到哪站、產出連結。skill 檔與流程定義本體在 repo，頻道只放連結跟討論（Slack 免費版 90 天就看不到了）。
- **W10：Repo 也要留 handoff 紀錄**：HANDOFF Block 除了貼 Thread，PM 還要彙整進 Repo `docs/handoffs/<job-id>.md`。老師只看得到 Repo，看不到 Slack；Slack 免費版 90 天後 Thread 也看不到了。Thread 是工作現場，Repo 檔案是繳交證據。

## 2. HANDOFF Block 格式（每階段結束必貼）

```markdown
### [HANDOFF] Stage: <stage_1_ingest | stage_2_wiki | stage_3a_retrieve | stage_3b_lesson | stage_4_slides>
- **Job ID**: <job_id>
- **Agent**: <cue | instinct | hark_pro>
- **Status**: <PASS | FAIL | NEEDS_RETRY>
- **Inputs Used**: <引用的 Wiki ID 或搜尋關鍵字>
- **Sources Verified (Stage 1)**: <5 篇以上官方/技術文件標題與 URL 清單>
- **Audience & Style Check (Stage 2)**: <確認已對齊 國小/國中/高中 詞彙深度與對應 style.md 規則>
- **Artifacts Produced**: <Markdown / JSON 區塊位置與字數/頁數統計>
- **Self-Audit Checklist**:
  - [x] 未包含任何未經查證之幻覺數據或無效連結
  - [x] 未對 GitHub Repo 執行任何 commit / push
  - [x] 符合 obsidian-note-spec.md Frontmatter 規範（期末才適用，W10 略過此條）
- **Next Action / Notes**: <交接給下一階段的重點提醒，或失敗原因說明；須用 Slack 正式 mention @ 下一棒，見 §3>
```

## 3. 規則

- **交棒必須 @ 下一棒**：HANDOFF Block 的 Next Action 要用 Slack 正式 mention（`<@USER_ID>`，不是純文字名字）點名下一站的 agent；驗收通過放行下一站時也要 @。沒 @ 的交棒不算完成——對方收不到通知，就不會動。Hark `U0CEM7V0R53`、Instinct `U0CBVT12GV7`；Cue 沒有 Slack 帳號，`@cue` 是純文字、由 n8n 轉信（見下）。

- **bot 發的 @ 叫不醒 Hark（2026-11-19 實證）**：Hark 的 Slack 入口會忽略 bot 發的訊息。Instinct 用 bot 身分發的 @（3a、站 2 PASS、15:08 的 3b PASS）一次都沒叫醒他；每次都是 Muse 用 Nicky 的使用者帳號再補一個 @，他才在 2 秒內回。不是 @ 格式錯，是發話身分不對。**W10 暫時解法：PM（Muse）手動補 @**——Instinct → Hark 的交棒由 PM 在同 thread 用使用者帳號補貼一則 @Hark 接棒訊息。**期末解法（2026-11-19 Nicky 定）：n8n 轉發**——n8n 監看各作業頻道，遇到 bot 發的、含 `<@U0CEM7V0R53>` 的訊息，就用 Nicky 的使用者 token 在同 thread 補貼一則短訊；只轉 Instinct、Cue 這類其他 agent 的 bot，排除 Hark 自己的 bot（`B0CEQHLUGKY`）與 Nicky 帳號發的訊息（否則 @ 別人可能被轉回來叫醒自己）；同一則用 ts 去重，只轉一次。

- **驗證者永遠與生產者不同人**：同一隻 agent 驗證自己做的東西看不出盲點。驗證者只看產出＋原始來源，不看生產者的推理過程。
- **FAIL 就停住該站**：發警報（首頁紅字＋Slack 推播），不讓錯的產出往下流；註明回哪站重做。
- **NEEDS_RETRY 要寫原因**：缺什麼、哪裡矛盾、回哪站補，不要只寫「再試一次」。
- **Cue 派工有兩種**：Slack @cue（純文字 @cue，n8n 收到後發信給 Cue，回覆經 Manus 回到 Thread）或直接 mail（回信進信箱，由 PM 轉貼進 Thread 留紀錄）。下一站的 agent 直接讀前手交接狀態繼續執行。
- **Muse 不進生產線，擔任 W10 PM**：任務協調＋專案 PM，在主對話對齊，派單與進度回報經 Slack thread。Slack @ 喚醒不穩定，不納入面向前端使用者的自動化流程。
- **Repo handoff 紀錄由 PM 維護**：每站結束後，PM 把 Thread 裡的 HANDOFF Block 彙整進 Repo `docs/handoffs/<job-id>.md`，再推上 develop（Muse 經 connector 推；封閉式 Agent 仍禁止直接 commit／push，見 §2 自檢條）。

## 4. 白盒化效益

1. **來源可稽核**：階段一抓了哪 5 篇官方文件、有沒有混入農場文，在 Thread 一目了然。
2. **除錯可定位**：教案品質不佳或格式解析失敗，打開該 `job_id` 對應的 Thread 就能看出是哪一隻 agent、在哪一個檢查點出錯。
3. **跨 Agent 無縫接力**：即使階段一由 Cue（@cue）執行，Handoff 摘要進 Thread 後，階段二的 Instinct／Hark Pro 就能直接接手。
