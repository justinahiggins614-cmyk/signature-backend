/* =========================================================================
   SigLlama v1 - pure JavaScript inference engine. No dependencies.
   Our own tiny transformer, trained from scratch on our own corpus.
   Loads vocab.json + sigllama-v1.bin (int8 weights, dequantized at load).

   API:
     await SigLlama.load(baseUrl)          // baseUrl holds vocab.json + sigllama-v1.bin
     SigLlama.loaded()                     // true/false
     SigLlama.info()                       // {params, vocab, ...}
     await SigLlama.generate(prompt, opts) // opts: maxTokens, temperature, topK, stopAtEos, onToken
   ========================================================================= */
var SigLlama = (function () {
  "use strict";

  var V = 0, D = 0, NL = 0, NH = 0, SEQ = 0, THETA = 10000, MLP = 0, HD = 0;
  var itos = [], stoi = {}, BOS = 0, EOS = 1, UNK = 3;
  var WORD_MODE = false;   // v2 chat model: word-level tokenizer
  var T = {};            // tensors, Float32Array, row-major
  var ready = false;
  var modelInfo = {};

  function readU8(dv, o) { return [dv.getUint8(o.p), o.p += 1]; }
  function readU32(dv, o) { var v = dv.getUint32(o.p, true); o.p += 4; return v; }
  function readF32(dv, o) { var v = dv.getFloat32(o.p, true); o.p += 4; return v; }

  function parseWeights(buf) {
    var dv = new DataView(buf), o = { p: 0 };
    function bytes(n) { var b = new Uint8Array(buf, o.p, n); o.p += n; return b; }
    function str(n) {
      var b = bytes(n), s = "";
      for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return s;
    }
    var magic = str(4);
    if (magic !== "SGLL") throw new Error("bad magic: " + magic);
    var ver = readU32(dv, o);
    if (ver !== 1) throw new Error("bad version: " + ver);
    V = readU32(dv, o); D = readU32(dv, o); NL = readU32(dv, o);
    NH = readU32(dv, o); SEQ = readU32(dv, o);
    THETA = readF32(dv, o); MLP = readU32(dv, o);
    HD = D / NH;
    var count = readU32(dv, o);
    for (var t = 0; t < count; t++) {
      var nl2 = readU8(dv, o)[0];
      var name = str(nl2);
      var ndim = readU8(dv, o)[0];
      var dims = [], nelem = 1, i;
      for (i = 0; i < ndim; i++) { var dd = readU32(dv, o); dims.push(dd); nelem *= dd; }
      var kind = readU8(dv, o)[0];
      var nscales = readU32(dv, o);
      var scales = null;
      if (nscales > 0) {
        scales = new Float32Array(nscales);
        for (i = 0; i < nscales; i++) scales[i] = readF32(dv, o);
      }
      var dlen = readU32(dv, o);
      var raw = bytes(dlen);
      var arr = new Float32Array(nelem);
      if (kind === 0) {
        // int8, per-row scales; rows = nelem / cols
        var cols = dims[dims.length - 1], rows = nelem / cols;
        for (var r = 0; r < rows; r++) {
          var s = scales ? scales[r] : 1, base = r * cols;
          for (var c = 0; c < cols; c++) {
            var v = raw[base + c];
            arr[base + c] = (v > 127 ? v - 256 : v) * s;
          }
        }
      } else {
        var dv2 = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        for (i = 0; i < nelem; i++) arr[i] = dv2.getFloat32(i * 4, true);
      }
      T[name] = arr;
    }
  }

  // ---- math helpers -------------------------------------------------------
  function rmsnorm(x, w, eps) {
    var n = x.length, s = 0, i;
    for (i = 0; i < n; i++) s += x[i] * x[i];
    var inv = 1 / Math.sqrt(s / n + (eps || 1e-5));
    var out = new Float32Array(n);
    for (i = 0; i < n; i++) out[i] = x[i] * inv * w[i];
    return out;
  }
  function matvec(W, x, rows, cols, out) {
    // W row-major (rows, cols)
    for (var r = 0; r < rows; r++) {
      var s = 0, base = r * cols;
      for (var c = 0; c < cols; c++) s += W[base + c] * x[c];
      out[r] = s;
    }
    return out;
  }
  // RoPE tables: cos/sin per position, per half-dim pair
  var ropeCos = null, ropeSin = null;
  function buildRope() {
    ropeCos = new Float32Array(SEQ * (HD / 2));
    ropeSin = new Float32Array(SEQ * (HD / 2));
    for (var p = 0; p < SEQ; p++) {
      for (var i = 0; i < HD / 2; i++) {
        var a = p / Math.pow(THETA, (2 * i) / HD);
        ropeCos[p * (HD / 2) + i] = Math.cos(a);
        ropeSin[p * (HD / 2) + i] = Math.sin(a);
      }
    }
  }
  function applyRope(vec, pos, nheads) {
    // vec: (nheads, HD) flat; rotate pairs (i, i+HD/2)
    var hd2 = HD / 2, h, i;
    for (h = 0; h < nheads; h++) {
      var hb = h * HD;
      for (i = 0; i < hd2; i++) {
        var c = ropeCos[pos * hd2 + i], s = ropeSin[pos * hd2 + i];
        var a = vec[hb + i], b = vec[hb + i + hd2];
        vec[hb + i] = a * c - b * s;
        vec[hb + i + hd2] = a * s + b * c;
      }
    }
  }

  // ---- KV cache -----------------------------------------------------------
  var kCache = [], vCache = [];
  function resetCache() {
    kCache = []; vCache = [];
    for (var l = 0; l < NL; l++) {
      kCache.push(new Float32Array(SEQ * NH * HD));
      vCache.push(new Float32Array(SEQ * NH * HD));
    }
  }

  var tmp = {};
  function allocTmp() {
    tmp.x = new Float32Array(D); tmp.h = new Float32Array(D);
    tmp.q = new Float32Array(D); tmp.k = new Float32Array(D); tmp.v = new Float32Array(D);
    tmp.att = new Float32Array(NH * D); tmp.scores = new Float32Array(SEQ);
    tmp.g = new Float32Array(MLP); tmp.u = new Float32Array(MLP); tmp.dn = new Float32Array(D);
    tmp.logits = new Float32Array(V);
  }

  function forwardOne(tok, pos) {
    var emb = T["tok_emb"];
    for (var i = 0; i < D; i++) tmp.x[i] = emb[tok * D + i];
    for (var l = 0; l < NL; l++) {
      var P = "layers." + l + ".";
      var h = rmsnorm(tmp.x, T[P + "rms1"]);
      matvec(T[P + "attn_q"], h, D, D, tmp.q);
      matvec(T[P + "attn_k"], h, D, D, tmp.k);
      matvec(T[P + "attn_v"], h, D, D, tmp.v);
      applyRope(tmp.q, pos, NH);
      applyRope(tmp.k, pos, NH);
      var kc = kCache[l], vc = vCache[l];
      kc.set(tmp.k, pos * NH * HD);
      vc.set(tmp.v, pos * NH * HD);
      // attention per head over 0..pos
      var hd, j, s, mx, sum, p;
      var scale = 1 / Math.sqrt(HD);
      for (hd = 0; hd < NH; hd++) {
        var qb = hd * HD;
        mx = -1e30;
        for (j = 0; j <= pos; j++) {
          s = 0;
          var kb = j * NH * HD + qb;
          for (var d = 0; d < HD; d++) s += tmp.q[qb + d] * kc[kb + d];
          s *= scale;
          tmp.scores[j] = s;
          if (s > mx) mx = s;
        }
        sum = 0;
        for (j = 0; j <= pos; j++) { p = Math.exp(tmp.scores[j] - mx); tmp.scores[j] = p; sum += p; }
        var ob = hd * HD;
        for (d = 0; d < HD; d++) {
          s = 0;
          for (j = 0; j <= pos; j++) s += (tmp.scores[j] / sum) * vc[j * NH * HD + qb + d];
          tmp.att[ob + d] = s;
        }
      }
      matvec(T[P + "attn_proj"], tmp.att, D, D, tmp.h);
      for (i = 0; i < D; i++) tmp.x[i] += tmp.h[i];
      var h2 = rmsnorm(tmp.x, T[P + "rms2"]);
      matvec(T[P + "mlp_gate"], h2, MLP, D, tmp.g);
      matvec(T[P + "mlp_up"], h2, MLP, D, tmp.u);
      for (i = 0; i < MLP; i++) {
        var gv = tmp.g[i];
        var silu = gv / (1 + Math.exp(-gv));
        tmp.g[i] = silu * tmp.u[i];
      }
      matvec(T[P + "mlp_down"], tmp.g, D, MLP, tmp.dn);
      for (i = 0; i < D; i++) tmp.x[i] += tmp.dn[i];
    }
    var hn = rmsnorm(tmp.x, T["final_norm"]);
    matvec(T["head"], hn, V, D, tmp.logits);
    return tmp.logits;
  }

  function sample(logits, temperature, topK) {
    var i, n = logits.length;
    if (!temperature || temperature <= 0) {
      var bi = 0, bv = logits[0];
      for (i = 1; i < n; i++) if (logits[i] > bv) { bv = logits[i]; bi = i; }
      return bi;
    }
    var arr = new Float32Array(n);
    for (i = 0; i < n; i++) arr[i] = logits[i] / temperature;
    var idx = new Array(n);
    for (i = 0; i < n; i++) idx[i] = i;
    var take = n;
    if (topK > 0 && topK < n) {
      idx.sort(function (a, b) { return arr[b] - arr[a]; });
      take = topK;
    }
    var mx = -1e30;
    for (i = 0; i < take; i++) { var id = topK > 0 && topK < n ? idx[i] : i; if (arr[id] > mx) mx = arr[id]; }
    var sum = 0;
    var probs = new Float32Array(take);
    for (i = 0; i < take; i++) {
      var id2 = topK > 0 && topK < n ? idx[i] : i;
      var p = Math.exp(arr[id2] - mx); probs[i] = p; sum += p;
    }
    var r = Math.random() * sum;
    for (i = 0; i < take; i++) { r -= probs[i]; if (r <= 0) return (topK > 0 && topK < n ? idx[i] : i); }
    return topK > 0 && topK < n ? idx[take - 1] : take - 1;
  }

  var WORD_RE = /[A-Za-z]+(?:'[a-z]+)?|[0-9]+(?:\.[0-9]+)?|[^\sA-Za-z0-9]/g;
  function encode(str) {
    var ids = [], i, m;
    if (WORD_MODE) {
      WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(String(str))) !== null) {
        var t = m[0];
        ids.push(stoi[t] !== undefined ? stoi[t] : UNK);
      }
      return ids;
    }
    for (i = 0; i < str.length; i++) {
      var ch = str[i];
      ids.push(stoi[ch] !== undefined ? stoi[ch] : UNK);
    }
    return ids;
  }
  function decode(ids) {
    var i, t;
    if (WORD_MODE) {
      var toks = [];
      for (i = 0; i < ids.length; i++) {
        t = itos[ids[i]];
        if (t === undefined || t === "<BOS>" || t === "<EOS>" || t === "<PAD>") continue;
        toks.push(t === "<UNK>" ? "?" : t);
      }
      var s = toks.join(" ");
      s = s.replace(/\s+([.,!?;:)\]}])/g, "$1");          // no space before punctuation
      s = s.replace(/\s+'(s|t|re|ve|ll|d|m)\b/g, "'$1");  // contractions
      s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"); // parens
      return s.replace(/\s+/g, " ");
    }
    var s2 = "";
    for (i = 0; i < ids.length; i++) s2 += itos[ids[i]] || "";
    return s2;
  }

  function fetchBin(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("fetch failed: " + url);
      return r.arrayBuffer();
    });
  }

  return {
    load: function (baseUrl, vocabFile, binFile) {
      var base = baseUrl.replace(/\/$/, "");
      vocabFile = vocabFile || "vocab.json";
      binFile = binFile || "sigllama-v1.bin";
      return fetch(base + "/" + vocabFile).then(function (r) {
        if (!r.ok) throw new Error(vocabFile + " not found at " + base);
        return r.json();
      }).then(function (vocab) {
        itos = vocab.itos; stoi = vocab.stoi || {};
        if (!vocab.stoi) { for (var i = 0; i < itos.length; i++) stoi[itos[i]] = i; }
        BOS = vocab.bos_id || 0; EOS = vocab.eos_id || 1; UNK = vocab.unk_id || 3;
        WORD_MODE = vocab.mode === "word";
        ready = false;
        return fetchBin(base + "/" + binFile);
      }).then(function (buf) {
        parseWeights(buf);
        buildRope(); allocTmp(); resetCache();
        ready = true;
        var nParams = V * D + NL * (4 * D * D + 3 * D * MLP) + V * D + NL * 2 * D + D;
        modelInfo = { params: nParams, vocab: V, dModel: D, layers: NL, heads: NH, seq: SEQ };
        return modelInfo;
      });
    },
    loaded: function () { return ready; },
    info: function () { return modelInfo; },
    vocabList: function () { return itos.slice(); },
    wordMode: function () { return WORD_MODE; },
    encode: encode,
    decode: decode,
    generate: function (prompt, opts) {
      if (!ready) return Promise.reject(new Error("SigLlama not loaded"));
      opts = opts || {};
      var maxTokens = opts.maxTokens || 120;
      var temperature = opts.temperature === undefined ? 0.8 : opts.temperature;
      var topK = opts.topK === undefined ? 40 : opts.topK;
      var stopAtEos = opts.stopAtEos === undefined ? true : opts.stopAtEos;
      var onToken = opts.onToken;
      resetCache();
      var ids = encode(String(prompt));
      // keep room: truncate left to SEQ - maxTokens - 2
      var room = SEQ - maxTokens - 2;
      if (ids.length > room) ids = ids.slice(ids.length - room);
      // feed BOS at position 0, then prompt tokens
      var feed = [BOS].concat(ids);
      var out = [];
      var pos = 0, fi = 0, logits;
      return new Promise(function (resolve) {
        function pumpFeed() {
          var n = 0;
          while (fi < feed.length && n < 16) { logits = forwardOne(feed[fi++], pos++); n++; }
          if (fi < feed.length) { setTimeout(pumpFeed, 0); return; }
          genTick();
        }
        var gi = 0;
        function genTick() {
          var n = 0;
          while (gi < maxTokens && n < 8) {
            var nx = sample(logits, temperature, topK);
            if (stopAtEos && nx === EOS) { gi = maxTokens; break; }
            out.push(nx);
            if (onToken) { try { onToken(itos[nx] || ""); } catch (e) {} }
            logits = forwardOne(nx, pos++);
            gi++; n++;
          }
          if (gi < maxTokens) { setTimeout(genTick, 0); return; }
          resolve(decode(out));
        }
        pumpFeed();
      });
    }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = SigLlama;
