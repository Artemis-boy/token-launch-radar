// Token Radar's model, version radar-4: one sealed snapshot in, one ranked board out.
//
// The board ranks pre-token protocols by what a launch would be worth if the
// protocol's record stayed as it is. The value is a model, never a promise,
// and it is fitted to the snapshot's own market, not to a list of names:
//
//   log10(mcap) = a + b * log10(TVL / 1e8)          (OLS on the fit set)
//   implied     = 10^(a + b*log10(TVL/1e8) + familyLog) x growth x maturity
//
// The fit set is the snapshot's traded protocols (market cap and TVL both
// above zero) with bridges and exchanges removed, versioned and wrapped/staked
// names removed, and the market-cap-to-TVL ratio trimmed to [1/500, 50].
// Radar-4 returns liquid-staking products to the fit set: they are legitimate
// traded protocols with their own tokens, and including them (n 89 -> 100)
// improves the out-of-sample miss (leave-one-out 3.29x -> 3.04x, time split
// 2.61x -> 1.99x). Bridges and exchanges stay out of the fit set because
// their market cap does not price the same kind of launch. The board itself
// still never ranks a staking or bridge product: that rule is separate from
// the fit set, and it is unchanged. The family factor is each category's mean
// residual from the curve, shrunk toward zero and capped to [0.5, 2.5], so a
// category the market prices above the curve lifts its protocols and one the
// market prices below it pulls them down. Growth carries the 7-day TVL change
// two weeks forward; seasoning rewards a protocol that has run longer with no
// token, peaking at 18 months and easing back by five years. The dashboard
// shows the fitted curve, the family table and the out-of-sample checks, so a
// reader can see where every number came from.
//
// The checks are honest: leave-one-out refits the curve and the family
// factors without each token and measures the miss, and a time split fits
// only the tokens listed before 2024 and tests the ones listed after. Both
// are reported against a flat baseline (one market-wide median multiple), so
// the reader can see whether the fit earns its keep. The p10/p90 band comes
// from the leave-one-out residuals, and the dashboard checks how often the
// truth lands inside it.
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
export const MODEL_VERSION = 'radar-4';

/** Pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** Live-token protocols the dashboard's Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

/** Categories that are bridges, staking products or exchanges, never launches of their own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Categories the fit set drops: bridges and exchanges only. Liquid-staking products stay in the fit set (radar-4): they are traded protocols with their own tokens, and their inclusion improves the out-of-sample miss. The board still never ranks them; that rule uses EXCLUDED_CATEGORIES above. */
const FIT_EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'CEX']);

/** The fit set keeps only market-cap-to-TVL ratios inside this band. */
const RATIO_MIN = 1 / 500;
const RATIO_MAX = 50;

/** A family factor's mean residual is shrunk toward zero by n/(n + this). */
const FAMILY_SHRINK_K = 20;

/** A family factor is kept inside this band, in linear terms. */
const FAMILY_MIN = 0.5;
const FAMILY_MAX = 2.5;

/** Growth is clamped to this band before it moves the value. */
const GROWTH_FLOOR = -30;
const GROWTH_CAP = 30;

/** Seasoning: a protocol that has run longer with no token is worth more, to a point. */
const UNKNOWN_AGE_DAYS = 365;
const SEASON_MID_DAYS = 540;
const SEASON_OLD_DAYS = 1825;
const SEASON_0 = 0.7;
const SEASON_MID = 1.15;
const SEASON_OLD = 0.95;

/** The farm: one standard position, its cost of capital, and its hold by age. */
const FARM_CAPITAL = 1000;
const FARM_TBILL_RATE = 0.04;
const FARM_HOLD_YOUNG_AGE = 180;
const FARM_HOLD_MID_AGE = 365;
const FARM_HOLD_YOUNG = 120;
const FARM_HOLD_MID = 90;
const FARM_HOLD_OLD = 60;

const DAY_MS = 86_400_000;

/** The fitted curve: log10(mcap) = a + b * log10(TVL / 1e8), over n traded protocols. */
export interface CurveFit {
  a: number;
  b: number;
  n: number;
}

/** One category's family factor: how the market prices it against the curve. */
export interface FamilyFactor {
  category: string;
  samples: number;
  factor: number;
  factor_log: number;
}

/** Leave-one-out validation, against a flat one-multiple baseline. */
export interface LooStats {
  n: number;
  median_miss: number;
  within_3x: number;
  within_10x: number;
  flat_median_miss: number;
  flat_within_3x: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  band50_coverage: number;
  band80_coverage: number;
}

/** Time-split validation: fit before 2024, test on the tokens listed after. */
export interface TimeSplitStats {
  train_n: number;
  test_n: number;
  median_miss: number;
  within_3x: number;
  flat_median_miss: number;
  flat_within_3x: number;
}

/** One traded protocol of the fit set, for the scatter and the peer list. */
export interface CompPoint {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** The market the model was derived from: the fitted curve, its families, and its checks. */
export interface FittedDerivation {
  curve: CurveFit;
  families: FamilyFactor[];
  loo: LooStats;
  time_split: TimeSplitStats;
  comps: CompPoint[];
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
    curve_a: number;
    curve_b: number;
    family_factor: number;
    family_samples: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    farm_capital_usd: number;
    farm_slice_usd: number;
    farm_fee_usd: number;
    farm_tbill_usd: number;
    farm_net_usd: number;
    farm_verdict: 'FARM' | 'THIN' | 'SKIP';
    value_lo_usd: number;
    value_hi_usd: number;
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
  curve_a: number;
  curve_b: number;
  family_factor: number;
  family_samples: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_capital_usd: number;
  farm_slice_usd: number;
  farm_fee_usd: number;
  farm_tbill_usd: number;
  farm_net_usd: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  value_lo_usd: number;
  value_hi_usd: number;
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

/** One pre-token protocol the board set aside, and why. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
  detail: string;
}

/** The model's constants, as the dashboard states them and the page recomputes with them. */
export interface ModelConstants {
  ratio_min: number;
  ratio_max: number;
  family_shrink_k: number;
  family_min: number;
  family_max: number;
  growth_floor: number;
  growth_cap: number;
  season_mid_days: number;
  season_old_days: number;
  season_0: number;
  season_mid: number;
  season_old: number;
  unknown_age_days: number;
  farm_capital_usd: number;
  farm_tbill_rate: number;
  farm_hold_young_age: number;
  farm_hold_mid_age: number;
  farm_hold_young: number;
  farm_hold_mid: number;
  farm_hold_old: number;
}

export const MODEL: ModelConstants = {
  ratio_min: RATIO_MIN,
  ratio_max: RATIO_MAX,
  family_shrink_k: FAMILY_SHRINK_K,
  family_min: FAMILY_MIN,
  family_max: FAMILY_MAX,
  growth_floor: GROWTH_FLOOR,
  growth_cap: GROWTH_CAP,
  season_mid_days: SEASON_MID_DAYS,
  season_old_days: SEASON_OLD_DAYS,
  season_0: SEASON_0,
  season_mid: SEASON_MID,
  season_old: SEASON_OLD,
  unknown_age_days: UNKNOWN_AGE_DAYS,
  farm_capital_usd: FARM_CAPITAL,
  farm_tbill_rate: FARM_TBILL_RATE,
  farm_hold_young_age: FARM_HOLD_YOUNG_AGE,
  farm_hold_mid_age: FARM_HOLD_MID_AGE,
  farm_hold_young: FARM_HOLD_YOUNG,
  farm_hold_mid: FARM_HOLD_MID,
  farm_hold_old: FARM_HOLD_OLD,
};

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  derivation: FittedDerivation;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
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
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a sorted list: index floor(p * n), clamped to the list. */
function quantile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[i]!;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
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

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_START.test(p.name)) return false;
  return true;
}

/** The traded protocols the curve is fitted to: market cap and TVL both above zero, bridges and exchanges removed, versioned and wrapped names removed, the ratio trimmed. Liquid-staking products are fitted, not ranked: they price the curve but never appear on the board. */
export function fitSet(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return false;
    if (p.category !== null && FIT_EXCLUDED_CATEGORIES.has(p.category)) return false;
    if (VERSIONED.test(p.name)) return false;
    if (WRAPPED_WORD.test(p.name)) return false;
    if (EXCHANGE_START.test(p.name)) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return ratio >= RATIO_MIN && ratio <= RATIO_MAX;
  });
}

/** Least squares for log10(mcap) = a + b * log10(TVL / 1e8), over the fit set. */
export function fitCurve(rows: SnapshotProtocol[]): CurveFit {
  const n = rows.length;
  const xs = rows.map((p) => Math.log10(p.tvl_usd / 1e8));
  const ys = rows.map((p) => Math.log10(p.mcap_usd!));
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  return { a: round4(a), b: round4(b), n };
}

/** Each category's family factor: its mean residual from the curve, shrunk toward zero and capped. */
export function familyFactors(rows: SnapshotProtocol[], curve: CurveFit): FamilyFactor[] {
  const byCategory = new Map<string, number[]>();
  for (const p of rows) {
    const pred = curve.a + curve.b * Math.log10(p.tvl_usd / 1e8);
    const residual = Math.log10(p.mcap_usd!) - pred;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(residual);
    byCategory.set(key, list);
  }
  const out: FamilyFactor[] = [];
  for (const [category, residuals] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
    const shrunk = mean * (residuals.length / (residuals.length + FAMILY_SHRINK_K));
    const factor = Math.min(FAMILY_MAX, Math.max(FAMILY_MIN, Math.pow(10, shrunk)));
    out.push({ category, samples: residuals.length, factor: round4(factor), factor_log: round4(Math.log10(factor)) });
  }
  return out;
}

/** The family factor for one category, from the fitted table; 1.0 when the category has no fit token. */
function familyFor(category: string | null, families: FamilyFactor[]): FamilyFactor | null {
  const key = category ?? 'Other';
  for (const f of families) if (f.category === key) return f;
  return null;
}

/** The log10 of a protocol's implied value before growth and maturity, from the curve and its family. */
function curveLog(protocol: SnapshotProtocol, curve: CurveFit, families: FamilyFactor[]): number {
  const f = familyFor(protocol.category, families);
  const familyLog = f === null ? 0 : f.factor_log;
  return curve.a + curve.b * Math.log10(protocol.tvl_usd / 1e8) + familyLog;
}

/** Seasoning: 0.70 at listing, 1.15 at 18 months, 0.95 at five years, linear between, flat after. */
export function maturityMultiplier(age: number | null): number {
  const d = age ?? UNKNOWN_AGE_DAYS;
  if (d <= SEASON_MID_DAYS) return SEASON_0 + (SEASON_MID - SEASON_0) * (d / SEASON_MID_DAYS);
  if (d <= SEASON_OLD_DAYS) return SEASON_MID - (SEASON_MID - SEASON_OLD) * ((d - SEASON_MID_DAYS) / (SEASON_OLD_DAYS - SEASON_MID_DAYS));
  return SEASON_OLD;
}

/** The multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  curve: CurveFit,
  families: FamilyFactor[],
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; familyFactor: number; familySamples: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const f = familyFor(protocol.category, families);
  const familyFactor = f === null ? 1 : f.factor;
  const familySamples = f === null ? 0 : f.samples;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, rawGrowth));
  const growthMult = Math.pow(1 + growthPct / 100, 2 * curve.b);
  const maturityMult = maturityMultiplier(age);
  const implied = Math.max(1, Math.round(Math.pow(10, curveLog(protocol, curve, families)) * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, familyFactor, familySamples, age };
}

/** The flat baseline's median multiple, over the fit set. */
function flatMedian(rows: SnapshotProtocol[]): number {
  return median(rows.map((p) => p.mcap_usd! / p.tvl_usd));
}

/** Leave-one-out: refit without each token, predict it, and measure the miss against the flat baseline. */
export function looValidation(rows: SnapshotProtocol[]): LooStats {
  const flat = flatMedian(rows);
  const residuals: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rest = rows.filter((_, j) => j !== i);
    const curve = fitCurve(rest);
    const families = familyFactors(rest, curve);
    const p = rows[i]!;
    const pred = curve.a + curve.b * Math.log10(p.tvl_usd / 1e8) + (familyFor(p.category, families)?.factor_log ?? 0);
    residuals.push(Math.log10(p.mcap_usd!) - pred);
  }
  const abs = residuals.map((r) => Math.abs(r));
  const flatAbs = rows.map((p) => Math.abs(Math.log10(p.mcap_usd!) - Math.log10(flat * p.tvl_usd)));
  const sorted = [...residuals].sort((a, b) => a - b);
  const p10 = quantile(sorted, 0.1);
  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);
  const p90 = quantile(sorted, 0.9);
  const inBand = (lo: number, hi: number): number => residuals.filter((r) => r >= lo && r <= hi).length / residuals.length;
  return {
    n: rows.length,
    median_miss: round2(Math.pow(10, median(abs))),
    within_3x: round4(abs.filter((v) => v <= Math.log10(3)).length / abs.length),
    within_10x: round4(abs.filter((v) => v <= 1).length / abs.length),
    flat_median_miss: round2(Math.pow(10, median(flatAbs))),
    flat_within_3x: round4(flatAbs.filter((v) => v <= Math.log10(3)).length / flatAbs.length),
    p10: round4(p10),
    p25: round4(p25),
    p75: round4(p75),
    p90: round4(p90),
    band50_coverage: round4(inBand(p25, p75)),
    band80_coverage: round4(inBand(p10, p90)),
  };
}

/** Time split: fit only the tokens listed before 2024, test the ones listed after, against the flat baseline. */
export function timeSplitValidation(rows: SnapshotProtocol[]): TimeSplitStats {
  const train = rows.filter((p) => p.listed_at !== null && p.listed_at < '2024-01-01');
  const test = rows.filter((p) => p.listed_at !== null && p.listed_at >= '2024-01-01');
  const flat = flatMedian(rows);
  if (train.length === 0 || test.length === 0) {
    return { train_n: train.length, test_n: test.length, median_miss: 0, within_3x: 0, flat_median_miss: 0, flat_within_3x: 0 };
  }
  const curve = fitCurve(train);
  const families = familyFactors(train, curve);
  const modelAbs = test.map((p) => Math.abs(Math.log10(p.mcap_usd!) - (curve.a + curve.b * Math.log10(p.tvl_usd / 1e8) + (familyFor(p.category, families)?.factor_log ?? 0))));
  const flatAbs = test.map((p) => Math.abs(Math.log10(p.mcap_usd!) - Math.log10(flat * p.tvl_usd)));
  return {
    train_n: train.length,
    test_n: test.length,
    median_miss: round2(Math.pow(10, median(modelAbs))),
    within_3x: round4(modelAbs.filter((v) => v <= Math.log10(3)).length / modelAbs.length),
    flat_median_miss: round2(Math.pow(10, median(flatAbs))),
    flat_within_3x: round4(flatAbs.filter((v) => v <= Math.log10(3)).length / flatAbs.length),
  };
}

/** The whole fitted derivation: curve, families, both out-of-sample checks, and the comps. */
export function deriveFitted(protocols: SnapshotProtocol[]): FittedDerivation {
  const rows = fitSet(protocols);
  const curve = fitCurve(rows);
  const families = familyFactors(rows, curve);
  const loo = looValidation(rows);
  const time_split = timeSplitValidation(rows);
  const comps: CompPoint[] = rows
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! }))
    .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  return { curve, families, loo, time_split, comps };
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const derivation = deriveFitted(snapshot.protocols);
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
    const v = impliedValue(p, snapshot.as_of, derivation.curve, derivation.families);
    const farm = farmMath(p, v.implied, v.age);
    const value_lo_usd = Math.max(1, Math.round(v.implied * Math.pow(10, derivation.loo.p10)));
    const value_hi_usd = Math.max(1, Math.round(v.implied * Math.pow(10, derivation.loo.p90)));
    return { p, ...v, farm, value_lo_usd, value_hi_usd };
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
      curve_a: derivation.curve.a,
      curve_b: derivation.curve.b,
      family_factor: s.familyFactor,
      family_samples: s.familySamples,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
      farm_capital_usd: FARM_CAPITAL,
      farm_slice_usd: s.farm.slice_usd,
      farm_fee_usd: s.farm.fee_usd,
      farm_tbill_usd: s.farm.tbill_usd,
      farm_net_usd: s.farm.net_usd,
      farm_verdict: s.farm.verdict,
      value_lo_usd: s.value_lo_usd,
      value_hi_usd: s.value_hi_usd,
    },
    farm_steps: farmSteps(s.p, s.age, s.farm).map(stepText),
  }));
}

/** Why a pre-token protocol is not on the board, in priority order. */
export function setAsideReason(p: SnapshotProtocol, boardSlugs: Set<string>): { reason: string; detail: string } | null {
  if (boardSlugs.has(p.slug)) return null;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return { reason: 'category', detail: p.category };
  if (VERSIONED.test(p.name)) return { reason: 'versioned', detail: '' };
  if (WRAPPED_WORD.test(p.name)) return { reason: 'wrapped', detail: '' };
  if (EXCHANGE_START.test(p.name)) return { reason: 'exchange', detail: '' };
  if (isRankable(p)) return { reason: 'below-cut', detail: '' };
  return { reason: 'other', detail: '' };
}

/** The pre-token protocols the board set aside, with the reason each one was left out. */
export function setAsideRows(snapshot: Snapshot, board: BoardRow[]): SetAsideRow[] {
  const boardSlugs = new Set(board.map((r) => r.slug));
  const boardNames = new Map<string, string>();
  for (const r of board) boardNames.set(r.name.toLowerCase().replace(/[^a-z0-9]/g, ''), r.slug);
  const rows: SetAsideRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || boardSlugs.has(p.slug)) continue;
    // A sibling shares its normalised name with a protocol already on the board.
    const norm = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (boardNames.has(norm)) {
      rows.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: 'sibling', detail: boardNames.get(norm)! });
      continue;
    }
    const r = setAsideReason(p, boardSlugs);
    if (r === null) continue;
    rows.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: r.reason, detail: r.detail });
  }
  rows.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return rows;
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

/** What one bridge crossing typically costs on a chain, in dollars. */
function bridgeFor(chain: string): number {
  const table: Record<string, number> = {
    Ethereum: 12,
    Solana: 2,
    Base: 2,
    Arbitrum: 2,
    'BNB Chain': 2,
    Polygon: 2,
    Avalanche: 2,
    Optimism: 2,
  };
  return table[chain] ?? 2.5;
}

/** Gas as a readable amount: cents under a dollar, dollars above it. */
function gasText(chain: string): string {
  const g = gasFor(chain);
  return g < 1 ? `${Math.round(g * 100)} cents` : `$${g}`;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return FARM_HOLD_MID;
  if (age < FARM_HOLD_YOUNG_AGE) return FARM_HOLD_YOUNG;
  if (age < FARM_HOLD_MID_AGE) return FARM_HOLD_MID;
  return FARM_HOLD_OLD;
}

/** One farm position, netted: the slice of a 10% distribution, the fees, the forgone T-bill interest, the net, and the verdict. */
export interface FarmMath {
  capital_usd: number;
  slice_usd: number;
  fee_usd: number;
  tbill_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  hold_days: number;
  chain: string;
}

export function farmMath(p: SnapshotProtocol, implied: number, age: number | null): FarmMath {
  const chain = chainOf(p);
  const fee = round2(2 * bridgeFor(chain) + 5 * gasFor(chain));
  const hold = holdDaysFor(age);
  const tbill = round2(FARM_CAPITAL * FARM_TBILL_RATE * hold / 365);
  const slice = round2((FARM_CAPITAL / (p.tvl_usd + FARM_CAPITAL)) * 0.1 * implied);
  const net = round2(slice - fee - tbill);
  const verdict = net > 0 ? 'FARM' : slice > fee ? 'THIN' : 'SKIP';
  return { capital_usd: FARM_CAPITAL, slice_usd: slice, fee_usd: fee, tbill_usd: tbill, net_usd: net, verdict, hold_days: hold, chain };
}

/** Dollars with two decimals, the sign in front for a loss. */
export function fmtMoney2(n: number): string {
  return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

/** A short dollar amount: $2.75B, $1.2M, $45K, $800. The dashboard formats the same way. */
export function fmtUsdShort(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
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
 * age, implied value), never from a hand-written list of names. Steps two to
 * four carry the position's own numbers: the slice, the fees, and the net.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, farm: FarmMath): FarmStep[] {
  const chain = farm.chain;
  const capital = farm.capital_usd;
  const hold = farm.hold_days;
  const gas = gasText(chain);
  const verdictLine = farm.verdict === 'FARM'
    ? `the expected net is ${fmtMoney2(farm.net_usd)} after fees, so this one is worth farming`
    : farm.verdict === 'THIN'
      ? `the expected net is ${fmtMoney2(farm.net_usd)}, so this one is thin: the slice covers the fees but not the wait`
      : `the expected net is ${fmtMoney2(farm.net_usd)}, so this one is a skip at a $${capital} position`;
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline.`,
      cost: `about ${gas} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: `${actionFor(p, capital, chain)} A $${capital} position against ${fmtUsdShort(p.tvl_usd)} of TVL would take about ${fmtMoney2(farm.slice_usd)} of a 10% distribution at the implied value.`,
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week on ${p.name}, such as a deposit, a swap, a borrow or a vote.`,
      cost: `about ${gas} of gas a week, and the round trip runs about ${fmtMoney2(farm.fee_usd)} in fees (two bridge crossings and five gas payments)`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so the activity lands in more than one snapshot. The forgone T-bill interest on $${capital} over ${hold} days is about ${fmtMoney2(farm.tbill_usd)}, and ${verdictLine}.`,
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
    curve_a: row.model.curve_a,
    curve_b: row.model.curve_b,
    family_factor: row.model.family_factor,
    family_samples: row.model.family_samples,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_capital_usd: row.model.farm_capital_usd,
    farm_slice_usd: row.model.farm_slice_usd,
    farm_fee_usd: row.model.farm_fee_usd,
    farm_tbill_usd: row.model.farm_tbill_usd,
    farm_net_usd: row.model.farm_net_usd,
    farm_verdict: row.model.farm_verdict,
    value_lo_usd: row.model.value_lo_usd,
    value_hi_usd: row.model.value_hi_usd,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const derivation = deriveFitted(snapshot.protocols);
  const live = liveRows(snapshot);
  const setAside = setAsideRows(snapshot, board);
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
    set_aside_size: setAside.length,
    rows: board.map((r) => radarRow(r, new Set(snapshot.watchlist))),
    live,
    set_aside: setAside,
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
