import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/catalogCache.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { isCatalog, readCatalogCache, writeCatalogCache } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const snapshot = JSON.parse(readFileSync(new URL('../src/data/catalog-snapshot.json', import.meta.url), 'utf8'));
let stored = null;
globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };

test('first visit has real products immediately without any network request', () => {
  stored = null;
  assert.equal(isCatalog(snapshot.products), true);
  assert.deepEqual(readCatalogCache('/api', snapshot.products, Date.parse(snapshot.generatedAt)), snapshot.products);
});

test('a newer saved catalog supersedes the deployed snapshot', () => {
  writeCatalogCache('/api', [snapshot.products[0]]);
  assert.deepEqual(readCatalogCache('/api', snapshot.products, 0), [snapshot.products[0]]);
});

test('a successfully fetched empty catalog does not resurrect old products', () => {
  writeCatalogCache('/api', []);
  assert.deepEqual(readCatalogCache('/api', snapshot.products, 0), []);
});

test('expired, future, wrong-backend and pre-deployment caches are ignored', () => {
  for (const [scope, savedAt, snapshotTime] of [
    ['/api', Date.now() - 86400001, 0],
    ['/api', Date.now() + 60000, 0],
    ['https://other.example/api', Date.now(), 0],
    ['/api', Date.now() - 10000, Date.now()],
  ]) {
    stored = JSON.stringify({ scope, savedAt, products: [], });
    assert.deepEqual(readCatalogCache('/api', snapshot.products, snapshotTime), snapshot.products);
  }
});

test('corrupt and malformed caches fall back safely', () => {
  for (const value of ['broken json', JSON.stringify({ scope: '/api', savedAt: Date.now(), products: [{}] })]) {
    stored = value;
    assert.deepEqual(readCatalogCache('/api', snapshot.products, 0), snapshot.products);
  }
});

test('blocked storage never prevents browsing', () => {
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(readCatalogCache('/api', snapshot.products, 0), snapshot.products);
  assert.doesNotThrow(() => writeCatalogCache('/api', snapshot.products));
});
