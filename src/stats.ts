import { METHODS, type Contest, type OptionResult } from './types';

export const METHOD_COLORS = ['#2a9d8f', '#e9a23b', '#8e5ad7', '#d6558a', '#6b7a8f'];
export const METHOD_SHORT = ['Early', 'Election Day', 'Provisional', 'Early A.R.S. 16-579', 'Late Early'];

const PARTY_COLORS: Record<string, string> = {
  Democratic: '#1f6fd1',
  Republican: '#d6342c',
  Libertarian: '#d9a000',
  Green: '#2f9e44',
  'No Labels': '#7d5fbf',
  Independent: '#8a6d3b',
  Other: '#7f8794',
};
const NEUTRAL = '#9aa1ac';

export const YES_COLOR = '#1b9e77';
export const NO_COLOR = '#e7711b';

export function isYes(o: OptionResult): boolean {
  return /\byes\b/i.test(o.name);
}
export function isNo(o: OptionResult): boolean {
  return /\bno\b/i.test(o.name);
}

export function partyAbbr(p: string | null): string {
  switch (p) {
    case 'Democratic': return 'D';
    case 'Republican': return 'R';
    case 'Libertarian': return 'L';
    case 'Green': return 'G';
    case 'No Labels': return 'NL';
    case 'Independent': return 'I';
    case 'Other': return 'O';
    default: return '';
  }
}

export function optionColor(c: Contest, o: OptionResult): string {
  if (c.kind === 'measure') return isYes(o) ? YES_COLOR : isNo(o) ? NO_COLOR : NEUTRAL;
  return (o.party && PARTY_COLORS[o.party]) || NEUTRAL;
}

export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const total = (c: Contest) => sum(c.options.map((o) => o.votes));

export function methodTotals(opts: { methods: number[] }[]): number[] {
  return METHODS.map((_, i) => sum(opts.map((o) => o.methods[i] ?? 0)));
}

export interface Margin {
  leader: OptionResult;
  runnerUp: OptionResult | undefined;
  /** Percentage-point lead, scaled for multi-seat races. */
  points: number;
  tier: 'tied' | 'tight' | 'lean' | 'likely' | 'safe';
  label: string;
}

export const TIER_INFO: Record<Margin['tier'], string> = {
  tied: 'Tied: lead under 0.5 pts',
  tight: 'Tight: lead 0.5 to 3 pts',
  lean: 'Lean: lead 3 to 8 pts',
  likely: 'Likely: lead 8 to 15 pts',
  safe: 'Safe: lead 15+ pts',
};

export function tierOf(points: number): Margin['tier'] {
  return points < 0.5 ? 'tied' : points < 3 ? 'tight' : points < 8 ? 'lean' : points < 15 ? 'likely' : 'safe';
}

export function marginOf(c: Contest): Margin | null {
  const n = Math.max(1, c.voteFor);
  const t = total(c);
  const leader = c.options[n - 1] ?? c.options[0];
  if (!leader || t === 0) return null;
  const runnerUp = c.options[n];
  const points = runnerUp ? ((leader.votes - runnerUp.votes) / t) * 100 * n : 100;
  const tier = tierOf(points);
  const tag = c.kind === 'measure' ? leader.name.replace(/^Be retained\s*/i, '') : partyAbbr(leader.party) || leader.name.split(' ').pop();
  return { leader, runnerUp, points, tier, label: `${tag} +${points.toFixed(1)}` };
}

export const fmt = (n: number) => n.toLocaleString('en-US');
export const pct = (n: number, d: number, digits = 1) => (d > 0 ? ((n / d) * 100).toFixed(digits) + '%' : '–');

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function leaderParty(c: Contest): 'D' | 'R' | 'Other' | null {
  if (c.kind !== 'candidate') return null;
  const l = marginOf(c)?.leader;
  if (!l) return null;
  return l.party === 'Democratic' ? 'D' : l.party === 'Republican' ? 'R' : 'Other';
}
