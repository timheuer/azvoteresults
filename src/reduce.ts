import { METHODS, type Category, type Contest, type CountyResult, type Kind, type Model } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function categorize(name: string, kind: Kind): Category {
  if (/retained in office/i.test(name)) return 'Judges';
  if (/^U\.S\. Representative/i.test(name)) return 'Congress';
  if (/^State Senator/i.test(name)) return 'State Senate';
  if (/^State Representative/i.test(name)) return 'State House';
  if (/^(Governor|Secretary of State|Attorney General|State Treasurer|Superintendent|State Mine Inspector|Corporation Commissioner)/i.test(name)) return 'Statewide';
  if (kind === 'measure') return 'Propositions';
  return 'Other';
}

export function tidyName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

function methodVector(groupResults: any[] | null | undefined): number[] {
  const v = METHODS.map(() => 0);
  for (const g of groupResults ?? []) {
    const i = (METHODS as readonly string[]).indexOf(g.groupName);
    if (i >= 0) v[i] += g.voteCount ?? 0;
  }
  return v;
}

/** Reduces the 70+ MB raw export to a compact model (county level, no precincts). */
export function reduceExport(raw: any): Model {
  const contests = new Map<string, Contest>();
  for (const item of raw.results?.ballotItems ?? []) {
    const kind: Kind = item.contestType === 'BallotMeasure' ? 'measure' : 'candidate';
    const name = tidyName(item.name);
    contests.set(item.id, {
      id: item.id,
      name,
      category: categorize(name, kind),
      kind,
      voteFor: item.voteFor ?? 1,
      options: (item.ballotOptions ?? [])
        .slice()
        .sort((a: any, b: any) => b.voteCount - a.voteCount || a.ballotOrder - b.ballotOrder)
        .map((o: any) => ({
          id: String(o.id),
          name: tidyName(o.name),
          party: o.politicalParty ?? null,
          votes: o.voteCount ?? 0,
          methods: methodVector(o.groupResults),
        })),
      counties: [],
    });
  }

  for (const county of raw.localResults ?? []) {
    for (const item of county.ballotItems ?? []) {
      const c = contests.get(item.id);
      if (!c) continue;
      const cr: CountyResult = {
        name: String(county.name).replace(/ County$/, ''),
        precinctsReporting: item.precinctsReporting ?? null,
        precinctsParticipating: item.precinctsParticipating ?? null,
        options: {},
      };
      for (const o of item.ballotOptions ?? []) {
        cr.options[String(o.id)] = { votes: o.voteCount ?? 0, methods: methodVector(o.groupResults) };
      }
      c.counties.push(cr);
    }
  }
  for (const c of contests.values()) c.counties.sort((a, b) => a.name.localeCompare(b.name));

  return {
    electionName: raw.electionName ?? 'Election',
    electionDate: raw.electionDate ?? '',
    sourceCreatedAt: raw.createdAt ?? '',
    methodStatuses: (raw.results?.reportingStatuses ?? []).map((s: any) => ({ name: s.groupName, status: s.status })),
    contests: [...contests.values()],
  };
}
