"""反思稿（docs/reflections/w10-poc-004.md）§6 的計數腳本：v1／v2 同口徑重算。
用法：python3 scripts/count_reflection.py   （需在 repo 根目錄；v1＝commit 2860d5e，v2＝HEAD）
"""
import json, re, subprocess
PAGES = ['00-總覽', '01-固定自動流', '02-單一-agent', '03-multi-agent', '04-選型決策']
CJK = re.compile(r'[\u4e00-\u9fff]'); TAG = re.compile(r'\[[A-E]\](?!\()')
def show(rev, path): return subprocess.run(['git', 'show', f'{rev}:{path}'], capture_output=True, text=True, check=True).stdout
def wiki_body(t):   # 正文：去掉頁尾「本頁來源／來源」清單（頁首說明列保留，與 Instinct Stage 2 字數口徑相同）
    return re.split(r'\n## (?:本頁)?來源', t)[0]
def slide_tags(slides):  # 簡報：文字裡的 [X] ＋ 每個 refs 陣列裡的代號
    n = 0
    def walk(o):
        nonlocal n
        if isinstance(o, dict):
            for k, v in o.items():
                if k == 'refs' and isinstance(v, list): n += len(v)
                else: walk(v)
        elif isinstance(o, list): [walk(x) for x in o]
        elif isinstance(o, str): n += len(TAG.findall(o))
    walk(slides); return n
for name, rev in [('v1', '2860d5e'), ('v2', 'HEAD')]:
    pages = [wiki_body(show(rev, f'wiki/workflow-selection/{p}.md')) for p in PAGES]
    lesson = show(rev, 'lessons/workflow-selection-高中-story.md')
    deck = json.loads(show(rev, 'slides/workflow-selection-高中-story.json'))
    s = json.dumps(deck['slides'], ensure_ascii=False)
    print(name, 'wiki_cjk_per_page', [len(CJK.findall(p)) for p in pages], 'wiki_cjk_total', sum(len(CJK.findall(p)) for p in pages),
          'wiki_tags', sum(len(TAG.findall(p)) for p in pages),
          '| lesson_cjk', len(CJK.findall(lesson)), 'lesson_tags', len(TAG.findall(lesson)),
          '| slides', len(deck['slides']), 'slides_cjk', len(CJK.findall(s)), 'slides_tags', slide_tags(deck['slides']))
l3b = show('6b7a926', 'lessons/workflow-selection-高中-story.md')   # 3b 驗收版（Instinct 17:09 PASS 的 commit）
print('v2 lesson@3b(6b7a926)', 'lesson_cjk', len(CJK.findall(l3b)), 'lesson_tags', len(TAG.findall(l3b)))
