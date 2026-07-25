import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const buildId = 'rfx-current-static-2026-07-25-1';

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyFile(join(root, 'index.html'), join(dist, 'index.html'));
await copyFile(join(root, '404.html'), join(dist, '404.html'));
await writeFile(join(dist, '.nojekyll'), '');
await writeFile(
  join(dist, 'CURRENT_BUILD.json'),
  `${JSON.stringify({ buildId, deploymentMode: 'static-root-and-actions' }, null, 2)}\n`,
);

console.log(`Built RFxchange static Pages artifact: ${buildId}`);
