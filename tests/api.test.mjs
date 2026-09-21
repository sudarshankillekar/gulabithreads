import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual TypeScript client without requiring Vite or a live backend.
const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8')
  .replace('import.meta.env.VITE_API_BASE_URL', 'undefined');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { apiRequest } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
globalThis.localStorage = globalThis.sessionStorage = { getItem: () => null };
const json = (value) => new Response(JSON.stringify(value), { status: 200 });

test('recovers from a temporary server failure without a refresh', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? new Response('Starting', { status: 503 }) : json([{ slug: 'bag' }]);
  assert.deepEqual(await apiRequest('/products', undefined, { retries: 3 }), [{ slug: 'bag' }]);
  assert.equal(calls, 2);
});

test('recovers from a network failure', async () => {
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError('Failed to fetch'); return json([]); };
  assert.deepEqual(await apiRequest('/products', undefined, { retries: 1 }), []);
  assert.equal(calls, 2);
});

test('stops after the retry budget and reports failure', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('Unavailable', { status: 502 }); };
  await assert.rejects(apiRequest('/products', undefined, { retries: 1 }), /Unavailable/);
  assert.equal(calls, 2);
});

test('does not retry permanent client errors or mutations', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('Missing', { status: 404 }); };
  await assert.rejects(apiRequest('/products', undefined, { retries: 3 }), /Missing/);
  assert.equal(calls, 1);
  calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('Network error'); };
  await assert.rejects(apiRequest('/orders', { method: 'POST', body: '{}' }, { retries: 3 }), /Network error/);
  assert.equal(calls, 1);
});

test('times out a stalled read and retries it', async () => {
  let calls = 0;
  globalThis.fetch = async (_url, { signal }) => {
    if (++calls > 1) return json([]);
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true }));
  };
  assert.deepEqual(await apiRequest('/products', undefined, { timeoutMs: 10, retries: 1 }), []);
  assert.equal(calls, 2);
});

test('cancellation during backoff prevents another request', async () => {
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('Starting', { status: 503 }); };
  const request = apiRequest('/products', { signal: controller.signal }, { retries: 3 });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('preserves custom headers and avoids unnecessary JSON headers on GET', async () => {
  globalThis.fetch = async (_url, { headers }) => {
    assert.equal(headers.has('Content-Type'), false);
    assert.equal(headers.get('X-Test'), 'yes');
    return json([]);
  };
  await apiRequest('/products', { headers: { 'X-Test': 'yes' } });
  globalThis.fetch = async (_url, { headers }) => {
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(headers.get('X-Test'), 'yes');
    return json({});
  };
  await apiRequest('/orders', { method: 'POST', body: '{}', headers: { 'X-Test': 'yes' } });
});
