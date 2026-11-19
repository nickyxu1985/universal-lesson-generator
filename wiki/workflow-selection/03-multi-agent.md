# 03 Multi-Agent

## 什麼時候拆
- 專家各自負責工作的不同部分時，multi-agent 才有用。[C]
- 先用一個 Agent；只有在能明顯改善「能力隔離、政策隔離、提示清晰度、追蹤可讀性」時才加專家。[C]
- 太早拆會多出更多 prompt、更多 trace、更多核准點，不一定讓流程變好。[C]
- 只有下一個分支真的需要不同的指令、工具或政策時才拆。[C]

## 兩種編排方式（OpenAI Agents SDK）
| 方式 | 用在 | 發生什麼 |
|---|---|---|
| Handoffs | 專家應該接手該分支的對話 | 控制權轉給專家 [C] |
| Agents as tools | 管理者保持控制，把專家當有限功能呼叫 | 管理者保有最後回覆 [C] |

- 管理者式適合：管理者要整合最後答案、專家只做摘要或分類這類有限任務。[C]

## 與 workflow 的關係
- Orchestrator-workers 由中央 LLM 動態拆解並派工，是最接近 multi-agent 分工的 workflow 模式。[B][E]

## 本頁來源
- [B] Anthropic — Building effective agents（2024-12-19）：<https://www.anthropic.com/research/building-effective-agents>
- [C] OpenAI — Orchestration and handoffs：<https://developers.openai.com/api/docs/guides/agents/orchestration>
- [E] LangGraph — Workflows and agents：<https://docs.langchain.com/oss/python/langgraph/workflows-agents>
