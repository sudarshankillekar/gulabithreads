import { writeFile } from 'node:fs/promises';

// A public, real catalog snapshot lets first-time visitors browse while the API wakes.
const base = (process.env.CATALOG_SNAPSHOT_API_URL || process.env.VITE_API_BASE_URL || 'https://www.gulabitreads.com/api').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) throw new Error('CATALOG_SNAPSHOT_API_URL must be an absolute API URL');
const response = await fetch(`${base.endsWith('/api') ? base : `${base}/api`}/products`, { signal: AbortSignal.timeout(90000), cache: 'no-store' });
if (!response.ok) throw new Error(`Catalog snapshot failed: HTTP ${response.status}`);
const products = await response.json();
if (!Array.isArray(products) || !products.every(p => typeof p.slug === 'string' && typeof p.name === 'string' && typeof p.price === 'number' && typeof p.stock === 'number' && typeof p.image === 'string')) throw new Error('Invalid product catalog');
await writeFile(new URL('../src/data/catalog-snapshot.json', import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), products })}\n`);
console.log(`Refreshed public catalog snapshot: ${products.length} products`);
