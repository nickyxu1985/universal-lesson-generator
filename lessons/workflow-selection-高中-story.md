# 教案：AI 幫我們辦園遊會 — 自動流程怎麼選（高中 × story）

> Job：w10-poc-001｜Stage 3b｜受眾：高中｜風格：story｜只讀 Wiki `wiki/workflow-selection/` 00–04，概念後的 [A]–[E] 對應 Wiki 來源

## 教學目標
學完之後，學生能夠：
1. 說出固定自動流、單一 Agent、Multi-Agent 三者有什麼不同
2. 遇到一個任務，判斷該選哪一種，並說出理由
3. 說出兩個常見誤解為什麼是錯的

- 時間：一節課 50 分鐘
- 先備知識：不需要會寫程式

## 1. 開場故事（5 分）
- 故事：班上要辦園遊會，班長說「交給 AI 幫忙」。但有的工作每次做法都一樣，有的要邊做邊想，有的大到要分組。
- 提問：「同樣都叫 AI 幫忙，做法應該都一樣嗎？」
- 引出今天的核心問題：遇到什麼情況，選哪一種。[B]

## 2. 三個名詞（7 分）
先講情境，再講名詞。英文術語第一次出現時，一定附中文和一句白話。
- **Workflow（固定自動流）**：照事先寫好的路線，一步一步做。[B][E]
- **Agent（單一 Agent）**：AI 自己決定要怎麼做、要用哪些工具。[B][E]
- **Multi-Agent（多個 Agent 分工）**：好幾個各有專長的 Agent 分工合作。這裡要設計清楚的是「每一段最後由誰回答」。[C]
- 補充：Anthropic 把這些統稱為 agentic systems，但在架構上把 workflow 和 agent 分開來看。[B]

## 3. 固定自動流（8 分）
- 故事：收報名表 → 整理名單 → 寄通知。每次步驟都一樣。
- 重點：
  - 路線是事先決定好的，所以結果可預測、做法一致，適合定義清楚的任務。[B][E]
  - 常見做法舉兩種就好：
    - 一步接一步，中間可以加檢查點（prompt chaining）[B][E]
    - 先分類，再交給對應的流程，像客服分流（routing）[B][E]
- ⚠️ 提醒：有些工具（例如 n8n 的 chain 節點）不能帶工具或記憶，但那是那個產品自己的規定。[A] 一般的固定流程裡，AI 也可以用工具和記憶，只是走的路線是事先寫好的。[B][E]

## 4. 單一 Agent：ReAct 迴圈（10 分）
- 故事：「幫我想辦法讓攤位不撞名，又有人潮。」沒人能事先寫好要幾步，只能邊做邊想。
- 重點：
  - Agent 會在一個迴圈裡用工具，每一步都看環境回傳的結果（例如工具查到的資料），再決定下一步。[B][E]
  - 它可以在卡住時停下來問人，通常也會設停止條件，例如最多試幾次。[B]
  - ReAct 的意思是「想一下（推理）→ 做一下（行動）」交替進行。推理用來訂計畫、改計畫；行動用來去外面查資料。[D]
  - 數字要講清楚比誰高：在 ALFWorld 和 WebShop 這兩個測驗上，ReAct 只看 1–2 個範例，成功率就比模仿學習和強化學習的方法分別高 34 和 10 個百分點。[D] 這是那兩個測驗的結果，不代表所有 Agent 都會進步這麼多。
- 代價：比較花錢、比較慢，錯誤也可能一路累積，所以要先在安全的環境多測，並加上護欄。[B]

## 5. Multi-Agent（8 分）
- 故事：總召 Agent 把工作派給場地組、宣傳組、財務組。分組是因為各組的規則不一樣，不是因為人多比較好看。
- 重點：
  - 原則：能用一個 Agent 就先用一個。只有在下一段工作需要不同的指令、工具或規則時才拆。[C]
  - 太早拆的話，要寫的提示、要追的紀錄、要核准的關卡都會變多。[C]
  - 兩種分工方式：[C]
    - **Handoffs（交棒）**：專家接手，那一段的對話由它負責
    - **Agents as tools（當工具叫）**：總召保有控制權，專家只負責一小件事，最後由總召回答
  - 和 workflow 的關係：Orchestrator-workers 是由中央的 AI 臨時拆工作、派給別人做，是 workflow 裡最接近分工的模式。[B][E]

## 6. 選型決策表（6 分）
| 遇到的情況 | 選哪個 | 依據 |
|---|---|---|
| 問一次 AI＋查資料就夠 | 先不用做 agentic system | [B] |
| 步驟固定、可以事先拆好 | 固定自動流 | [B][E] |
| 子任務要看輸入才知道有哪些 | Orchestrator-workers | [B][E] |
| 步驟數不能預測，要 AI 自己判斷 | 單一 Agent | [B][D][E] |
| 不同部分需要不同的指令、工具或規則 | Multi-Agent | [C] |

一句話總結：先用最簡單的，真的需要時再加複雜度。[B]

## 7. 常見誤解（3 分）
- 「固定流程不能用工具或記憶」→ 錯。那只是 n8n chain 節點的限制。[A][B][E]
- 「Agent 越多越強」→ 不一定。太早拆反而會增加提示、紀錄和核准關卡。[C]

## 8. 小測驗（3 題，3 分）
1. 園遊會結束後，要照名單寄感謝信給每個攤位，步驟每次都一樣。該選哪一種？
   - 答：固定自動流（步驟固定，可以事先拆好）[B][E]
2. 要 AI 找出「為什麼今年人潮變少」，不知道要查幾次資料。該選哪一種？
   - 答：單一 Agent（步驟數不能預測）[B]
3. 小明說「分成 10 個 Agent 一定比 1 個強」。對嗎？
   - 答：不一定。只有指令、工具或規則需要不同時才拆。[C]

## 9. 來源（Wiki 引用）
- [A] n8n — Agents vs chains：https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains
- [B] Anthropic — Building effective agents（2024-12-19）：https://www.anthropic.com/research/building-effective-agents
- [C] OpenAI — Orchestration and handoffs：https://developers.openai.com/api/docs/guides/agents/orchestration
- [D] Yao et al. — ReAct（arXiv:2210.03629）：https://arxiv.org/abs/2210.03629
- [E] LangGraph — Workflows and agents：https://docs.langchain.com/oss/python/langgraph/workflows-agents
