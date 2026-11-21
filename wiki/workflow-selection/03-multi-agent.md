# 03 Multi-Agent

> Job：w10-poc-004（v2，Wiki 增量）｜主張後的 [A]–[E] 對應頁尾來源；標「示意」的是本 Wiki 的教學情境，標「本 Wiki 推論」的是由來源推出、非原文的句子。

## 一、定義

- **Multi-Agent 是讓專家分工**：當不同的專家應該各自負責工作的不同部分時，multi-agent workflow 才有用。[C]
- **第一個設計決定是「誰負責回覆」**：設計 multi-agent 時，第一個要決定的是：在流程的每一個分支，由誰負責給使用者的最終回覆。[C]
- **兩種編排方式**：OpenAI 把它分成 handoffs（交棒）與 agents as tools（把專家 Agent 當工具呼叫）兩種模式。[C]
- **和 workflow 的關係**：Anthropic 與 LangGraph 都列出 orchestrator-workers 這個 workflow 模式：由中央 LLM 動態拆解任務、派給 worker、再彙整結果。[B][E] 它是固定自動流中最接近「多 Agent 分工」的模式（本 Wiki 推論：兩者都是一個中心角色派工、多個角色執行；差別在 [B][E] 把它歸類為 workflow，[C] 討論的則是每個專家都是一個 Agent）。

## 二、運作方式

### 1. 兩種模式對照 [C]
| 模式 | 什麼時候用 | 發生什麼事 |
|---|---|---|
| Handoffs（交棒） | 某個專家應該接手這個分支的對話 | 控制權轉移到專家 Agent |
| Agents as tools（當工具用） | 管理者應該保持控制，把專家當成有範圍限制的能力來呼叫 | 管理者保有回覆的所有權 |

### 2. Handoffs：把「負責權」交出去 [C]
- **適用**：當專家應該負責「下一個回覆」，而不只是在背後幫忙時，handoffs 最合適。
- **怎麼設定**：OpenAI Agents SDK 的範例中，Triage agent（分流 Agent）的 `handoffs` 清單裡放了 Billing agent 與 Refund agent，表示分流 Agent 可以把對話交給這兩位專家接手。
- **讓分流介面保持清楚**：
  - 每個專家只給一個窄的工作範圍。
  - 交棒說明（Python 的 `handoff_description`、TypeScript 的 `handoffDescription`）要寫得短而具體。
  - 只有在下一個分支真的需要不同的指令、工具或政策時才拆。
- **進階**：交棒時也可以帶結構化的 metadata 或過濾過的對話歷史；確切 API 寫在 SDK 文件，因為不同語言的接法不同。

### 3. Agents as tools：管理者保有最後回覆 [C]
- **怎麼設定**：用 Python 的 `agent.as_tool()`（TypeScript 是 `agent.asTool()`），把專家 Agent 包成主 Agent 的一個工具；主 Agent 仍然負責最終答案，只是把專家當幫手呼叫。
- **範例**：一個 Summarizer（摘要 Agent），指令是「為提供的文字產生精簡摘要」，被包成 `summarize_text` 工具，交給 Research assistant（研究助理 Agent）使用。
- **通常比較適合的情況**：
  - 管理者應該整合出最終答案；
  - 專家做的是有範圍的任務，例如摘要或分類；
  - 你想要一個穩定的外層流程、在裡面巢狀呼叫專家，而不是轉移負責權。

### 4. Orchestrator-workers 的分工機制 [B][E]
- 中央 LLM 依照具體輸入動態決定子任務，不是事先定義好的。[B]
- LangGraph 用 `Send` API 動態建立 worker 節點並送出各自的輸入；每個 worker 有自己的狀態，所有 worker 的輸出寫進同一個共用狀態鍵，orchestrator 讀得到全部輸出，再合成最終結果。[E]
- LangGraph 的範例是：先由規劃器用結構化輸出列出報告的各個章節，再把每個章節送給一個 worker 撰寫，最後由合成節點整合成完整報告。[E]

### 5. 執行之後：狀態與下一輪 [C]
OpenAI 的指南在最後提醒，負責權的模式確定後，還要處理相鄰的執行與狀態問題，例如「最後一個 Agent」（Python 的 `last_agent`）與可恢復的狀態，會影響下一輪由誰接手。這表示用 handoffs 時，下一輪對話不一定回到原本的分流 Agent（本 Wiki 推論，細節以 SDK 文件為準）。

### 6. 「分工」的想法在 workflow 裡早就出現過
Multi-Agent 不是憑空多出來的新概念，前面幾種 workflow 已經用到「讓不同的 LLM 呼叫各做各的事」：
- **Routing**：把不同類型的客服問題分到不同的下游流程、prompt 與工具；或把簡單常見的問題交給較小、較省成本的模型，把困難少見的問題交給能力較強的模型。[B] 這和 Triage agent 交棒給專家的形狀很像，差別在 routing 的下游是預先寫好的流程（本 Wiki 推論）。
- **Parallelization 的 sectioning**：一個模型實例處理使用者問題，另一個同時篩查不當內容或請求，通常比讓同一次 LLM 呼叫同時兼顧護欄與主要回覆效果更好。[B]
- **為什麼分開會比較好**：面對有多個考量的複雜任務，讓每個考量由一次獨立的 LLM 呼叫處理、專注在一個面向上，LLM 通常表現更好。[B]

這也說明了 [C] 列出的「提示清晰度」為什麼是拆分的好理由：每個角色只看自己那一塊，prompt 才能寫得專門（本 Wiki 推論，對照 [B] 的 routing 說明：沒有分流時，為某類輸入最佳化可能傷害其他類輸入的表現）。

## 三、例子

### 來源裡的例子
- **客服分流（handoffs）**：Triage agent 把帳務問題交給 Billing agent、退款問題交給 Refund agent，由專家接手該分支的對話。[C]
- **研究助理（agents as tools）**：Research assistant 保有最終回覆，需要時呼叫 Summarizer 產生摘要。[C]
- **報告撰寫（orchestrator-workers）**：規劃器拆出報告章節，每個 worker 寫一節，合成節點整合成最終報告。[E]
- **程式與搜尋（orchestrator-workers）**：每次都要修改多個檔案的程式產品，以及要從多個來源蒐集、分析資訊的搜尋任務。[B]

### 示意：園遊會總召
- 總召 Agent 收到「幫我們班規劃園遊會」：場地組要看學校場地規則、宣傳組要用海報與社群工具、財務組要守收支規定。三組的指令、工具、規則都不一樣，拆開才有道理。
- 若同學問「我們攤位在哪裡？」，總召把對話交給場地組直接回答：這是 handoffs。
- 若總召要寫一份給導師的總報告，只請財務組算好收支數字、自己整合成報告：這是 agents as tools。
- 反過來，如果只是「把報名名單整理好寄出去」，一個流程就做完了，硬拆三組只會多出更多交接。

## 四、適用情境與取捨

### 什麼時候才拆
- **先用一個 Agent**：能用一個就先用一個。[C]
- **拆了要有明確好處**：只有在專家能明顯改善下列至少一項時才加：能力隔離、政策隔離、提示清晰度、追蹤可讀性。[C]
- **契約改變了才拆**：OpenAI 用「Add specialists only when the contract changes」當小節標題，並要求只有在下一個分支真的需要不同的指令、工具或政策時才拆。[C]

### 拆的代價
- 太早拆，會多出更多 prompt、更多 trace（執行軌跡）、更多需要核准的地方，卻不一定讓流程變好。[C]

### 核准點與人工監督
- [C] 提到太早拆會多出「approval surfaces」，也就是更多需要人核准的地方。[C]
- Anthropic 觀察到，agent 最能發揮價值的任務，會納入有意義的人工監督。[B]
- 兩者合起來看：每多一個專家，就可能多一個需要人看的關卡；拆分前要先算清楚，人工監督的負擔是否還承受得起（本 Wiki 推論）。

### Handoffs 還是 agents as tools
| 想要的結果 | 選擇 | 依據 |
|---|---|---|
| 專家直接面對使用者、負責下一個回覆 | Handoffs | [C] |
| 管理者整合最終答案，專家只做摘要、分類這類有範圍的工作 | Agents as tools | [C] |
| 一個穩定的外層流程，裡面巢狀呼叫專家 | Agents as tools | [C] |
| 子任務要看輸入才知道有幾個，做完要彙整 | Orchestrator-workers（workflow 模式） | [B][E] |

## 五、常見錯誤

1. **Agent 越多越強**：太早拆只會多出 prompt、trace 與核准點，不一定變好。[C]
2. **拆了卻沒想清楚誰負責回覆**：這是 multi-agent 的第一個設計決定。[C] 沒決定，就分不清該用 handoffs 還是 agents as tools。
3. **專家的工作範圍太寬**：每個專家應該只有一個窄的工作，交棒說明要短而具體。[C]
4. **為了分工而分工**：下一個分支如果不需要不同的指令、工具或政策，就不必拆。[C]
5. **把 orchestrator-workers 當成固定分組**：它的子任務由中央 LLM 依輸入動態決定，不是事先定義的。[B][E]
6. **拆了之後看不懂發生什麼事**：[C] 把追蹤可讀性列為拆分要改善的項目之一；Anthropic 的實作原則也要求透明，明確顯示 Agent 的規劃步驟。[B] 如果拆完反而看不出是哪一位專家在哪一步出錯，就違背了拆的初衷（本 Wiki 推論）。
7. **以為 handoffs 的進階功能每種語言都一樣**：交棒帶 metadata 或過濾歷史的確切 API 依語言而不同，要看 SDK 文件。[C]

## 本頁來源
- [B] Anthropic — Building effective agents（2024-12-19）：<https://www.anthropic.com/research/building-effective-agents>（存檔 `raw/B-anthropic-building-effective-agents.md`）
- [C] OpenAI — Orchestration and handoffs：<https://developers.openai.com/api/docs/guides/agents/orchestration>（存檔 `raw/C-openai-orchestration-and-handoffs.md`）
- [E] LangGraph — Workflows and agents：<https://docs.langchain.com/oss/python/langgraph/workflows-agents>（存檔 `raw/E-langgraph-workflows-and-agents.md`）
