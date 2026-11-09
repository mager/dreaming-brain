#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Brain, readText } from '../lib/brain.js';
import { generate, makePrompt } from '../lib/dream.js';

const help = `dreaming-brain — a small, reviewable custom brain

node bin/brain.js [--brain DIR] COMMAND

  init                         Create a new brain directory and profile.
  capture FILE                 Import a completed session (plain text).
  prompt                       Export brain/request.json and brain/prompt.md.
  dream --reply FILE           Import JSON for the last exported request.
  dream --reply FILE --request FILE  Use an explicit exported request.
  dream --live                 Make one Claude API call; save a proposal only.
  review ID                    Show before/after notes and source excerpts.
  accept ID                    Apply a reviewed proposal.
  reject ID                    Keep its sessions available for a new review.
  context [QUERY]              Print profile and matching accepted notes.
  export                       Print profile and ALL accepted notes as Markdown.
  status                       Show counts and proposal IDs.
  undo                         Restore notes/checkpoint before the last acceptance.

Default directory: ./brain. Requires Node 22+.
Live mode needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL.
Live mode sends the profile, accepted notes, and selected sessions to Anthropic.
It never accepts notes automatically. See README for limits and privacy.
`;
function output(value) { console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); }
function exportFile(path, data) {
  if (existsSync(path)) readText(path); // Reject symlinks before writing an export.
  writeFileSync(path, data, { mode: 0o600 });
}
function report(p) {
  const rows = [`# ${p.id} (${p.status})`, `Input revision: ${p.input.revision}`];
  for (const change of p.reply.changes) {
    rows.push(`## ${change.id}`);
    for (const id of change.replaces) rows.push(`Before (${id}): ${p.input.notes.find(n => n.id === id)?.text}`);
    rows.push(`Proposed: ${change.text}`, `Scope: ${change.scope}`, `Recheck: ${change.recheck}`);
    for (const e of change.evidence) rows.push(`Evidence (${e.session}): ${JSON.stringify(e.quote)}`);
  }
  rows.push('## Unresolved', ...p.reply.unresolved);
  rows.push('Exact quotes are checked by software. You must check whether they support the claim.');
  return rows.join('\n\n');
}
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { brain: { type: 'string' }, live: { type: 'boolean' }, reply: { type: 'string' }, request: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  const [command, ...args] = positionals;
  if (values.help || !command) { output(help); }
  else {
    const counts = { init: 0, capture: 1, prompt: 0, dream: 0, review: 1, accept: 1, reject: 1, context: null, export: 0, status: 0, undo: 0 };
    if (!Object.hasOwn(counts, command)) throw new Error(`Unknown command: ${command}. Use --help.`);
    if (counts[command] !== null && args.length !== counts[command]) throw new Error(`${command} expects ${counts[command]} argument(s). Use --help.`);
    if (command !== 'dream' && (values.live || values.reply || values.request)) throw new Error('Dream options require the dream command.');
    if (command === 'dream' && (Boolean(values.live) === Boolean(values.reply) || (values.request && !values.reply))) throw new Error('Choose dream --live OR dream --reply FILE [--request FILE].');
    const brain = new Brain(values.brain ?? 'brain');
    switch (command) {
      case 'init': brain.init(); output(`Created ${brain.root}. Edit profile.md to make it yours.`); break;
      case 'capture': output(brain.capture(readText(args[0], 20_000), args[0])); break;
      case 'prompt': {
        const input = brain.snapshot();
        if (!input.sessions.length) { output('No unprocessed sessions.'); break; }
        exportFile(join(brain.root, 'request.json'), JSON.stringify(input, null, 2) + '\n');
        exportFile(join(brain.root, 'prompt.md'), makePrompt(input));
        output(`Read ${join(brain.root, 'prompt.md')}. Save your assistant's JSON reply, then run dream --reply FILE.`);
        break;
      }
      case 'dream': {
        let input, reply;
        if (values.live) {
          input = brain.snapshot();
          if (!input.sessions.length) { output('No unprocessed sessions.'); break; }
          const result = await generate(input, { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL });
          reply = result.reply;
          console.error(`API usage: ${JSON.stringify(result.usage)}`);
        } else {
          input = JSON.parse(readText(values.request ?? join(brain.root, 'request.json')));
          reply = JSON.parse(readText(values.reply));
        }
        output(brain.propose(input, reply));
        break;
      }
      case 'review': output(report(brain.review(args[0]))); break;
      case 'accept': brain.accept(args[0]); output('Accepted. Run context to read the saved notes.'); break;
      case 'reject': brain.reject(args[0]); output('Rejected. Captured sessions remain available.'); break;
      case 'context': output(brain.context(args.join(' '))); break;
      case 'export': output(brain.exportMemory()); break;
      case 'status': output({ ...brain.status(), proposals: Object.values(brain.load().proposals).map(p => ({ id: p.id, status: p.status })) }); break;
      case 'undo': brain.undo(); output('Restored previous notes and checkpoint; captured sessions are preserved.'); break;
    }
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
