/* The Signature AI Mix and Match Generator — shared engine.
   Pure functions (fuzzy match, hybrid builder, name check, code generators)
   are exported for node harness tests. ES5-safe. */
(function(){
"use strict";

/* ---------- one global audio controller (never stacked) ---------- */
var _W = (typeof window !== "undefined") ? window : null;
if (_W && !_W.__JAHREAD){
  _W.__JAHREAD = {
    _last: {},
    playGuard: function(label){
      var now = Date.now(), k = String(label || "speak");
      if (now - (this._last[k] || 0) < 800) return false;
      this._last[k] = now;
      try{ if (_W.speechSynthesis) _W.speechSynthesis.cancel(); }catch(e){}
      return true;
    },
    stop: function(){ try{ if (_W.speechSynthesis) _W.speechSynthesis.cancel(); }catch(e){} }
  };
}
function speak(text, label){
  try{
    if (!_W || !_W.__JAHREAD.playGuard(label || "speak")) return;
    var u = new _W.SpeechSynthesisUtterance(String(text).slice(0, 1500));
    _W.speechSynthesis.speak(u);
  }catch(e){}
}
function stopSpeak(){ try{ if (_W) _W.__JAHREAD.stop(); }catch(e){} }

function escHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function download(filename, content, mime){
  var blob = (content instanceof Blob) ? content :
    new Blob([content], {type: mime || "text/plain;charset=utf-8"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* ---------- fuzzy AI name matching ---------- */
var STOP = {mix:1, and:1, with:1, the:1, a:1, an:1, ai:1, please:1, me:1, my:1};
function toks(s){
  return String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(function(t){ return t && !STOP[t]; });
}
function edit1(a, b){ /* true if levenshtein distance <= 1 */
  if (a === b) return true;
  var la = a.length, lb = b.length, d = Math.abs(la - lb);
  if (d > 1) return false;
  var i = 0, j = 0, edits = 0;
  while (i < la && j < lb){
    if (a[i] === b[j]){ i++; j++; }
    else{
      edits++; if (edits > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
  }
  return true;
}
function tokScore(q, nameToks){
  var best = 0, qt;
  for (var k = 0; k < nameToks.length; k++){
    var nt = nameToks[k];
    if (q === nt) best = Math.max(best, 1);
    else if (nt.indexOf(q) === 0 || q.indexOf(nt) === 0) best = Math.max(best, 0.75);
    else if (nt.indexOf(q) > 0 || q.indexOf(nt) > 0) best = Math.max(best, 0.55);
    else if (edit1(q, nt)) best = Math.max(best, 0.45);
  }
  return best;
}
/* findAIs(query, AIS) -> [{ai, score}] sorted desc */
function findAIs(query, AIS){
  var qs = toks(query);
  if (!qs.length) return [];
  var out = [];
  for (var i = 0; i < AIS.length; i++){
    var ai = AIS[i], nt = toks(ai.name), s = 0;
    for (var q = 0; q < qs.length; q++) s += tokScore(qs[q], nt);
    s = s / qs.length;
    if (s >= 0.45) out.push({ai: ai, score: s});
  }
  out.sort(function(a, b){ return b.score - a.score; });
  return out;
}
/* split "mix air coordinator ai with cook ai" into segments, match each */
function matchMixPhrase(phrase, AIS){
  var low = String(phrase || "").toLowerCase().replace(/^mix\s+/, "");
  var segs = low.split(/\s+(?:with|and|plus|&|\+|x)\s+/);
  if (segs.length < 2) segs = [low];
  var picks = [], seen = {};
  for (var i = 0; i < segs.length && picks.length < 4; i++){
    var m = findAIs(segs[i], AIS)[0];
    if (m && !seen[m.ai.id]){ seen[m.ai.id] = 1; picks.push(m.ai); }
  }
  return picks;
}

/* ---------- deterministic hybrid builder ---------- */
function blendName(ais){
  function sig(name){
    var t = toks(name);
    return t.length ? t : ["mix"];
  }
  if (ais.length === 1) return ais[0].name;
  var first = sig(ais[0].name)[0], last = sig(ais[ais.length - 1].name);
  last = last[last.length - 1];
  var mid = [];
  for (var i = 1; i < ais.length - 1; i++) mid.push(sig(ais[i].name)[0]);
  var parts = [first].concat(mid).concat([last]);
  return parts.map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
}
function shortDesc(ai){
  var d = String(ai.desc || "");
  var cut = d.indexOf(". ");
  return (cut > 20 ? d.slice(0, cut) : d.slice(0, 120)).replace(/\s+$/, "");
}
function buildHybrid(ais, stamp){
  ais = ais.slice(0, 4);
  var name = blendName(ais);
  var abilities = [];
  ais.forEach(function(a){
    (a.caps || []).forEach(function(c){ if (abilities.indexOf(c) < 0) abilities.push(c); });
  });
  abilities = abilities.slice(0, 14);
  var lineage = "Mixed from " + ais.map(function(a){ return a.id + " (" + a.name + ")"; }).join(" + ") +
    " on " + (stamp || new Date().toISOString().slice(0, 10)) +
    " via The Signature AI Mix and Match Generator.";
  var descBits = ais.map(function(a){ return a.name + " — " + shortDesc(a); });
  var description = name + " fuses " + ais.map(function(a){ return a.name; }).join(" with ") +
    " into one mind. " + descBits.join(" ") +
    " It keeps every specialty and answers as one voice.";
  var cats = {};
  ais.forEach(function(a){ cats[a.cat || "AI"] = 1; });
  var catList = Object.keys(cats).join(", ");
  var implications = [
    name + " covers " + catList + " in a single conversation — ask it anything across those fields.",
    "Union of " + abilities.length + " abilities from " + ais.length + " source AIs; nothing invented, every ability comes from the phone book.",
    "File it in the AI Phone Book and it becomes callable from every site, with its own number."
  ];
  return { name: name, ais: ais, abilities: abilities, description: description,
           implications: implications, lineage: lineage,
           stats: [ais.length + " source AIs", abilities.length + " merged abilities",
                   catList] };
}

/* ---------- name check (profanity filter) ---------- */
/* Curse blocklist. SUB = always blocked as a substring (severe). EDGE = blocked
   only as a whole word (their substrings appear in innocent words: peacock, hello). */
var BAD_SUB = ("fuck,shit,bitch,asshole,dick,pussy,cunt,whore,slut,fag,nigger,nigga," +
  "retard,chink,spic,kike,tranny,boob,tits,porn,xxx,hentai,masturbat,orgasm," +
  "dildo,vibrator,penis,vagina,anal,blowjob,handjob,creampie,gangbang," +
  "bastard,douche,titfuck,assfuck,buttplug,clit,ejaculat,erotic,fellatio," +
  "genital,horny,incest,jizz,milf,necrophilia,pedophil,pub[ae],semen," +
  "shemale,smut,sodomy,stripper,threesome,upskirt,voyeur,wetback," +
  "damn,crap,piss,sexy").split(",");
var BAD_EDGE = ["cock", "hell", "sex"];
function checkMixName(raw){
  var name = String(raw || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return {ok: false, msg: "Give your mix a name at least 2 letters long."};
  if (name.length > 48) return {ok: false, msg: "Keep the name under 48 letters."};
  var low = name.toLowerCase();
  for (var i = 0; i < BAD_SUB.length; i++){
    if (low.indexOf(BAD_SUB[i]) >= 0)
      return {ok: false, msg: "Let's pick a cleaner name — that one isn't allowed. Try something friendly!"};
  }
  for (var j = 0; j < BAD_EDGE.length; j++){
    if (new RegExp("(^|[^a-z])" + BAD_EDGE[j] + "([^a-z]|$)").test(low))
      return {ok: false, msg: "Let's pick a cleaner name — that one isn't allowed. Try something friendly!"};
  }
  if (/^j\.?a\.?r\.?v\.?i\.?s\.?$/i.test(name) || /^darth vader$/i.test(name))
    return {ok: false, msg: "That name is taken by a persona AI — pick your own original name."};
  return {ok: true, name: name};
}

/* ---------- code generators (REAL working code) ---------- */
function slug(s){
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mix";
}
function pyStr(s){ return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; }

function buildPython(name, hyb){
  var L = [];
  L.push('"""' + name + ' — a Signature AI mix.');
  L.push(lineage_short(hyb));
  L.push('Runs:  python3 ' + slug(name) + '.py');
  L.push('"""');
  L.push("NAME = " + pyStr(name));
  L.push("SOURCES = [" + hyb.ais.map(function(a){ return pyStr(a.id + " " + a.name); }).join(", ") + "]");
  L.push("ABILITIES = [");
  hyb.abilities.forEach(function(a){ L.push("    " + pyStr(a) + ","); });
  L.push("]");
  L.push("DESCRIPTION = " + pyStr(hyb.description));
  L.push("");
  L.push("def reply(query):");
  L.push('    """Answer about what this mix can do (keyword responder over its abilities)."""');
  L.push("    q = (query or '').lower()");
  L.push("    hits = [a for a in ABILITIES if any(w in q for w in a.lower().split()[:6])]");
  L.push("    if hits:");
  L.push("        return NAME + ' can help: ' + '; '.join(hits[:3])");
  L.push("    if any(w in q for w in ('who are you', 'your name', 'what are you')):");
  L.push("        return NAME + ': ' + DESCRIPTION[:220]");
  L.push("    if 'abilities' in q or 'can you' in q or 'what can' in q:");
  L.push("        return NAME + ' has ' + str(len(ABILITIES)) + ' abilities, including: ' + '; '.join(ABILITIES[:5])");
  L.push("    return NAME + ' hears you. Ask about its abilities, or say help.'");
  L.push("");
  L.push("def main():");
  L.push("    print(NAME + ' — Signature AI mix. Type quit to exit.')");
  L.push("    print('Mixed from: ' + ', '.join(SOURCES))");
  L.push("    while True:");
  L.push("        try: q = input('you> ').strip()");
  L.push("        except (EOFError, KeyboardInterrupt): print(); break");
  L.push("        if q.lower() in ('quit', 'exit'): break");
  L.push("        if q: print('mix> ' + reply(q))");
  L.push("");
  L.push("if __name__ == '__main__':");
  L.push("    main()");
  return L.join("\n") + "\n";
}
function lineage_short(hyb){
  return "Mixed from " + hyb.ais.map(function(a){ return a.name; }).join(" + ") + ".";
}
function buildJS(name, hyb){
  var L = [];
  L.push("/* " + name + " — a Signature AI mix. " + lineage_short(hyb) + " */");
  L.push("(function(){");
  L.push('  var NAME = ' + JSON.stringify(name) + ';');
  L.push('  var ABILITIES = ' + JSON.stringify(hyb.abilities) + ';');
  L.push('  var SOURCES = ' + JSON.stringify(hyb.ais.map(function(a){ return {id: a.id, name: a.name}; })) + ';');
  L.push("  function reply(query){");
  L.push("    var q = String(query || '').toLowerCase();");
  L.push("    var hits = ABILITIES.filter(function(a){");
  L.push("      return a.toLowerCase().split(' ').slice(0,6).some(function(w){ return w && q.indexOf(w) >= 0; });");
  L.push("    });");
  L.push("    if (hits.length) return NAME + ' can help: ' + hits.slice(0,3).join('; ');");
  L.push("    if (/who are you|your name|what are you/.test(q)) return NAME + ': ' + " + JSON.stringify(hyb.description.slice(0,220)) + ";");
  L.push("    return NAME + ' hears you. Ask about its abilities, or say help.';");
  L.push("  }");
  L.push("  var ROOT = (typeof window !== 'undefined') ? window :");
  L.push("             (typeof globalThis !== 'undefined') ? globalThis : this;");
  L.push("  ROOT.SigMix = ROOT.SigMix || {};");
  L.push("  var api = {name: NAME, abilities: ABILITIES, sources: SOURCES, reply: reply};");
  L.push("  ROOT.SigMix[" + JSON.stringify(slug(name)) + "] = api;");
  L.push("  if (typeof module !== 'undefined' && module.exports) module.exports = api;");
  L.push("  if (typeof process !== 'undefined' && process.argv && require.main === module){");
  L.push("    var q = process.argv.slice(2).join(' ');");
  L.push("    if (!q){");
  L.push("      console.log(NAME + ' — Signature AI mix');");
  L.push("      console.log('Mixed from: ' + SOURCES.map(function(s){ return s.name; }).join(' + '));");
  L.push("      console.log('Abilities (' + ABILITIES.length + '):');");
  L.push("      ABILITIES.forEach(function(a){ console.log(' - ' + a); });");
  L.push("      console.log('Usage: node ' + " + JSON.stringify(slug(name) + ".js") + " + ' \"your question\"');");
  L.push("    } else { console.log(api.reply(q)); }");
  L.push("  }");
  L.push("})();");
  return L.join("\n") + "\n";
}

/* ---------- phone-book entries (ai-catalog.json schema) ---------- */
function sha256hex(str){
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function rr(x,n){ return (x>>>n)|(x<<(32-n)); }
  var b = unescape(encodeURIComponent(str)), ml = b.length, i;
  var words = [];
  for (i = 0; i < ml; i++) words[i>>2] |= b.charCodeAt(i) << ((3-(i%4))*8);
  words[ml>>2] |= 0x80 << ((3-(ml%4))*8);
  words[(((ml+8)>>6)<<4)+15] = ml*8;
  var h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  for (i = 0; i < words.length; i += 16){
    var w = words.slice(i, i+16), j;
    for (j = 16; j < 64; j++){
      var s0 = rr(w[j-15],7)^rr(w[j-15],18)^(w[j-15]>>>3);
      var s1 = rr(w[j-2],17)^rr(w[j-2],19)^(w[j-2]>>>10);
      w[j] = (w[j-16]+s0+w[j-7]+s1)|0;
    }
    var a=h[0],bb=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for (j = 0; j < 64; j++){
      var S1 = rr(e,6)^rr(e,11)^rr(e,25), ch = (e&f)^(~e&g);
      var t1 = (hh+S1+ch+K[j]+w[j])|0;
      var S0 = rr(a,2)^rr(a,13)^rr(a,22), mj = (a&bb)^(a&c)^(bb&c);
      var t2 = (S0+mj)|0;
      hh=g; g=f; f=e; e=(d+t1)|0; d=c; c=bb; bb=a; a=(t1+t2)|0;
    }
    h[0]=(h[0]+a)|0; h[1]=(h[1]+bb)|0; h[2]=(h[2]+c)|0; h[3]=(h[3]+d)|0;
    h[4]=(h[4]+e)|0; h[5]=(h[5]+f)|0; h[6]=(h[6]+g)|0; h[7]=(h[7]+hh)|0;
  }
  return h.map(function(x){ return ("00000000"+(x>>>0).toString(16)).slice(-8); }).join("");
}
function pad6(n){ n = String(n); while (n.length < 6) n = "0" + n; return n; }
function pad7(n){ n = String(n); while (n.length < 7) n = "0" + n; return n; }

function buildPhoneBookEntries(args){
  /* args: {name, hyb, seq, stamp, extraCaps:[{name}], manifestText} */
  var hyb = args.hyb, stamp = args.stamp, seq = args.seq;
  var srcIds = hyb.ais.map(function(a){ return a.id; });
  var lineage = "Mixed from " + hyb.ais.map(function(a){ return a.id + " (" + a.name + ")"; }).join(" + ") +
    " on " + stamp + " via The Signature AI Mix and Match Generator.";
  function runtime(){
    return {
      what_you_download: "Real generated files: Python persona module (runs: python3 " + slug(args.name) + ".py), JS persona module for the browser — logic and persona code, not trained-model weights",
      what_the_demo_is: "the mix's own persona code running (Python chat on the command line, JS reply() in the browser)",
      what_the_chat_is: "keyword responder over the mix's merged abilities, running locally — every reply says which answered",
      works_offline: "YES — after download",
      internet_required: "NO",
      browser_only: "NO — Python runs anywhere with Python 3; JS runs in a browser",
      local_download: "YES"
    };
  }
  function artifacts(tag){
    return { download: slug(args.name) + ".py",
      deep_link: "#file-" + tag.toLowerCase(),
      live_url: "https://justinahiggins614-cmyk.github.io/signature-backend/mixes.html" };
  }
  var sig = {
    ID: "JAH-AI-MIX-" + pad6(seq), NAME: args.name, TYPE: "mix", CATEGORY: "Mixed AI",
    DESCRIPTION: args.name + " — a user-mixed Signature AI. " + lineage + " " + hyb.description.slice(0, 300),
    CAPABILITIES: hyb.abilities.slice(),
    LIMITATIONS: "Chat answers come from a local keyword responder over its merged abilities — verify important facts elsewhere.",
    STATUS: "PUBLISHED", VERSION: "1.0", ROLE: "MIXED AI",
    RUNTIME: runtime(),
    DEMO: { kind: "persona-download", runs_in: "browser+python",
      url: "https://justinahiggins614-cmyk.github.io/signature-backend/mixes.html" },
    VOICE: { read_aloud: true, engine: "browser speech synthesis (tiered TTS)" },
    SIGNATURE_NUMBER: "1-800-" + pad7(seq),
    SOURCE: "Mixed on The Signature AI Mix and Match Generator by the user — Signature-made by Justin Addam Higgins",
    RELATIONSHIPS: { mixed_from: srcIds },
    HASH: "sha256:" + sha256hex(args.manifestText || args.name),
    ARTIFACTS: artifacts("JAH-AI-MIX-" + pad6(seq))
  };
  var extra = (args.extraCaps || []).slice(0, 4);
  var best = {
    ID: "JAH-AI-MIX-" + pad6(seq + 1), NAME: args.name + " Best", TYPE: "mix", CATEGORY: "Mixed AI",
    DESCRIPTION: args.name + " Best — the improved best version of " + args.name +
      ". Takes the user's exact mix (" + lineage + ") and adds complementary abilities" +
      (extra.length ? " (" + extra.map(function(c){ return c.name; }).join(", ") + ")" : " (none needed — the mix already covers them)") + ".",
    CAPABILITIES: hyb.abilities.concat(extra.map(function(c){ return c.name + " — " + c.from; })),
    LIMITATIONS: sig.LIMITATIONS, STATUS: "PUBLISHED", VERSION: "1.0", ROLE: "MIXED AI — BEST",
    RUNTIME: runtime(),
    DEMO: sig.DEMO, VOICE: sig.VOICE,
    SIGNATURE_NUMBER: "1-800-" + pad7(seq + 1),
    SOURCE: "Auto-improved by the Mix and Match Generator's best-practice reviewer — Signature-made by Justin Addam Higgins",
    RELATIONSHIPS: { mixed_from: srcIds, improves: "JAH-AI-MIX-" + pad6(seq) },
    HASH: "sha256:" + sha256hex((args.manifestText || args.name) + "-best"),
    ARTIFACTS: artifacts("JAH-AI-MIX-" + pad6(seq + 1))
  };
  return [sig, best];
}

var MixEngine = {
  speak: speak, stopSpeak: stopSpeak, escHtml: escHtml, download: download,
  findAIs: findAIs, matchMixPhrase: matchMixPhrase, buildHybrid: buildHybrid,
  checkMixName: checkMixName, buildPython: buildPython, buildJS: buildJS,
  buildPhoneBookEntries: buildPhoneBookEntries, slug: slug, sha256hex: sha256hex
};
if (typeof module !== "undefined" && module.exports) module.exports = MixEngine;
else window.MixEngine = MixEngine;
})();
