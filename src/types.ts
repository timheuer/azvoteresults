export interface MethodVotes {
  /** Votes indexed by METHODS order. */
  m: number[];
}

export interface OptionResult {
  id: string;
  name: string;
  party: string | null;
  votes: number;
  methods: number[];
}

export interface CountyOption {
  votes: number;
  methods: number[];
}

export interface CountyResult {
  name: string;
  precinctsReporting: number | null;
  precinctsParticipating: number | null;
  options: Record<string, CountyOption>;
}

export type Category = 'Congress' | 'Statewide' | 'State Senate' | 'State House' | 'Judges' | 'Propositions' | 'Other';
export type Kind = 'candidate' | 'measure';

export interface Contest {
  id: string;
  name: string;
  category: Category;
  kind: Kind;
  voteFor: number;
  options: OptionResult[];
  counties: CountyResult[];
}

export interface Model {
  electionName: string;
  electionDate: string;
  sourceCreatedAt: string;
  methodStatuses: { name: string; status: string }[];
  contests: Contest[];
}

export interface Meta {
  fetchedAt: string;
  sourceCreatedAt: string;
  md5: string;
  size: number;
}

export interface Stored {
  model: Model;
  md5: string | null;
  lastChecked: string;
  fetchedAt: string;
}

export const METHODS = [
  'Early Voting',
  'Election Day',
  'Provisional',
  'Early A.R.S. 16-579',
  'Late Early*',
] as const;
