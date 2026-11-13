#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/bing-to-retro.py —— 把必应站长 GetPageStats 转成 retro.js --fill 需要的 JSON
------------------------------------------------------------------
为什么需要它：复盘表的内容侧指标（字数/图/内链）能自动算，但曝光/点击/排名只有
站长后台有。这个脚本直接调必应只读 API，按 abbrlink 落成 JSON，再喂给
`node tools/retro.js --fill=...`，避免手工抄表。

用法：
  python tools/bing-to-retro.py                 # 输出到 D:/1/1/.tmp/retro-bing.json
  node tools/retro.js --fill=D:/1/1/.tmp/retro-bing.json
  node tools/retro.js --report

注意：必应这个接口返回的对象里，URL 是塞在 `Query` 字段里的（不是 Page/Url），
      字段名容易踩坑；日期是 /Date(ms)/ 格式，本脚本按 abbrlink 聚合多天数据。
依赖：仅标准库；走系统代理。
"""
# -*- coding: utf-8 -*-
"""把必应站长 GetPageStats 转成 retro.js --fill 需要的 JSON（按 abbrlink 索引）。"""
import json, re, sys, urllib.parse, urllib.request

API_BASE = "https://ssl.bing.com/webmaster/api.svc/json"
SITE = "https://mfy-lifeline.com"
CFG = r"D:/1/1/.workbuddy/memory/bing-webmaster.json"
OUT = r"D:/1/1/.tmp/retro-bing.json"


def load_key():
    with open(CFG, encoding="utf-8") as f:
        return json.load(f).get("api_key", "").strip()


def call(endpoint, key):
    qs = urllib.parse.urlencode({"apikey": key, "siteUrl": SITE})
    req = urllib.request.Request(f"{API_BASE}/{endpoint}?{qs}", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8")).get("d", [])


def main():
    key = load_key()
    if not key:
        print("ERR: 没读到 api_key")
        sys.exit(1)
    pages = call("GetPageStats", key)
    if isinstance(pages, dict):
        print("ERR:", json.dumps(pages, ensure_ascii=False)[:300])
        sys.exit(1)

    print(f"页面记录：{len(pages)} 条")
    if pages:
        print("字段：", list(pages[0].keys()))

    out = {}
    unmatched = []
    for p in pages:
        url = p.get("Page") or p.get("PageUrl") or p.get("Url") or p.get("Query") or ""
        m = re.search(r"/posts/([0-9a-zA-Z]+)/?$", url.rstrip("/") + "/")
        if not m:
            unmatched.append(url)
            continue
        abbr = m.group(1)
        imp = int(p.get("Impressions", 0) or 0)
        clk = int(p.get("Clicks", 0) or 0)
        pos = p.get("AvgImpressionPosition") or p.get("AveragePosition") or p.get("Position")
        row = out.setdefault(abbr, {"impressions": 0, "clicks": 0, "position": None})
        row["impressions"] += imp
        row["clicks"] += clk
        if pos not in (None, ""):
            try:
                row["position"] = round(float(pos), 1)
            except Exception:
                pass

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"匹配到文章页：{len(out)} 篇 → {OUT}")
    if unmatched:
        print(f"非文章页（首页/分类/项目页）：{len(unmatched)} 条，已忽略")
        for u in unmatched[:5]:
            print("  ·", u[:80])
    top = sorted(out.items(), key=lambda kv: -kv[1]["impressions"])[:5]
    print("曝光 Top5：")
    for a, v in top:
        print(f"  {a}  曝光={v['impressions']} 点击={v['clicks']} 排名={v['position']}")


if __name__ == "__main__":
    main()
