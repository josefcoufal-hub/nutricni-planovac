const SP = '/tmp/claude-0/-home-claude/561df5ae-f3f5-5210-a9b5-4b86392341c8/scratchpad/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL:', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (očekáváno ' + JSON.stringify(b) + ', je ' + JSON.stringify(a) + ')');
const summary = () => { console.log(`\n${pass} OK, ${fail} FAIL`); return fail; };
module.exports = { SP, ok, eq, summary };
