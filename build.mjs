import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'dist');
await mkdir(output, { recursive: true });
// Only ship public, reviewed assets. Worker sources, secrets and backups stay local.
for (const file of ['index.html', 'styles.css', 'app.js', 'assets']) {
  await cp(path.join(root, file), path.join(output, file), { recursive: true });
}
for (const dir of ['modules']) {
  try { await access(path.join(root, dir)); }
  catch { continue; }
  await cp(path.join(root, dir), path.join(output, dir), { recursive: true });
}
console.log('Public frontend copied to dist. No Worker files or secrets included.');
