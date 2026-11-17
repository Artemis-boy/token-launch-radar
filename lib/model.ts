// Token Radar's model, version radar-2: one sealed snapshot in, one ranked board out.
//
// The board ranks pre-token protocols by what a launch would be worth if the
// protocol's record stayed as it is. The value is a model, never a promise,
// and it is computed from the snapshot's own market, not from a list of names:
//
//   multiple   = the category's market multiple, derived below
//   growth     = clamp(change_7d, -50, 100) per cent
//   growthMult = 1 + (growth / 100) x 0.6
//   maturity   = 0.7 + min(age_days, 1095) / 1095 x 0.5   (age unknown: 365)
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// The category multiple is the market's own answer to "what is a protocol of
// this kind worth per dollar of TVL". For every category, take the live-token
// protocols in the snapshot that carry both a market cap and a TVL, and take
// the median of mcap_usd / tvl_usd. A category needs at least three such
// protocols before its own median counts; a thinner one uses the market-wide
// median, and a counted median is pulled toward it (five protocols' worth of
// prior). The multiple is kept inside [0.03, 1.5] so one outlier cannot set
// the price. The dashboard shows the table the model used, with each
// category's sample count, so a reader can see where every number came from.
//
// A protocol is pre-token when its record carries no market cap, no CoinGecko
// id and no symbol. The board covers the snapshot's whole watchlist (the
// floor, never the ceiling) and adds the strongest pre-token protocols below
// the floor, by TVL. Wrapped, staked and bridged products of tokens that
// already trade are never ranked: they are not launches waiting to happen.
// Live-token protocols are kept apart and shown with their market caps, never
// mixed into the ranking.

/** One protocol entry: exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** Pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** Live-token protocols the dashboard's Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

/** A category needs this many live protocols before its own median counts. */
const MIN_CATEGORY_SAMPLES = 3;

/** Prior weight, in protocols, pulling a thin category toward the global median. */
const SHRINK_K = 5;

/** The category multiple is kept inside this band. */
const MULTIPLE_MIN = 0.03;
const MULTIPLE_MAX = 1.5;

/** Growth is clamped to this band before it moves the value. */
const GROWTH_FLOOR = -50;
const GROWTH_CAP = 100;
const GROWTH_WEIGHT = 0.6;

/** Maturity: a protocol that has run longer with no token is worth more. */
const MATURITY_FLOOR = 0.7;
const MATURITY_RANGE = 0.5;
const MATURITY_DAYS = 1095;
const UNKNOWN_AGE_DAYS = 365;

const DAY_MS = 86_400_000;

/** One category's market multiple, as the dashboard shows it. */
export interface CategoryMultiple {
  category: string;
  samples: number;
  median: number | null;
  multiple: number;
}

/** The market the model was derived from. */
export interface MarketDerivation {
  global_median: number;
  global_samples: number;
  categories: CategoryMultiple[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_samples: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One board row as the dashboard's data.js carries it, steps included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  category_samples: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The model's constants, as the dashboard states them and the page recomputes with them. */
export interface ModelConstants {
  min_category_samples: number;
  shrink_k: number;
  multiple_min: number;
  multiple_max: number;
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  min_category_samples: MIN_CATEGORY_SAMPLES,
  shrink_k: SHRINK_K,
  multiple_min: MULTIPLE_MIN,
  multiple_max: MULTIPLE_MAX,
  growth_floor: GROWTH_FLOOR,
  growth_cap: GROWTH_CAP,
  growth_weight: GROWTH_WEIGHT,
  maturity_floor: MATURITY_FLOOR,
  maturity_range: MATURITY_RANGE,
  maturity_days: MATURITY_DAYS,
  unknown_age_days: UNKNOWN_AGE_DAYS,
};

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  derivation: MarketDerivation;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The market multiples, derived from the snapshot's live-token protocols.
 * Every category present in the snapshot gets a row. A category needs at
 * least three live protocols carrying a market cap before its own median
 * counts; a thinner category uses the market-wide median, so one outlier
 * cannot set the price. A counted median is pulled toward the global median
 * (five protocols' worth of prior) and kept inside [0.03, 1.5].
 */
export function deriveMultiples(protocols: SnapshotProtocol[]): MarketDerivation {
  const live = protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.25;
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  const categories = new Set(protocols.map((p) => p.category ?? 'Other'));
  const table: CategoryMultiple[] = [...categories].sort().map((category) => {
    const samples = byCategory.get(category) ?? [];
    const catMedian = samples.length > 0 ? median(samples) : null;
    const raw = samples.length < MIN_CATEGORY_SAMPLES || catMedian === null
      ? globalMedian
      : (samples.length * catMedian + SHRINK_K * globalMedian) / (samples.length + SHRINK_K);
    const multiple = Math.min(MULTIPLE_MAX, Math.max(MULTIPLE_MIN, raw));
    return { category, samples: samples.length, median: catMedian === null ? null : round4(catMedian), multiple: round4(multiple) };
  });
  return { global_median: round4(globalMedian), global_samples: ratios.length, categories: table };
}

/** The multiple for one protocol's category, from the derived table. */
function multipleFor(p: SnapshotProtocol, derivation: MarketDerivation): { multiple: number; samples: number } {
  const row = derivation.categories.find((c) => c.category === (p.category ?? 'Other'));
  if (row !== undefined) return { multiple: row.multiple, samples: row.samples };
  return { multiple: Math.min(MULTIPLE_MAX, Math.max(MULTIPLE_MIN, derivation.global_median)), samples: 0 };
}

/** The multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  derivation: MarketDerivation,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; multiple: number; samples: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, samples } = multipleFor(protocol, derivation);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * GROWTH_WEIGHT;
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_FLOOR + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, multiple, samples, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is another protocol's pool. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped, staked or staking product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name is that exchange's product. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Categories that are bridges, staking products or exchanges, never launches of their own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_START.test(p.name)) return false;
  return true;
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const derivation = deriveMultiples(snapshot.protocols);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is ranked.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the floor, by TVL.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, derivation);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.multiple,
      category_samples: s.samples,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction typically costs on a chain, in dollars. */
function gasFor(chain: string): number {
  const table: Record<string, number> = {
    Ethereum: 8,
    Solana: 0.05,
    Base: 0.3,
    Arbitrum: 0.4,
    'BNB Chain': 0.3,
    Polygon: 0.1,
    Avalanche: 0.5,
    Optimism: 0.3,
    Gnosis: 0.1,
    Linea: 0.2,
    Scroll: 0.2,
    zkSync: 0.3,
    Starknet: 0.5,
    Sui: 0.05,
    Aptos: 0.05,
    Near: 0.05,
    Tron: 0.5,
    Fantom: 0.1,
  };
  return table[chain] ?? 1;
}

/** Gas as a readable amount: cents under a dollar, dollars above it. */
function gasText(chain: string): string {
  const g = gasFor(chain);
  return g < 1 ? `${Math.round(g * 100)} cents` : `$${g}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the loan open.`;
  if (c.includes('dex') || c.includes('amm') || c.includes('liquidity')) return `Add $${capital} of liquidity to the busiest pool on ${name} (${chain}) and leave it in.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged farm')) return `Deposit $${capital} into the highest-yield vault on ${name} (${chain}) and leave it compounding.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds inside its app.`;
  if (c.includes('stak') || c.includes('restak')) return `Stake $${capital} of the chain asset through ${name} and hold on to the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund your account with $${capital} on ${name} and take one small market position.`;
  if (c.includes('launchpad')) return `Commit $${capital} to the next sale on ${name} and complete every task its page lists.`;
  if (c.includes('rwa')) return `Buy $${capital} of the yield-bearing asset ${name} issues on ${chain} and hold it.`;
  if (c.includes('stable')) return `Mint or hold $${capital} of the stable asset ${name} issues on ${chain}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the shares.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('synthetic') || c.includes('synthetics')) return `Mint $${capital} of the synthetic asset on ${name} (${chain}) and hold it.`;
  if (c.includes('payment') || c.includes('card')) return `Spend $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('ai') || c.includes('agent')) return `Run $${capital} of usage through ${name} on ${chain} and keep the account active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasText(chain);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline.`,
      cost: `about ${gas} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week on ${p.name}, such as a deposit, a swap, a borrow or a vote.`,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so the activity lands in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `When a claim opens, open the points page from the protocol's own site or docs and claim only there.`,
      cost: 'no fee to check, and never pay anyone to claim for you',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live tab. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's form for data.js, with the farm plan carried along. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: watchlist.has(row.slug),
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_samples: row.model.category_samples,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const derivation = deriveMultiples(snapshot.protocols);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: MODEL,
    derivation,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
