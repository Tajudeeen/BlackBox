import {readFileSync} from 'node:fs';
for (const file of ['backend/.env.example', 'frontend/.env.example']) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [name, ...parts] = line.split('=');
    if (parts.join('=') !== '' && !['CLOSING_IN_SECONDS', 'POLL_INTERVAL_MS'].includes(name)) throw new Error(`Nonblank credential/configuration example: ${file} ${name}`);
  }
}
