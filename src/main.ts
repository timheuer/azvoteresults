import './style.css';
import { loadStored, refresh, REFRESH_MS } from './data';
import {
  METHOD_COLORS, METHOD_SHORT, TIER_INFO, esc, fmt, isNo, isYes, leaderParty, marginOf, methodTotals,
  optionColor, partyAbbr, pct, sum, tierOf, total,
} from './stats';
import { METHODS, type Category, type Contest, type CountyResult, type Stored } from './types';

const CATEGORIES: Category[] = ['Statewide', 'Congress', 'Propositions', 'Judges', 'State Senate', 'State House', 'Other'];

const app = document.getElementById('app')!;
let stored: Stored | null = null;
let busy = false;
let progressMb = 0;
let error = '';
const filters = { q: '', cat: 'All' as Category | 'All', close: false, party: 'All' as 'All' | 'D' | 'R' | 'Other' };

app.innerHTML = `
  <header class="top">
    <div class="title">
      <h1>Arizona Election Results</h1>
      <div id="sub" class="sub"></div>
    </div>
    <div class="actions">
      <span id="status" class="status" role="status" aria-live="polite"></span>
      <button id="refresh" type="button">Refresh now</button>
    </div>
  </header>
  <main id="view"></main>
  <footer class="foot">Source: Arizona Secretary of State / Enhanced Voting <a href="https://app.enhancedvoting.com/cdn/results/Arizona/export-110326GeneralElection.json" target="_blank" rel="noopener">raw data export</a>. Unofficial results; not affiliated with the state.</footer>`;
const view = document.getElementById('view')!;
const refreshBtn = document.getElementById('refresh') as HTMLButtonElement;

/* ---------- reusable bits ---------- */

function stacked(values: number[], colors: string[], labels: string[], cls = ''): string {
  const t = sum(values);
  if (t <= 0) return `<div class="stack empty ${cls}"></div>`;
  return `<div class="stack ${cls}" role="img" aria-label="${esc(labels.map((l, i) => `${l} ${pct(values[i], t)}`).join(', '))}">${values
    .map((v, i) =>
      v > 0
        ? `<span style="width:${(v / t) * 100}%;background:${colors[i]}" title="${esc(labels[i])}: ${fmt(v)} (${pct(v, t)})"></span>`
        : '',
    )
    .join('')}</div>`;
}

function methodLegend(totals?: number[]): string {
  const t = totals ? sum(totals) : 0;
  return `<ul class="legend">${METHODS.map(
    (m, i) =>
      `<li><i style="background:${METHOD_COLORS[i]}"></i>${esc(METHOD_SHORT[i])}${totals ? ` <b>${fmt(totals[i])}</b> <small>${pct(totals[i], t)}</small>` : ''}</li>`,
  ).join('')}</ul>`;
}

function badge(c: Contest): string {
  const m = marginOf(c);
  if (!m) return '<span class="badge none">No votes</span>';
  const color = optionColor(c, m.leader);
  return `<span class="badge tier-${m.tier}" style="--c:${color}" title="${esc(TIER_INFO[m.tier])} (${m.points.toFixed(2)} pts over ${esc(m.runnerUp?.name ?? 'no one')})">${esc(m.label)}</span>`;
}

function optionName(o: { name: string; party: string | null }): string {
  const a = partyAbbr(o.party);
  return `${esc(o.name)}${a ? ` <span class="party">(${a})</span>` : ''}`;
}

/* ---------- home ---------- */

function matches(c: Contest): boolean {
  if (filters.cat !== 'All' && c.category !== filters.cat) return false;
  if (filters.q) {
    const hay = (c.name + ' ' + c.options.map((o) => o.name).join(' ')).toLowerCase();
    if (!filters.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (filters.close) {
    const m = marginOf(c);
    if (!m || m.points >= 3) return false;
  }
  if (filters.party !== 'All' && leaderParty(c) !== filters.party) return false;
  return true;
}

function card(c: Contest): string {
  const t = total(c);
  const top = c.options.slice(0, c.kind === 'measure' ? 2 : 3);
  const mt = methodTotals(c.options);
  return `<a class="card" href="#/c/${encodeURIComponent(c.id)}">
    <div class="card-h"><h3>${esc(c.name)}</h3>${badge(c)}</div>
    <ul class="opts">${top
      .map(
        (o) => `<li><span class="nm">${optionName(o)}</span><span class="bar"><i style="width:${t ? (o.votes / t) * 100 : 0}%;background:${optionColor(c, o)}"></i></span><span class="pc">${pct(o.votes, t)}</span></li>`,
      )
      .join('')}</ul>
    ${c.options.length > top.length ? `<div class="more">+${c.options.length - top.length} more</div>` : ''}
    ${stacked(mt, METHOD_COLORS, [...METHOD_SHORT], 'thin')}
    <div class="card-f">${fmt(t)} votes</div>
  </a>`;
}

function tallies(): string {
  const cands = stored!.model.contests.filter((c) => c.kind === 'candidate' && c.category !== 'Other');
  const n = (p: string) => cands.filter((c) => leaderParty(c) === p).length;
  return `<div class="tally"><span style="--c:#1f6fd1">Democrats leading <b>${n('D')}</b></span><span style="--c:#d6342c">Republicans leading <b>${n('R')}</b></span><span style="--c:#7f8794">Other <b>${n('Other')}</b></span><span class="muted">of ${cands.length} candidate contests</span></div>`;
}

const collapsed = new Set<string>();
const secId = (cat: string) => 'sec-' + cat.replace(/\s+/g, '-');

function renderList(): void {
  const el = document.getElementById('list');
  const jump = document.getElementById('jump');
  if (!el || !stored) return;
  const all = stored.model.contests.filter(matches);
  const groups = CATEGORIES.map((cat) => ({ cat, cs: all.filter((c) => c.category === cat) })).filter((g) => g.cs.length);
  if (jump) {
    jump.innerHTML = groups.length > 1
      ? `<span class="muted">Jump to:</span>${groups.map((g) => `<button type="button" class="chip" data-jump="${g.cat}">${g.cat} <small>${g.cs.length}</small></button>`).join('')}<span class="spacer"></span><button type="button" class="link" data-all="open">Expand all</button><button type="button" class="link" data-all="close">Collapse all</button>`
      : '';
  }
  if (!groups.length) {
    el.innerHTML = '<p class="muted">No contests match your filters.</p>';
    return;
  }
  el.innerHTML = groups
    .map(({ cat, cs }) => `<details class="sec" id="${secId(cat)}" data-cat="${cat}"${collapsed.has(cat) ? '' : ' open'}><summary><h2>${cat} <small>${cs.length}</small></h2></summary><div class="grid">${cs.map(card).join('')}</div></details>`)
    .join('');
  el.querySelectorAll<HTMLDetailsElement>('details.sec').forEach((d) => {
    d.ontoggle = () => { if (d.open) collapsed.delete(d.dataset.cat!); else collapsed.add(d.dataset.cat!); };
  });
}

function onJumpClick(e: Event): void {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-jump],[data-all]');
  if (!t) return;
  if (t.dataset.all) {
    document.querySelectorAll<HTMLDetailsElement>('details.sec').forEach((d) => { d.open = t.dataset.all === 'open'; });
    return;
  }
  const d = document.getElementById(secId(t.dataset.jump!)) as HTMLDetailsElement | null;
  if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

function renderHome(): void {
  if (!stored) return;
  view.innerHTML = `
    ${tallies()}
    <div class="legend-row"><span class="muted">Vote method:</span>${methodLegend()}</div>
    <div class="filters">
      <input id="q" type="search" placeholder="Search contests or candidates…" value="${esc(filters.q)}" aria-label="Search" />
      <select id="cat" aria-label="Category"><option>All</option>${CATEGORIES.map((c) => `<option${filters.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select>
      <select id="party" aria-label="Leading party">${(['All', 'D', 'R', 'Other'] as const).map((p) => `<option value="${p}"${filters.party === p ? ' selected' : ''}>${p === 'All' ? 'Any leader' : p === 'D' ? 'Democrat leading' : p === 'R' ? 'Republican leading' : 'Other leading'}</option>`).join('')}</select>
      <label class="chk"><input id="close" type="checkbox"${filters.close ? ' checked' : ''}/> Close (&lt; 3 pts)</label>
    </div>
    <div id="jump" class="jump"></div>
    <div id="list"></div>`;
  document.getElementById('jump')!.onclick = onJumpClick;
  (document.getElementById('q') as HTMLInputElement).oninput = (e) => { filters.q = (e.target as HTMLInputElement).value; renderList(); };
  (document.getElementById('cat') as HTMLSelectElement).onchange = (e) => { filters.cat = (e.target as HTMLSelectElement).value as Category | 'All'; renderList(); };
  (document.getElementById('party') as HTMLSelectElement).onchange = (e) => { filters.party = (e.target as HTMLSelectElement).value as typeof filters.party; renderList(); };
  (document.getElementById('close') as HTMLInputElement).onchange = (e) => { filters.close = (e.target as HTMLInputElement).checked; renderList(); };
  renderList();
}

/* ---------- detail ---------- */

function methodMatrix(c: Contest): string {
  const mt = methodTotals(c.options);
  const rows = c.options.map((o) => ({ o, shares: o.methods.map((v, i) => (mt[i] ? v / mt[i] : 0)) }));
  const best = METHODS.map((_, i) => Math.max(...rows.map((r) => r.shares[i])));
  return `<div class="scroll"><table class="matrix">
    <thead><tr><th>Share of each method's votes</th>${METHODS.map((_, i) => `<th><i class="dot" style="background:${METHOD_COLORS[i]}"></i>${esc(METHOD_SHORT[i])}</th>`).join('')}<th>All</th></tr></thead>
    <tbody>${rows
      .map(({ o, shares }) => `<tr><th>${optionName(o)}</th>${shares
        .map((s, i) => `<td class="${mt[i] && s === best[i] ? 'lead' : ''}" style="--c:${optionColor(c, o)}">${mt[i] ? (s * 100).toFixed(1) + '%' : '–'}</td>`)
        .join('')}<td>${pct(o.votes, total(c))}</td></tr>`)
      .join('')}</tbody>
    <tfoot><tr><th>Votes counted</th>${mt.map((v) => `<td>${fmt(v)}</td>`).join('')}<td>${fmt(total(c))}</td></tr></tfoot>
  </table></div>`;
}

function reporting(cr: CountyResult): string {
  if (!cr.precinctsParticipating) return '–';
  const p = (cr.precinctsReporting ?? 0) / cr.precinctsParticipating;
  return `<span class="rep" title="${cr.precinctsReporting}/${cr.precinctsParticipating} precincts reporting"><i style="width:${p * 100}%"></i></span> ${Math.round(p * 100)}%`;
}

function countyTable(c: Contest): string {
  if (!c.counties.length) return '';
  const rows = c.counties.map((cr) => {
    const vals = c.options.map((o) => cr.options[o.id]?.votes ?? 0);
    const t = sum(vals);
    const order = vals.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const n = Math.max(1, c.voteFor);
    const lead = order[n - 1];
    const next = order[n];
    const o = c.options[lead.i];
    const pts = t ? ((lead.v - (next?.v ?? 0)) / t) * 100 * n : 0;
    const tag = c.kind === 'measure' ? o.name.replace(/^Be retained\s*/i, '') : partyAbbr(o.party) || o.name;
    return `<tr><th>${esc(cr.name)}</th>
      <td>${stacked(vals, c.options.map((x) => optionColor(c, x)), c.options.map((x) => x.name), 'thin')}</td>
      <td><span class="badge tier-${tierOf(pts)}" style="--c:${optionColor(c, o)}" title="${t ? esc(TIER_INFO[tierOf(pts)]) : ''}">${t ? esc(tag) + ' +' + pts.toFixed(1) : '–'}</span></td>
      <td class="num">${fmt(t)}</td><td class="nowrap">${reporting(cr)}</td></tr>`;
  });
  return `<h2>By county</h2><div class="scroll"><table class="counties"><thead><tr><th>County</th><th>Vote split</th><th>Lead</th><th class="num">Votes</th><th>Precincts</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function renderDetail(id: string): void {
  const c = stored?.model.contests.find((x) => x.id === id);
  if (!c) { view.innerHTML = '<p><a href="#/">← All contests</a></p><p>Contest not found.</p>'; return; }
  const t = total(c);
  const mt = methodTotals(c.options);
  let note = '';
  if (c.kind === 'measure') {
    const yes = c.options.find(isYes), no = c.options.find(isNo);
    if (yes && no && t) note = `<p class="note">${yes.votes > no.votes ? 'YES' : 'NO'} currently leads (${pct(Math.max(yes.votes, no.votes), yes.votes + no.votes)}). Results are unofficial and incomplete until certified.</p>`;
  } else if (c.voteFor > 1) {
    note = `<p class="note">Vote for ${c.voteFor}. Shares are of all votes cast for candidates.</p>`;
  }
  view.innerHTML = `
    <p><a href="#/">← All contests</a></p>
    <div class="detail-h"><div><span class="cat">${c.category}</span><h2 class="big">${esc(c.name)}</h2></div>${badge(c)}</div>
    ${note}
    <ul class="opts big">${c.options
      .map((o) => `<li><span class="nm">${optionName(o)}</span><span class="bar"><i style="width:${t ? (o.votes / t) * 100 : 0}%;background:${optionColor(c, o)}"></i></span><span class="pc">${pct(o.votes, t)}</span><span class="vt">${fmt(o.votes)}</span></li>`)
      .join('')}</ul>
    <h2>How people voted</h2>
    ${stacked(mt, METHOD_COLORS, [...METHOD_SHORT])}
    ${methodLegend(mt)}
    <h3>Each candidate's vote by method</h3>
    <div class="rows">${c.options
      .map((o) => `<div class="row"><span class="nm">${optionName(o)}</span>${stacked(o.methods, METHOD_COLORS, [...METHOD_SHORT])}<span class="vt">${fmt(o.votes)}</span></div>`)
      .join('')}</div>
    <h3>Who won each method</h3>
    ${methodMatrix(c)}
    ${countyTable(c)}`;
  window.scrollTo(0, 0);
}

/* ---------- shell, routing, refresh ---------- */

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

function renderStatus(): void {
  const sub = document.getElementById('sub')!;
  const st = document.getElementById('status')!;
  if (stored) {
    const m = stored.model;
    const asOf = m.sourceCreatedAt ? new Date(m.sourceCreatedAt).toLocaleString() : 'unknown';
    sub.textContent = `${m.electionName} · results as of ${asOf}`;
    st.textContent = busy
      ? `Updating… ${progressMb.toFixed(1)} MB`
      : error
        ? `Update failed: ${error} (showing saved data)`
        : `Checked ${ago(stored.lastChecked)}`;
  } else {
    sub.textContent = '';
    st.textContent = busy ? `Loading… ${progressMb.toFixed(1)} MB` : error;
  }
  st.classList.toggle('err', !!error && !busy);
  refreshBtn.disabled = busy;
}

function route(): void {
  if (!stored) { view.innerHTML = busy ? '<p class="muted">Loading results…</p>' : `<p>${esc(error || 'No data yet.')}</p>`; return; }
  const m = location.hash.match(/^#\/c\/(.+)$/);
  if (m) renderDetail(decodeURIComponent(m[1]));
  else renderHome();
}

async function doRefresh(force: boolean): Promise<void> {
  if (busy) return;
  busy = true; error = ''; progressMb = 0;
  renderStatus();
  const hadData = !!stored;
  try {
    stored = await refresh(stored, force, (n) => { progressMb = n / 1048576; renderStatus(); });
  } catch (e) {
    error = (e as Error).message;
  }
  busy = false;
  renderStatus();
  const dataChanged = !hadData || !error;
  if (dataChanged && !document.activeElement?.matches('#q')) route();
}

refreshBtn.onclick = () => void doRefresh(true);
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeRefresh(); });
setInterval(() => { renderStatus(); maybeRefresh(); }, 60_000);

function maybeRefresh(): void {
  if (!busy && (!stored || Date.now() - new Date(stored.lastChecked).getTime() >= REFRESH_MS)) void doRefresh(false);
}

(async () => {
  stored = await loadStored();
  renderStatus();
  route();
  maybeRefresh();
})();
