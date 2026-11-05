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

// Secondary source: ballot progress statistics only exist in the results site API, not in the export.
const PROGRESS_SOURCE =
  'https://app.enhancedvoting.com/results/public/api/elections/Arizona/110326GeneralElection/data';
try {
  const pres = await fetch(PROGRESS_SOURCE, { headers: { 'Cache-Control': 'no-cache' } });
  if (!pres.ok) throw new Error(`Progress source returned ${pres.status}`);
  const pd = await pres.json();
  const en = (names) => (names?.find((n) => n.languageId === 'en') ?? names?.[0])?.text ?? '';
  const stat = pd.statistics?.[0];
  const groups = [...(stat?.groups ?? [])].sort((a, b) => a.order - b.order);
  const counties = new Map();
  groups.forEach((g, gi) => {
    for (const c of g.children ?? []) {
      const name = en(c.name).replace(/ County$/, '');
      if (!counties.has(name)) counties.set(name, { name, values: groups.map(() => null), updated: groups.map(() => null) });
      counties.get(name).values[gi] = c.value;
      counties.get(name).updated[gi] = c.lastUpdated;
    }
  });
  const progress = {
    source: PROGRESS_SOURCE,
    fetchedAt: new Date().toISOString(),
    asOf: pd.election?.lastUpdated ?? null,
    title: en(stat?.name),
    groups: groups.map((g) => en(g.name)),
    counties: [...counties.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
  if (!progress.groups.length) throw new Error('No ballot progress groups found');
  writeFileSync('public/data/progress.json', JSON.stringify(progress));
  meta.progressMd5 = createHash('md5').update(JSON.stringify(progress.counties)).digest('hex');
  writeFileSync('public/data/meta.json', JSON.stringify(meta, null, 2));
  console.log('progress.json written', progress.counties.length, 'counties');
} catch (e) {
  console.warn('Ballot progress unavailable:', e.message);
}
