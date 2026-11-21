# raw/ — Wiki 來源原始存檔

老師影片的結構是「資料 → raw → wiki」。這個資料夾存 Job 1（w10-poc-001）stage_1_ingest 已驗過的 5 篇來源（Cue 找、Instinct PASS），一源一檔，對應 Wiki 引用標籤 [A]–[E]。

- 只做存檔：不加新來源、不改內容。Google 候選已排除（見 `topics/topic.yaml`），不存。
- 每檔開頭的 front matter 記錄來源 URL、抓取時間、HTTP 狀態、原始 HTML 大小與 SHA-256，以及轉換方式，方便驗證者對照原站。
- 重抓：Hark，2026-11-19 16:19 CST（Job w10-poc-003）。

| 標籤 | 檔案 | 來源 | URL | Markdown 大小 | 轉換方式 |
|---|---|---|---|---|---|
| [A] | [A-n8n-agents-vs-chains.md](A-n8n-agents-vs-chains.md) | n8n — Agents vs chains | <https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains> | 22 KB | 官方 Markdown 版（原 URL 加 .md），逐字存檔 |
| [B] | [B-anthropic-building-effective-agents.md](B-anthropic-building-effective-agents.md) | Anthropic — Building effective agents（2024-12-19） | <https://www.anthropic.com/research/building-effective-agents> | 20 KB | 原始 HTML 的 <article> 區塊經 pandoc 轉 GFM；只移除內嵌 SVG 圖示（data:image），內文未改 |
| [C] | [C-openai-orchestration-and-handoffs.md](C-openai-orchestration-and-handoffs.md) | OpenAI — Orchestration and handoffs | <https://developers.openai.com/api/docs/guides/agents/orchestration> | 4 KB | 官方 Markdown 版（原 URL 加 .md），逐字存檔 |
| [D] | [D-react-arxiv-2210.03629.md](D-react-arxiv-2210.03629.md) | Yao et al. — ReAct（arXiv:2210.03629，v3 2023-03-10） | <https://arxiv.org/abs/2210.03629> | 3 KB | arXiv 摘要頁的標題／作者／日期／摘要／metadata／提交紀錄經 pandoc 轉 GFM；內文未改（Wiki 引用的是摘要頁，非 PDF 全文） |
| [E] | [E-langgraph-workflows-and-agents.md](E-langgraph-workflows-and-agents.md) | LangGraph — Workflows and agents | <https://docs.langchain.com/oss/python/langgraph/workflows-agents> | 28 KB | 官方 Markdown 版（原 URL 加 .md），逐字存檔；原始 HTML 約 1 MB 多為框架腳本，正文即此 Markdown |

By Hark
