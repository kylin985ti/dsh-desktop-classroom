import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collaborationInput } from '../lib/ai-context.mjs';

const sample = { filename: '样本.md', prompt: '解释这段', source: '不能发送的前文\n  选中的原文  \n不能发送的后文', selection: '  选中的原文  ' };

test('selection-only input preserves exact whitespace and excludes unselected content', () => {
  const result = collaborationInput({ ...sample, contextScope: 'selection' });
  const input = JSON.parse(result.input);
  assert.equal(input.content, sample.selection);
  assert.equal(result.selection, sample.selection);
  assert.equal(input.contextScope, 'selection');
  assert.ok(!result.input.includes('不能发送'));
  assert.ok(!('selectedText' in input));
});

test('full context keeps the selected edit target and old callers default safely', () => {
  const full = JSON.parse(collaborationInput({ ...sample, contextScope: 'document' }).input);
  assert.equal(full.content, sample.source);
  assert.equal(full.selectedText, sample.selection);
  assert.equal(collaborationInput(sample).contextScope, 'selection');
  assert.equal(collaborationInput({ ...sample, selection: '' }).contextScope, 'document');
});

test('the size limit applies to the actual serialized model input', () => {
  const long = { ...sample, source: '长'.repeat(110000) + sample.selection };
  assert.equal(JSON.parse(collaborationInput(long).input).content, sample.selection);
  assert.throws(() => collaborationInput({ ...long, contextScope: 'document' }), /300000/);
  // JSON escaping and a second copy of selectedText both count toward the bound.
  assert.throws(() => collaborationInput({ ...sample, source: '\n'.repeat(160000), contextScope: 'document' }), /300000/);
});

test('invalid or oversized scope, selection and prompt are rejected without truncation', () => {
  for (const invalid of [
    { contextScope: 'unknown' }, { selection: '', contextScope: 'selection' },
    { selection: ' ' }, { selection: 'a\0b' }, { selection: 42 },
    { selection: '字'.repeat(12001) }, { prompt: '字'.repeat(4001) },
  ]) assert.throws(() => collaborationInput({ ...sample, ...invalid }));
  assert.equal(collaborationInput({ ...sample, selection: '字'.repeat(12000) }).selection.length, 12000);
});
