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
  call.hangup();            // line closed
</script>
```

## The Opperater

Ten gene boxes (the telephone book's JAH-UAIG slots: INPUT, REASON, OUTPUT, MEMORY, ETHICS, REPAIR, RESOURCE, LEARN, INTERFACE, COMMS — more in advanced mode) forge any AI:

```html
<script>
  var boxes = SignatureBackend.geneOptions();          // the 10 boxes + options
  var boxesAdv = SignatureBackend.geneOptions(true);   // + DREAM, SWARM, QUANTUM, TEMPO
  var myAI = SignatureBackend.buildGenome({
    genes: { INPUT: 'P-AIFU', REASON: 'P-ARAE', ETHICS: 'P-AEGCU' },
    name: 'Mercy-7', tone: 'Compassionate', mission: 'heal the sick'
  });
  var call = SignatureBackend.dial(myAI);  // forged record dials like any other
</script>
```

Unfilled boxes default to their Foundational gene, so every forged record is complete and directory-grade (stamp `JAH-AI-OPR-XXXX`).

## What it fixes

`chat()` matches keywords as **whole words only** — "hi" never fires inside "this" (the telephone-book parroting bug). Longest keyword wins, ties broken randomly. Built-in intents (greeting, who-are-you, abilities, thanks, bye, my-name) are all whole-word too. The engine learns "my name is X", never repeats a line twice in a row, and never returns the greeting as a reply.

## Demo kinds

`extinction-calculus` · `checklist` · `calculator` (hand-written parser, no eval) · `slider-lab` · `guided` (default walkthrough). Every demo is wrapped so it can never throw — on bad input it returns a friendly message instead.

A Signature system.
