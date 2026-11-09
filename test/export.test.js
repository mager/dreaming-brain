import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Brain } from '../lib/brain.js';

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'brain-export-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const brain = new Brain(join(root, 'brain'));
  brain.init();
  writeFileSync(join(brain.root, 'profile.md'), '# Profile\nHelp me with docs.\n');
  return brain;
}
function proposal(brain, id = 'preview-target', target = 'staging', replaces = []) {
  const quote = `Docs previews use ${target}.`;
  const session = brain.capture(`${quote}\nPRIVATE_SESSION_DETAIL`, `${target}.txt`);
  return brain.propose(brain.snapshot(), { changes: [{ id, text: quote, scope: 'Docs previews only.', recheck: 'When the deployment settings change.', replaces, evidence: [{ session, quote }] }], unresolved: ['UNRESOLVED_DETAIL'] });
}
test('export includes profile, accepted notes and citations but no raw sessions or pending work', t => {
  const brain = setup(t);
  brain.accept(proposal(brain));
  proposal(brain, 'pending-target', 'PENDING_DETAIL');
  const before = readFileSync(join(brain.root, 'state.json'), 'utf8');
  const text = brain.exportMemory();
  assert.match(text, /Help me with docs/);
  assert.match(text, /Docs previews use staging/);
  assert.match(text, /Docs previews only/);
  assert.match(text, /When the deployment settings change/);
  assert.match(text, /Source s-/);
  for (const excluded of ['PRIVATE_SESSION_DETAIL', 'PENDING_DETAIL', 'UNRESOLVED_DETAIL']) assert(!text.includes(excluded));
  assert.equal(readFileSync(join(brain.root, 'state.json'), 'utf8'), before);
});
test('full export includes every accepted note beyond context limits', t => {
  const brain = setup(t);
  const quote = 'Ten checked rules.';
  const session = brain.capture(quote, 'rules.txt');
  const changes = Array.from({ length: 10 }, (_, i) => ({ id: `rule-${i}`, text: `Rule ${i}: ${'x'.repeat(1400)}`, scope: 'This example.', recheck: 'When the example changes.', replaces: [], evidence: [{ session, quote }] }));
  brain.accept(brain.propose(brain.snapshot(), { changes, unresolved: [] }));
  const text = brain.exportMemory();
  for (let i = 0; i < 10; i++) assert(text.includes(`## rule-${i}\n`));
  assert(text.length > 12_000);
  assert(!text.includes('omitted'));
});
test('export reflects a correction and undo without retaining the superseded note', t => {
  const brain = setup(t);
  brain.accept(proposal(brain));
  brain.accept(proposal(brain, 'corrected-target', 'sandbox', ['preview-target']));
  assert.match(brain.exportMemory(), /Docs previews use sandbox/);
  assert(!brain.exportMemory().includes('staging'));
  brain.undo();
  assert.match(brain.exportMemory(), /Docs previews use staging/);
  assert(!brain.exportMemory().includes('sandbox'));
});
test('CLI export works for an empty brain and writes only Markdown to stdout', t => {
  const brain = setup(t);
  const cli = fileURLToPath(new URL('../bin/brain.js', import.meta.url));
  const text = execFileSync(process.execPath, [cli, '--brain', brain.root, 'export'], { encoding: 'utf8' });
  assert(text.startsWith('# Portable agent memory\n'));
  assert.match(text, /Help me with docs/);
  assert.match(text, /No accepted notes/);
  assert(!text.includes('Created'));
});
