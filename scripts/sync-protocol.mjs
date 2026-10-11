import {readFileSync, writeFileSync} from 'node:fs';
for (const destination of ['backend/src/generated', 'frontend/src/lib/generated']) {
  for (const name of ['protocol.mjs', 'protocol.d.mts']) {
    const source = readFileSync(`shared/${name}`, 'utf8');
    const path = `${destination}/${name}`;
    if (process.argv.includes('--check')) {
      if (readFileSync(path, 'utf8') !== source) throw new Error(`Stale generated file: ${path}`);
    } else writeFileSync(path, source);
  }
}
