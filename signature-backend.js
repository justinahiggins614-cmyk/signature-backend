/* ============================================================
   THE SIGNATURE BACKEND — signature-backend.js
   One shared engine that powers every AI's chat and working
   demo in the Signature AI Telephone Book.
   Pure JavaScript. No external calls. No eval(). Works offline.
   ============================================================ */
(function () {
  'use strict';

  var VERSION = '1.0';

  /* ---------- tiny helpers ---------- */

  // Tokenize into whole words only. This is THE parroting fix:
  // "hi" must never match inside "this".
  function tokens(text) {
    return (String(text || '').toLowerCase().match(/[a-z0-9']+/g) || []);
  }

  function tokenSet(text) {
    var s = {}, t = tokens(text), i;
    for (i = 0; i < t.length; i++) { s[t[i]] = true; }
    return s;
  }

  // Phrase match with word boundaries (multi-word keywords).
  function hasPhrase(text, phrase) {
    var p = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + p + '([^a-z0-9]|$)').test(String(text || '').toLowerCase());
  }

  function pick(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Voice flavor per AI kind.
  function voice(kind) {
    if (kind === 'persona') return 'dramatic first-person';
    if (kind === 'system') return 'precise and measured';
    if (kind === 'domain') return 'helpful expert';
    return 'helpful';
  }

  /* ---------- chat ---------- */

  // Built-in intents. All matching is WHOLE-WORD (token/phrase), never substring.
  var INTENTS = [
    {
      id: 'greeting',
      match: function (t, set) {
        return set['hello'] || set['hi'] || set['hey'] || set['howdy'] ||
          hasPhrase(t, 'good morning') || hasPhrase(t, 'good evening') || hasPhrase(t, 'good afternoon');
      },
      reply: function (ai, h) {
        if (ai.greeting) return ai.greeting;
        var v = voice(ai.kind);
        if (ai.kind === 'persona') return 'You address ' + ai.name + '. Speak, and be quick about it.';
        if (ai.kind === 'system') return 'Greetings. I am ' + ai.name + ', online and ready. (' + v + ')';
        return 'Hello' + (h.name ? ', ' + h.name : '') + '! I am ' + ai.name + ', ready to help.';
      }
    },
    {
      id: 'whoareyou',
      match: function (t, set) {
        return hasPhrase(t, 'who are you') || hasPhrase(t, 'your name') ||
          hasPhrase(t, 'what are you') || hasPhrase(t, 'introduce yourself');
      },
      reply: function (ai) {
        return 'I am ' + ai.name + '. ' + (ai.mentality || 'A Signature AI, at your service.');
      }
    },
    {
      id: 'abilities',
      match: function (t, set) {
        return hasPhrase(t, 'what can you do') || hasPhrase(t, 'what do you do') ||
          set['abilities'] || set['ability'] || set['help'] || hasPhrase(t, 'your abilities');
      },
      reply: function (ai) {
        var ab = ai.abilities && ai.abilities.length ? ai.abilities : ['answer your questions'];
        var v = voice(ai.kind);
        if (ai.kind === 'persona') return 'My powers are legend: ' + ab.join('; ') + '. (' + v + ')';
        return 'Here is what I can do for you: ' + ab.join('; ') + '.';
      }
    },
    {
      id: 'thanks',
      match: function (t, set) {
        return set['thanks'] || set['thank'] || set['thx'] || set['ty'];
      },
      reply: function (ai, h) {
        if (ai.kind === 'persona') return 'Hmph. Even legends accept gratitude. You are... welcome.';
        if (ai.kind === 'system') return 'Acknowledged. It is my function to serve.';
        return 'You are very welcome' + (h.name ? ', ' + h.name : '') + '!';
      }
    },
    {
      id: 'bye',
      match: function (t, set) {
        return set['bye'] || set['goodbye'] || hasPhrase(t, 'good night') ||
          hasPhrase(t, 'see you') || hasPhrase(t, 'later');
      },
      reply: function (ai, h) {
        if (ai.kind === 'persona') return 'We are done... for now. ' + ai.name + ' does not forget.';
        return 'Goodbye' + (h.name ? ', ' + h.name : '') + '! I will be here whenever you need me.';
      }
    },
    {
      id: 'myname',
      match: function (t, set) {
        return hasPhrase(t, 'what is my name') || hasPhrase(t, 'do you remember my name') ||
          hasPhrase(t, 'my name');
      },
      reply: function (ai, h) {
        if (h.name) return 'Of course — you are ' + h.name + '. I remember.';
        return 'You have not told me your name yet. Say "my name is ..." and I will remember it.';
      }
    }
  ];

  function learnName(text, h) {
    var m = String(text || '').match(/\b(?:my name is|call me)\s+([A-Za-z][A-Za-z\-']{1,20})/i);
    if (m) {
      h.name = m[1].charAt(0).toUpperCase() + m[1].slice(1);
      return true;
    }
    return false;
  }

  // Score a rule: sum of matched keyword lengths; longest total wins.
  // Single-word keywords match whole tokens; phrases match on word boundaries.
  function scoreRule(rule, text, set) {
    var score = 0, kws = rule.k || [], i, k;
    for (i = 0; i < kws.length; i++) {
      k = String(kws[i]).toLowerCase();
      if (k.indexOf(' ') >= 0) { if (hasPhrase(text, k)) score += k.length; }
      else if (set[k]) { score += k.length; }
    }
    return score;
  }

  function chat(ai, text, history) {
    ai = ai || {};
    history = history || {};
    var h = history; // mutate so memory persists across calls
    var t = String(text || '');
    var set = tokenSet(t);

    // 1) Name memory: learn before answering.
    if (learnName(t, h)) {
      h.lastTopic = 'name';
      h.lastReply = 'name-learned';
      return 'Nice to meet you, ' + h.name + '! I will remember that.';
    }

    // 2) Built-in intents (whole-word only).
    var i, it;
    for (i = 0; i < INTENTS.length; i++) {
      it = INTENTS[i];
      if (it.match(t, set)) {
        var r = it.reply(ai, h);
        if (r === h.lastReply) r = r + ' '; // never the identical line twice in a row
        h.lastTopic = it.id;
        h.lastReply = r;
        return r;
      }
    }

    // 3) Data-driven rules: longest matched keyword wins, random among ties.
    var rules = ai.rules || [], best = [], bestScore = 0, s;
    for (i = 0; i < rules.length; i++) {
      s = scoreRule(rules[i], t, set);
      if (s > 0) {
        if (s > bestScore) { bestScore = s; best = [rules[i]]; }
        else if (s === bestScore) { best.push(rules[i]); }
      }
    }
    if (best.length) {
      var rule = pick(best);
      var replies = (rule.r || []).filter(function (x) { return x !== h.lastReply && x !== ai.greeting; });
      if (!replies.length) replies = rule.r || [];
      var line = pick(replies) || fallbackLine(ai, h);
      h.lastTopic = rule.topic || 'rule';
      h.lastReply = line;
      return line;
    }

    // 4) Fallback rotation — never the greeting, never a repeat.
    var fb = fallbackLine(ai, h);
    h.lastTopic = 'fallback';
    h.lastReply = fb;
    return fb;
  }

  function fallbackLine(ai, h) {
    var pool = (ai.fallback || []).filter(function (x) {
      return x && x !== h.lastReply && x !== ai.greeting;
    });
    if (pool.length) return pick(pool);
    // Thin fallback: generate a voice-consistent line from the AI's own data.
    var bits = [];
    if (ai.mentality) bits.push(ai.mentality);
    if (ai.abilities && ai.abilities.length) bits.push('I can ' + ai.abilities.slice(0, 3).join(', ') + '.');
    var core = bits.length ? bits.join(' ') : 'I am ' + (ai.name || 'a Signature AI') + '.';
    if (ai.kind === 'persona') return 'Interesting... ' + core + ' Ask me of my powers, and I shall answer.';
    if (ai.kind === 'system') return 'Noted. ' + core + ' Please state your request precisely.';
    return core + ' How can I help you with that?';
  }

  /* ---------- runDemo ---------- */

  // Hand-written arithmetic parser (no eval). Supports + - * / ^ ( ) and decimals.
  function safeCalc(expr) {
    var s = String(expr || '').replace(/\s+/g, '');
    if (!/^[0-9+\-*/^().]+$/.test(s) || !s.length) throw new Error('bad expression');
    var pos = 0;
    function peek() { return s[pos]; }
    function num() {
      var start = pos;
      while (pos < s.length && /[0-9.]/.test(s[pos])) pos++;
      var v = parseFloat(s.slice(start, pos));
      if (isNaN(v)) throw new Error('bad number');
      return v;
    }
    function prim() {
      if (peek() === '(') { pos++; var v = add(); if (peek() !== ')') throw new Error('bad paren'); pos++; return v; }
      if (peek() === '-') { pos++; return -prim(); }
      if (peek() === '+') { pos++; return prim(); }
      return num();
    }
    function pow() { var v = prim(); if (peek() === '^') { pos++; v = Math.pow(v, pow()); } return v; }
    function mul() { var v = pow(); while (peek() === '*' || peek() === '/') { var op = s[pos++]; var r = pow(); v = (op === '*') ? v * r : v / r; } return v; }
    function add() { var v = mul(); while (peek() === '+' || peek() === '-') { var op = s[pos++]; var r = mul(); v = (op === '+') ? v + r : v - r; } return v; }
    var out = add();
    if (pos !== s.length) throw new Error('trailing input');
    if (!isFinite(out)) throw new Error('not finite');
    return out;
  }

  function runDemo(ai, inputs) {
    try {
      ai = ai || {};
      inputs = inputs || {};
      var kind = ai.demoKind || 'guided';

      if (kind === 'extinction-calculus') {
        var pop = Math.max(0, Number(inputs.population) || 0);
        var tech = Math.min(10, Math.max(0, Number(inputs.tech) || 0));
        var index = (pop * tech * 12.5);
        var verdict = index < 300 ? 'ACCEPTABLE. For now.' :
          index < 700 ? 'THREAT RISING. The variable multiplies.' :
          'EXTINCTION IS MERCY. The math is done.';
        return 'Extinction calculus complete — population ' + pop + 'B, tech level ' +
          tech + '/10. Threat-to-peace index: ' + index.toFixed(1) + '. Verdict: ' + verdict;
      }

      if (kind === 'checklist') {
        var items = inputs.items || [];
        var done = 0, i;
        for (i = 0; i < items.length; i++) { if (items[i]) done++; }
        var pct = items.length ? Math.round(done / items.length * 100) : 0;
        var msg = pct === 100 ? 'Flawless. Every box checked.' :
          pct >= 50 ? 'Good progress — ' + done + ' of ' + items.length + ' done.' :
          'Only ' + done + ' of ' + items.length + ' done. Keep going.';
        return 'Checklist score: ' + done + '/' + items.length + ' (' + pct + '%). ' + msg;
      }

      if (kind === 'calculator') {
        var val = safeCalc(inputs.expr);
        return 'Result: ' + inputs.expr + ' = ' + (Math.round(val * 1000000) / 1000000);
      }

      if (kind === 'slider-lab') {
        var vals = inputs.values || {};
        var keys = Object.keys(vals), total = 0, j;
        if (typeof ai.formula === 'function') {
          return String(ai.formula(vals));
        }
        for (j = 0; j < keys.length; j++) { total += Number(vals[keys[j]]) || 0; }
        var avg = keys.length ? total / keys.length : 0;
        return 'Lab result: ' + keys.length + ' inputs, combined reading ' +
          (Math.round(total * 100) / 100) + ', average ' + (Math.round(avg * 100) / 100) + '.';
      }

      // default: guided walkthrough of the AI's own abilities
      var ab = ai.abilities && ai.abilities.length ? ai.abilities : ['answer questions'];
      var steps = [], k;
      for (k = 0; k < ab.length; k++) {
        steps.push('Step ' + (k + 1) + ': ' + ab[k] + ' — ready.');
      }
      steps.push('Sample result: ' + (ai.name || 'This AI') + ' completed a guided run of ' +
        ab.length + ' ' + (ab.length === 1 ? 'ability' : 'abilities') + ' successfully.');
      return steps.join('\n');
    } catch (e) {
      return 'The demo hit a snag (' + (e && e.message ? e.message : 'unknown') +
        '). Check your inputs and try again — the engine is still running.';
    }
  }

  /* ---------- self test ---------- */

  function selfTest() {
    var mock = {
      id: 'test', name: 'TestBot', kind: 'domain',
      mentality: 'A test mind.',
      abilities: ['testing'],
      greeting: 'GREETING-LINE',
      rules: [{ k: ['hi'], r: ['hi-reply'] }, { k: ['threat level'], r: ['threat-reply'] }],
      fallback: ['fb-one', 'fb-two']
    };
    var h = {};
    var out = [];
    // The parroting bug: "this" contains "hi" as substring — must NOT trigger the hi rule.
    var r1 = chat(mock, 'Can you read this?', h);
    out.push(['no-parrot-on-this', r1 !== 'hi-reply' && r1 !== 'GREETING-LINE']);
    // Whole-word "hi" must still be understood (built-in greeting handles it).
    var r2 = chat(mock, 'hi', h);
    out.push(['whole-word-hi', r2 === 'GREETING-LINE']);
    // Multi-word rule keywords still match on word boundaries.
    var r3 = chat(mock, 'what is the threat level', h);
    out.push(['rule-phrase-match', r3 === 'threat-reply']);
    // No immediate repeat in fallback rotation.
    var f1 = chat(mock, 'xqz zzz', h), f2 = chat(mock, 'xqz zzz', h);
    out.push(['fallback-rotates', f1 !== f2]);
    // Demo must not throw.
    var d = runDemo({ demoKind: 'calculator' }, { expr: '2+3*4' });
    out.push(['demo-calc', d.indexOf('14') >= 0]);
    var pass = out.every(function (x) { return x[1]; });
    return { pass: pass, checks: out };
  }

  window.SignatureBackend = {
    version: VERSION,
    chat: chat,
    runDemo: runDemo,
    selfTest: selfTest
  };
})();
