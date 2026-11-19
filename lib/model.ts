// Token Radar model: rank pre-token protocols by an implied token value that is
// computed from the snapshot's own figures, never from a hardcoded list of names.
//
// The idea, in one line: a protocol that records no token is worth what the
// market already pays for the same kind of protocol that does have one.
//   implied = TVL x category multiple x growth factor x age factor x chain factor
// where the category multiple is the median market-cap / TVL of the token-bearing
// protocols in the same DefiLlama category (global median when a category has too
// few traded comps), the growth factor comes from the 7-day TVL change, the age
// factor from how long the protocol has run with no token, and the chain factor
// from how many chains it runs on. Every input is a field of the snapshot.

export interface Protocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** One board row: everything the dashboard needs, plus the full farm plan. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  multiple: number;
  growth_factor: number;
  age_factor: number;
  chain_factor: number;
  watchlist: boolean;
}

/** A protocol records no token when DefiLlama carries neither a CoinGecko id nor a ticker. */
export function hasNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a pre-token protocol is a genuine launch candidate, by the visible
 * parts of the watchlist's own rule: it is not a wrapped, staked or bridged
 * product of a token that already trades. The snapshot carries no
 * parentProtocol field, so the rule's parent check cannot be applied here;
 * the snapshot's own watchlist (built with the full rule) is covered in full
 * regardless. A wrapped or staked product -- WBTC, a staked-ETH product, a
 * bridge -- is not a protocol still waiting on a launch of its own.
 */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function exclusionReason(p: Protocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return 'wrapped, staked or bridged product';
  if (VERSION_MARKER.test(p.name)) return 'versioned build of a protocol';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product';
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return 'exchange product';
  return null;
}

export function isLaunchCandidate(p: Protocol): boolean {
  return exclusionReason(p) === null;
}

function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  if (a.length === 0) return NaN;
  const m = a.length >> 1;
  return a.length % 2 === 1 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Days between two YYYY-MM-DD dates (as_of minus listed_at). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z');
  return Math.max(0, Math.round(ms / 86400000));
}

export interface Multiples {
  /** Per-category median mcap/TVL of traded comps (only categories with >= 3 comps). */
  byCategory: Record<string, number>;
  /** Global median mcap/TVL of all traded comps. */
  global: number;
}

/**
 * The market multiples, read off the snapshot itself: for every category, the
 * median market-cap / TVL of the protocols in that category whose token already
 * trades and which report both a market cap and a TVL. Categories with fewer
 * than three such comps fall back to the global median.
 */
export function computeMultiples(protocols: Protocol[]): Multiples {
  const traded = protocols.filter(
    (p) => !hasNoToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const global = median(traded.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCat: Record<string, number[]> = {};
  for (const p of traded) {
    const c = p.category ?? '(none)';
    (byCat[c] ??= []).push(p.mcap_usd! / p.tvl_usd);
  }
  const byCategory: Record<string, number> = {};
  for (const [c, vals] of Object.entries(byCat)) {
    if (vals.length >= 3) byCategory[c] = median(vals);
  }
  return { byCategory, global };
}

/** The multiple a protocol's TVL is valued at: its category's, else the global one. */
export function multipleFor(p: Protocol, multiples: Multiples): number {
  const m = p.category !== null ? multiples.byCategory[p.category] : undefined;
  const raw = m !== undefined ? m : multiples.global;
  // A multiple is a market ratio, not a prophecy: keep it inside a sane band.
  return clamp(raw, 0.03, 2.0);
}

/**
 * How long the protocol has run with no token, in days. A protocol DefiLlama
 * does not date is treated as one year old: neutral, not zero and not ancient.
 */
export function ageDays(p: Protocol, asOf: string): number {
  return p.listed_at === null ? 365 : daysBetween(p.listed_at, asOf);
}

/** Growth factor from the 7-day TVL change: +50% of the move, clamped to [0.75, 1.50]. */
export function growthFactor(p: Protocol): number {
  const change = clamp(p.change_7d ?? 0, -50, 100) / 100;
  return clamp(1 + 0.5 * change, 0.75, 1.5);
}

/** Age factor: +12% per year of track record with no token, capped at four years. */
export function ageFactor(p: Protocol, asOf: string): number {
  const years = Math.min(ageDays(p, asOf) / 365, 4);
  return 1 + 0.12 * years;
}

/** Chain factor: +2% per chain it runs on, capped at eight chains. */
export function chainFactor(p: Protocol): number {
  return 1 + 0.02 * Math.min(p.chains.length, 8);
}

/** The implied value, and every factor that produced it (for the detail view). */
export function impliedValue(
  p: Protocol,
  multiples: Multiples,
  asOf: string,
): { value: number; multiple: number; growth: number; age: number; chain: number; ageDays: number } {
  const multiple = multipleFor(p, multiples);
  const growth = growthFactor(p);
  const age = ageFactor(p, asOf);
  const chain = chainFactor(p);
  const value = Math.max(1, Math.round(p.tvl_usd * multiple * growth * age * chain));
  return { value, multiple, growth, age, chain, ageDays: ageDays(p, asOf) };
}

/** Short human money: 1.2B, 340.5M, 12.4K. */
export function shortMoney(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${usd}`;
}

// ---------------------------------------------------------------- farm plans

type StepFn = (p: Protocol) => string;

function chainOf(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
}

function money(p: Protocol): string {
  return shortMoney(p.tvl_usd);
}

/**
 * Farm plans, one template set per kind of protocol. Every step names the
 * protocol and its main chain, says what it costs and how long it takes, and
 * is written for that category's actual mechanics -- a DEX plan talks about
 * swaps and pools, a lending plan about supplying and borrowing, a bridge
 * plan about moving assets. The dashboard renders these same templates from
 * the same rows, so the page and the board never disagree.
 */
const STEP_SETS: Record<string, StepFn[]> = {
  dex: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with the chain's gas token plus $50-$500 in stablecoins for your first trades on ${p.name}; setup gas is usually under $2 and takes about 10 minutes.`,
    (p) => `Swap a small test amount of about $25 for another asset on ${p.name} to confirm the route, slippage and fees; one swap typically costs $0.10-$3 in gas and settles in under a minute.`,
    (p) => `Provide liquidity to the highest-volume pool on ${p.name} with $100-$500 split across the pool's two assets; approving both tokens and adding the position takes about 5-15 minutes.`,
    (p) => `Come back at least once a week for 4-8 weeks to swap, add or rebalance your position on ${p.name}; regular use is what points and airdrop trackers weight most, and each visit takes about 5 minutes.`,
    (p) => `Track your points, fees earned and any announced snapshot dates in ${p.name}'s app and social channels every week; exit by removing liquidity and swapping back in two steps, about 10 minutes total.`,
  ],
  lending: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with gas plus $100-$1,000 in an asset ${p.name} accepts as collateral; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Supply about $50-$500 of collateral on ${p.name} and confirm the supply transaction and your health factor; the deposit takes a few minutes and gas is typically $0.10-$3.`,
    (p) => `Borrow a small amount (under 40% of your collateral value) on ${p.name} to open a borrow position, then repay part of it a few days later; each borrow or repay takes about 5 minutes.`,
    (p) => `Use ${p.name} at least once a week for 4-8 weeks -- supply, borrow, repay, top up -- because steady activity across weeks is what farming trackers reward; each visit takes about 5 minutes.`,
    (p) => `Watch your health factor and any points dashboard weekly, and unwind by repaying the borrow first and then withdrawing collateral; a full exit takes about 10 minutes plus gas.`,
  ],
  bridge: [
    (p) => `Set up a wallet holding assets on ${chainOf(p)} plus gas on both the source and destination chains, starting with $50-$500 to move; funding takes about 10 minutes.`,
    (p) => `Bridge a small test amount of about $25 through ${p.name} and confirm it arrives on the destination chain before moving more; a test bridge takes 2-15 minutes and costs the bridge fee plus gas.`,
    (p) => `Bridge $100-$500 in two or three separate transfers on different days through ${p.name} instead of one lump sum; each transfer takes 2-15 minutes and repeated use is what trackers count.`,
    (p) => `Use ${p.name} at least twice a month for 2-3 months, varying the asset and the destination chain when you can; each bridge takes about 5 minutes of your time plus the wait for finality.`,
    (p) => `Keep a record of every transfer hash and check ${p.name}'s points or activity page weekly; if a token launches, claims usually open on the same app, so keep the wallet funded with a little gas.`,
  ],
  stake: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with gas plus $50-$500 of the asset ${p.name} stakes; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Stake about $50-$250 with ${p.name} and confirm you received the liquid staking receipt token in your wallet; the stake transaction takes a few minutes and gas is typically $0.10-$3.`,
    (p) => `Put the receipt token to work -- hold it, supply it to a lending market or a liquidity pool -- so you earn staking yield and a second layer of activity; setting this up takes about 15 minutes.`,
    (p) => `Top up your stake in small amounts every 2-4 weeks for 2-3 months rather than staking once; regular top-ups and a growing receipt-token balance are what farming trackers tend to reward.`,
    (p) => `Track your staking yield and points weekly, and plan your exit as unstaking first (which can take an unbonding period of hours to days) and then swapping the receipt token back, about 10 minutes.`,
  ],
  yield: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with gas plus $100-$500 in stablecoins to deposit into ${p.name}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Deposit about $50-$250 into the highest-TVL vault on ${p.name} and confirm the vault shares in your wallet; the deposit takes a few minutes and gas is typically $0.10-$3.`,
    (p) => `Leave the deposit working for at least 4 weeks and add a second deposit of $50-$250 in week two or three; vaults reward time-in-vault, and each deposit takes about 5 minutes.`,
    (p) => `Check the vault's yield, fees and any points page weekly, and harvest or compound rewards when the gas cost is less than the reward; a harvest takes about 5 minutes.`,
    (p) => `Exit by withdrawing from the vault back to stablecoins in one transaction, about 5 minutes, and keep the receipt until any airdrop claim window is announced for ${p.name}.`,
  ],
  rwa: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with gas plus $100-$500 in stablecoins to allocate through ${p.name}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Allocate about $50-$250 into the largest live offering on ${p.name} and complete any identity check it asks for first; onboarding can take 10-30 minutes and the allocation a few minutes more.`,
    (p) => `Hold the allocation for the offering's full term (often 4-12 weeks) and reinvest any yield it pays into a second offering on ${p.name}; each reinvestment takes about 5 minutes.`,
    (p) => `Read the offering's documents and track maturity dates and payouts weekly; real-world-asset products reward holders who stay through maturity, not quick flippers.`,
    (p) => `At maturity, redeem back to stablecoins on ${p.name} in one transaction, about 5 minutes, and keep records of every allocation for the tax year.`,
  ],
  deriv: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with gas plus $100-$500 in collateral (usually stablecoins) for ${p.name}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Open a small test position of about $25-$50 notional on ${p.name} with low leverage (2x or less) to learn the interface, fees and funding rate; opening takes a few minutes.`,
    (p) => `Trade at least once a week for 4-8 weeks on ${p.name}, keeping each position small and closing it the same week; regular trading volume is what derivatives farming trackers weight, and each trade takes minutes.`,
    (p) => `Set a stop-loss on every position and never risk more than 5% of your collateral on one trade on ${p.name}; liquidations erase farming progress, so size positions to survive normal volatility.`,
    (p) => `Track your volume, fees paid and any points page weekly; close all positions before any announced snapshot, then withdraw collateral in one transaction, about 5 minutes.`,
  ],
  cex: [
    (p) => `Create an account on ${p.name} and finish its identity verification, then fund it with $100-$500; verification usually takes 10 minutes to a day, and a first deposit minutes more.`,
    (p) => `Make a first spot trade of about $25-$50 on ${p.name} and confirm the fill, fees and withdrawal address whitelist; the trade takes a few minutes and fees are typically under $1.`,
    (p) => `Use ${p.name} at least twice a week for 4-8 weeks -- trade, convert or use its earn product -- because account activity over weeks is what centralized-platform rewards track; each session takes minutes.`,
    (p) => `Opt into any points, rewards or referral program ${p.name} runs and complete its beginner tasks; most take 5-15 minutes each and stack with trading activity.`,
    (p) => `Withdraw a test amount back to your own wallet before any snapshot to confirm the withdrawal path works; a withdrawal takes minutes to an hour and usually costs a small flat fee.`,
  ],
  chain: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with the chain's gas token plus $50-$500 in stablecoins; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Make a first transaction on ${chainOf(p)} through ${p.name} -- a swap, a transfer or a mint -- of about $25 to confirm the wallet, gas and confirmations; it takes a few minutes.`,
    (p) => `Use an app on ${chainOf(p)} at least once a week for 4-8 weeks through ${p.name} (swap, stake, provide liquidity or mint); weekly on-chain activity is the core of chain-level farming.`,
    (p) => `Bridge $50-$200 of assets into ${chainOf(p)} from another chain at least twice during the period to add cross-chain activity to your address; each bridge takes 2-15 minutes.`,
    (p) => `Keep the wallet active and funded with gas until any snapshot or claim is announced, then claim from the chain's official app; claiming usually takes about 5 minutes plus gas.`,
  ],
  risk: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with gas plus $100-$500 in stablecoins to use on ${p.name}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Open a first position of about $50-$100 on ${p.name} -- a vault, a cover or a curated allocation -- and read its terms, fees and lock-up before confirming; it takes about 10 minutes.`,
    (p) => `Add a second position of $50-$100 in a different vault or pool on ${p.name} two weeks later to diversify; each allocation takes about 5 minutes plus gas.`,
    (p) => `Review performance, fees and any points or governance activity weekly for 6-8 weeks; curators and insurers reward depositors who stay through full cycles, not one-week visitors.`,
    (p) => `Exit by withdrawing at the end of a term or epoch on ${p.name}, about 5 minutes, and keep records of deposits and withdrawals for any future claim.`,
  ],
  gov: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with gas plus $50-$200 to participate in ${p.name}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Take a first position of about $25-$50 on ${p.name} -- a vote, a prediction, a stake or an index buy -- and confirm it on-chain; it takes a few minutes and gas is typically $0.10-$3.`,
    (p) => `Participate at least once a week for 4-8 weeks on ${p.name}: vote on live proposals, place small predictions or rebalance the index; each action takes about 5 minutes.`,
    (p) => `Join ${p.name}'s community channels and complete any listed quests or feedback tasks; most take 5-15 minutes each and stack with on-chain activity in farming trackers.`,
    (p) => `Track your participation history and points weekly, and unwind positions in one transaction when you stop, about 5 minutes, keeping the wallet funded until any claim window closes.`,
  ],
  generic: [
    (p) => `Set up a wallet on ${chainOf(p)} and fund it with gas plus $50-$500 to use on ${p.name}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (p) => `Make a first transaction of about $25 on ${p.name} -- a deposit, a swap or a stake, whichever it offers -- and confirm it settles; it takes a few minutes and gas is typically $0.10-$3.`,
    (p) => `Use ${p.name} at least once a week for 4-8 weeks, repeating its core action with $50-$200 each time; steady weekly use is what most farming trackers reward, and each visit takes about 5 minutes.`,
    (p) => `Join ${p.name}'s community and complete any quests, points tasks or testnet steps it lists; most take 5-15 minutes each and add to your on-chain footprint.`,
    (p) => `Track your activity and any points page weekly, and unwind in one or two transactions when you stop, about 10 minutes, keeping gas in the wallet until any claim is announced.`,
  ],
};

/** Which step set a category uses. */
function stepSetFor(category: string | null): StepFn[] {
  const c = category ?? '';
  if (['Dexs', 'Liquidity Manager', 'Farm', 'Leveraged Farming'].includes(c)) return STEP_SETS.dex!;
  if (['Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Uncollateralized Lending'].includes(c)) return STEP_SETS.lending!;
  if (['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'].includes(c)) return STEP_SETS.bridge!;
  if (['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Restaked BTC', 'Staking Pool'].includes(c)) return STEP_SETS.stake!;
  if (['Yield', 'Yield Aggregator'].includes(c)) return STEP_SETS.yield!;
  if (['RWA', 'Onchain Capital Allocator'].includes(c)) return STEP_SETS.rwa!;
  if (['Derivatives', 'Basis Trading', 'Interest Rate Derivatives', 'Options Vault'].includes(c)) return STEP_SETS.deriv!;
  if (['CEX', 'CeDeFi', 'OTC Marketplace', 'Crypto Card Issuer', 'Payments'].includes(c)) return STEP_SETS.cex!;
  if (['Chain', 'Stablecoin Wrapper', 'Dual-Token Stablecoin', 'Decentralized BTC', 'Anchor BTC'].includes(c)) return STEP_SETS.chain!;
  if (['Risk Curators', 'Insurance'].includes(c)) return STEP_SETS.risk!;
  if (['Governance Incentives', 'Indexes', 'Prediction Market', 'Privacy'].includes(c)) return STEP_SETS.gov!;
  return STEP_SETS.generic!;
}

/** The farm plan for a protocol: five concrete steps with costs and times. */
export function farmSteps(p: Protocol): string[] {
  return stepSetFor(p.category).map((fn) => fn(p));
}

// ---------------------------------------------------------------- the board

export interface Board {
  rows: BoardRow[];
  multiples: Multiples;
  /** Traded protocols by market cap, for the dashboard's method section. */
  tradedTop: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number }[];
  preTokenCount: number;
  watchlistCount: number;
  /** Pre-token protocols set aside as wrapped, staked, bridged or versioned. */
  excludedCount: number;
}

export const BOARD_ROWS = 180;

/**
 * Build the board: every protocol that records no token AND is a genuine
 * launch candidate, ranked by implied value, top 180, with every watchlist
 * protocol force-included. Ranks are 1..N by implied value descending; ties
 * break by TVL, then slug, so the order is total and the run is deterministic.
 */
export function buildBoard(snapshot: Snapshot): Board {
  const multiples = computeMultiples(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const preToken = snapshot.protocols.filter(hasNoToken);
  const excludedCount = preToken.filter((p) => !isLaunchCandidate(p)).length;
  const scored = preToken.filter(isLaunchCandidate).map((p) => {
    const iv = impliedValue(p, multiples, snapshot.as_of);
    return { p, iv };
  });
  scored.sort((a, b) => {
    if (b.iv.value !== a.iv.value) return b.iv.value - a.iv.value;
    if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
    return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
  });
  const picked = scored.slice(0, BOARD_ROWS);
  const pickedSlugs = new Set(picked.map((s) => s.p.slug));
  // Force every watchlist protocol in, swapping out the lowest non-watchlist rows.
  const missing = snapshot.watchlist.filter((s) => !pickedSlugs.has(s));
  for (const slug of missing) {
    const entry = scored.find((s) => s.p.slug === slug);
    if (!entry) continue;
    let at = picked.length - 1;
    while (at >= 0 && watch.has(picked[at]!.p.slug)) at--;
    if (at < 0) break;
    picked[at] = entry;
  }
  picked.sort((a, b) => {
    if (b.iv.value !== a.iv.value) return b.iv.value - a.iv.value;
    if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
    return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
  });
  const rows: BoardRow[] = picked.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.iv.value,
    farm_steps: farmSteps(s.p),
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.iv.ageDays,
    multiple: s.iv.multiple,
    growth_factor: s.iv.growth,
    age_factor: s.iv.age,
    chain_factor: s.iv.chain,
    watchlist: watch.has(s.p.slug),
  }));
  const tradedTop = snapshot.protocols
    .filter((p) => !hasNoToken(p) && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, 10)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! }));
  return {
    rows,
    multiples,
    tradedTop,
    preTokenCount: scored.length + excludedCount,
    watchlistCount: snapshot.watchlist.length,
    excludedCount,
  };
}
