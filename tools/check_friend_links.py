#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
友链健康检测 v3（只读，不改 link.yml；输出 json + markdown 报告）
==============================================================
对 source/_data/link.yml 每条友链：
  1) 可访问性：Python urllib 走环境代理，取最终 HTTP 状态码（跟随重定向）。
     连接失败/超时(0) -> 串行复测一次，避免代理瞬时抖动误判。
  2) 回链检测：先查首页；未命中则补查常见友链子页
     (/link/ /links/ /friends/ /blogroll/ /about/ /exchange/ /guestbook/)。
  3) SPA 判别：首页极短或几乎没有 <a> 标签 -> 标 unknown（无法判定，不当定罪）。

分类：
  - normal  : 可达 + 命中本站域名（home / 子页）
  - nolink  : 可达但首页与常见子页均未发现本站域名（可能真撤链，也可能子页/SPA未覆盖）
  - unknown : 可达但疑似 SPA / 首页无友链区，无法判定
  - dead    : 复测仍不可达 / 服务器 4xx5xx / 无链接字段

产出（D:/1/1/.tmp，不占C盘，不改动仓库 link.yml）：
  - friend_link_report.md
  - friend_link_status.json
"""
import os
import re
import json
import time
import datetime
import urllib.request
import urllib.error
import urllib.parse
import yaml

LINK_YML = r"D:\1\1\Blog\source\_data\link.yml"
REPORT = r"D:\1\1\.tmp\friend_link_report.md"
JSONOUT = r"D:\1\1\.tmp\friend_link_status.json"

PROXY = (os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
         or os.environ.get("HTTP_PROXY") or "")
SELF = ["mfy-lifeline.com", "lifelinest.github.io"]
SUBPATHS = ["/link/", "/links/", "/friends/", "/blogroll/",
            "/about/", "/exchange/", "/guestbook/",
            "/link", "/links", "/friends", "/blogroll"]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")


def make_opener():
    if PROXY:
        return urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
    return urllib.request.build_opener()


OP = make_opener()
OP.addheaders = [("User-Agent", UA), ("Accept", "text/html,application/xhtml+xml")]


def fetch(url, timeout=20):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        r = OP.open(req, timeout=timeout)
        return r.getcode(), r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return 0, b""


def fetch_text(url, timeout=20):
    code, data = fetch(url, timeout)
    if code and 100 <= code < 400 and data:
        try:
            return code, data.decode("utf-8", "ignore")
        except Exception:
            return code, ""
    return code, ""


def check_backlink(base):
    code, html = fetch_text(base, 15)
    if not html:
        return None, code
    if any(d in html.lower() for d in SELF):
        return "home", code
    for sp in SUBPATHS:
        u = base.rstrip("/") + sp
        c, h = fetch_text(u, 12)
        if h and any(d in h.lower() for d in SELF):
            return sp, c
    acount = html.count("<a ")
    if len(html) < 4000 or acount < 3:
        return "spa_unknown", code
    return False, code


def main():
    data = yaml.safe_load(open(LINK_YML, encoding="utf-8").read())
    results = []
    for grp in data:
        gname = grp.get("class_name", "?")
        for it in grp.get("link_list", []):
            name = it.get("name", "?")
            link = it.get("link") or it.get("url") or ""
            rec = {"name": name, "group": gname, "link": link}
            if not link:
                rec.update(status="dead", detail="无链接字段", code=0)
                results.append(rec)
                print(f"[  dead] {gname}/{name} 无链接字段")
                continue
            base = link.rstrip("/")
            code, _ = fetch(base, 15)
            if code == 0:
                time.sleep(0.6)
                code2, _ = fetch(base, 25)
                if code2 == 0:
                    rec.update(status="dead", detail="连接失败(复测仍失败)", code=code2)
                    results.append(rec)
                    print(f"[  dead] {gname}/{name} {link} 连接失败(复测仍失败)")
                    continue
                code = code2
            if code and 200 <= code < 400:
                found, fcode = check_backlink(base)
                if found == "home":
                    rec.update(status="normal", detail="可达且首页回链", found_at="/", code=code)
                elif found == "spa_unknown":
                    rec.update(status="unknown", detail="可达但疑似SPA/无友链区，无法判定回链", code=code)
                elif found:
                    rec.update(status="normal", detail=f"可达且在子页回链({found})", found_at=found, code=code)
                else:
                    rec.update(status="nolink", detail="可达但首页+常见子页均未发现回链", code=code)
                print(f"[{rec['status']:>7}] {gname}/{name} {link} HTTP {code}")
            elif code and code >= 400:
                rec.update(status="dead", detail=f"服务器返回 {code}", code=code)
                results.append(rec)
                print(f"[  dead] {gname}/{name} {link} HTTP {code}")
                continue
            else:
                rec.update(status="dead", detail="无法判定", code=code)
                results.append(rec)
                print(f"[  dead] {gname}/{name} {link} 无法判定")
                continue
            time.sleep(0.25)
            results.append(rec)

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    cnt = {"normal": 0, "unknown": 0, "nolink": 0, "dead": 0}
    for r in results:
        cnt[r["status"]] += 1

    lines = [
        f"# 友链健康检测报告（{now}）", "",
        f"检测总数 {len(results)} | 正常 {cnt['normal']} | 未知(SPA) {cnt['unknown']} "
        f"| 未回链 {cnt['nolink']} | 疑似失效 {cnt['dead']}", "",
        "## ⚠️ 疑似失效（复测仍不可达 / 4xx5xx，建议复核或下架）", "",
    ]
    for r in [x for x in results if x["status"] == "dead"]:
        lines.append(f"- [{r['group']}] {r['name']} — {r['link']} （{r['detail']}）")
    lines += ["", "## 🔗 未回链（可达但未见回链；可能误判：子页/SPA/反爬，建议人工复核，未自动移动）", ""]
    for r in [x for x in results if x["status"] == "nolink"]:
        lines.append(f"- [{r['group']}] {r['name']} — {r['link']}")
    lines += ["", "## ❓ 无法判定（可达但疑似 SPA 首页无友链区）", ""]
    for r in [x for x in results if x["status"] == "unknown"]:
        lines.append(f"- [{r['group']}] {r['name']} — {r['link']}")
    lines += ["", "## ✅ 正常（回链位置 home=首页 / sub=子页）", ""]
    for r in [x for x in results if x["status"] == "normal"]:
        loc = r.get("found_at", "/")
        lines.append(f"- [{r['group']}] {r['name']} — {r['link']} （@{loc}）")

    open(REPORT, "w", encoding="utf-8").write("\n".join(lines))
    json.dump(results, open(JSONOUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print("\n报告:", REPORT)
    print("JSON :", JSONOUT)
    print("汇总 :", cnt)


if __name__ == "__main__":
    main()
