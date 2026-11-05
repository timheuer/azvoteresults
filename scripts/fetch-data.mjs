// Downloads the raw export and writes public/data/export.json + meta.json.
// Used by the scheduled GitHub Action and for local development.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const SOURCE =
  'https://app.enhancedvoting.com/cdn/results/Arizona/export-110326GeneralElection.json';

const res = await fetch(SOURCE, { headers: { 'Cache-Control': 'no-cache' } });
if (!res.ok) throw new Error(`Source returned ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const text = buf.toString('utf8');
const parsed = JSON.parse(text); // fail the job rather than publish a broken file

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/export.json', buf);
const meta = {
  source: SOURCE,
  fetchedAt: new Date().toISOString(),
  sourceCreatedAt: parsed.createdAt,
  sourceLastModified: res.headers.get('last-modified'),
  md5: createHash('md5').update(buf).digest('hex'),
  size: buf.length,
};
writeFileSync('public/data/meta.json', JSON.stringify(meta, null, 2));
console.log(meta);
