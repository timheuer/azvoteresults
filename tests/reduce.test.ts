import { describe, expect, it } from 'vitest';
import { categorize, reduceExport } from '../src/reduce';
import { marginOf } from '../src/stats';

const grp = (a: number, b: number) => [
  { groupName: 'Early Voting', voteCount: a },
  { groupName: 'Election Day', voteCount: b },
];

describe('reduceExport', () => {
  const raw = {
    electionName: 'T',
    createdAt: '2026-11-05T00:00:00Z',
    results: {
      reportingStatuses: [{ groupName: 'Early Voting', status: 'Reported' }],
      ballotItems: [
        {
          id: 'AZ-1', name: 'State  Senator - District No.  1', contestType: 'Candidate', voteFor: 1,
          ballotOptions: [
            { id: '1', name: 'A', ballotOrder: 1, voteCount: 10, politicalParty: 'Republican', groupResults: grp(6, 4) },
            { id: '2', name: 'B', ballotOrder: 2, voteCount: 30, politicalParty: 'Democratic', groupResults: grp(10, 20) },
          ],
        },
      ],
    },
    localResults: [
      {
        name: 'Pima County',
        ballotItems: [
          {
            id: 'AZ-1', precinctsReporting: 2, precinctsParticipating: 4,
            ballotOptions: [{ id: '2', voteCount: 5, groupResults: grp(1, 4), precinctResults: [{}] }],
          },
        ],
      },
    ],
  };

  it('sorts options, normalizes names, vectors by method and nests counties', () => {
    const m = reduceExport(raw);
    const c = m.contests[0];
    expect(c.name).toBe('State Senator - District No. 1');
    expect(c.category).toBe('State Senate');
    expect(c.options.map((o) => o.name)).toEqual(['B', 'A']);
    expect(c.options[0].methods).toEqual([10, 20, 0, 0, 0]);
    expect(c.counties[0]).toMatchObject({ name: 'Pima', precinctsReporting: 2 });
    expect(c.counties[0].options['2'].votes).toBe(5);
  });

  it('computes margin', () => {
    const mg = marginOf(reduceExport(raw).contests[0])!;
    expect(mg.points).toBeCloseTo(50);
    expect(mg.label).toBe('D +50.0');
  });

  it('categorizes judges and props', () => {
    expect(categorize('Shall Judge X be retained in office?', 'measure')).toBe('Judges');
    expect(categorize('PROPOSITION 141', 'measure')).toBe('Propositions');
  });
});
