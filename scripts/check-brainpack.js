// Opt-in compatibility check. Downloads the pinned public CLI through npx.
// All generated data is synthetic and stays in a temporary directory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../lib/brain.js';

const root = mkdtempSync(join(tmpdir(), 'dreaming-brainpack-'));
const cli = fileURLToPath(new URL('../bin/brain.js', import.meta.url));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
const brainpack = (args, cwd) => run('npx', ['--yes', '--package=@mager/brainpack@0.3.0', 'brainpack', ...args], cwd);

try {
  const brain = new Brain(join(root, 'brain'));
  brain.init();
  const acceptTarget = (target, replaces) => {
    const quote = `Docs previews now use ${target}.`;
    const session = brain.capture(`${quote}\nRAW_SESSION_DETAIL`, `${target}.txt`);
    const proposal = brain.propose(brain.snapshot(), { changes: [{
      id: `${target}-preview`, text: quote, scope: 'Docs previews only.', recheck: 'When deployment settings change.', replaces,
      evidence: [{ session, quote }],
    }], unresolved: ['UNRESOLVED_DETAIL'] });
    brain.accept(proposal);
  };
  acceptTarget('staging', []);
  acceptTarget('sandbox', ['staging-preview']);
  const pack = join(root, 'pack');
  mkdirSync(pack);
  const exported = run(process.execPath, [cli, '--brain', brain.root, 'export'], root);
  assert(exported.includes('Docs previews now use sandbox.'));
  assert(!exported.includes('staging'));
  assert(!exported.includes('RAW_SESSION_DETAIL'));
  assert(!exported.includes('UNRESOLVED_DETAIL'));
  writeFileSync(join(pack, 'MEMORY.md'), exported);

  brainpack(['init', '--name', 'compatibility-example', '--platform', 'generic'], pack);
  run('git', ['add', '.'], pack);
  run('git', ['-c', 'user.name=Compatibility Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Save accepted memory'], pack);
  brainpack(['snapshot', 'accepted-memory'], pack);
  assert.equal(run('git', ['tag', '--list', 'brain/accepted-memory'], pack).trim(), 'brain/accepted-memory');
  assert.equal(run('git', ['remote'], pack).trim(), '');

  const archive = join(root, 'accepted-memory.tar.gz');
  brainpack(['export', archive], pack);
  const restored = join(root, 'restored');
  mkdirSync(restored);
  brainpack(['import', archive], restored);
  assert.equal(readFileSync(join(restored, 'MEMORY.md'), 'utf8'), exported);
  assert.equal(JSON.parse(readFileSync(join(restored, 'brainpack.json'), 'utf8')).platform, 'generic');
  brain.undo();
  assert(brain.exportMemory().includes('Docs previews now use staging.'));
  console.log('Brainpack 0.3.0: corrected memory exported, committed, tagged, archived, and restored byte-for-byte. Undo also verified. No remote configured.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
