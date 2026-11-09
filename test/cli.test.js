import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../bin/brain.js', import.meta.url));

test('the documented offline CLI workflow produces reviewed, queryable memory', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'dreaming-cli-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' }).trim();
  run('init');
  writeFileSync(join(cwd, 'session.txt'), 'User: I want concise answers.');
  const id = run('capture', 'session.txt');
  run('prompt');
  const request = JSON.parse(readFileSync(join(cwd, 'brain/request.json'), 'utf8'));
  assert.equal(request.sessions[0].id, id);
  writeFileSync(join(cwd, 'reply.json'), JSON.stringify({ changes: [{ id: 'concise-answers', text: 'Use concise answers.', scope: 'Routine responses.', recheck: 'If the user asks for more detail.', replaces: [], evidence: [{ session: id, quote: 'User: I want concise answers.' }] }], unresolved: [] }));
  const proposal = run('dream', '--reply', 'reply.json');
  assert(!run('context', 'answers').includes('Use concise answers.'));
  assert.match(run('review', proposal), /User: I want concise answers/);
  run('accept', proposal);
  assert.match(run('context', 'answers'), /Use concise answers/);
  assert.match(run('dream', '--live'), /No unprocessed sessions/);
  run('undo');
  assert(!run('context', 'answers').includes('Use concise answers.'));
});
test('bad arguments fail clearly, and help works without an initialized brain', () => {
  for (const args of [['capture'], ['accept'], ['dream'], ['dream', '--live', '--reply', 'reply.json'], ['not-a-command']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert(result.stderr.includes('Error:'));
  }
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert(help.stdout.includes('capture'));
});
