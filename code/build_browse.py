#!/usr/bin/env python3
"""Creation Archive builder for signature-backend (site #14).

Re-stamps the REAL counts into browse.html + index.html and rebuilds
sitemap.xml — all computed LIVE from signature-backend.js on every run.

STAMP ORDER (never one run behind): this script reads the engine directly,
so the stamped count always matches the shipped engine. If the engine ever
changes (new shelf options / presets), re-run this script BEFORE committing.

Usage: python3 code/build_browse.py
"""
import json
import re
import subprocess
import sys
from datetime import date
from zoneinfo import ZoneInfo

ROOT = "/home/hatch/workspace/signature-backend"
SITE = "https://justinahiggins614-cmyk.github.io/signature-backend/"

NODE_PROBE = r"""
var fs=require('fs'), vm=require('vm');
var sandbox={window:{}}; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('signature-backend.js','utf8'), sandbox);
var B=sandbox.window.SignatureBackend;
function enc(spec){
  var b64=Buffer.from(unescape(encodeURIComponent(JSON.stringify(spec))),'binary').toString('base64');
  return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
var shelves=B.labCatalogs().map(function(c){
  var opts=B.labOptions(c.key);
  var first=opts.slice().sort(function(a,b){return a.name<b.name?-1:1;})[0];
  return {key:c.key, name:c.name, count:c.count, blurb:c.blurb,
          exId:first.id,
          exLink:'index.html?creation='+enc({base:null,picks:(function(){var p={};p[c.key]=[first.id];return p;})()})};
});
var presets=B.presets().map(function(p){
  return {key:p.key, name:p.name, stamp:p.stamp, kind:p.kind, blurb:p.blurb,
          link:'index.html?preset='+p.key+'#api'};
});
var total=shelves.reduce(function(n,c){return n+c.count;},0)+presets.length;
console.log(JSON.stringify({shelves:shelves, presets:presets, total:total}));
"""

def run_node():
    p = subprocess.run(["node", "-e", NODE_PROBE], capture_output=True,
                       text=True, cwd=ROOT)
    if p.returncode != 0:
        sys.exit("FATAL: engine probe failed:\n" + p.stderr[-2000:])
    data = json.loads(p.stdout.strip())
    if data["total"] <= 0:
        sys.exit("FATAL: engine returned zero catalog records — refusing to stamp")
    return data

def stamp_markers(path, replacements):
    with open(path) as f:
        html = f.read()
    for marker, value in replacements:
        pat = r"<!--%s-->.*?<!--/%s-->" % (re.escape(marker), re.escape(marker))
        new, n = re.subn(pat, "<!--%s-->%s<!--/%s-->" % (marker, value, marker),
                         html, flags=re.DOTALL)
        if n == 0:
            sys.exit("FATAL: marker <!--%s--> not found in %s" % (marker, path))
        html = new
    with open(path, "w") as f:
        f.write(html)

def build_sitemap(data):
    today = date.today().isoformat()
    urls = [
        (SITE, "daily", "1.0"),
        (SITE + "browse.html", "weekly", "0.9"),
        (SITE + "api.json", "weekly", "0.5"),
        (SITE + "api-manifest.json", "weekly", "0.5"),
        (SITE + "engine-manifest.json", "weekly", "0.5"),
        (SITE + "llms.txt", "weekly", "0.4"),
        (SITE + "signature-backend.d.ts", "weekly", "0.3"),
    ]
    # Representative deep links: first alphabetical option of each shelf
    # (?creation= animation link) + every preset (?preset= picker link).
    for sh in data["shelves"]:
        urls.append((SITE + sh["exLink"], "weekly", "0.6"))
    for pr in data["presets"]:
        urls.append((SITE + pr["link"], "weekly", "0.6"))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, freq, pri in urls:
        esc = loc.replace("&", "&amp;").replace("<", "&lt;")
        lines.append(
            "  <url><loc>%s</loc><lastmod>%s</lastmod>"
            "<changefreq>%s</changefreq><priority>%s</priority></url>"
            % (esc, today, freq, pri))
    lines.append("</urlset>")
    with open(ROOT + "/sitemap.xml", "w") as f:
        f.write("\n".join(lines) + "\n")
    return len(urls)

def main():
    data = run_node()
    total = data["total"]
    fmt = "{:,}".format(total)

    # 1. Stamp browse.html count header + per-shelf static counts.
    repl = [("BROWSECOUNT", fmt),
            ("BROWSESTAMP", "counted %s" % date.today().isoformat())]
    for sh in data["shelves"]:
        repl.append(("SHELFCOUNT-%s" % sh["key"], "{:,}".format(sh["count"])))
    repl.append(("SHELFCOUNT-presets", str(len(data["presets"]))))
    stamp_markers(ROOT + "/browse.html", repl)

    # 2. Stamp the archive-link count on index.html's hero banner.
    stamp_markers(ROOT + "/index.html", [("ARCHCOUNT", fmt)])

    # 3. Rebuild sitemap (browse.html + deep-link patterns).
    n = build_sitemap(data)

    print("OK: total=%d shelves=%d presets=%d sitemap_urls=%d"
          % (total, sum(s["count"] for s in data["shelves"]),
             len(data["presets"]), n))
    print("stamped browse.html (BROWSECOUNT=%s) + index.html (ARCHCOUNT=%s)"
          % (fmt, fmt))

if __name__ == "__main__":
    main()
