# 02 單一 Agent

## 定義與運作
- Agent 由 LLM 動態決定自己的流程與工具使用。[B][E]
- 實作上通常就是「LLM 根據環境回饋、在迴圈中使用工具」。[B][E]
- 每一步要從環境取得「ground truth」（例如工具結果、程式執行結果）來判斷進度；可在檢查點或卡住時停下來問人；常設停止條件（例如最大迭代次數）。[B]
- n8n 的 Agent 節點會決定要呼叫哪些工具，並可使用記憶。[A]

## 理論根源：ReAct
- ReAct 讓 LLM 交錯產生「推理軌跡」與「行動」：推理幫助擬定、追蹤、更新計畫與處理例外；行動讓模型接觸外部來源（知識庫、環境）取得資訊。[D]
- 在 HotpotQA 與 Fever 上，透過呼叫簡單的 Wikipedia API，減少思維鏈推理常見的幻覺與錯誤傳遞。[D]
- 在 ALFWorld 與 WebShop 兩個互動決策 benchmark 上，ReAct 只用 1–2 個範例提示（one/two-shot），絕對成功率分別比模仿學習與強化學習方法高 34 與 10 個百分點。[D]
  - ⚠️ 這是論文在這兩個特定 benchmark、對上述比較對象的結果，不能寫成「一般 Agent 都會提升 34／10 個百分點」。

## 適合時機
- 開放式問題：很難或無法預測需要幾步，也無法寫死固定路徑。[B]
- 需要彈性與模型自行決策的規模化任務。[B]

## 代價與風險
- 成本較高，錯誤可能累積（compounding errors）；建議在沙盒大量測試並設護欄。[B]
- agentic system 通常用延遲與成本換更好的任務表現。[B]

## 本頁來源
- [A] n8n — Agents vs chains：<https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains>
- [B] Anthropic — Building effective agents（2024-12-19）：<https://www.anthropic.com/research/building-effective-agents>
- [D] Yao et al. — ReAct: Synergizing Reasoning and Acting in Language Models（arXiv:2210.03629，v3 2023-03-10）：<https://arxiv.org/abs/2210.03629>
- [E] LangGraph — Workflows and agents：<https://docs.langchain.com/oss/python/langgraph/workflows-agents>
