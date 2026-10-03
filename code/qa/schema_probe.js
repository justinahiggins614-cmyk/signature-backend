// Emits one real sample per schema: {genome, creation, demo, session, error}.
// Used by code/qa/run_all.sh to validate schemas against real engine output.
global.window = {};
var fs = require('fs');
var path = require('path');
// Works both as `node code/qa/schema_probe.js` and embedded via `node -e`.
var here = process.cwd();
try {
  var f = fs.realpathSync(__filename);
  if (!/\[eval\]/.test(f)) here = path.dirname(f);
} catch (e) { /* keep cwd */ }
var enginePath = fs.existsSync(path.join(here, 'signature-backend.js'))
  ? path.join(here, 'signature-backend.js')
  : path.join(here, '..', '..', 'signature-backend.js');
eval(fs.readFileSync(enginePath, 'utf8'));
var B = global.window.SignatureBackend;
var out = {};
var genes = {INPUT:'F-IFU',REASON:'F-RAE',OUTPUT:'F-OAO',MEMORY:'F-KMMU',ETHICS:'F-EGCU',
  REPAIR:'F-SDR',RESOURCE:'F-RM',LEARN:'F-ALAOU',INTERFACE:'F-AUIX',COMMS:'F-ECU'};
out.genome = B.buildGenome({genes: genes, name: 'Schema Probe', kind: 'domain'});
out.creation = B.animateCreation({base:'paragon',
  picks:{parts:['BP00-00'],brains:['BR-00'],power:['PW-00']}});
out.demo = B.runDemoReceipt(B.loadPreset('Universal Problem Solver'), {problem: 'x'});
var s = B.dial({name:'sp', kind:'domain', fallback:['z']});
s.say('hi');
out.session = s.transcript();
s.hangup();
try { B.buildGenome({genes: {BOGUS: 'F-IFU'}}); }
catch (e) {
  out.error = {error_code: e.error_code, message_text: e.message_text,
    operation: e.operation, engine_version: e.engine_version,
    api_version: e.api_version, recoverable: e.recoverable};
}
console.log(JSON.stringify(out));
