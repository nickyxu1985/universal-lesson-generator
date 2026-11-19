"""把 wiki/ 的 Markdown（已驗證內容，不改字）組裝成單檔瀏覽頁 wiki/index.html。
用法：python3 scripts/build_wiki.py [topic-slug]   （預設 workflow-selection）
母版：templates/wiki.html；本腳本只做 Markdown → HTML 轉換與注入，不增刪內容。
無第三方套件，支援本 Wiki 用到的語法：標題、清單（含巢狀）、表格、引言、粗體、行內碼、程式碼區塊、<url> 與 [文字](連結)。
"""
import html, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = "https://github.com/nickyxu1985/universal-lesson-generator/blob/develop/"
slug = sys.argv[1] if len(sys.argv) > 1 else "workflow-selection"
TAG = re.compile(r"\[([A-E])\](?!\()")

def inline(s, base):
    out, pos = [], 0
    for m in re.finditer(r"`([^`]+)`", s):          # 行內碼先保護
        out.append(("t", s[pos:m.start()])); out.append(("c", m.group(1))); pos = m.end()
    out.append(("t", s[pos:]))
    res = []
    for kind, txt in out:
        if kind == "c":
            res.append(f"<code>{html.escape(txt)}</code>"); continue
        links = []
        def keep(h):
            links.append(h); return f"\x00{len(links)-1}\x00"
        txt = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: keep((m.group(1), m.group(2))), txt)
        txt = re.sub(r"<(https?://[^>]+)>", lambda m: keep((m.group(1), m.group(1))), txt)
        txt = re.sub(r"(?<![\"'(])(https?://[^\s<>）)]+)", lambda m: keep((m.group(1), m.group(1))), txt)
        txt = html.escape(txt, quote=False)
        txt = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", txt)
        txt = TAG.sub(lambda m: f'<a class="tag" href="#" data-src="{m.group(1)}">[{m.group(1)}]</a>', txt)
        def back(m):
            label, href = links[int(m.group(1))]
            if not re.match(r"https?://", href):   # repo 內相對連結 → GitHub develop
                href = REPO + str((base / href).resolve().relative_to(ROOT)).replace("\\", "/")
            return f'<a href="{html.escape(href)}" target="_blank" rel="noopener">{html.escape(label, quote=False)}</a>'
        res.append(re.sub(r"\x00(\d+)\x00", back, txt))
    return "".join(res)

def md(text, base):
    lines, i, o = text.split("\n"), 0, []
    while i < len(lines):
        l = lines[i]
        if l.startswith("```"):
            j = i + 1
            while j < len(lines) and not lines[j].startswith("```"): j += 1
            o.append("<pre><code>" + html.escape("\n".join(lines[i+1:j])) + "</code></pre>"); i = j + 1; continue
        m = re.match(r"(#{1,4})\s+(.*)", l)
        if m:
            n = len(m.group(1)); t = m.group(2)
            cls = ' class="srchead"' if "來源" in t and n >= 2 else ""
            o.append(f"<h{n}{cls}>{inline(t, base)}</h{n}>"); i += 1; continue
        if l.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"): buf.append(lines[i].lstrip("> ").rstrip()); i += 1
            o.append("<blockquote>" + inline(" ".join(buf), base) + "</blockquote>"); continue
        if l.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"): rows.append(lines[i]); i += 1
            cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows if not re.match(r"^\|[\s\-:|]+\|$", r.strip())]
            h = "<div class=\"tbl\"><table><thead><tr>" + "".join(f"<th>{inline(c, base)}</th>" for c in cells[0]) + "</tr></thead><tbody>"
            h += "".join("<tr>" + "".join(f"<td>{inline(c, base)}</td>" for c in r) + "</tr>" for r in cells[1:])
            o.append(h + "</tbody></table></div>"); continue
        if re.match(r"\s*([-*]|\d+\.)\s", l):
            items = []   # (indent, ordered, text)
            while i < len(lines) and re.match(r"\s*([-*]|\d+\.)\s", lines[i]):
                mm = re.match(r"(\s*)([-*]|\d+\.)\s+(.*)", lines[i]); items.append((len(mm.group(1)), mm.group(2)[0].isdigit(), mm.group(3))); i += 1
            h, stack = "", []
            for ind, ordered, t in items:
                tagn = "ol" if ordered else "ul"
                if not stack or ind > stack[-1][0]: h += f"<{tagn}>"; stack.append((ind, tagn))
                else:
                    while len(stack) > 1 and ind < stack[-1][0]: h += f"</li></{stack.pop()[1]}>"
                    h += "</li>"
                h += "<li>" + inline(t, base)
            while stack: h += f"</li></{stack.pop()[1]}>"
            o.append(h); continue
        if l.strip():
            buf = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(#|>|\||```|\s*([-*]|\d+\.)\s)", lines[i]): buf.append(lines[i].strip()); i += 1
            o.append("<p>" + inline(" ".join(buf), base) + "</p>"); continue
        i += 1
    return "\n".join(o)

wdir = ROOT / "wiki" / slug
pages = []
for f in sorted(wdir.glob("[0-9][0-9]-*.md")):
    text = f.read_text(encoding="utf-8")
    title = re.match(r"#\s+(.*)", text).group(1)
    pages.append({"id": f.name[:2], "title": title, "file": f"wiki/{slug}/{f.name}", "html": md(text, f.parent)})
readme = ROOT / "wiki" / "README.md"
pages.append({"id": "about", "title": "關於這個 Wiki", "file": "wiki/README.md", "html": md(readme.read_text(encoding="utf-8"), readme.parent)})
assert sum(p["id"] != "about" for p in pages) == 5, "預期 5 頁 Wiki"

tpl = (ROOT / "templates" / "wiki.html").read_text(encoding="utf-8")
data = json.dumps({"slug": slug, "repo": REPO, "pages": pages}, ensure_ascii=False).replace("</", "<\\/")
dst = ROOT / "wiki" / "index.html"
dst.write_text(tpl.replace("{{WIKI_JSON}}", data), encoding="utf-8")
print(dst.relative_to(ROOT), len(pages), "pages")
