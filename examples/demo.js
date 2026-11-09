import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain } from '../lib/brain.js';

const directory = mkdtempSync(join(tmpdir(), 'dreaming-brain-demo-'));
try {
  const brain = new Brain(join(directory, 'brain'));
  brain.init();
  const session = brain.capture(readFileSync(new URL('./session.txt', import.meta.url), 'utf8'), 'session.txt');
  // A hand-authored fixture demonstrates the lifecycle. This is NOT an LLM call.
  const reply = { changes: [{
    id: 'docs-preview-target',
    text: 'Use deploy --target staging for docs preview deployments.',
    scope: 'Docs project previews only; production has a separate process.',
    recheck: 'When the docs deployment configuration or user instructions change.',
    replaces: [],
    evidence: [{ session, quote: 'Preview deployments must use the staging target.' }, { session, quote: 'The staging deployment passed. Exit code 0.' }],
  }], unresolved: ['The production release procedure is not established by this session.'] };
  console.log('OFFLINE DEMO — synthetic session + hand-authored proposal. No API call.\n');
  const proposal = brain.propose(brain.snapshot(), reply);
  console.log('1. Before acceptance:');
  console.log(brain.context('deployment'));
  console.log('2. Proposed changes (normally review these yourself):');
  console.log(JSON.stringify(brain.review(proposal).reply, null, 2));
  brain.accept(proposal);
  console.log('\n3. After accepting this demo fixture:');
  console.log(brain.context('deployment'));
  brain.undo();
  console.log('4. Undo restores the previous memory:', brain.status());
} finally { rmSync(directory, { recursive: true, force: true }); }
