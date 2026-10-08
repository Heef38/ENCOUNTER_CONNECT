/**
 * Lets `node --test` import app modules the way the app does: the `@/`
 * alias from tsconfig.json, and extensionless relative imports of .ts
 * files. Type-only imports are erased by Node's type stripping and never
 * reach this hook.
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CANDIDATES = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

function firstFile(base) {
  for (const suffix of CANDIDATES) {
    const p = base + suffix;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const hit = firstFile(path.join(ROOT, specifier.slice(2)));
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const hit = firstFile(path.resolve(parentDir, specifier));
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }
  return nextResolve(specifier, context);
}
