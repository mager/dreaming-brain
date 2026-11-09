import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain } from '../lib/brain.js';

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'dreaming-brain-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const brain = new Brain(join(root, 'brain'));
  brain.init();
  return brain;
}
function reply(id, overrides = {}) {
  return { changes: [{ id: 'staging-deploy', text: 'Use the staging environment for preview deployments.', scope: 'Preview deployments only.', recheck: 'When deployment configuration changes.', replaces: [], evidence: [{ session: id, quote: 'The staging deployment passed.' }], ...overrides }], unresolved: [] };
}

test('new users can create a brain without overwriting an existing one', t => {
  const brain = setup(t);
  assert.throws(() => brain.init(), /already exists/);
  assert.deepEqual(brain.status(), { sessions: 0, notes: 0, pending: 0, unprocessed: 0, revision: 0 });
});
test('capture -> propose -> review -> accept -> context keeps pending notes out of recall', t => {
  const brain = setup(t);
  const id = brain.capture('The staging deployment passed.', 'deployment.txt');
  const input = brain.snapshot();
  const proposal = brain.propose(input, reply(id));
  assert(!brain.context('staging').includes('Preview deployments only.'));
  assert.equal(brain.review(proposal).reply.changes[0].evidence[0].quote, 'The staging deployment passed.');
  brain.accept(proposal);
  assert.match(brain.context('staging'), /Preview deployments only/);
  assert.match(brain.context('staging'), /The staging deployment passed/);
  assert.deepEqual(brain.status(), { sessions: 1, notes: 1, pending: 0, unprocessed: 0, revision: 2 });
  assert.throws(() => brain.accept(proposal), /pending/);
});
test('reimporting identical content does not create another session', t => {
  const brain = setup(t);
  const id = brain.capture('The staging deployment passed.', 'a.txt');
  assert.equal(brain.capture('The staging deployment passed.', 'b.txt'), id);
  assert.equal(brain.status().sessions, 1);
});
test('invalid reply fields and unsupported evidence leave state unchanged', t => {
  const brain = setup(t);
  const id = brain.capture('The staging deployment passed.', 'a.txt');
  const before = readFileSync(join(brain.root, 'state.json'), 'utf8');
  for (const bad of [
    { changes: 'wrong', unresolved: [] },
    reply(id, { id: '../escape' }),
    reply(id, { text: '' }),
    reply(id, { evidence: [] }),
    reply(id, { evidence: [{ session: 'missing', quote: 'The staging deployment passed.' }] }),
    reply(id, { evidence: [{ session: id, quote: 'Production is safe.' }] }),
    reply(id, { replaces: ['missing-note'] }),
    { ...reply(id), unexpected: true },
  ]) assert.throws(() => brain.propose(brain.snapshot(), bad));
  assert.equal(readFileSync(join(brain.root, 'state.json'), 'utf8'), before);
});
test('a captured session or accepted proposal makes earlier input stale', t => {
  const brain = setup(t);
  const id = brain.capture('The staging deployment passed.', 'a.txt');
  const snapshot = brain.snapshot();
  const first = brain.propose(snapshot, reply(id));
  const second = brain.propose(snapshot, reply(id));
  brain.accept(first);
  assert.throws(() => brain.accept(second), /stale/);
  assert.throws(() => brain.propose(snapshot, reply(id)), /stale/);
  const next = brain.capture('New session.', 'b.txt');
  assert(next);
  assert.equal(brain.status().notes, 1);
});
test('new captures invalidate pending proposals and do not become processed by accident', t => {
  const brain = setup(t);
  const id = brain.capture('The staging deployment passed.', 'a.txt');
  const proposal = brain.propose(brain.snapshot(), reply(id));
  brain.capture('A new unrelated task.', 'b.txt');
  assert.throws(() => brain.accept(proposal), /stale/);
  assert.equal(brain.status().unprocessed, 2);
});
test('explicit replacements remove the old note and undo restores it', t => {
  const brain = setup(t);
  const id = brain.capture('The staging deployment passed.', 'a.txt');
  brain.accept(brain.propose(brain.snapshot(), reply(id)));
  const correction = brain.capture('Preview deployments now use sandbox.', 'b.txt');
  const corrected = reply(correction, { id: 'sandbox-deploy', text: 'Use sandbox for previews.', replaces: ['staging-deploy'], evidence: [{ session: correction, quote: 'Preview deployments now use sandbox.' }] });
  brain.accept(brain.propose(brain.snapshot(), corrected));
  assert(!brain.context('deployments').includes('Use the staging environment'));
  brain.undo();
  assert.match(brain.context('staging'), /Use the staging environment/);
  assert.equal(brain.status().sessions, 2);
  assert.equal(brain.status().unprocessed, 1);
});
test('reject and no-change review keep the learning loop usable', t => {
  const brain = setup(t);
  const id = brain.capture('The staging deployment passed.', 'a.txt');
  const p = brain.propose(brain.snapshot(), reply(id));
  brain.reject(p);
  assert.equal(brain.status().unprocessed, 1);
  const empty = brain.propose(brain.snapshot(), { changes: [], unresolved: ['No durable lesson.'] });
  brain.accept(empty);
  assert.equal(brain.status().notes, 0);
  assert.equal(brain.status().unprocessed, 0);
});
test('unknown queries do not return unrelated memories', t => {
  const brain = setup(t);
  const id = brain.capture('The staging deployment passed.', 'a.txt');
  brain.accept(brain.propose(brain.snapshot(), reply(id)));
  assert(!brain.context('orchid').includes('Use the staging environment'));
  assert.match(brain.context('orchid'), /No matching accepted notes/);
});
test('empty and oversized captures fail without changing state', t => {
  const brain = setup(t);
  assert.throws(() => brain.capture('  ', 'a.txt'));
  assert.throws(() => brain.capture('x'.repeat(20_001), 'a.txt'));
  assert.equal(brain.status().sessions, 0);
});
test('a write lock prevents a second writer from altering state', t => {
  const brain = setup(t);
  mkdirSync(join(brain.root, '.lock'));
  assert.throws(() => brain.capture('A task.', 'a.txt'), /locked/);
  assert.equal(brain.status().sessions, 0);
});

test('dream batches fit the input budget and leave later sessions unprocessed', t => {
  const brain = setup(t);
  for (let i = 0; i < 6; i++) brain.capture(`${i}:` + 'x'.repeat(17_998), `${i}.txt`);
  const input = brain.snapshot();
  assert.equal(input.sessions.length, 5);
  brain.accept(brain.propose(input, { changes: [], unresolved: [] }));
  assert.equal(brain.status().unprocessed, 1);
  assert.equal(brain.snapshot().sessions.length, 1);
});

test('a rejected oversized state write leaves the previous state readable', t => {
  const brain = setup(t);
  let rejected = false;
  for (let i = 0; i < 300; i++) {
    const previous = readFileSync(join(brain.root, 'state.json'), 'utf8');
    try { brain.capture(`${i}:` + 'x'.repeat(19_990), `${i}.txt`); }
    catch (error) {
      assert.match(error.message, /State would exceed/);
      assert.equal(readFileSync(join(brain.root, 'state.json'), 'utf8'), previous);
      assert.equal(brain.status().sessions, i);
      rejected = true;
      break;
    }
  }
  assert(rejected);
});
