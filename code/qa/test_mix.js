#!/usr/bin/env node
/* Harness test for The Signature AI Mix and Match Generator (js/mix.js).
   Tests: pick-2 mix, free-text mix, name filter, Python/JS codegen (py RUNS),
   phone-book entries (schema-consistent vs the real catalog). */
"use strict";
var fs = require("fs"), path = require("path"), cp = require("child_process");
var ROOT = path.resolve(__dirname, "..", "..");
var E = require(path.join(ROOT, "js", "mix.js"));
var fails = 0;
function ok(cond, label, extra){
  console.log((cond ? "PASS" : "FAIL") + " " + label + (extra ? " — " + extra : ""));
  if (!cond) fails++;
}

var compact = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ai-compact.json"), "utf8"));
var AIS = compact.ais;
ok(AIS.length === 441, "phone book loaded", AIS.length + " AIs");

/* 1. pick-2 mix */
var a1 = AIS.filter(function(a){ return a.name === "Signature Grovemark Mind"; })[0];
var a2 = AIS.filter(function(a){ return a.name === "Signature Kelpfield Reel"; })[0];
ok(!!(a1 && a2), "exact-name lookup finds both AIs");
var hyb = E.buildHybrid([a1, a2], "2026-10-04");
ok(hyb.name && hyb.name.length > 3, "hybrid has a name", hyb.name);
ok(hyb.lineage.indexOf(a1.name) >= 0 && hyb.lineage.indexOf(a2.name) >= 0, "lineage names both parents", hyb.lineage);
ok(hyb.abilities.length >= 2, "abilities merged", hyb.abilities.length + " abilities");
var union = {};
a1.caps.concat(a2.caps).forEach(function(c){ union[c] = 1; });
ok(hyb.abilities.every(function(c){ return union[c]; }), "abilities are a true union (nothing invented)");
ok(hyb.implications.length >= 2, "implications generated");
ok(hyb.description.length > 40, "description generated");

/* 2. free-text mix */
var picks = E.matchMixPhrase("mix air coordinator ai with cook ai", AIS);
ok(picks.length >= 2, "free-text matched >= 2 AIs", picks.map(function(a){ return a.name; }).join(" + "));
var hyb2 = E.buildHybrid(picks.slice(0, 2), "2026-10-04");
ok(hyb2.name.length > 3 && hyb2.abilities.length >= 2, "free-text hybrid sane", hyb2.name);

/* 3. name filter */
var clean = E.checkMixName("Sky Kitchen Captain");
ok(clean.ok === true, "clean name accepted", JSON.stringify(clean));
["damn this mix", "what the hell ai", "shitbot"].forEach(function(bad){
  var r = E.checkMixName(bad);
  ok(r.ok === false, "profane name rejected", bad);
});
var short = E.checkMixName("x");
ok(short.ok === false, "too-short name rejected");

/* 4. codegen: real Python that RUNS, real JS */
var py = E.buildPython("Sky Kitchen Captain", hyb);
var js = E.buildJS("Sky Kitchen Captain", hyb);
var tmp = "/tmp/mixtest";
try { fs.mkdirSync(tmp); } catch (e) {}
fs.writeFileSync(path.join(tmp, "mix.py"), py);
fs.writeFileSync(path.join(tmp, "mix.js"), js);
try {
  var out = cp.execSync("python3 " + path.join(tmp, "mix.py"),
    {timeout: 15000, input: "what can you do\nquit\n"}).toString();
  ok(out.indexOf("Sky Kitchen Captain") >= 0 && /abilities/i.test(out), "generated Python RUNS as chat CLI", out.split("\n")[0]);
} catch (e) { ok(false, "generated Python RUNS as chat CLI", e.message.slice(0, 120)); }
try {
  cp.execSync("node --check " + path.join(tmp, "mix.js"), {timeout: 10000});
  ok(true, "generated JS passes node --check");
} catch (e) { ok(false, "generated JS passes node --check", e.message.slice(0, 120)); }
try {
  var jout = cp.execSync("node " + path.join(tmp, "mix.js") + " \"what can you do\"", {timeout: 10000}).toString();
  ok(jout.indexOf("Sky Kitchen Captain") >= 0 && /can help|abilities/i.test(jout), "generated JS RUNS as chat CLI", jout.split("\n")[0].slice(0, 70));
} catch (e) { ok(false, "generated JS RUNS as chat CLI", e.message.slice(0, 160)); }
try {
  var jmod = require(path.join(tmp, "mix.js"));
  ok(jmod && typeof jmod.reply === "function" && jmod.reply("hello").length > 5, "generated JS works as required module");
} catch (e) { ok(false, "generated JS works as required module", e.message.slice(0, 120)); }

/* 5. phone-book entries: schema-consistent vs the real catalog */
var catPath = require("os").homedir() + "/workspace/jah-ai-models/ai-catalog.json";
var cat = JSON.parse(fs.readFileSync(catPath, "utf8"));
var recs = cat.records || cat;
var keyset = {};
recs.forEach(function(r){ Object.keys(r).forEach(function(k){ keyset[k] = 1; }); });
var sub = {RUNTIME: {}, DEMO: {}, VOICE: {}, ARTIFACTS: {}};
recs.forEach(function(r){
  Object.keys(sub).forEach(function(sk){
    if (r[sk]) Object.keys(r[sk]).forEach(function(k){ sub[sk][k] = 1; });
  });
});
var entries = E.buildPhoneBookEntries({name: "Sky Kitchen Captain", hyb: hyb, seq: 900001,
  stamp: "2026-10-04", extraCaps: [{name: "Test Cap", from: "Test AI"}], manifestText: "test-manifest"});
ok(entries.length === 2, "two entries built (Signature + best)");
entries.forEach(function(en, i){
  var missing = Object.keys(keyset).filter(function(k){ return !(k in en); });
  var extra = Object.keys(en).filter(function(k){ return !(k in keyset); });
  ok(missing.length === 0 && extra.length === 0, "entry " + i + " top-level keys exact",
     "missing=" + missing.join(",") + " extra=" + extra.join(","));
  Object.keys(sub).forEach(function(sk){
    var ek = en[sk] ? Object.keys(en[sk]) : [];
    var mk = Object.keys(sub[sk]).filter(function(k){ return ek.indexOf(k) < 0; });
    var xk = ek.filter(function(k){ return !(k in sub[sk]); });
    ok(mk.length === 0 && xk.length === 0, "entry " + i + "." + sk + " sub-keys exact");
  });
  ok(/^JAH-AI-MIX-\d{6}$/.test(en.ID), "entry " + i + " ID format", en.ID);
  ok(/^1-800-\d{7}$/.test(en.SIGNATURE_NUMBER), "entry " + i + " phone format", en.SIGNATURE_NUMBER);
});
ok(entries[0].RELATIONSHIPS.mixed_from.length === 2, "lineage lists both parents");
ok(entries[1].RELATIONSHIPS.improves === entries[0].ID, "best version improves the Signature version");

console.log(fails ? "\nRESULT: " + fails + " FAILURES" : "\nRESULT: ALL PASS");
process.exit(fails ? 1 : 0);
