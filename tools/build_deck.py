#!/usr/bin/env python3
"""Gera deck/slides.js a partir de project/deck.json + project/slides/*.html.

Rode sempre que editar um slide:  python3 tools/build_deck.py
(O player lê deck/slides.js, assim funciona abrindo o index.html direto, sem servidor.)
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
deck = json.load(open(os.path.join(ROOT, "project", "deck.json"), encoding="utf-8"))
slides, missing = {}, []
for sid in deck["order"]:
    f = os.path.join(ROOT, "project", "slides", sid + ".html")
    if os.path.exists(f):
        slides[sid] = open(f, encoding="utf-8").read()
    else:
        missing.append(sid)
out = {"title": deck.get("title", ""), "order": deck["order"], "slides": slides}
os.makedirs(os.path.join(ROOT, "deck"), exist_ok=True)
with open(os.path.join(ROOT, "deck", "slides.js"), "w", encoding="utf-8") as fh:
    fh.write("/* Gerado por tools/build_deck.py — não edite à mão; edite project/slides/*.html */\n")
    fh.write("window.DECK = " + json.dumps(out, ensure_ascii=False) + ";\n")
print(f"deck/slides.js: {len(slides)} slides" + (f" (faltando: {', '.join(missing)})" if missing else ""))
sys.exit(1 if missing else 0)
