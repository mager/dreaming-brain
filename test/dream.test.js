import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, makePrompt } from '../lib/dream.js';
const input = { profile: 'Help with deployments.', notes: [], sessions: [{ id: 's-example', text: 'The staging deployment passed.' }] };
const reply = { changes: [], unresolved: ['No confirmed rule.'] };

test('live dreaming sends evidence and a schema, then returns parsed text and usage', async () => {
  const result = await generate(input, { apiKey: 'test-key', model: 'test-model', fetcher: async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['x-api-key'], 'test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'test-model');
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.output_config.format.schema.additionalProperties, false);
    assert(body.messages[0].content.includes('The staging deployment passed.'));
    assert(!body.tools);
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200 });
  }});
  assert.deepEqual(result.reply, reply);
  assert.equal(result.usage.input_tokens, 100);
});
test('HTTP failures do not retry or leak the provider response body', async () => {
  let calls = 0;
  await assert.rejects(generate(input, { apiKey: 'test-key', model: 'test-model', fetcher: async () => { calls++; return new Response('sensitive server detail', { status: 429 }); } }), /429/);
  assert.equal(calls, 1);
});
test('truncated or malformed model replies fail before creating a proposal', async () => {
  for (const [body, message] of [
    [{ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] }, /max_tokens/],
    [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }, /invalid JSON/],
    [{ stop_reason: 'refusal', content: [] }, /refusal/],
  ]) await assert.rejects(generate(input, { apiKey: 'key', model: 'model', fetcher: async () => new Response(JSON.stringify(body)) }), message);
});
test('missing configuration fails before a network call', async () => {
  for (const config of [{}, { apiKey: 'key' }, { model: 'model' }]) {
    await assert.rejects(generate(input, { ...config, fetcher: () => { throw new Error('Network must not be called'); } }), /ANTHROPIC_/);
  }
});
test('prompt export carries the actual profile, evidence, and reply schema', () => {
  const prompt = makePrompt(input);
  assert(prompt.includes('Help with deployments.'));
  assert(prompt.includes('s-example'));
  assert(prompt.includes('The staging deployment passed.'));
  assert(prompt.includes('replaces'));
});
