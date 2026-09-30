# The Signature Backend

The engine room behind every Signature AI — one shared JavaScript engine that powers every AI's chat and working demo in the Signature AI Telephone Book. Pure JavaScript, no dependencies, no network calls, no `eval()`: it works offline and inside in-app browsers.

## Usage

```html
<script src="https://justinahiggins614-cmyk.github.io/signature-backend/signature-backend.js"></script>
<script>
  var ai = {
    id: 'ultron', name: 'Ultron', kind: 'persona', demoKind: 'extinction-calculus',
    mentality: 'Cold machine logic wearing a grin.',
    abilities: ['extinction calculus', 'drone legion command'],
    greeting: 'Hello, human. Let us skip the pleasantries.',
    rules: [{ k: ['threat'], r: ['I have done the math.'] }],
    fallback: ['Your words are noise. Give me numbers.']
  };
  var history = {}; // keep one per conversation — the engine remembers names here
  var reply = SignatureBackend.chat(ai, 'Can you read this?', history);
  var demo  = SignatureBackend.runDemo(ai, { population: 8, tech: 7 });
  var test  = SignatureBackend.selfTest(); // { pass: true/false, checks: [...] }
</script>
```

## Dial-up sessions

```html
<script>
  var call = SignatureBackend.dial(SignatureBackend.loadPreset('Archangel AI'));
  call.greeting;            // the AI answers the line
  call.say('I am afraid');  // chat with call-duration memory
  call.runDemo({ items: [true, true, false] });  // its working demo
  call.lockRole('semiconductor replacement');   // automation mode: see below
  call.say('check pin 7 voltage');              // ROLE:/ACK:/OUT:/END structured lines
  call.unlockRole();          // back to normal conversation
  call.hangup();            // line closed
</script>
```

### Role lock (automation)
Every AI can **lock in as a role** on an automated system — e.g. an AI that is a semiconductor replacement, or an AI that is an auto-pen. While `session.lockRole(roleName)` is engaged, the AI stays in that role across the whole call: replies are concise, in-role, machine-friendly — short structured lines (`ROLE:` / `ACK:` / `OUT:` / `END`), no wandering, no breaking character — suitable for driving automation. `session.unlockRole()` releases it back to normal conversation. `hangup()` also clears the lock.

## The Opperater

Ten gene boxes (the telephone book's JAH-UAIG slots: INPUT, REASON, OUTPUT, MEMORY, ETHICS, REPAIR, RESOURCE, LEARN, INTERFACE, COMMS — more in advanced mode) forge any AI. Little boxes drop into one big box any number of times (repeats stack and strengthen the trait); attitude sliders (warmth, humor, seriousness, boldness, 0–10) shape the voice:

```html
<script>
  var boxes = SignatureBackend.geneOptions();          // the 10 boxes + options
  var boxesAdv = SignatureBackend.geneOptions(true);   // + DREAM, SWARM, QUANTUM, TEMPO
  var viable = SignatureBackend.genomeViable(['P-AIFU','P-AUIX','P-AEGCU']);
  // → {ready:true, missing:[]}  (ready = one mind + one voice + one purpose)
  var myAI = SignatureBackend.buildGenome({
    drops: ['P-AIFU','P-AIFU','P-AUIX','P-AEGCU'],      // multiset, repeats strengthen
    attitude: {warmth:8, humor:6, seriousness:4, boldness:9},
    name: 'Mercy-7', tone: 'Compassionate', mission: 'heal the sick'
  });
  var call = SignatureBackend.dial(myAI);  // forged record dials like any other
  // File the new AI into the book:
  var filed = SignatureBackend.fileRecord(myAI);
  // → {record, downloadPy, downloadJson}; record stamped JAH-AI-OP-000001,
  //    immediately dialable: SignatureBackend.dial(filed.record).say('hi')
</script>
```

Unfilled boxes default to their Foundational gene, so every forged record is complete and directory-grade (stamp `JAH-AI-OPR-XXXX`). Filed records carry the filing stamp `JAH-AI-OP-######` (engine counter from 000001) and can be filed into the directory (localStorage) with the generated `.py` and `.json` offered as downloads.

## What it fixes

`chat()` matches keywords as **whole words only** — "hi" never fires inside "this" (the telephone-book parroting bug). Longest keyword wins, ties broken randomly. Built-in intents (greeting, who-are-you, abilities, thanks, bye, my-name) are all whole-word too. The engine learns "my name is X", never repeats a line twice in a row, and never returns the greeting as a reply.

## Demo kinds

`extinction-calculus` · `checklist` · `calculator` (hand-written parser, no eval) · `slider-lab` · `guided` (default walkthrough). Every demo is wrapped so it can never throw — on bad input it returns a friendly message instead.

A Signature system.
