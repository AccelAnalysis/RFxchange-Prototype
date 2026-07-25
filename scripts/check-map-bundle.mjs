import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url);
const forbidden = ['maplibre-gl-worker.mjs'];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const rootPath = DIST.pathname;
try {
  await stat(rootPath);
} catch {
  throw new Error('dist/ does not exist. Run npm run build first.');
}

const files = await walk(rootPath);
for (const file of files) {
  if (!/\.(?:js|mjs|html|css)$/i.test(file)) continue;
  const text = await readFile(file, 'utf8');
  for (const token of forbidden) {
    if (text.includes(token)) {
      throw new Error(`Pages bundle still references ${token} in ${file}`);
    }
  }
}

console.log('Map bundle check passed: no external maplibre-gl-worker.mjs reference found.');
