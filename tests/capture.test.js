import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTranscript, analyzeTranscript } from '../src/capture-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

test('one-shot session does not prompt', () => {
  const messages = parseTranscript(join(fixturesDir, 'one-shot.jsonl'));
  const analysis = analyzeTranscript(messages);
  assert.equal(analysis.shouldPrompt, false);
});

test('failure to success triggers prompt', () => {
  const messages = parseTranscript(join(fixturesDir, 'failure-success.jsonl'));
  const analysis = analyzeTranscript(messages);
  assert.equal(analysis.shouldPrompt, true);
  assert.equal(analysis.reasons.includes('failure_to_success'), true);
  assert.ok(analysis.problem.includes('401'));
  assert.ok(analysis.solution.includes('Authorization'));
});

test('web search triggers prompt', () => {
  const messages = parseTranscript(join(fixturesDir, 'websearch.jsonl'));
  const analysis = analyzeTranscript(messages);
  assert.equal(analysis.shouldPrompt, true);
  assert.equal(analysis.reasons.includes('web_search'), true);
});
