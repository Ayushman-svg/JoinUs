import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    const filePath = fileURLToPath(url);
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const transformed = await transformWithOxc(raw, filePath, {
      jsx: { runtime: 'automatic' },
    });
    return {
      format: 'module',
      shortCircuit: true,
      source: transformed.code,
    };
  }
  return nextLoad(url, context);
}
