# LLM-Wiki — 知識庫（`wiki/`）

> 這裡是 LLM-Wiki 的家：底層事實，按選型問題分章，不是按來源堆。Wiki 是單一事實來源，錯了後面全錯，所以不趕工。

## 內容怎麼來

1. **Ingest（Cue，@cue）**：依 `topics/topic.yaml` 找 5 篇以上官方／技術文件，HTTP 200、內文非空、去重、官方優先。
2. **結構化進 Wiki（Hark）**：把文件整理進本目錄的分章 Markdown，每個主張標來源。
3. **驗證（Instinct）**：每個主張都有來源、沒有腦補、重點都有覆蓋、結構完整、來源之間沒有矛盾。不合格退回 ingest 補抓。

## 佈局

```
wiki/
  README.md                 本檔
  <topic-slug>/             一個主題一個資料夾
    00-總覽.md
    01-固定自動流.md
    02-單一-agent.md
    03-multi-agent.md
    04-選型決策.md
```

- 每個主張標來源（`來源：<文件標題>（URL）`）。
- 同一個 Wiki 可以生三種教案（國小／國中／高中），但每種都要單獨驗。
- Wiki 越用越厚，同主題第二次不用再 ingest。

## 目前狀態

- `workflow-selection/`：範例主題（固定自動流 → 單一 Agent → Multi-Agent 選型）5 頁已建立，來源 [A]–[E] 為 Cue stage_1_ingest 五篇（Instinct PASS）；stage_2_wiki 內容經 Instinct 驗收 PASS（Job w10-poc-001）。每頁頁尾附「本頁來源」標題與 URL。
- **v2（Job w10-poc-004，Wiki 增量）**：5 頁加深，每頁正文（不含頁尾來源清單）≥ 2,000 個中文字，且都有「定義、運作方式、例子、適用情境與取捨、常見錯誤」五段；新增內容只用 [A]–[E]（原文存檔見 `raw/`），教學情境標「示意」、由來源推出的句子標「本 Wiki 推論」。v1 留在 git history 作反思材料。
- Google 官方來源仍從缺（`topics/topic.yaml` TODO），目前五篇已達門檻。
- 檔案命名與分章細節以 `agents/wiki.md` 為準。
