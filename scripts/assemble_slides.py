"""把簡報結構 JSON 注入 templates/slides.html 母版，輸出單檔 HTML。
用法：python3 scripts/assemble_slides.py slides/<name>.json  → slides/<name>.html
"""
import json, sys, pathlib
src = pathlib.Path(sys.argv[1])
deck = json.loads(src.read_text(encoding="utf-8"))
tpl = pathlib.Path(__file__).resolve().parent.parent.joinpath("templates/slides.html").read_text(encoding="utf-8")
data = json.dumps(deck, ensure_ascii=False).replace("</", "<\\/")
out = tpl.replace("{{DECK_JSON}}", data).replace("{{TITLE}}", deck["title"].replace("<", "&lt;"))
dst = src.with_suffix(".html")
dst.write_text(out, encoding="utf-8")
print(dst, len(deck["slides"]), "slides")
