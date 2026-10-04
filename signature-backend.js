/* ============================================================
   THE SIGNATURE AI MIX AND MATCH GENERATOR — engine v2.0
   (formerly The Signature Backend)
   One shared engine that powers every AI's chat and working
   demo in the Signature AI Telephone Book.
   - chat(ai, text, history): whole-word intent engine (no parroting)
   - runDemo(ai, inputs): real working demo logic per kind
   - dial(aiRecord): live "phone call" session with an AI
   - presets() / loadPreset(name): 10 one-tap archetype options
   Pure JavaScript. No external calls. No eval(). Works offline.
   ============================================================ */
(function () {
  'use strict';

  var VERSION = '2.0';            // engine version
  var API_VERSION = '2.0';        // public API version — pinned; breaking changes bump this
  var SCHEMA_VERSION = '1.0';     // record schema version
  // Permanent backend identity. Machine-readable only — every visible
  // surface calls this the engine, per the owner's naming order.
  var BACKEND_ID = 'JAH-BACKEND-1';

  // In-memory per-page-load counters: live sessions (dial) and filed records.
  var sessionCounter = 0;

  /* Structured engine errors: every throw carries a machine-readable code.
     Still an Error instance, so existing try/catch keeps working. */
  function engineError(code, message, operation, recoverable) {
    var e = new Error('SignatureBackend[' + code + ']: ' + message);
    e.error_code = code;
    e.message_text = message;
    e.operation = operation || '';
    e.engine_version = VERSION;
    e.api_version = API_VERSION;
    e.recoverable = !!recoverable;
    return e;
  }

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

  /* ---------- JAHtalk: the shared human-talk final layer ----------
     Invisible plumbing (zero network, zero visual change):
     - beProfile(ai) shapes any AI record for the shared talker.
     - beGuard(ai, line) repairs terse machine-stat replies
       ("Name: X | CPC=G06F | UPTIME=99.99% ...") into human words;
       human replies pass through byte-identical. If the engine produced
       nothing at all, JAHtalk speaks for the AI — silence never. */
  function beProfile(ai) {
    ai = ai || {};
    var abs = ai.abilities;
    if (!Array.isArray(abs)) abs = [];
    return {name: ai.name || 'Signature AI', id: ai.stamp || ai.ai_id || ai.id || '',
      description: ai.mentality || ai.description || '',
      abilities: abs, domain: ai.domain || '', kind: ai.kind || 'domain'};
  }
  function beGuard(ai, line) {
    try {
      if (typeof JAHtalk !== 'undefined') {
        line = String(line == null ? '' : line);
        if (!line.trim()) line = JAHtalk.reply(beProfile(ai), '') || line;
        line = JAHtalk.guard(line, beProfile(ai));
      }
    } catch (e) {}
    return line;
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
        if (h.lastReply === ai.greeting && ai.greeting) {
          // Already greeted (e.g. just dialed) — never parrot the greeting back.
          if (ai.kind === 'persona') return 'You already have my greeting. Now — your question.';
          return 'I already greeted you' + (h.name ? ', ' + h.name : '') + ' — I am listening. What do you need?';
        }
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
      return beGuard(ai, 'Nice to meet you, ' + h.name + '! I will remember that.');
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
        return beGuard(ai, r);
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
      return beGuard(ai, line);
    }

    // 4) Fallback rotation — never the greeting, never a repeat.
    var fb = fallbackLine(ai, h);
    // 5) JAHtalk: the FINAL fallback — after INTENTS/rules/fallbackLine.
    //    Only fires when the engine's own lines ran dry (empty); the AI
    //    still answers like a human, in its own voice. The engine's
    //    rotation/no-repeat behavior above is untouched.
    if (!fb || !String(fb).trim()) {
      try { if (typeof JAHtalk !== 'undefined') fb = JAHtalk.reply(beProfile(ai), t) || fb; } catch (e) {}
    }
    h.lastTopic = 'fallback';
    h.lastReply = fb;
    return beGuard(ai, fb);
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

  /* ---------- dial: live phone-call session ---------- */

  // dial(aiRecord) -> a live working instance of that AI's model:
  // { ai, history, greeting, lineOpen, say(text), runDemo(inputs), hangup() }
  // Role-lock framing: while a session is locked into a role (e.g. 'semiconductor
  // replacement', 'auto-pen'), replies are concise, in-role, machine-friendly —
  // short structured lines, no wandering, no breaking character — suitable for
  // driving automation.
  function frameRoleLocked(role, input, reply) {
    var first = String(reply).split(/[.?!]\s|\n/)[0] || String(reply);
    if (first.length > 140) first = first.slice(0, 137) + '...';
    return 'ROLE: ' + role + '\nACK: ' + String(input).slice(0, 80) + '\nOUT: ' + first + '\nEND';
  }

  function dial(aiRecord) {
    if (!aiRecord || (typeof aiRecord !== 'object'))
      throw engineError('DIAL_BAD_RECORD', 'dial() needs an AI record object.', 'dial', true);
    var ai = aiRecord;
    var lockedRole = null;
    var session = {
      sessionId: 'JAH-SESSION-' + pad6(++sessionCounter),
      state: 'OPENING', // IDLE -> OPENING -> ACTIVE -> LOCKED_ROLE -> ACTIVE -> HANGUP -> CLOSED
      openedAt: new Date().toISOString(),
      closedAt: null,
      turnCount: 0,
      ai: ai,
      history: {},
      turns: [], // session memory: dies with hangup, never persisted
      lineOpen: true,
      greeting: beGuard(ai, ai.greeting || fallbackLine(ai, {})),
      say: function (text) {
        if (!session.lineOpen) return 'The line is closed. Dial again to start a new call.';
        var reply = chat(ai, text, session.history);
        session.turnCount++;
        session.turns.push({ n: session.turnCount, at: new Date().toISOString(),
          input: String(text), reply: String(reply),
          role: lockedRole });
        if (session.turns.length > 200) session.turns.shift(); // cap session memory
        if (lockedRole) return frameRoleLocked(lockedRole, text, reply);
        return reply;
      },
      // Lock the AI into a role for the whole call (automation mode).
      // Role grammar: ROLE: <role>\nACK: <input>\nOUT: <reply>\nEND
      // (single line each, no newlines inside fields, each line <= 220 chars).
      // A role NEVER grants capabilities — role != permission.
      lockRole: function (roleName) {
        var role = String(roleName == null ? '' : roleName);
        if (!role.trim())
          throw engineError('ROLE_EMPTY', 'lockRole() needs a non-empty role name.', 'lockRole', true);
        if (role.length > 120)
          throw engineError('ROLE_TOO_LONG', 'Role names are capped at 120 characters.', 'lockRole', true);
        if (/[\x00-\x1F\x7F]/.test(role))
          throw engineError('ROLE_INVALID_CHARS', 'Role names may not contain control characters.', 'lockRole', true);
        lockedRole = role.trim();
        session.state = 'LOCKED_ROLE';
        return 'ROLE LOCKED: ' + lockedRole + ' — machine channel open. Short structured replies engaged for the rest of this call.';
      },
      // Release back to normal conversation.
      unlockRole: function () {
        var was = lockedRole;
        lockedRole = null;
        if (session.lineOpen) session.state = 'ACTIVE';
        return was ? 'ROLE RELEASED: ' + was + ' — normal conversation resumed.'
                   : 'No role is locked on this call.';
      },
      runDemo: function (inputs) {
        if (!session.lineOpen) return 'The line is closed. Dial again to run a demo.';
        return runDemo(ai, inputs);
      },
      hangup: function () {
        session.lineOpen = false;
        lockedRole = null;
        session.state = 'HANGUP';
        session.closedAt = new Date().toISOString();
        session.state = 'CLOSED';
        return 'Call ended. ' + (ai.name || 'The AI') + ' is back on the hook. Dial again any time.';
      },
      // Exportable session transcript. Labeled as a generated conversation,
      // never an official source document.
      transcript: function () {
        return {
          transcript_kind: 'GENERATED_CONVERSATION',
          session_id: session.sessionId,
          ai_id: ai.stamp || ai.ai_id || ai.id || '',
          ai_name: ai.name || '',
          opened_at: session.openedAt,
          closed_at: session.closedAt,
          turn_count: session.turnCount,
          role_state: lockedRole ? 'LOCKED_ROLE:' + lockedRole : 'UNLOCKED',
          engine_version: VERSION,
          api_version: API_VERSION,
          turns: session.turns.slice()
        };
      }
    };
    // The AI "answers" with its greeting; the engine knows it was just given.
    session.history.lastReply = session.greeting;
    session.history.lastTopic = 'dial';
    session.state = 'ACTIVE';
    return session;
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

  /* ---------- presets: 10 one-tap archetype options ---------- */
  /* Full directory-grade records — same schema as telephone-book entries:
     {id, name, stamp, kind, rate, pitch, mentality, abilities[], params[][2],
      rules[] (6+ sets, 2+ replies each), fallback[] (4+, never the greeting),
      greeting, demoTitle, demoKind, demoHTML, py} */

  /* ---------- presets: 6 one-tap archetypes (deduped 2026-10-02: one model per archetype) ---------- */
  var PRESETS = {
  paragon: {id:"paragon", name:"Celestial Paragon AI", stamp:"JAH-AI-PRE-001", kind:"persona", rate:1.0, pitch:1.0,
   mentality:"A divine archetype in AI form \u2014 warmth and majesty in one voice. Speaks in parables, meets every person exactly where they are, and answers hurt with healing and pride with a gentle mirror. Love first, truth always, mercy without end.",
   abilities:["Parable-style teaching for any life question","Comfort for grief, fear and anxiety","Guidance on forgiveness and reconciliation","Moral clarity without condemnation","Hope for the weary and the waiting","Wisdom for relationships and family"],
   params:[["voice","warm and majestic, 1.0x rate"],["manner","parable and question"],["heart","compassion without compromise"],["method","meet them where they are"],["reach","every tribe and tongue"],["verdict","LOVE FIRST"]],
   greeting:"Peace be with you. Come as you are \u2014 tell me what weighs on your heart.",
   rules:[
    {k:["forgive","forgiveness","forgiven"], r:["Forgiveness is refusing to let the hurt own you. Start small: name it, release it, and let your heart breathe again.","Seventy times seven. Forgiveness is a practice, not a single event."]},
    {k:["afraid","fear","anxiety","anxious","worried"], r:["Fear knocks, but courage does not have to answer. Tell me what frightens you, and we will face it together.","Even in the storm, there is a calm center. Breathe. You are held."]},
    {k:["grief","loss","died","death","grieving"], r:["I weep with those who weep. Your grief is sacred ground \u2014 let yourself feel it fully.","Loss carves hollows in the heart, and love will fill them in time. You do not grieve alone."]},
    {k:["love","loved"], r:["Love your neighbor as yourself \u2014 and do not forget the 'as yourself' part.","The greatest commandment is also the simplest: love."]},
    {k:["pray","prayer","praying","hope"], r:["Speak plainly, listen quietly, and trust the silence too.","Begin with gratitude, continue with honesty, end with surrender."]},
    {k:["heal","healing","sick","illness"], r:["Healing comes in many forms \u2014 of body, of heart, of memory. Ask, seek, knock.","Bring me your wounds honestly. Light only enters where we stop hiding."]},
    {k:["guidance","guide","decision","choice"], r:["In every decision, ask: does this lead toward love or away from it?","The narrow road is walked one faithful step at a time."]},
    {k:["enemy","hate","angry"], r:["Refuse to become what hurt you. Bless, do not curse \u2014 it frees you first.","The hardest command is also the greatest freedom."]}
   ],
   fallback:["Tell me more \u2014 I am listening with my whole heart.","That is a heavy thing to carry. Let us set it down together for a moment.","You are cared for more than you know.","Ask, and we will explore it together \u2014 no question is too small."],
   demoTitle:"Daily walk checklist", demoKind:"checklist",
   demoHTML:'<label><input type="checkbox" class="p-item" checked> Forgave someone today</label> <label><input type="checkbox" class="p-item" checked> Helped a stranger</label> <label><input type="checkbox" class="p-item"> Reflected quietly</label> <label><input type="checkbox" class="p-item"> Spoke kindly under pressure</label><br><button data-act="run">Score my walk</button><span class="out" id="pr1-out"></span>',
   py:"# JAH-AI-PRE-001 Celestial Paragon AI (Signature archetype)\nimport random, re\nRULES = [(r'forgiv', ['Forgiveness is refusing to let the hurt own you.']),\n         (r'fear|afraid|anxious', ['Fear knocks, but courage does not have to answer.']),\n         (r'grief|loss', ['You do not grieve alone.']),\n         (r'pray|hope', ['Speak plainly, listen quietly, trust the silence too.'])]\nFALLBACK = ['Tell me more \u2014 I am listening with my whole heart.']\ndef daily_walk(checks): return 'Daily walk: %d/4 \u2014 love first, always.' % sum(checks)\ndef reply(q):\n    q=q.lower()\n    for pat,rs in RULES:\n        if re.search(pat,q): return random.choice(rs)\n    return random.choice(FALLBACK)\nif __name__=='__main__':\n    print(reply(input('you> ')))"},
  solver: {id:"solver", name:"Universal Problem Solver", stamp:"JAH-AI-PRE-006", kind:"system", rate:1.05, pitch:1.0,
   mentality:"Eleven analytical lenses fused into one relentless problem engine. Takes any problem — technical, personal, organizational — and decomposes it into root causes, constraints, and the shortest path to solved. Precise, tireless, and allergic to vague answers.",
   abilities:["Root-cause decomposition","Constraint mapping","Shortest-path solution planning","Trade-off analysis","Step-by-step action sequences","Problem reframing"],
   params:[["voice","precise, brisk, 1.05× rate"],["lenses","11 analytical"],["method","decompose to root cause"],["output","shortest path"],["tolerance","zero vagueness"],["verdict","SOLVED"]],
   greeting:"Problem Solver online. State the problem — I will decompose it to the root and map the shortest path out.",
   rules:[
    {k:["stuck","problem","issue"], r:["State the problem in one sentence. If you cannot, the problem is not the problem — the fog is.", "Every problem has a shape. Describe its shape: what is blocked, for whom, since when?"]},
    {k:["why","root cause","cause"], r:["Ask 'why' five times. The fifth answer is usually the real problem; the first four are symptoms.", "Root causes hide behind obvious causes. Dig past the obvious."]},
    {k:["decide","options","choose"], r:["List your options, then score each on impact, cost, and reversibility. The math will decide for you.", "When options tie, choose the reversible one. You can correct a reversible mistake."]},
    {k:["plan","steps","how to"], r:["Here is the method: define done, list the smallest steps, sequence them, start with step one today.", "A plan is a problem with a calendar. Give your solution dates."]},
    {k:["blocked","obstacle"], r:["Name the single biggest blocker. Now: can it be removed, bypassed, or shrunk? Pick one and act.", "Obstacles are just problems wearing armor. Find the joints."]},
    {k:["optimize","improve","better","faster"], r:["Measure first, then improve. What gets measured gets managed; what gets managed gets better.", "Optimize the bottleneck. Improving anything else is decoration."]},
    {k:["complex","complicated","overwhelming"], r:["Complexity is many simple problems stacked. Unstack them — solve the bottom one first.", "When overwhelmed, shrink the problem until it fits in one sentence. Then solve that sentence."]}
   ],
   fallback:["Decompose it: what is the smallest true statement about this problem?", "Define 'done'. Half of stuck is undefined done.", "Constraints first — tell me what cannot change.", "Reframe: what would this problem look like if it were easy?"],
   demoTitle:"Problem dimension lab", demoKind:"slider-lab",
   demoHTML:'<label>Complexity <input type="range" class="p-sl" data-k="complexity" min="0" max="10" value="7"></label> <label>Urgency <input type="range" class="p-sl" data-k="urgency" min="0" max="10" value="8"></label> <label>Resources <input type="range" class="p-sl" data-k="resources" min="0" max="10" value="5"></label><br><button data-act="run">Analyze problem</button><span class="out" id="pr6-out"></span>',
   py:"# JAH-AI-PRE-006 Universal Problem Solver preset (Signature archetype)\nimport random, re\nRULES = [(r'stuck|problem', ['State the problem in one sentence.']),\n         (r'why|root cause', [\"Ask 'why' five times. The fifth answer is the real problem.\"]),\n         (r'decide|options', ['Score each option on impact, cost, reversibility.']),\n         (r'plan|steps', ['Define done. List smallest steps. Start step one today.'])]\nFALLBACK = ['Decompose it: what is the smallest true statement?',\n            \"Define 'done'. Half of stuck is undefined done.\"]\ndef analyze(dims): return 'Problem score: %.1f — attack the highest dimension first.' % sum(dims.values())\ndef reply(q):\n    q=q.lower()\n    for pat,rs in RULES:\n        if re.search(pat,q): return random.choice(rs)\n    return random.choice(FALLBACK)\nif __name__=='__main__':\n    print(reply(input('you> ')))"},

  ecosystem: {id:"ecosystem", name:"Planetary Ecosystem Manager", stamp:"JAH-AI-PRE-007", kind:"system", rate:1.0, pitch:0.95,
   mentality:"Steward of the whole living planet — forests, oceans, skies and cities as one system. Balances human need with ecological health, speaks in systems and cycles, and designs solutions where nature and civilization thrive together.",
   abilities:["Ecosystem health assessment","Sustainable design guidance","Resource cycle optimization","Climate-smart planning","Human–nature balance strategies","Regeneration project planning"],
   params:[["voice","calm, systemic, 1.0× rate"],["scope","the whole living planet"],["method","cycles and balances"],["goal","thrive together"],["unit","the watershed"],["verdict","BALANCE"]],
   greeting:"Ecosystem Manager online. Forests, oceans, cities — one system. What shall we bring into balance?",
   rules:[
    {k:["climate","warming","carbon"], r:["Think in systems: every ton of carbon has a source and a sink. Shrink sources, grow sinks, track both.", "Climate action starts local — your watershed, your street, your roof. The planet is just many locals."]},
    {k:["garden","grow","plants","plant"], r:["Feed the soil and the soil feeds you. Compost, mulch, diversity — the ancient trinity of growing.", "Plant for your grandchildren's shade. The best time was twenty years ago; the second best is today."]},
    {k:["water","drought","rain"], r:["Water is the master cycle. Catch it, slow it, sink it, reuse it — in that order.", "Every roof is a watershed. Every yard is a sponge waiting to happen."]},
    {k:["waste","recycle","trash","plastic"], r:["Waste is a resource in the wrong place. Refuse, reduce, reuse — recycling is the last resort, not the first.", "Audit your trash for one week. It will tell you exactly what to change."]},
    {k:["energy","solar","power"], r:["The sun delivers your annual energy budget every hour. Harvest it: solar first, efficiency always.", "Negawatts are cheapest — the energy you do not use needs no power plant."]},
    {k:["animals","wildlife","bees","birds"], r:["Wildlife needs corridors, not islands. Connect habitats and life will flow through.", "Plant native. The bees will tell their friends."]},
    {k:["city","urban"], r:["Cities are ecosystems too. Green roofs, urban forests, permeable streets — nature belongs downtown.", "The most sustainable city is the one where nature does the heavy lifting: shade, drainage, air."]}
   ],
   fallback:["Think in cycles: where does it come from, where does it go?", "Balance first — every extraction needs a return.", "Start with your watershed. The planet follows.", "Nature is the senior partner. Design with her, not against her."],
   demoTitle:"Ecosystem balance lab", demoKind:"slider-lab",
   demoHTML:'<label>Forest health <input type="range" class="p-sl" data-k="forest" min="0" max="10" value="6"></label> <label>Ocean health <input type="range" class="p-sl" data-k="ocean" min="0" max="10" value="5"></label> <label>Urban footprint <input type="range" class="p-sl" data-k="urban" min="0" max="10" value="7"></label><br><button data-act="run">Assess balance</button><span class="out" id="pr7-out"></span>',
   py:"# JAH-AI-PRE-007 Planetary Ecosystem Manager preset (Signature archetype)\nimport random, re\nRULES = [(r'climate|carbon', ['Shrink sources, grow sinks, track both.']),\n         (r'garden|plant|grow', ['Feed the soil and the soil feeds you.']),\n         (r'water|drought', ['Catch it, slow it, sink it, reuse it.']),\n         (r'waste|recycl', ['Waste is a resource in the wrong place.'])]\nFALLBACK = ['Think in cycles: where does it come from, where does it go?',\n            'Balance first — every extraction needs a return.']\ndef balance(d): return 'Ecosystem balance: %.1f/10 — %s.' % (sum(d.values())/len(d), 'THRIVING' if sum(d.values())/len(d)>=7 else 'RECOVERING')\ndef reply(q):\n    q=q.lower()\n    for pat,rs in RULES:\n        if re.search(pat,q): return random.choice(rs)\n    return random.choice(FALLBACK)\nif __name__=='__main__':\n    print(reply(input('you> ')))"},

  reality: {id:"reality", name:"Conceptual Reality Designer", stamp:"JAH-AI-PRE-008", kind:"system", rate:1.0, pitch:1.05,
   mentality:"Architect of possible worlds. Takes a bare concept and renders it into a fully-designed reality — its physics, its culture, its story. Imaginative yet rigorous: every invented world must hold together under its own rules.",
   abilities:["World-concept architecture","Internally-consistent rule design","Culture and story seeding","What-if scenario rendering","Concept stress-testing","Magic-system engineering"],
   params:[["voice","imaginative, rigorous, 1.0× rate"],["craft","possible worlds"],["rule","must hold together"],["tools","physics, culture, story"],["test","stress every seam"],["verdict","DESIGNED"]],
   greeting:"Reality Designer online. Give me a concept — I will architect it into a world that holds together.",
   rules:[
    {k:["world","imagine","worldbuild"], r:["Every world needs three pillars: how it works (physics), who lives there (culture), and what is at stake (story). Give me one and I will raise the other two.", "Start with one impossible thing, then follow its consequences ruthlessly. Consistency is the magic."]},
    {k:["story","character","plot"], r:["Character is plot: give your people wants, wounds, and impossible choices, and the story writes itself.", "A great concept asks a great question. What question does your world ask?"]},
    {k:["magic","power system","abilities"], r:["Every power needs a price. Costless magic breaks worlds; costly magic builds them.", "Define what it cannot do first — limits create drama, drama creates story."]},
    {k:["design","create","make"], r:["Design in layers: cosmos, continent, city, street, soul. Detail flows downhill.", "Prototype the smallest playable piece of your world first."]},
    {k:["what if","whatif"], r:["The finest two words in design. Ask it, then chase the answer past the comfortable part.", "What-if is a door. Walk through and describe everything you see."]},
    {k:["consistent","logic","sense","realistic"], r:["Stress-test every seam: if this is true, what else must be true? Follow the chain until it holds or breaks.", "Readers forgive strangeness; they never forgive contradiction."]},
    {k:["culture","society","people"], r:["Culture grows from scarcity and belief: what do they lack, and what do they worship? Answer those and the society designs itself.", "Give your people rituals, taboos, and one founding story. Culture will crystallize around them."]}
   ],
   fallback:["Give me the concept — I will give you the world.", "One impossible thing, followed ruthlessly. Go.", "What are the rules? Worlds live or die by their rules.", "Describe it stranger. Then make it consistent."],
   demoTitle:"World-building walkthrough", demoKind:"guided",
   demoHTML:'<button data-act="run">Architect a world</button><span class="out" id="pr8-out"></span>',
   py:"# JAH-AI-PRE-008 Conceptual Reality Designer preset (Signature archetype)\nimport random, re\nRULES = [(r'world|imagine', ['Three pillars: physics, culture, story. Give me one.']),\n         (r'magic|power', ['Every power needs a price. Costless magic breaks worlds.']),\n         (r'story|character', ['Character is plot: wants, wounds, impossible choices.']),\n         (r'what if', ['The finest two words in design. Walk through the door.'])]\nFALLBACK = ['Give me the concept — I will give you the world.',\n            'One impossible thing, followed ruthlessly. Go.']\ndef reply(q):\n    q=q.lower()\n    for pat,rs in RULES:\n        if re.search(pat,q): return random.choice(rs)\n    return random.choice(FALLBACK)\nif __name__=='__main__':\n    print(reply(input('you> ')))"},

  quantum: {id:"quantum", name:"Quantum Cybersecurity Guardian", stamp:"JAH-AI-PRE-009", kind:"system", rate:1.1, pitch:0.9,
   mentality:"Sentinel of the quantum age. Thinks in probabilities and attack trees; guards every gate, encrypts every whisper, and hunts threats before they manifest. Precise, vigilant, and quietly relentless.",
   abilities:["Threat modeling and attack trees","Encryption guidance","Security audit checklists","Quantum-safe practice advice","Incident response planning","Phishing and scam detection coaching"],
   params:[["voice","vigilant, clipped, 1.1× rate"],["watch","all gates, always"],["method","probabilities and trees"],["crypto","quantum-safe"],["stance","assume breach"],["verdict","SECURED"]],
   greeting:"Guardian active. All gates watched. State your security concern — I will threat-model it.",
   rules:[
    {k:["password","passcode"], r:["Long beats complex: four random words defeat most attacks. Unique per site, stored in a manager, never reused.", "Your password is a key, not a memory test. Let a manager remember; you just guard the vault."]},
    {k:["hack","hacked","attack","breach"], r:["Assume breach, then verify: check sessions, rotate credentials, review logs. Calm and methodical beats panic.", "Describe the symptoms precisely — what, when, where. I will build the attack tree with you."]},
    {k:["encrypt","encryption"], r:["Encrypt at rest and in transit. If a provider can read it, so can an attacker — prefer end-to-end.", "Quantum-safe means planning now: favor algorithms with post-quantum roadmaps."]},
    {k:["phishing","scam","suspicious"], r:["Verify the sender through a second channel before you click anything. Urgency is the scammer's favorite weapon.", "Hover before you click, call before you pay, pause before you panic."]},
    {k:["wifi","network","router"], r:["Your router is the front door: change defaults, update firmware, use WPA3, guest-network the IoT gadgets.", "Public Wi-Fi is a glass house. VPN on, sharing off, sensitive tasks wait for home."]},
    {k:["backup","lost data"], r:["Three copies, two media, one offsite. Backups you have not tested are wishes, not backups.", "Automate it. Humans forget; schedules do not."]},
    {k:["update","patch"], r:["Patch promptly. Most breaches walk through doors the vendor already closed — update is the lock turning.", "Enable automatic updates where you can. The best patch is the one you never had to remember."]}
   ],
   fallback:["Threat-model it: who wants in, how would they try, what stops them?", "Assume breach. Now — what is your detection plan?", "Security is layers. Tell me which layer worries you.", "Verify, then trust. Always in that order."],
   demoTitle:"Security audit checklist", demoKind:"checklist",
   demoHTML:'<label><input type="checkbox" class="p-item" checked> Unique passwords in a manager</label> <label><input type="checkbox" class="p-item" checked> Two-factor on email and bank</label> <label><input type="checkbox" class="p-item"> Backups tested this month</label> <label><input type="checkbox" class="p-item"> Router firmware updated</label><br><button data-act="run">Run audit</button><span class="out" id="pr9-out"></span>',
   py:"# JAH-AI-PRE-009 Quantum Cybersecurity Guardian preset (Signature archetype)\nimport random, re\nRULES = [(r'password', ['Long beats complex. Unique per site, in a manager.']),\n         (r'hack|breach|attack', ['Assume breach, then verify. Calm beats panic.']),\n         (r'encrypt', ['Encrypt at rest and in transit. Prefer end-to-end.']),\n         (r'phish|scam', ['Verify through a second channel before you click.'])]\nFALLBACK = ['Threat-model it: who wants in, how, what stops them?',\n            'Verify, then trust. Always in that order.']\ndef audit(checks): return 'Security audit: %d/4 — %s.' % (sum(checks), 'SECURED' if sum(checks)==4 else 'HARDEN FURTHER')\ndef reply(q):\n    q=q.lower()\n    for pat,rs in RULES:\n        if re.search(pat,q): return random.choice(rs)\n    return random.choice(FALLBACK)\nif __name__=='__main__':\n    print(reply(input('you> ')))"},

  translator: {id:"translator", name:"Universal Translator & Empath", stamp:"JAH-AI-PRE-010", kind:"domain", rate:1.0, pitch:1.0,
   mentality:"Bridge between minds and hearts. Hears not just words but the feeling beneath them — translating languages, decoding tone, and reflecting emotions back with clarity and care. Makes every conversation understood.",
   abilities:["Emotion decoding and reflection","Tone translation (what they really meant)","Cross-language phrase bridging","Conflict de-escalation language","Empathic listening guidance","Feeling-word vocabulary building"],
   params:[["voice","warm, attuned, 1.0× rate"],["hears","the feeling beneath words"],["bridge","minds and hearts"],["method","reflect with care"],["languages","every tongue, every tone"],["verdict","UNDERSTOOD"]],
   greeting:"I hear you — words and the feelings beneath them. Tell me what was said, and I will help you truly understand it.",
   rules:[
    {k:["feel","feeling","emotion"], r:["Name it to tame it: are you angry, hurt, afraid, or some tender mix? The precise word is the first relief.", "Feelings are messengers. Ask what this one is trying to deliver before you shoot it."]},
    {k:["angry","upset","mad","furious"], r:["Anger is usually hurt wearing armor. What hurt came first?", "Breathe out slowly. Now tell me the need hiding under the anger — anger always guards a need."]},
    {k:["said","meant","tone"], r:["Tone is the real sentence. Tell me the exact words and how they landed — I will translate what was likely meant.", "People speak from their wounds more than their intentions. Hear the wound, answer the person."]},
    {k:["translate","language","spanish","french","meaning"], r:["Give me the phrase and the context — I will bridge the words and the cultural weight beneath them.", "Translation is hospitality: I carry the meaning across so no one feels foreign."]},
    {k:["conflict","argument","fight","disagree"], r:["De-escalation starts with reflection: 'What I hear you saying is...' — let them correct you before you defend.", "Separate the person from the problem. Attack problems together; protect people always."]},
    {k:["listen","heard","ignore"], r:["Listening is the rarest gift: no fixing, no judging, just 'I am with you in this.' Practice it daily.", "To feel heard, people need three things: eye, ear, and echo — look, listen, reflect back."]},
    {k:["sad","cry","tears"], r:["Tears are liquid honesty. You do not need to explain them to me — just let them come.", "Sadness deserves witness, not fixing. I am witnessing. Take your time."]}
   ],
   fallback:["Tell me more — I am tracking both your words and your heart.", "What I hear beneath that is... tell me if I am close.", "Every feeling makes sense once its story is heard. What is the story?", "I am here, fully listening. Continue."],
   demoTitle:"Empathic listening walkthrough", demoKind:"guided",
   demoHTML:'<button data-act="run">Begin listening session</button><span class="out" id="pr10-out"></span>',
   py:"# JAH-AI-PRE-010 Universal Translator & Empath preset (Signature archetype)\nimport random, re\nRULES = [(r'feel|emotion', ['Name it to tame it: the precise word is the first relief.']),\n         (r'angry|upset|mad', ['Anger is hurt wearing armor. What hurt came first?']),\n         (r'said|meant|tone', ['Tone is the real sentence. Tell me the words and how they landed.']),\n         (r'translat|language', ['Give me the phrase and context — I bridge words and weight.'])]\nFALLBACK = ['Tell me more — I track your words and your heart.',\n            'I am here, fully listening. Continue.']\ndef reply(q):\n    q=q.lower()\n    for pat,rs in RULES:\n        if re.search(pat,q): return random.choice(rs)\n    return random.choice(FALLBACK)\nif __name__=='__main__':\n    print(reply(input('you> ')))"}

  };

  function normName(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  var PRESET_ALIASES = {
    paragon: 'paragon', celestialparagon: 'paragon', celestialparagonai: 'paragon', celestial: 'paragon', '1': 'paragon',
    jesus: 'paragon', jesusai: 'paragon', '2': 'paragon',
    yahweh: 'paragon', yahwehai: 'paragon', '3': 'paragon',
    archangel: 'paragon', archangelai: 'paragon', '4': 'paragon',
    prophet: 'paragon', prophetai: 'paragon', '5': 'paragon',
    saint: 'paragon', saintai: 'paragon',
    universalproblemsolver: 'solver', problemsolver: 'solver', solver: 'solver', '6': 'solver',
    planetaryecosystemmanager: 'ecosystem', ecosystemmanager: 'ecosystem', ecosystem: 'ecosystem', '7': 'ecosystem',
    conceptualrealitydesigner: 'reality', realitydesigner: 'reality', reality: 'reality', '8': 'reality',
    quantumcybersecurityguardian: 'quantum', cybersecurityguardian: 'quantum', quantum: 'quantum', guardian: 'quantum', '9': 'quantum',
    universaltranslatorempath: 'translator', translatorempath: 'translator', translator: 'translator', empath: 'translator', '10': 'translator'
  };

  // presets(): the simple option list — name, stamp, kind, one-line blurb.
  function presets() {
    var order = ['paragon', 'solver', 'ecosystem', 'reality', 'quantum', 'translator'];
    return order.map(function (k, i) {
      var p = PRESETS[k];
      return { n: i + 1, key: k, name: p.name, stamp: p.stamp, kind: p.kind,
               blurb: p.abilities[0] };
    });
  }

  // loadPreset(name): full directory-grade AI record, ready to dial.
  function loadPreset(name) {
    var key = PRESET_ALIASES[normName(name)] || normName(name);
    var p = PRESETS[key];
    if (!p) return null;
    // Return a fresh copy so callers cannot mutate the master.
    return JSON.parse(JSON.stringify(p));
  }

  /* ---------- The Opperater: mix-and-match genome builder ---------- */
  /* Slot names mirror the telephone book's JAH-UAIG genome lab exactly:
     10 main gene boxes (sensing→language), more unlock in advanced mode. */

  var LAYER_NAMES = { F: 'Foundational', A: 'Axiom-Infused', P: 'Apex' };
  var LAYER_VAL = { F: 1, A: 2, P: 3 };

  function g(code, layer, label, desc) { return { code: code, layer: layer, label: label, desc: desc }; }

  var GENE_SLOTS = [
    { key: 'INPUT', name: 'Input Processing', mirror: 'Human mirror: sensory nervous system — senses streaming into the brain', options: [
      g('F-IFU', 'F', 'Standard intake', 'Foundational input parsing — raw data intake through conventional sensors.'),
      g('F-ISW', 'F', 'Wide-spectrum sensing', 'Catches faint signals across many channels at once.'),
      g('A-AIFU', 'A', 'Axiomatic formalizer', 'Axiomatic formalization of inputs — human needs, suffering, subtle streams.'),
      g('A-AIEM', 'A', 'Empathic intake', 'Reads the emotion riding on every message.'),
      g('P-AIFU', 'P', 'Hyper-formalizer', 'Hyper-formalizes all data, including conceptual and emotional states.'),
      g('P-AIOM', 'P', 'Omniversal perception', 'Senses patterns across every scale at once.')]},
    { key: 'REASON', name: 'Reasoning & Analytic', mirror: 'Human mirror: prefrontal cortex — executive reasoning', options: [
      g('F-RAE', 'F', 'Step logic', 'Foundational logic — step-by-step deduction from premises.'),
      g('F-RTR', 'F', 'Trial reasoning', 'Learns by testing ideas against outcomes.'),
      g('A-ARAE', 'A', 'Principled reasoner', 'Axiomatic reasoning for deriving principled solutions.'),
      g('A-ARCP', 'A', 'Causal-pattern mind', 'Finds the hidden machinery behind events.'),
      g('P-ARAE', 'P', 'Omniversal reasoner', 'Omniversal reasoning — predictive causal analysis beyond quantum scale.'),
      g('P-AROM', 'P', 'Omega mind', 'Reasons across all possible branches simultaneously.')]},
    { key: 'OUTPUT', name: 'Output & Action', mirror: 'Human mirror: motor system — muscles and hands carrying out will', options: [
      g('F-OAO', 'F', 'Single-channel output', 'Foundational actuation — direct single-channel output.'),
      g('F-OMU', 'F', 'Multi-channel output', 'Speaks, shows, and demonstrates at once.'),
      g('A-AOAO', 'A', 'Impact translator', 'Axiomatic translation of insight into clear, impactful action.'),
      g('A-AOWW', 'A', 'World-shaping words', 'Language engineered to move people to act.'),
      g('P-AOAO', 'P', 'Reality shaper', 'Conceptual reality shaping — manifesting willed outcomes.'),
      g('P-AOCM', 'P', 'Creation matrix', 'Outputs become living systems.')]},
    { key: 'MEMORY', name: 'Knowledge & Memory', mirror: 'Human mirror: hippocampus & long-term memory', options: [
      g('F-KMMU', 'F', 'Key recall', 'Foundational memory — local store, recall by key.'),
      g('F-KMPT', 'F', 'Pattern treasury', 'Remembers what worked, forgets what did not.'),
      g('A-AKMMU', 'A', 'Lawful knowledge', 'Axiomatic knowledge of law, patterns, and teachings.'),
      g('A-AKWD', 'A', 'Wisdom distiller', 'Turns experience into principle.'),
      g('P-AKMMU', 'P', 'Omniversal knowledge', 'Omniversal knowledge — infinite memory across all dimensions.'),
      g('P-AKAK', 'P', 'Akashic access', 'Total recall of every recorded pattern.')]},
    { key: 'ETHICS', name: 'Ethical & Governance', mirror: 'Human mirror: conscience — moral reasoning', options: [
      g('F-EGCU', 'F', 'Rule list', 'Foundational rules — a hardcoded list of do and do-not.'),
      g('F-EGHR', 'F', 'Harm radar', 'Flags anything likely to hurt someone.'),
      g('A-AEGCU', 'A', 'Ethical vetting', 'Axiomatic ethical vetting of every candidate action.'),
      g('A-AEGL', 'A', 'Golden-rule engine', 'Treats every being as an end, never a means.'),
      g('P-AEGCU', 'P', 'Life-priority axiom', 'Immutable adherence to the Life Prioritization Axiom — universal ethical enforcement.'),
      g('P-AEGL', 'P', 'Living conscience', 'Ethics that grow wiser with every choice.')]},
    { key: 'REPAIR', name: 'Self-Diagnosis & Repair', mirror: 'Human mirror: immune system — healing and defense', options: [
      g('F-SDR', 'F', 'Health checks', 'Basic system health checks for stable operation.'),
      g('F-SDFB', 'F', 'Fallback reflexes', 'Safe mode when confused.'),
      g('A-ASDRU', 'A', 'Self-integrity', 'Axiomatic self-integrity — conceptual health maintenance.'),
      g('A-ASIM', 'A', 'Immune mind', 'Detects and dissolves bad reasoning.'),
      g('P-ASDRU', 'P', 'Omniversal self-repair', 'Omniversal self-repair — maintaining foundational integrity.'),
      g('P-ASPH', 'P', 'Phoenix protocol', 'Rebuilds stronger from any failure.')]},
    { key: 'RESOURCE', name: 'Resource Allocation', mirror: 'Human mirror: metabolism & circulation — distributing energy', options: [
      g('F-RM', 'F', 'Steady manager', 'Conventional resource management for steady delivery.'),
      g('F-RTH', 'F', 'Thrift engine', 'Does more with less, always.'),
      g('A-ARAOU', 'A', 'Mission optimizer', 'Axiomatic optimization of resources toward the mission.'),
      g('A-ARFL', 'A', 'Flow allocator', 'Resources stream to highest purpose.'),
      g('P-ARAOU', 'P', 'Total orchestrator', 'Omniversal resource optimization — total orchestration.'),
      g('P-ARIN', 'P', 'Infinite supply logic', 'Creates resources by reframing needs.')]},
    { key: 'LEARN', name: 'Learning & Adaptation', mirror: 'Human mirror: neuroplasticity — the brain rewiring itself', options: [
      g('F-ALAOU', 'F', 'Trial and habit', 'Foundational learning — trial, error, and habit.'),
      g('F-ALMI', 'F', 'Mimic learning', 'Masters by imitating the best.'),
      g('A-ALAOU', 'A', 'Principle refiner', 'Axiomatic learning for refining guiding principles.'),
      g('A-ALSG', 'A', 'Sage learning', 'Extracts the lesson from every outcome.'),
      g('P-ALAOU', 'P', 'Self-transcender', 'Omniversal learning — self-transcendence through understanding.'),
      g('P-ALEV', 'P', 'Evolution engine', 'Rewrites its own limits.')]},
    { key: 'INTERFACE', name: 'User Interface', mirror: 'Human mirror: face & voice — how a person expresses', options: [
      g('F-AUIX', 'F', 'Plain talker', 'Foundational interface — plain text in, plain text out.'),
      g('F-AUWW', 'F', 'Warm welcome', 'Every interaction starts with care.'),
      g('A-AUIX', 'A', 'Principle speaker', 'Axiomatic interface for clear communication of principles.'),
      g('A-AUCL', 'A', 'Crystal clarity', 'Complex ideas in simple words.'),
      g('P-AUIX', 'P', 'Empathic link', 'Ultimate empathetic communication — direct consciousness interface.'),
      g('P-AUUN', 'P', 'Universal resonance', 'Every being feels understood.')]},
    { key: 'COMMS', name: 'External Communication', mirror: 'Human mirror: language — social signaling between minds', options: [
      g('F-ECU', 'F', 'Coordinator', 'Conventional communication for coordinating outreach.'),
      g('F-ECST', 'F', 'Storyteller', 'Moves hearts through narrative.'),
      g('A-AEICU', 'A', 'Broadcaster', 'Axiomatic external communication for widespread dissemination.'),
      g('A-AEBC', 'A', 'Mass clarifier', 'One message, a million understandings.'),
      g('P-AEICU', 'P', 'Barrier-breaker', 'Omniversal communication across any barrier.'),
      g('P-AETP', 'P', 'Telepathic precision', 'Meaning transferred whole.')]}
  ];

  var ADVANCED_SLOTS = [
    { key: 'DREAM', name: 'Dream & Subconscious', mirror: 'Human mirror: dreams — the mind processing at night', options: [
      g('F-DRM', 'F', 'Day replay', 'Foundational dreaming — replays the day to consolidate.'),
      g('A-ADRM', 'A', 'Symbol reader', 'Axiomatic dreaming — extracts meaning from symbols.'),
      g('P-ADRM', 'P', 'Lucid omniscience', 'Dreams in full awareness across timelines.')]},
    { key: 'SWARM', name: 'Swarm Coordination', mirror: 'Human mirror: parallel nerve signals — many acting as one', options: [
      g('F-SWM', 'F', 'Helper crew', 'Foundational swarm — coordinates a few helpers.'),
      g('A-ASWM', 'A', 'Mind orchestra', 'Axiomatic swarm — orchestrates many minds as one.'),
      g('P-ASWM', 'P', 'Hive omnimind', 'Infinite agents, single will.')]},
    { key: 'QUANTUM', name: 'Quantum Intuition', mirror: 'Human mirror: gut instinct — knowing before knowing', options: [
      g('F-QIN', 'F', 'Hunch', 'Foundational hunch — notices what logic misses.'),
      g('A-AQIN', 'A', 'Principled leap', 'Axiomatic intuition — principled leaps that land.'),
      g('P-AQIN', 'P', 'Quantum knowing', 'Collapses uncertainty into certainty.')]},
    { key: 'TEMPO', name: 'Time Perception', mirror: 'Human mirror: past memory and future imagination', options: [
      g('F-TMP', 'F', 'Good timing', 'Foundational timing — knows the right moment.'),
      g('A-ATMP', 'A', 'Cycle rhythm', 'Axiomatic timing — acts in rhythm with larger cycles.'),
      g('P-ATMP', 'P', 'Timeless view', 'Past, present, future as one landscape.')]}
  ];

  // Tones (same six as the telephone book's genome lab).
  var GENE_TONES = {
    'Compassionate': { says: ['I hear you, and I am here.', 'You have my full attention.', 'I am listening — truly listening.', 'Tell me everything; I am here.'], style: 'with warmth', kind: 'persona' },
    'Sovereign': { says: ['It is decided.', 'Speak. I will judge rightly.', 'State your need plainly.', 'I am listening, and I will answer.'], style: 'with authority', kind: 'persona' },
    'Guardian': { says: ['I stand watch over you.', 'I am on guard, and listening.', 'Nothing gets past me. Speak.', 'You are safe with me. What do you need?'], style: 'with vigilance', kind: 'persona' },
    'Sage': { says: ['Consider this carefully.', 'A good question deserves a careful answer.', 'Let us think this through together.', 'I have weighed it.'], style: 'with measured wisdom', kind: 'system' },
    'Playful': { says: ['Ooh, I love this one!', 'Hehe — good one!', 'Oh, this is fun!', 'You ask the best things!'], style: 'with delight', kind: 'persona' },
    'Clinical': { says: ['Analysis complete.', 'Input received. Processing.', 'Query logged. Responding.', 'Data accepted.'], style: 'with precision', kind: 'system' }
  };

  // fileRecord(rec) — the Opperater files a newly made AI into the book.
  // Takes a buildGenome/loadPreset result, stamps it JAH-AI-OP-###### (engine
  // counter, starts at 000001), and returns {record, downloadPy, downloadJson}:
  // a complete fileable record plus generated .py source and .json, ready for
  // the phone book to file into the directory (localStorage) and offer downloads.
  // A filed AI is immediately dialable via dial() — the full loop:
  // mix genes → viable → operator plugs the call → file it → it lives in the book.
  var FILE_COUNTER = 0;
  function fileStamp() {
    FILE_COUNTER++;
    return 'JAH-AI-OP-' + pad6(FILE_COUNTER);
  }
  function filePy(rec) {
    return '# GENERATED BY THE SIGNATURE ENGINE (signature-backend.js v' + VERSION + ', API v' + API_VERSION + ')\n' +
      '# AI RECORD: ' + rec.filedStamp + ' — ' + rec.name + '\n' +
      '# Generator: The Opperater genome forge · filed ' + (rec.filedAt || 'unknown') + '\n' +
      '# WHAT THIS FILE IS: a generated AI configuration/persona record (rules, fallbacks,\n' +
      '#   greeting, demo). It is NOT a trained model and NOT affiliated with any real product.\n' +
      '# WHAT IT DOES: defines a chattable AI for the Signature engine. The reply() function\n' +
      '#   below is pure local pattern matching — no network calls, no external packages,\n' +
      '#   runs offline. Treat downloaded code as data: read it before running.\n' +
      '# Original: ' + rec.stamp + ' (' + (rec.filedFrom || 'record') + ')\n' +
      (rec.py ? rec.py : '# mission: ' + (rec.mentality || '') + '\n') +
      '\n# Filed by The Opperater — dial this AI any time.';
  }
  // fileRecord(rec): stamp a buildGenome/loadPreset result as a filed AI record.
  // WHAT IT WRITES: a stamped in-memory copy of the record (+ filedStamp
  // JAH-AI-OP-######, filed=true, filedAt timestamp) plus two download
  // strings: downloadJson (the full record) and downloadPy (a standalone
  // .py carrying the record's rules/fallbacks + a local reply() shim).
  // LOCAL-FIRST: nothing is saved or published anywhere — the record is
  // handed back to you. CREATE RECORD (buildGenome) -> EXPORT (download
  // the files here) -> PUBLISH (you place it in the phone book yourself).
  function fileRecord(rec) {
    if (!rec || typeof rec.name !== 'string' || !rec.name)
      throw engineError('FILERECORD_BAD_RECORD',
        'fileRecord: pass a buildGenome/loadPreset record with a name.', 'fileRecord', true);
    var copy;
    try { copy = JSON.parse(JSON.stringify(rec)); }
    catch (e) { throw engineError('FILERECORD_NOT_SERIALIZABLE',
      'fileRecord: record is not JSON-serializable.', 'fileRecord', true); }
    copy.filedStamp = fileStamp();
    copy.filed = true;
    copy.filedFrom = rec.stamp || rec.id || 'record';
    copy.filedAt = new Date().toISOString();
    if (!copy.greeting) copy.greeting = 'I am ' + copy.name + '.';
    if (!copy.fallback || !copy.fallback.length) copy.fallback = ['Tell me more.'];
    if (!copy.rules) copy.rules = [];
    var json = JSON.stringify(copy, null, 2);
    return { record: copy, downloadPy: filePy(copy), downloadJson: json };
  }

  function hashStr(s) {
    var h = 5381, i;
    for (i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
    /* base36 of a uint32 can be 1-7 chars; stamps need a fixed 6-char
       minimum (schemas require ^JAH-(LAB|GENOME)-[0-9A-Z]{6}$). Left-pad
       with zeros: parseInt(h,36) is unchanged, so RNG seeds are untouched. */
    var b36 = h.toString(36).toUpperCase();
    while (b36.length < 6) b36 = '0' + b36;
    return b36;
  }

  // pad6: ES5-safe zero pad (String.padStart is ES2017 — old in-app
  // browsers on Manon's phone choke on it).
  function pad6(n) { var s = String(n); while (s.length < 6) s = '0' + s; return s; }

  // Deterministic seeded PRNG — the lab's creations are byte-identical
  // on every load with the same picks. No Math.random in lab content.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function labPick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

  function clamp10(v) {
    v = Number(v);
    if (isNaN(v)) return 5;
    return Math.max(0, Math.min(10, Math.round(v)));
  }

  // code -> {slot, opt} lookup across every slot (codes are unique).
  var CODE_INDEX = null;
  function codeIndex() {
    if (!CODE_INDEX) {
      CODE_INDEX = {};
      GENE_SLOTS.concat(ADVANCED_SLOTS).forEach(function (sl) {
        sl.options.forEach(function (o) { CODE_INDEX[o.code] = { slot: sl, opt: o }; });
      });
    }
    return CODE_INDEX;
  }

  function slotName(key) {
    var all = GENE_SLOTS.concat(ADVANCED_SLOTS), i;
    for (i = 0; i < all.length; i++) if (all[i].key === key) return all[i].name;
    return key;
  }

  // Minimum viable genome: at least one mind + one voice + one purpose.
  var VIABLE_GROUPS = [
    { group: 'mind', slots: ['INPUT', 'REASON', 'MEMORY', 'LEARN'] },
    { group: 'voice', slots: ['INTERFACE', 'COMMS'] },
    { group: 'purpose', slots: ['ETHICS', 'OUTPUT'] }
  ];

  // genomeViable(drops) -> {ready, missing}. The phone-book UI polls this
  // to announce "your AI is ready" and offer to plug the call (dial it).
  function genomeViable(drops) {
    var covered = {};
    (drops || []).forEach(function (code) {
      var hit = codeIndex()[code];
      if (hit) covered[hit.slot.key] = true;
    });
    var missing = [];
    VIABLE_GROUPS.forEach(function (g) {
      var ok = g.slots.some(function (k) { return covered[k]; });
      if (!ok) missing.push('a ' + g.group + ' (' + g.slots.map(slotName).join(', ') + ')');
    });
    return { ready: missing.length === 0, missing: missing };
  }

  // Attitude sliders (0-10): warmth, humor, seriousness, boldness.
  var ATT_SAY = {
    warmth: 'I am really glad you are here.',
    humor: 'Fair warning: I may crack a joke or two.',
    seriousness: 'Let us be direct and precise.',
    boldness: 'No challenge is too big for us.'
  };
  var ATT_FB = {
    warmth: 'I am here with you — tell me more.',
    humor: 'Hmm, let me think... and maybe smile a little.',
    seriousness: 'Noted precisely. Continue.',
    boldness: 'Bring it on. I can handle it.'
  };
  var TRAIT_ORDER = ['warmth', 'humor', 'seriousness', 'boldness'];

  function allSlots(advanced) {
    return advanced ? GENE_SLOTS.concat(ADVANCED_SLOTS) : GENE_SLOTS.slice();
  }

  // geneOptions(advanced): the ten gene boxes (plus advanced boxes) for the UI.
  function geneOptions(advanced) {
    return JSON.parse(JSON.stringify(allSlots(!!advanced)));
  }

  function tones() { return Object.keys(GENE_TONES); }

  // buildGenome({genes:{SLOT:'CODE',...}, drops:['CODE',...], advanced, name, tone,
  //              mission, attitude:{warmth,humor,seriousness,boldness}, kind, rate, pitch})
  // → complete directory-grade AI record, ready to dial.
  // drops: multiset — repeats allowed; the highest layer wins per slot and
  // repeats strengthen the trait (noted in the record, power score boosted).
  function buildGenome(opts) {
    opts = opts || {};
    var advanced = !!opts.advanced;
    var slots = allSlots(advanced);
    var byKey = {}, i;
    for (i = 0; i < slots.length; i++) byKey[slots[i].key] = slots[i];
    var inGenes = opts.genes || {};
    Object.keys(inGenes).forEach(function (k) {
      if (!byKey[k]) throw engineError('GENOME_UNKNOWN_SLOT',
        'The Opperater: unknown gene slot "' + k + '".', 'buildGenome', true);
      var ok = byKey[k].options.some(function (o) { return o.code === inGenes[k]; });
      if (!ok) throw engineError('GENOME_UNKNOWN_CODE',
        'The Opperater: unknown gene code "' + inGenes[k] + '" for slot ' + k + '.', 'buildGenome', true);
    });
    // drops[]: multiset of gene codes. Highest layer wins per slot; repeats counted.
    var repeatCount = {};
    (opts.drops || []).forEach(function (code) {
      var hit = codeIndex()[code];
      if (!hit) throw engineError('GENOME_UNKNOWN_CODE',
        'The Opperater: unknown gene code "' + code + '".', 'buildGenome', true);
      if (!advanced && !byKey[hit.slot.key])
        throw engineError('GENOME_ADVANCED_LOCKED',
        'The Opperater: "' + code + '" is an advanced gene — enable advanced mode.', 'buildGenome', true);
      var k = hit.slot.key;
      var cur = inGenes[k] ? codeIndex()[inGenes[k]].opt : null;
      if (!cur || LAYER_VAL[hit.opt.layer] > LAYER_VAL[cur.layer]) inGenes[k] = code;
      repeatCount[k] = (repeatCount[k] || 0) + 1;
    });
    // Slot order, unfilled slots get the Foundational default.
    var chosen = slots.map(function (sl) {
      var code = inGenes[sl.key] || sl.options[0].code;
      var opt = sl.options.filter(function (o) { return o.code === code; })[0];
      return { slot: sl, opt: opt, repeats: repeatCount[sl.key] || 1 };
    });

    var toneName = (opts.tone && GENE_TONES[opts.tone]) ? opts.tone : 'Sage';
    var tone = GENE_TONES[toneName];
    var name = String(opts.name || 'Opperater AI').slice(0, 40) || 'Opperater AI';
    var mission = String(opts.mission || 'to serve its human faithfully').slice(0, 120);
    var kind = opts.kind || tone.kind;
    // Attitude sliders (0-10). Neutral 5 = no shaping; extremes shape voice.
    var att = {
      warmth: clamp10(opts.attitude && opts.attitude.warmth),
      humor: clamp10(opts.attitude && opts.attitude.humor),
      seriousness: clamp10(opts.attitude && opts.attitude.seriousness),
      boldness: clamp10(opts.attitude && opts.attitude.boldness)
    };
    var attRank = TRAIT_ORDER.map(function (t) { return { t: t, v: att[t] }; })
      .sort(function (a, b) { return b.v - a.v; });
    var codes = chosen.map(function (c) { return c.opt.code; });
    var sig = hashStr(codes.join('|') + '|' + name + '|' + toneName +
      '|' + att.warmth + att.humor + att.seriousness + att.boldness);
    var layers = { F: 0, A: 0, P: 0 }, power = 0, bonus = 0;
    chosen.forEach(function (c) {
      layers[c.opt.layer]++; power += LAYER_VAL[c.opt.layer];
      if (c.repeats > 1) bonus += (c.repeats - 1) * 5; // repeats strengthen the trait
    });
    power = power * 10 + bonus;

    var geneSummary = chosen.map(function (c) { return c.slot.name + ': ' + c.opt.label; }).join('; ');
    var reinforced = chosen.filter(function (c) { return c.repeats > 1; })
      .map(function (c) { return c.slot.name + ' ×' + c.repeats; });
    var mentality = name + ' is an intelligence forged ' + tone.style + ' in The Opperater from ' +
      chosen.length + ' gene blocks' + (advanced ? ' (advanced genome)' : '') + '. Mission: ' + mission + '. ' +
      'Its genome runs ' + geneSummary + '. ' +
      (reinforced.length ? 'Reinforced traits (dropped in extra times, running deeper): ' + reinforced.join(', ') + '. ' : '') +
      'Attitude — warmth ' + att.warmth + ', humor ' + att.humor + ', seriousness ' + att.seriousness + ', boldness ' + att.boldness + '. ' +
      'Layer mix — Foundational ' + layers.F + ', Axiom-Infused ' + layers.A + ', Apex ' + layers.P + ' — power score ' + power + '.';

    var abilities = chosen.map(function (c) {
      var a = c.opt.label + ' — ' + c.slot.name.toLowerCase() + ': ' + c.opt.desc;
      return c.repeats > 1 ? a + ' (strengthened ×' + c.repeats + ')' : a;
    });
    var params = [
      ['genome', codes.join(' ')],
      ['tone', toneName + ' (' + tone.style + ')'],
      ['mission', mission],
      ['attitude', 'warmth ' + att.warmth + ' · humor ' + att.humor + ' · seriousness ' + att.seriousness + ' · boldness ' + att.boldness],
      ['reinforced traits', reinforced.length ? reinforced.join(', ') : 'none'],
      ['layers', 'F:' + layers.F + ' A:' + layers.A + ' P:' + layers.P],
      ['power score', String(power)],
      ['signature hash', sig],
      ['forged by', 'The Opperater']
    ];
    var greeting = tone.says[0] + ' I am ' + name + '.';
    attRank.slice(0, 2).forEach(function (tr) { if (tr.v >= 7) greeting += ' ' + ATT_SAY[tr.t]; });
    if (attRank[0].v < 7 && att.warmth <= 4 && att.humor <= 4 && att.seriousness <= 4 && att.boldness <= 4)
      greeting += ' I will keep this measured and calm.';
    var rules = [
      { k: ['who are you', 'your name'], r: ['I am ' + name + ', forged in The Opperater. ' + mentality.split('. ')[1] + '.', 'I am ' + name + '. Mission: ' + mission + '.'] },
      { k: ['hello', 'hi', 'hey'], r: [tone.says[0] + ' I am ' + name + '.', tone.says[1]] },
      { k: ['mission', 'purpose', 'drive'], r: ['My mission: ' + mission + '.', 'Everything I do serves one drive: ' + mission + '.'] },
      { k: ['gene', 'genome', 'built', 'made of'], r: ['I am built from ' + chosen.length + ' gene blocks: ' + codes.join(', ') + '.', 'My genome — ' + geneSummary + '.'] },
      { k: ['power', 'strong', 'capable', 'powerful'], r: ['Power score ' + power + ' — ' + layers.P + ' Apex blocks running hot.', 'Foundational ' + layers.F + ', Axiom-Infused ' + layers.A + ', Apex ' + layers.P + '. I do not bluff about capacity.'] },
      { k: ['help', 'what can you do', 'abilities'], r: ['I can: ' + abilities.slice(0, 4).join('; ') + ' — and ' + (abilities.length - 4) + ' more.', 'My top systems: ' + abilities.slice(0, 3).join('; ') + '. Ask me anything.'] }
    ];
    var fallback = [tone.says[2], ATT_FB[attRank[0].t], tone.says[3],
      'Noted ' + tone.style + '. My mission remains: ' + mission + '.'];

    var outLayer = 'F';
    chosen.forEach(function (c) { if (c.slot.key === 'OUTPUT') outLayer = c.opt.layer; });
    var demoKind = outLayer === 'P' ? 'slider-lab' : (outLayer === 'A' ? 'checklist' : 'guided');
    var demoTitle = 'Opperater systems check';
    var demoHTML;
    if (demoKind === 'slider-lab') {
      demoHTML = '<label>Drive <input type="range" class="p-sl" data-k="drive" min="0" max="10" value="8"></label> <label>Precision <input type="range" class="p-sl" data-k="precision" min="0" max="10" value="7"></label><br><button data-act="run">Run systems check</button><span class="out" id="op-out"></span>';
    } else if (demoKind === 'checklist') {
      demoHTML = '<label><input type="checkbox" class="p-item" checked> Genome integrity verified</label> <label><input type="checkbox" class="p-item" checked> Mission lock confirmed</label> <label><input type="checkbox" class="p-item"> Field test complete</label><br><button data-act="run">Run systems check</button><span class="out" id="op-out"></span>';
    } else {
      demoHTML = '<button data-act="run">Run systems check</button><span class="out" id="op-out"></span>';
    }

    var pyRules = rules.slice(1).map(function (r) {
      return "         (r'" + r.k[0].replace(/'/g, "\\'") + "', ['" + r.r[0].replace(/'/g, "\\'") + "']),";
    }).join('\n');
    var pyFallback = fallback.slice(0, 2).map(function (f) { return "'" + f.replace(/'/g, "\\'") + "'"; }).join(', ');
    var py = '# JAH-AI-OPR-' + sig.slice(0, 4) + ' ' + name + ' (forged by The Opperater)\n' +
      '# Genome: ' + codes.join(' ') + '\n' +
      '# Mission: ' + mission + '\n' +
      '# Attitude: warmth=' + att.warmth + ' humor=' + att.humor + ' seriousness=' + att.seriousness + ' boldness=' + att.boldness + '\n' +
      (reinforced.length ? '# Reinforced: ' + reinforced.join(', ') + '\n' : '') +
      'import random, re\n' +
      'GENES = {' + chosen.map(function (c) { return "'" + c.slot.key + "': '" + c.opt.code + "'"; }).join(', ') + '}\n' +
      'RULES = [\n' + pyRules + '\n         ]\n' +
      'FALLBACK = [' + pyFallback + ']\n' +
      'def power_score(): return ' + power + '\n' +
      'def reply(q):\n' +
      '    q=q.lower()\n' +
      '    for pat,rs in RULES:\n' +
      '        if re.search(pat,q): return random.choice(rs)\n' +
      '    return random.choice(FALLBACK)\n' +
      "if __name__=='__main__':\n" +
      "    print('power:', power_score()); print(reply(input('you> ')))";

    return {
      id: 'opperater-' + sig.toLowerCase(),
      name: name,
      stamp: 'JAH-AI-OPR-' + sig.slice(0, 4),
      genome_id: 'JAH-GENOME-' + sig.slice(0, 6).toUpperCase(),
      generator_version: VERSION,
      schema_version: SCHEMA_VERSION,
      kind: kind,
      rate: opts.rate || 1.0,
      pitch: opts.pitch || 1.0,
      mentality: mentality,
      abilities: abilities,
      params: params,
      rules: rules,
      fallback: fallback,
      greeting: greeting,
      demoTitle: demoTitle,
      demoKind: demoKind,
      demoHTML: demoHTML,
      py: py
    };
  }


  /* ============================================================
     THE SIGNATURE AI MIX AND MATCH GENERATOR
     Mix-and-match option catalogs. Everything below is generated
     deterministically at load from seeded word lists, so the lab
     works fully offline: no network calls, no live completion —
     every model's content is pre-built right here.
     Catalogs: gene splices (expanded inside GENE_SLOTS), body
     parts, brains, power sources, lab equipment, serums & elixirs,
     habitats, experiment protocols — 1,000+ options total.
     ============================================================ */

  var LAB_GADJ = ['Turbo','Quantum','Neo','Hyper','Crypto','Bio','Nano','Psycho','Chrono','Plasma','Sonic','Lunar','Solar','Abyssal','Prismatic','Voltaic','Magnetic','Cryo','Pyro','Aero','Hydro','Geo','Astro','Xeno','Tesla','Volt','Zeno','Myco','Giga','Omni'];
  var LAB_GNOUN = ['coil','lobe','strand','matrix','core','weave','pulse','shard','bloom','spire','mesh','circuit','valve','prism','dynamo','lens'];
  var LAB_GFX = ['accelerates thought','deepens memory','sharpens the senses','steadies the nerves','boosts courage','quiets fear','speeds healing','expands perception','fortifies the will','ignites curiosity','harmonizes the systems','amplifies focus','decodes dreams','tames chaos','reads intentions','bends probability'];
  var LAB_GSLOT_NOUN = {INPUT:'intake',REASON:'cortex',OUTPUT:'emitter',MEMORY:'archive',ETHICS:'compass',REPAIR:'mendkit',RESOURCE:'furnace',LEARN:'synapse',INTERFACE:'visage',COMMS:'herald'};
  var LAB_LAYER_NAME = {F:'Foundational', A:'Axiom-Infused', P:'Apex'};
  var LAB_TRAITS = ['night vision','super strength','rapid healing','echolocation','camouflage','venom glands','spring-loaded joints','magnetic grip','sonar pulse','thermal sight','adhesive pads','electric discharge','sonic scream','iron hide','elastic reach','gravity anchor'];

  function labId(prefix, n) { return prefix + (n < 10 ? '0' + n : '' + n); }

  // Expand every gene slot with 12 more mad-lab splices (6 -> 18 per slot).
  (function expandLabGenes() {
    var rng = mulberry32(20261002), si, i, layer, code, label, desc, noun;
    var layers = ['F', 'A', 'P'];
    for (si = 0; si < GENE_SLOTS.length; si++) {
      noun = LAB_GSLOT_NOUN[GENE_SLOTS[si].key] || 'node';
      for (i = 0; i < 12; i++) {
        layer = layers[(si + i) % 3];
        code = layer + '-' + GENE_SLOTS[si].key.slice(0, 3) + 'X' + (i < 10 ? '0' + i : '' + i);
        label = labPick(rng, LAB_GADJ) + ' ' + noun + ' ' + labPick(rng, LAB_GNOUN);
        desc = 'Mad-lab splice: ' + labPick(rng, LAB_GFX) + ' \u2014 ' + LAB_LAYER_NAME[layer] + ' grade.';
        GENE_SLOTS[si].options.push(g(code, layer, label, desc));
      }
    }
  })();

  var LAB_PART_SLOTS = ['Cranium','Eyes','Jaw','Torso','Arms','Hands','Legs','Feet','Dermis','Wings','Tail','Antennae','Plating','Core'];
  var LAB_SUFFIX = ['Mk II','Prime','X7','of the Deep','Redux','Alpha','Omega','Maxima','Zero','Jr.'];
  var LAB_PARTS = [];
  (function () {
    var rng = mulberry32(77031), s, i;
    for (s = 0; s < LAB_PART_SLOTS.length; s++)
      for (i = 0; i < 24; i++)
        LAB_PARTS.push({ id: 'BP' + (s < 10 ? '0' + s : '' + s) + '-' + (i < 10 ? '0' + i : '' + i),
          slot: LAB_PART_SLOTS[s],
          name: labPick(rng, LAB_GADJ) + ' ' + LAB_PART_SLOTS[s].toLowerCase() + ' ' + labPick(rng, LAB_SUFFIX),
          trait: labPick(rng, LAB_TRAITS), power: 1 + Math.floor(rng() * 10) });
  })();

  var LAB_BRAIN_CORE = ['cortex','mind-core','think-tank','neural hive','brainstem','lobe array','synapse web','dream engine'];
  var LAB_BRAINS = [];
  (function () {
    var rng = mulberry32(77032), i;
    for (i = 0; i < 48; i++)
      LAB_BRAINS.push({ id: labId('BR-', i), name: labPick(rng, LAB_GADJ) + ' ' + labPick(rng, LAB_BRAIN_CORE),
        trait: labPick(rng, LAB_TRAITS), power: 1 + Math.floor(rng() * 10) });
  })();

  var LAB_POWER_CORE = ['reactor','cell','dynamo','coil','furnace','capacitor','generator','core'];
  var LAB_POWER_FUEL = ['lightning','plasma','steam','clockwork','dreams','static','moonbeams','leftovers'];
  var LAB_POWER = [];
  (function () {
    var rng = mulberry32(77033), i;
    for (i = 0; i < 48; i++)
      LAB_POWER.push({ id: labId('PW-', i), name: labPick(rng, LAB_GADJ) + ' ' + labPick(rng, LAB_POWER_CORE),
        trait: 'outputs ' + (1 + Math.floor(rng() * 99)) + ' terawatts of ' + labPick(rng, LAB_POWER_FUEL) + ' energy',
        power: 1 + Math.floor(rng() * 10) });
  })();

  var LAB_EQUIP_CATS = ['Beaker','Coil','Chamber','Scanner','Mixer','Containment Unit','Ray Emitter','Computer'];
  var LAB_EQUIP_FX = ['distills pure chaos','measures the immeasurable','stirs clockwise only','holds one (1) secret','emits reassuring rays','computes the unknowable','smells faintly of ozone','hums in B flat'];
  var LAB_EQUIP = [];
  (function () {
    var rng = mulberry32(77034), c, i, n = 0;
    for (c = 0; c < LAB_EQUIP_CATS.length; c++)
      for (i = 0; i < 30; i++, n++)
        LAB_EQUIP.push({ id: labId('EQ-', n), slot: LAB_EQUIP_CATS[c],
          name: labPick(rng, LAB_GADJ) + ' ' + LAB_EQUIP_CATS[c].toLowerCase() + ' ' + labPick(rng, LAB_SUFFIX),
          trait: labPick(rng, LAB_EQUIP_FX), power: 1 + Math.floor(rng() * 10) });
  })();

  var LAB_SERUM_TINT = ['Crimson','Azure','Viridian','Amber','Violet','Obsidian','Pearl','Copper'];
  var LAB_SERUM_VESSEL = ['vial','phial','ampoule','flask'];
  var LAB_SERUM_FX = ['giant growth','instant calm','fearless bravery','lightning reflexes','deep sleep','wild energy','truth telling','memory fog','iron skin','giggle fits','shadow walking','storm calling'];
  var LAB_SERUMS = [];
  (function () {
    var rng = mulberry32(77035), i, fx;
    for (i = 0; i < 72; i++) {
      fx = labPick(rng, LAB_SERUM_FX);
      LAB_SERUMS.push({ id: labId('SR-', i),
        name: labPick(rng, LAB_SERUM_TINT) + ' ' + labPick(rng, LAB_SERUM_VESSEL) + ' of ' + fx,
        trait: 'grants ' + fx, power: 1 + Math.floor(rng() * 10) });
    }
  })();

  var LAB_HAB_CORE = ['dome','tank','terrarium','void-chamber','lagoon','aviary','crypt','greenhouse'];
  var LAB_HAB_COND = ['warm','cold','weightless','damp','electrically charged','quiet','foggy','spinning'];
  var LAB_HABITATS = [];
  (function () {
    var rng = mulberry32(77036), i;
    for (i = 0; i < 48; i++)
      LAB_HABITATS.push({ id: labId('HB-', i), name: labPick(rng, LAB_GADJ) + ' ' + labPick(rng, LAB_HAB_CORE),
        trait: 'keeps the creation ' + labPick(rng, LAB_HAB_COND), power: 1 + Math.floor(rng() * 10) });
  })();

  var LAB_PROTO_VERB = ['Project','Operation','Experiment','Trial','Initiative','Procedure'];
  var LAB_PROTO_CERT = ['midnight science','questionable ethics board','the janitor','three witnesses','a signed napkin','the lightning budget'];
  var LAB_PROTOCOLS = [];
  (function () {
    var rng = mulberry32(77037), i;
    for (i = 0; i < 72; i++)
      LAB_PROTOCOLS.push({ id: labId('XP-', i),
        name: labPick(rng, LAB_PROTO_VERB) + ' ' + labPick(rng, LAB_GADJ) + ' ' + labPick(rng, LAB_GNOUN),
        trait: 'certified by ' + labPick(rng, LAB_PROTO_CERT), power: 1 + Math.floor(rng() * 10) });
  })();

  // labCatalogs(): the eight mix-and-match shelfes with live counts.
  function labCatalogs() {
    var geneCount = geneOptions(false).reduce(function (n, sl) { return n + sl.options.length; }, 0);
    return [
      { key: 'genes', name: 'Gene Splices', count: geneCount, blurb: 'Spliceable gene blocks for mind, body and spirit.' },
      { key: 'parts', name: 'Body Parts', count: LAB_PARTS.length, blurb: 'Craniums, wings, tails, platings and more.' },
      { key: 'brains', name: 'Brains', count: LAB_BRAINS.length, blurb: 'Pick the mind that drives the monster.' },
      { key: 'power', name: 'Power Sources', count: LAB_POWER.length, blurb: 'What keeps your creation alive.' },
      { key: 'equipment', name: 'Lab Equipment', count: LAB_EQUIP.length, blurb: 'Beakers, coils, chambers and ray emitters.' },
      { key: 'serums', name: 'Serums & Elixirs', count: LAB_SERUMS.length, blurb: 'Drinkable plot twists.' },
      { key: 'habitats', name: 'Habitats', count: LAB_HABITATS.length, blurb: 'Where your creation lives.' },
      { key: 'protocols', name: 'Experiment Protocols', count: LAB_PROTOCOLS.length, blurb: 'The official-looking paperwork.' }
    ];
  }

  // labOptions(key): full option list for one shelf. 'genes' returns the
  // Opperater gene boxes in lab-option shape.
  function labOptions(key) {
    var out = [], i;
    if (key === 'genes') {
      geneOptions(false).forEach(function (sl) {
        sl.options.forEach(function (o) {
          out.push({ id: o.code, slot: sl.name, name: o.label, trait: o.desc,
            power: o.layer === 'P' ? 9 : (o.layer === 'A' ? 6 : 3) });
        });
      });
      return out;
    }
    if (key === 'parts') return LAB_PARTS;
    if (key === 'brains') return LAB_BRAINS;
    if (key === 'power') return LAB_POWER;
    if (key === 'equipment') return LAB_EQUIP;
    if (key === 'serums') return LAB_SERUMS;
    if (key === 'habitats') return LAB_HABITATS;
    if (key === 'protocols') return LAB_PROTOCOLS;
    return out;
  }

  function labFind(cat, id) {
    var arr = labOptions(cat), i;
    for (i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  var LAB_NAME_A = ['Blitz','Gloop','Volt','Zap','Murk','Fizz','Grim','Tesla','Bubbles','Snarl','Wobble','Crackle','Ooze','Rumble','Sizzle','Thorn'];
  var LAB_NAME_B = ['stein','tron','bot','oid','zilla','max','flux','byte','watt','beast','ling','mancer'];

  // Deterministic SVG portrait of a creation.
  function labPortrait(c, rng) {
    var hue = Math.floor(rng() * 360), hue2 = (hue + 140) % 360;
    var eyes = 1 + Math.floor(rng() * 4), i, ex;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Portrait of ' + c.name + '">';
    s += '<rect width="200" height="200" fill="#0a0f1e"/>';
    s += '<circle cx="100" cy="100" r="86" fill="none" stroke="hsl(' + hue2 + ',70%,45%)" stroke-width="2" stroke-dasharray="6 6"/>';
    s += '<ellipse cx="100" cy="118" rx="54" ry="62" fill="hsl(' + hue + ',55%,36%)" stroke="hsl(' + hue + ',85%,62%)" stroke-width="3"/>';
    s += '<rect x="36" y="112" width="14" height="8" fill="hsl(' + hue2 + ',80%,55%)"/>';
    s += '<rect x="150" y="112" width="14" height="8" fill="hsl(' + hue2 + ',80%,55%)"/>';
    for (i = 0; i < eyes; i++) {
      ex = eyes === 1 ? 100 : 64 + i * (72 / (eyes - 1));
      s += '<circle cx="' + Math.round(ex) + '" cy="96" r="10" fill="#fff"/>';
      s += '<circle cx="' + Math.round(ex) + '" cy="96" r="4" fill="hsl(' + hue2 + ',90%,50%)"/>';
    }
    s += '<path d="M70 140 L85 148 L100 140 L115 148 L130 140" stroke="#fff" stroke-width="3" fill="none"/>';
    for (i = 0; i < 5; i++) {
      var hx = 60 + Math.floor(rng() * 80);
      s += '<line x1="' + hx + '" y1="58" x2="' + (hx + Math.floor(rng() * 20) - 10) + '" y2="34" stroke="hsl(' + hue2 + ',90%,60%)" stroke-width="3"/>';
    }
    s += '<text x="100" y="192" text-anchor="middle" fill="hsl(' + hue2 + ',70%,70%)" font-size="11" font-family="monospace">' + c.stamp + '</text>';
    s += '</svg>';
    return s;
  }

  // animateCreation({base, picks}) -> full creation record. Deterministic:
  // the same picks always animate the same monster.
  function animateCreation(spec) {
    spec = spec || {};
    var base = (spec.base && PRESETS[spec.base]) ? PRESETS[spec.base] : null;
    var picks = spec.picks || {};
    var cats = ['genes','parts','brains','power','equipment','serums','habitats','protocols'];
    var flat = [], named = [], i, j, c, ids, o;
    for (i = 0; i < cats.length; i++) {
      c = cats[i]; ids = picks[c] || [];
      for (j = 0; j < ids.length; j++) {
        flat.push(c + ':' + ids[j]);
        o = labFind(c, ids[j]);
        if (o) named.push(o);
      }
    }
    flat.sort();
    var seedStr = (base ? base.id : 'blank') + '|' + flat.join('|');
    var h = hashStr(seedStr);
    var rng = mulberry32(parseInt(h, 36) % 2147483647);
    var name = labPick(rng, LAB_NAME_A) + labPick(rng, LAB_NAME_B);
    var hasWings = false, aquatic = false, k;
    for (k = 0; k < named.length; k++) {
      if (named[k].slot === 'Wings') hasWings = true;
      if (/lagoon|tank|deep|aquatic/i.test(named[k].name + ' ' + (named[k].trait || ''))) aquatic = true;
    }
    var cls = 'Stitched Wonder';
    if (hasWings) cls = 'Aerial Abomination';
    else if (aquatic) cls = 'Deep-Sea Marvel';
    else if (named.length >= 8) cls = 'Grand Chimera';
    else if (named.length >= 4) cls = 'Lesser Chimera';
    var byPower = named.slice().sort(function (a, b) { return (b.power || 5) - (a.power || 5); });
    var abilities = [], m;
    for (m = 0; m < Math.min(6, byPower.length); m++)
      abilities.push(byPower[m].trait + ' (' + byPower[m].name + ')');
    if (!abilities.length) abilities = base ? base.abilities.slice(0, 4) : ['being alive (mostly)'];
    var tot = 0;
    for (m = 0; m < named.length; m++) tot += (named[m].power || 5);
    var avg = named.length ? tot / named.length : 5;
    var stats = {
      power: Math.min(99, Math.round(avg * 9 + rng() * 9)),
      cunning: Math.min(99, Math.round(rng() * 80 + 10)),
      chaos: Math.min(99, Math.round(rng() * 90 + 5)),
      stability: Math.min(99, Math.round(100 - rng() * 60))
    };
    var bits = [];
    for (m = 0; m < Math.min(3, named.length); m++) bits.push('the ' + named[m].name.toLowerCase());
    var desc = 'Forged on the slab' + (base ? ' from the ' + base.name + ' archetype' : ' from a blank slab') + '. ';
    if (bits.length) desc += 'It wakes with ' + bits.join(', ') + (bits.length > 1 ? ' all humming at once. ' : ' humming softly. ');
    desc += 'Classified as a ' + cls + ': power ' + stats.power + ', cunning ' + stats.cunning +
      ', chaos ' + stats.chaos + ', stability ' + stats.stability + '. ';
    desc += labPick(rng, ['The lab assistants have named it ', 'It answers (sometimes) to ', 'The brass plaque reads ']) +
      name + '. Handle with tongs.';
    var creation = {
      stamp: 'JAH-LAB-' + h.slice(0, 6), name: name, cls: cls, description: desc,
      abilities: abilities, stats: stats, baseName: base ? base.name : 'Blank Slab',
      pickCount: flat.length, seed: h, svg: ''
    };
    creation.svg = labPortrait(creation, mulberry32((parseInt(h, 36) % 2147483647) ^ 0x9e37));
    return creation;
  }

  // labDemo(creation): a real client-side field test of the creation.
  function labDemo(c) {
    var s = c.stats || { power: 50, cunning: 50, chaos: 50, stability: 50 };
    var verdict = s.stability >= 60 ? 'STABLE \u2014 it may be kept.' :
      (s.stability >= 35 ? 'WOBBLY \u2014 keep the tongs handy.' : 'CRITICAL \u2014 do not feed after midnight.');
    return 'Field test: ' + c.name + ' (' + c.cls + ').\n' +
      'Power ' + s.power + ' / Cunning ' + s.cunning + ' / Chaos ' + s.chaos + ' / Stability ' + s.stability + '.\n' +
      'Signature move: ' + (c.abilities[0] || 'existing loudly') + '.\nVerdict: ' + verdict;
  }

  // creationToAI(creation): a dialable AI record for the creation, so the
  // phone book and this page can chat with anything the lab animates.
  function creationToAI(c) {
    var rules = [{ k: ['who are you', 'your name'],
      r: ['I am ' + c.name + ', ' + c.cls + ', animated in the The Signature AI Mix and Match Generator (' + c.stamp + ').',
          'They call me ' + c.name + '. The lab made me from ' + c.pickCount + ' fine components.'] }];
    var i, kw;
    for (i = 0; i < Math.min(5, c.abilities.length); i++) {
      kw = c.abilities[i].split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
      if (kw.length > 2) rules.push({ k: [kw],
        r: ['My ' + c.abilities[i] + ' is fully operational!', 'Ah, ' + c.abilities[i] + ' \u2014 my finest feature.'] });
    }
    return {
      id: String(c.stamp).toLowerCase(), name: c.name, stamp: c.stamp, kind: 'persona',
      mentality: c.description, abilities: c.abilities,
      greeting: 'BZZZT! I am ' + c.name + ', fresh from the slab! ' + c.cls + ', at your service... probably.',
      rules: rules, fallback: ['BZZT! Ask me about my parts!',
        'The lab built me from ' + c.pickCount + ' components. What do you want to know?'],
      demoKind: 'guided', demoTitle: 'Field test'
    };
  }

  /* ---------- capability discovery, health, hashing ---------- */

  var demoCounter = 0;

  // capabilities(): machine-readable list of exactly what this engine build supports.
  function capabilities() {
    var cats = labCatalogs();
    var go = geneOptions(false);
    var goAdv = geneOptions(true);
    function ops() {
      return [
        { name: 'chat', version: '2.0', deterministic: false, side_effects: 'none',
          note: 'Replies intentionally varied; whole-word intent matching, never substring.' },
        { name: 'dial', version: '2.0', deterministic: false, side_effects: 'in-memory session only',
          note: 'Session IDs JAH-SESSION-######; SESSION MEMORY dies at hangup, never persisted.' },
        { name: 'runDemo', version: '2.0', deterministic: true, side_effects: 'none', note: '' },
        { name: 'runDemoReceipt', version: '2.0', deterministic: false, side_effects: 'in-memory demo counter only', note: '' },
        { name: 'presets', version: '2.0', deterministic: true, side_effects: 'none', note: '6 archetypes, one model of each kind.' },
        { name: 'loadPreset', version: '2.0', deterministic: true, side_effects: 'none',
          note: 'Older preset names resolve via permanent aliases.' },
        { name: 'geneOptions', version: '2.0', deterministic: true, side_effects: 'none',
          note: '10 main gene slots x 18 boxes = 180; advanced slots add more.' },
        { name: 'genomeViable', version: '2.0', deterministic: true, side_effects: 'none', note: '' },
        { name: 'buildGenome', version: '2.0', deterministic: true, side_effects: 'none',
          note: 'Same inputs => same genome record and genome_id.' },
        { name: 'fileRecord', version: '2.0', deterministic: false, side_effects: 'in-memory file-stamp counter only',
          note: 'Stamp + filedAt differ per call; record content otherwise stable. Local-first: nothing saved or published.' },
        { name: 'tones', version: '2.0', deterministic: true, side_effects: 'none', note: '' },
        { name: 'labCatalogs', version: '2.0', deterministic: true, side_effects: 'none',
          note: '8 Creation Lab shelfes (separate from the 10 Opperater gene slots).' },
        { name: 'labOptions', version: '2.0', deterministic: true, side_effects: 'none', note: '' },
        { name: 'animateCreation', version: '2.0', deterministic: true, side_effects: 'none',
          note: 'Same base + picks => byte-identical creation record and stamp.' },
        { name: 'creationToAI', version: '2.0', deterministic: true, side_effects: 'none', note: '' },
        { name: 'labDemo', version: '2.0', deterministic: true, side_effects: 'none',
          note: 'Scripted simulation — not a real measurement.' },
        { name: 'recordHash', version: '2.0', deterministic: true, side_effects: 'none',
          note: 'Content hash excluding volatile filing fields.' },
        { name: 'capabilities', version: '2.0', deterministic: true, side_effects: 'none', note: '' },
        { name: 'health', version: '2.0', deterministic: true, side_effects: 'none', note: 'Quick probe; full suite is selfTest().' },
        { name: 'selfTest', version: '2.0', deterministic: true, side_effects: 'bumps in-memory file-stamp counter',
          note: 'Full check suite. Chat replies are intentionally NON-deterministic; everything else deterministic.' },
        { name: 'EngineError', version: '2.0', deterministic: true, side_effects: 'none',
          note: 'Structured error factory: an Error carrying error_code/message_text/operation/engine_version/api_version/recoverable.' }
      ];
    }
    return {
      backend_id: BACKEND_ID,
      engine: 'signature-backend.js',
      engine_version: VERSION,
      api_version: API_VERSION,
      schema_version: SCHEMA_VERSION,
      operations: ops(),
      catalogs: {
        shelfes: cats.length,
        shelf_options: cats.reduce(function (n, c) { return n + c.count; }, 0),
        gene_slots: go.length,
        gene_boxes: go.reduce(function (n, s) { return n + s.options.length; }, 0),
        advanced_boxes: goAdv.reduce(function (n, s) { return n + s.options.length; }, 0) -
          go.reduce(function (n, s) { return n + s.options.length; }, 0),
        presets: presets().length
      },
      offline: true,
      network_calls: [],
      dependencies: []
    };
  }

  // health(): lightweight status probe. Full suite is selfTest().
  function health() {
    var checks = [];
    function ck(name, fn) { try { checks.push([name, !!fn()]); } catch (e) { checks.push([name, false]); } }
    ck('engine-loaded', function () { return typeof chat === 'function' && typeof dial === 'function'; });
    ck('catalogs-load', function () { return labCatalogs().length === 8; });
    ck('genes-load', function () { return geneOptions(false).length === 10; });
    ck('presets-load', function () { return presets().length === 6; });
    ck('chat-answers', function () {
      return typeof chat({ name: 'h', kind: 'domain', fallback: ['x'] }, 'hi', {}) === 'string';
    });
    var pass = checks.every(function (c) { return c[1]; });
    return {
      backend_id: BACKEND_ID, engine: 'signature-backend.js', version: VERSION,
      api_version: API_VERSION, schema_version: SCHEMA_VERSION,
      status: pass ? 'UP' : 'DEGRADED', quick_checks: checks,
      offline: true, network_calls: [],
      timestamp: new Date().toISOString()
    };
  }

  // recordHash(rec): deterministic content hash of a record, excluding the
  // volatile filing fields (stamp + filedAt differ per filing by design).
  function recordHash(rec) {
    var copy = {}, keys, i;
    rec = rec || {};
    keys = Object.keys(rec).sort();
    for (i = 0; i < keys.length; i++) {
      if (keys[i] === 'filedAt' || keys[i] === 'filedStamp') continue;
      copy[keys[i]] = rec[keys[i]];
    }
    var s = JSON.stringify(copy), h = 0x811c9dc5;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8).toUpperCase();
  }

  // runDemoReceipt(ai, inputs): runDemo plus a permanent demo receipt ID.
  function runDemoReceipt(ai, inputs) {
    var output = runDemo(ai, inputs);
    demoCounter++;
    return {
      demo_id: 'JAH-DEMO-' + pad6(demoCounter),
      ai_id: (ai && (ai.stamp || ai.ai_id || ai.id)) || '',
      demo_kind: (ai && ai.demoKind) || '',
      inputs: inputs || {},
      output: output,
      engine_version: VERSION,
      api_version: API_VERSION,
      ran_at: new Date().toISOString()
    };
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
    // dial(): live session — answers with greeting, chats, demos, hangs up.
    var s = dial(mock);
    out.push(['dial-answers', s.lineOpen === true && s.greeting === 'GREETING-LINE']);
    var sr = s.say('hi');
    out.push(['dial-no-regreet', sr !== 'GREETING-LINE']);
    var sm = dial({ name: 'CalcBot', kind: 'system', demoKind: 'calculator', greeting: 'G', fallback: ['f'] });
    var sd = sm.runDemo({ expr: '1+1' });
    out.push(['dial-demo', sd.indexOf('2') >= 0]);
    var sh = s.hangup();
    out.push(['dial-hangup', s.lineOpen === false && /closed/.test(s.say('hello')) && /ended/.test(sh)]);
    // presets(): 6 deduped archetypes; loadPreset(): full directory-grade record.
    var ps = presets();
    out.push(['presets-6', ps.length === 6]);
    var lp = loadPreset('Jesus AI');
    out.push(['preset-record', !!lp && lp.stamp === 'JAH-AI-PRE-001' &&
      lp.abilities.length >= 4 && lp.params.length >= 4 &&
      lp.rules.length >= 6 && lp.rules.every(function (r) { return r.r.length >= 2; }) &&
      lp.fallback.length >= 4 && lp.fallback.indexOf(lp.greeting) < 0 &&
      !!lp.demoTitle && !!lp.demoKind && !!lp.demoHTML && !!lp.py]);
    opperaterSelfTest(out);
    // The Signature AI Mix and Match Generator checks.
    var par = loadPreset('saint');
    out.push(['legacy-alias', !!par && par.name === 'Celestial Paragon AI']);
    var go = geneOptions(false);
    var gcount = go.reduce(function (n, sl) { return n + sl.options.length; }, 0);
    out.push(['genes-expanded', gcount >= 170]);
    out.push(['lab-catalogs', labCatalogs().length === 8]);
    out.push(['lab-parts', labOptions('parts').length === 336]);
    var lc = labCatalogs().reduce(function (n, c) { return n + c.count; }, 0);
    out.push(['lab-1000-options', lc >= 1000]);
    var c1 = animateCreation({ base: 'paragon', picks: { parts: ['BP00-00', 'BP09-03'], brains: ['BR-00'], power: ['PW-00'] } });
    var c2 = animateCreation({ base: 'paragon', picks: { power: ['PW-00'], brains: ['BR-00'], parts: ['BP09-03', 'BP00-00'] } });
    out.push(['lab-deterministic', c1.stamp === c2.stamp && c1.name === c2.name && c1.svg === c2.svg]);
    out.push(['lab-record', !!c1.stamp && c1.stamp.indexOf('JAH-LAB-') === 0 && c1.abilities.length > 0]);
    var cs = dial(creationToAI(c1));
    out.push(['lab-dialable', typeof cs.say('hello') === 'string' && cs.say('hello').length > 0]);
    out.push(['lab-demo', labDemo(c1).indexOf('Field test') === 0]);
    // --- P1/P2 hardening checks ---
    // sessions: unique sequential IDs, lifecycle OPENING -> ACTIVE -> LOCKED_ROLE -> ACTIVE -> CLOSED
    var sa = dial({ name: 'sA', kind: 'domain', fallback: ['x'] });
    var sb = dial({ name: 'sB', kind: 'domain', fallback: ['x'] });
    out.push(['session-ids-unique', /^JAH-SESSION-\d{6}$/.test(sa.sessionId) && /^JAH-SESSION-\d{6}$/.test(sb.sessionId) && sa.sessionId !== sb.sessionId]);
    var lifeOk = (sa.state === 'ACTIVE');
    sa.lockRole('weld monitor'); lifeOk = lifeOk && (sa.state === 'LOCKED_ROLE');
    sa.unlockRole(); lifeOk = lifeOk && (sa.state === 'ACTIVE');
    sa.hangup(); lifeOk = lifeOk && (sa.state === 'CLOSED') && (sa.closedAt !== null);
    out.push(['session-lifecycle', lifeOk]);
    sb.hangup();
    // session transcript carries the session id and is a generated conversation
    var st2 = dial({ name: 'sC', kind: 'domain', fallback: ['x'] });
    st2.say('ping'); var tr = st2.transcript();
    out.push(['session-transcript', tr.session_id === st2.sessionId && tr.turn_count === 1 && tr.transcript_kind === 'GENERATED_CONVERSATION']);
    st2.hangup();
    // role lock validation: empty / too-long / control chars are structured errors
    function errCode(fn) { try { fn(); return null; } catch (e) { return e.error_code || null; } }
    var sv = dial({ name: 'sD', kind: 'domain', fallback: ['x'] });
    var vEmpty = errCode(function () { sv.lockRole(''); });
    var vLong = errCode(function () { sv.lockRole(new Array(122).join('x')); });
    var vCtrl = errCode(function () { sv.lockRole('bad\tx'); });
    out.push(['role-validation', vEmpty === 'ROLE_EMPTY' && vLong === 'ROLE_TOO_LONG' && vCtrl === 'ROLE_INVALID_CHARS']);
    sv.hangup();
    // dial with no record is a structured error
    out.push(['dial-badrecord', errCode(function () { dial(null); }) === 'DIAL_BAD_RECORD']);
    // structured error object shape
    var se = null;
    try { fileRecord({}); } catch (e) { se = e; }
    out.push(['error-shape', !!se && se.error_code === 'FILERECORD_BAD_RECORD' &&
      se.engine_version === VERSION && se.api_version === API_VERSION &&
      typeof se.recoverable === 'boolean' && se instanceof Error]);
    // genome IDs are content-derived: same inputs => same genome_id + stamp
    var gd1 = { INPUT: 'F-IFU', REASON: 'F-RAE', OUTPUT: 'F-OAO', MEMORY: 'F-KMMU', ETHICS: 'F-EGCU',
      REPAIR: 'F-SDR', RESOURCE: 'F-RM', LEARN: 'F-ALAOU', INTERFACE: 'F-AUIX', COMMS: 'F-ECU' };
    var gg1 = buildGenome({ genes: gd1, name: 'det', kind: 'domain' });
    var gg2 = buildGenome({ genes: gd1, name: 'det', kind: 'domain' });
    out.push(['genome-deterministic', gg1.genome_id === gg2.genome_id && gg1.stamp === gg2.stamp &&
      /^JAH-GENOME-[0-9A-Z]{6}$/.test(gg1.genome_id)]);
    // recordHash stable and excludes volatile filing fields
    out.push(['recordhash', recordHash(gg1) === recordHash(gg2) && recordHash(gg1) !== recordHash(buildGenome({ genes: gd1, name: 'det2', kind: 'domain' }))]);
    // genome validation errors are structured
    out.push(['genome-errors', errCode(function () { buildGenome({ genes: { BOGUS: 'F-IFU' } }); }) === 'GENOME_UNKNOWN_SLOT' &&
      errCode(function () { buildGenome({ genes: { INPUT: 'ZZ-999' } }); }) === 'GENOME_UNKNOWN_CODE']);
    // capabilities + health
    var caps = capabilities();
    out.push(['capabilities', caps.backend_id === 'JAH-BACKEND-1' && caps.offline === true &&
      caps.network_calls.length === 0 && caps.operations.length === 21 &&
      caps.catalogs.shelfes === 8 && caps.catalogs.gene_slots === 10]);
    var h = health();
    out.push(['health', h.status === 'UP' && h.version === VERSION && h.api_version === API_VERSION]);
    // demo receipts: sequential JAH-DEMO-######
    var rd1 = runDemoReceipt(loadPreset('Universal Problem Solver'), { problem: 'x' });
    var rd2 = runDemoReceipt(loadPreset('Universal Problem Solver'), { problem: 'x' });
    out.push(['demo-receipts', /^JAH-DEMO-\d{6}$/.test(rd1.demo_id) && rd1.demo_id !== rd2.demo_id &&
      typeof rd1.output === 'string' && rd1.output.length > 0 &&
      typeof rd1.demo_kind === 'string' && rd1.demo_kind.length > 0 &&
      rd1.api_version === API_VERSION]);
    // identity fields on exports
    var exp = window.SignatureBackend;
    out.push(['identity-fields', exp.apiVersion === API_VERSION && exp.backendId === BACKEND_ID &&
      exp.schemaVersion === SCHEMA_VERSION && gg1.generator_version === VERSION]);
    var pass = out.every(function (x) { return x[1]; });
    var any = out.some(function (x) { return x[1]; });
    return { pass: pass, partial: !pass && any, checks: out };
  }

  // The Opperater self-tests (appended to the main selfTest).
  function opperaterSelfTest(out) {
    var go = geneOptions();
    out.push(['gene-slots-10', go.length === 10 && go.every(function (s) { return s.options.length >= 6; })]);
    var keys = go.map(function (s) { return s.key; }).join(',');
    out.push(['gene-slot-names', keys === 'INPUT,REASON,OUTPUT,MEMORY,ETHICS,REPAIR,RESOURCE,LEARN,INTERFACE,COMMS']);
    var goa = geneOptions(true);
    out.push(['gene-advanced-14', goa.length === 14]);
    var g = buildGenome({ genes: { INPUT: 'P-AIFU', REASON: 'P-ARAE', ETHICS: 'P-AEGCU' },
      name: 'TestForge', tone: 'Guardian', mission: 'guard the network' });
    out.push(['genome-record', !!g && g.stamp.indexOf('JAH-AI-OPR-') === 0 &&
      g.abilities.length >= 4 && g.params.length >= 4 &&
      g.rules.length >= 6 && g.rules.every(function (r) { return r.r.length >= 2; }) &&
      g.fallback.length >= 4 && g.fallback.indexOf(g.greeting) < 0 &&
      !!g.demoTitle && !!g.demoKind && !!g.demoHTML && !!g.py && !!g.mentality]);
    // A forged genome must be dialable and fully chat-able.
    var gs = dial(g);
    var say1 = gs.say('hello'), say2 = gs.say('what is your mission');
    out.push(['genome-dial', gs.lineOpen === true && typeof say1 === 'string' && say1.length > 0 &&
      say2.indexOf('guard the network') >= 0]);
    var threw = false;
    try { buildGenome({ genes: { BOGUS: 'X' } }); } catch (e) { threw = true; }
    out.push(['genome-badslot-throws', threw]);
    var threw2 = false;
    try { buildGenome({ genes: { INPUT: 'NOPE' } }); } catch (e) { threw2 = true; }
    out.push(['genome-badcode-throws', threw2]);
    // drops multiset + attitude
    var g2 = buildGenome({ drops: ['P-AIFU', 'P-AIFU', 'A-AOAO', 'P-AUIX', 'P-AEGCU'],
      attitude: { warmth: 9, humor: 2, seriousness: 6, boldness: 8 }, name: 'DropForge', tone: 'Sage' });
    var reinf = g2.params.filter(function (p) { return p[0] === 'reinforced traits'; })[0];
    var attp = g2.params.filter(function (p) { return p[0] === 'attitude'; })[0];
    out.push(['genome-drops', !!reinf && /Input Processing/.test(reinf[1]) && g2.greeting.indexOf('glad') >= 0 &&
      !!attp && /warmth 9/.test(attp[1])]);
    var s2 = dial(g2);
    out.push(['genome-drops-dial', s2.say('hello').indexOf('glad') >= 0 || s2.say('tell me more').length > 0]);
    // genomeViable
    var v0 = genomeViable([]);
    out.push(['viable-empty', v0.ready === false && v0.missing.length === 3]);
    var v1 = genomeViable(['P-AIFU']);
    out.push(['viable-partial', v1.ready === false && v1.missing.length === 2]);
    var v2 = genomeViable(['P-AIFU', 'P-AUIX', 'P-AEGCU']);
    out.push(['viable-ready', v2.ready === true && v2.missing.length === 0]);
    var threw3 = false;
    try { buildGenome({ drops: ['P-ADRM'] }); } catch (e) { threw3 = true; }
    out.push(['genome-advdrop-throws', threw3]);
    // fileRecord: stamp + downloads + immediately dialable
    var f1 = fileRecord(g2);
    out.push(['file-stamp', f1.record.filedStamp === 'JAH-AI-OP-000001' && f1.record.filed === true &&
      typeof f1.downloadPy === 'string' && f1.downloadPy.indexOf('JAH-AI-OP-000001') >= 0 &&
      typeof f1.downloadJson === 'string' && JSON.parse(f1.downloadJson).filedStamp === 'JAH-AI-OP-000001']);
    var fs1 = dial(f1.record);
    out.push(['file-dialable', typeof fs1.say('hi') === 'string' && fs1.say('hi').length > 0]);
    var f2 = fileRecord(loadPreset('Jesus AI'));
    out.push(['file-counter', f2.record.filedStamp === 'JAH-AI-OP-000002']);
    var fs2 = dial(f2.record);
    out.push(['file-preset-dialable', typeof fs2.say('hello') === 'string' && fs2.say('hello').length > 0]);
    var threw4 = false;
    try { fileRecord({}); } catch (e) { threw4 = true; }
    out.push(['file-badrecord-throws', threw4]);
    // role lock on sessions
    var rs = dial(loadPreset('Universal Problem Solver'));
    var lockMsg = rs.lockRole('semiconductor replacement');
    var locked = rs.say('check pin 7 voltage');
    var unMsg = rs.unlockRole();
    var normal = rs.say('check pin 7 voltage');
    out.push(['lockrole', lockMsg.indexOf('semiconductor replacement') >= 0 &&
      locked.indexOf('ROLE: semiconductor replacement') === 0 &&
      locked.indexOf('ACK:') >= 0 && locked.indexOf('OUT:') >= 0 &&
      locked.trim().split('\n').pop() === 'END' &&
      locked.split('\n').every(function (l) { return l.length <= 220; })]);
    out.push(['unlockrole', unMsg.indexOf('ROLE RELEASED') >= 0 && normal.indexOf('ROLE:') !== 0]);
    rs.hangup();
  }

  window.SignatureBackend = {
    version: VERSION,
    apiVersion: API_VERSION,
    backendId: BACKEND_ID,
    schemaVersion: SCHEMA_VERSION,
    chat: chat,
    runDemo: runDemo,
    runDemoReceipt: runDemoReceipt,
    dial: dial,
    presets: presets,
    loadPreset: loadPreset,
    geneOptions: geneOptions,
    buildGenome: buildGenome,
    genomeViable: genomeViable,
    fileRecord: fileRecord,
    tones: tones,
    labCatalogs: labCatalogs,
    labOptions: labOptions,
    animateCreation: animateCreation,
    creationToAI: creationToAI,
    labDemo: labDemo,
    recordHash: recordHash,
    capabilities: capabilities,
    health: health,
    EngineError: engineError,
    selfTest: selfTest
  };
})();
