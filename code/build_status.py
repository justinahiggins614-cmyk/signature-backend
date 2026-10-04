#!/usr/bin/env python3
"""Stamp static (no-JS) status values into index.html.

The live status panel is filled by JavaScript at page load, but readers
without JavaScript (crawlers, accessibility readers, curl) only ever saw
the raw placeholders ("..." / "running..."). This builder runs the real
engine self-test in node and stamps the VERIFIED values into the static
HTML, so the page is honest with and without JavaScript. The page JS
overwrites these spans with live values when it runs.

Markers in index.html (inside the status spans):
  <!--STVER-->...<!--/STVER-->       engine version line
  <!--STTEST-->...<!--/STTEST-->     self-test line
  <!--STAPIS-->...<!--/STAPIS-->     engine API list
  <!--STSHELVES-->...<!--/STSHELVES--> lab shelf counts

Exit 0 on self-test PASS, 2 on FAIL (build gate). Always stamps the
honest result either way. Writes code/status.json with the verified
values for the QA gates to consume.
"""
import hashlib
import json
import re
import subprocess
import sys
import datetime
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENGINE = os.path.join(ROOT, "signature-backend.js")
INDEX = os.path.join(ROOT, "index.html")
STATUS_JSON = os.path.join(HERE, "status.json")

PROBE = r"""
global.window = {};
try {
  eval(require('fs').readFileSync(%s, 'utf8'));
} catch (e) {
  console.log(JSON.stringify({load_error: String(e && e.message || e)}));
  process.exit(0);
}
var B = global.window.SignatureBackend;
var out = {version: B.version, api_version: B.apiVersion || null, backend_id: B.backendId || null};
try {
  var st = B.selfTest();
  out.selftest = {pass: !!st.pass,
                  total: st.checks.length,
                  failed: st.checks.filter(function (c) { return !c[1]; }).map(function (c) { return c[0]; })};
} catch (e) { out.selftest = {pass: false, total: 0, failed: ['selftest-threw: ' + String(e && e.message || e)]}; }
try {
  var cats = B.labCatalogs();
  out.shelfes = cats.length;
  out.options = cats.reduce(function (n, c) { return n + c.count; }, 0);
  var go = B.geneOptions();
  out.gene_slots = go.length;
  out.gene_boxes = go.reduce(function (n, s) { return n + s.options.length; }, 0);
  out.presets = B.presets().length;
  out.apis = Object.keys(B).filter(function (k) { return typeof B[k] === 'function'; });
} catch (e) { out.probe_error = String(e && e.message || e); }
console.log(JSON.stringify(out));
""" % json.dumps(ENGINE)

SKIP_APIS = {"selfTest"}  # self-test is reported on its own line


def main():
    with open(ENGINE, "rb") as f:
        engine_bytes = f.read()
    sha256 = hashlib.sha256(engine_bytes).hexdigest()

    p = subprocess.run(["node", "-e", PROBE], capture_output=True, text=True, timeout=120)
    try:
        info = json.loads((p.stdout or "").strip().splitlines()[-1])
    except Exception:
        info = {"load_error": (p.stderr or "node probe produced no JSON")[:300]}

    today = datetime.date.today().isoformat()
    ok = bool(info.get("selftest", {}).get("pass")) and not info.get("load_error")

    st = info.get("selftest", {})
    total = st.get("total", 0)
    failed = st.get("failed", [])

    if info.get("load_error"):
        ver_html = "engine failed to load"
        test_html = ('<span class="fail">ERROR</span> '
                     '<span class="stamped">static check ' + today + "</span>")
    else:
        ver_html = ("v" + str(info.get("version")) + " — The Signature AI Mix and Match Generator"
                    '<span class="stamped"> · static check ' + today + "</span>")
        if ok:
            test_html = ('<span class="pass">PASS</span> '
                         '<span class="stamped">engine self-test %d/%d · %s</span>'
                         % (total, total, today))
        else:
            test_html = ('<span class="fail">FAIL</span> '
                         '<span class="stamped">engine self-test %d/%d · %s: %s</span>'
                         % (total - len(failed), total, today,
                            ", ".join(failed[:6])))

    apis = [a for a in info.get("apis", []) if a not in SKIP_APIS]
    apis_html = (" ".join(
        '<span class="pass">✓</span>&nbsp;' + a for a in apis)
        + '<span class="stamped"> · static check ' + today + "</span>") if apis else "unavailable"

    if info.get("shelfes") is not None:
        shelfes_html = ("%d shelfes, %d mix-and-match options, all pre-built"
                        '<span class="stamped"> · static check %s</span>'
                        % (info["shelfes"], info["options"], today))
    else:
        shelfes_html = "unavailable"

    with open(INDEX, encoding="utf-8") as f:
        html = f.read()

    def stamp(marker, value):
        nonlocal_html = [html]
        pat = re.compile(r"(<!--" + marker + r"-->).*?(<!--/" + marker + r"-->)",
                         re.DOTALL)
        new_html, n = pat.subn(lambda m: m.group(1) + value + m.group(2),
                               nonlocal_html[0], count=1)
        if n != 1:
            print("marker %s not found exactly once" % marker, file=sys.stderr)
            sys.exit(3)
        nonlocal_html[0] = new_html
        return new_html

    html = stamp("STVER", ver_html)
    html = stamp("STTEST", test_html)
    html = stamp("STAPIS", apis_html)
    html = stamp("STSHELVES", shelfes_html)

    with open(INDEX, "w", encoding="utf-8") as f:
        f.write(html)

    status = {
        "date": today,
        "engine_version": info.get("version"),
        "api_version": info.get("api_version"),
        "backend_id": info.get("backend_id"),
        "engine_sha256": sha256,
        "selftest_pass": ok,
        "selftest_total": total,
        "selftest_failed": failed,
        "shelfes": info.get("shelfes"),
        "options": info.get("options"),
        "gene_slots": info.get("gene_slots"),
        "gene_boxes": info.get("gene_boxes"),
        "presets": info.get("presets"),
        "apis": apis,
    }
    with open(STATUS_JSON, "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2)

    print("stamped index.html: engine v%s, self-test %s (%d checks), sha256 %s..."
          % (info.get("version"), "PASS" if ok else "FAIL", total, sha256[:12]))
    sys.exit(0 if ok else 2)


if __name__ == "__main__":
    main()
