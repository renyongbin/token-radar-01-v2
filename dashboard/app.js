// Token Radar dashboard: renders the board from data.js, with no network.
// The page recomputes every row's derivation from the snapshot fields, and
// builds each farm plan from the same category templates the board was built
// with, so the page, the screenshots and board.json never disagree.

const DATA = window.TOKEN_RADAR_DATA;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- numbers

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

function money(usd) {
  if (usd >= 1e9) return '$' + (usd / 1e9).toFixed(2) + 'B';
  if (usd >= 1e6) return '$' + (usd / 1e6).toFixed(1) + 'M';
  if (usd >= 1e3) return '$' + (usd / 1e3).toFixed(1) + 'K';
  return '$' + usd;
}

function pct(x) {
  if (x === null || x === undefined) return 'n/a';
  const s = (x > 0 ? '+' : '') + x.toFixed(1) + '%';
  return s;
}

function ageText(days) {
  if (days < 30) return days + 'd';
  if (days < 365) return Math.round(days / 30) + 'mo';
  return (days / 365).toFixed(1) + 'y';
}

function daysBetween(from, to) {
  return Math.max(0, Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000));
}

// ---------------------------------------------------------------- derivation

// Same formulas as the model: multiple from the traded comps, growth from the
// 7-day change, age from time with no token, chains from chain count.
function factors(row) {
  const mult = clamp(
    row.c !== null && DATA.multiples.byCategory[row.c] !== undefined
      ? DATA.multiples.byCategory[row.c]
      : DATA.multiples.global,
    0.03, 2.0,
  );
  const growth = clamp(1 + 0.5 * (clamp(row.g === null ? 0 : row.g, -50, 100) / 100), 0.75, 1.5);
  const days = row.l === null ? 365 : daysBetween(row.l, DATA.asOf);
  const age = 1 + 0.12 * Math.min(days / 365, 4);
  const chain = 1 + 0.02 * Math.min(row.h.length, 8);
  return { multiple: mult, growth, age, chain, days };
}

// ---------------------------------------------------------------- farm plans

// The same category templates the board was built with: every step names the
// protocol and its main chain and says what it costs and how long it takes.
function chainOf(row) { return row.h.length > 0 ? row.h[0] : 'Ethereum'; }

const STEP_SETS = {
  dex: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with the chain's gas token plus $50-$500 in stablecoins for your first trades on ${r.n}; setup gas is usually under $2 and takes about 10 minutes.`,
    (r) => `Swap a small test amount of about $25 for another asset on ${r.n} to confirm the route, slippage and fees; one swap typically costs $0.10-$3 in gas and settles in under a minute.`,
    (r) => `Provide liquidity to the highest-volume pool on ${r.n} with $100-$500 split across the pool's two assets; approving both tokens and adding the position takes about 5-15 minutes.`,
    (r) => `Come back at least once a week for 4-8 weeks to swap, add or rebalance your position on ${r.n}; regular use is what points and airdrop trackers weight most, and each visit takes about 5 minutes.`,
    (r) => `Track your points, fees earned and any announced snapshot dates in ${r.n}'s app and social channels every week; exit by removing liquidity and swapping back in two steps, about 10 minutes total.`,
  ],
  lending: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with gas plus $100-$1,000 in an asset ${r.n} accepts as collateral; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Supply about $50-$500 of collateral on ${r.n} and confirm the supply transaction and your health factor; the deposit takes a few minutes and gas is typically $0.10-$3.`,
    (r) => `Borrow a small amount (under 40% of your collateral value) on ${r.n} to open a borrow position, then repay part of it a few days later; each borrow or repay takes about 5 minutes.`,
    (r) => `Use ${r.n} at least once a week for 4-8 weeks -- supply, borrow, repay, top up -- because steady activity across weeks is what farming trackers reward; each visit takes about 5 minutes.`,
    (r) => `Watch your health factor and any points dashboard weekly, and unwind by repaying the borrow first and then withdrawing collateral; a full exit takes about 10 minutes plus gas.`,
  ],
  bridge: [
    (r) => `Set up a wallet holding assets on ${chainOf(r)} plus gas on both the source and destination chains, starting with $50-$500 to move; funding takes about 10 minutes.`,
    (r) => `Bridge a small test amount of about $25 through ${r.n} and confirm it arrives on the destination chain before moving more; a test bridge takes 2-15 minutes and costs the bridge fee plus gas.`,
    (r) => `Bridge $100-$500 in two or three separate transfers on different days through ${r.n} instead of one lump sum; each transfer takes 2-15 minutes and repeated use is what trackers count.`,
    (r) => `Use ${r.n} at least twice a month for 2-3 months, varying the asset and the destination chain when you can; each bridge takes about 5 minutes of your time plus the wait for finality.`,
    (r) => `Keep a record of every transfer hash and check ${r.n}'s points or activity page weekly; if a token launches, claims usually open on the same app, so keep the wallet funded with a little gas.`,
  ],
  stake: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with gas plus $50-$500 of the asset ${r.n} stakes; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Stake about $50-$250 with ${r.n} and confirm you received the liquid staking receipt token in your wallet; the stake transaction takes a few minutes and gas is typically $0.10-$3.`,
    (r) => `Put the receipt token to work -- hold it, supply it to a lending market or a liquidity pool -- so you earn staking yield and a second layer of activity; setting this up takes about 15 minutes.`,
    (r) => `Top up your stake in small amounts every 2-4 weeks for 2-3 months rather than staking once; regular top-ups and a growing receipt-token balance are what farming trackers tend to reward.`,
    (r) => `Track your staking yield and points weekly, and plan your exit as unstaking first (which can take an unbonding period of hours to days) and then swapping the receipt token back, about 10 minutes.`,
  ],
  yield: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with gas plus $100-$500 in stablecoins to deposit into ${r.n}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Deposit about $50-$250 into the highest-TVL vault on ${r.n} and confirm the vault shares in your wallet; the deposit takes a few minutes and gas is typically $0.10-$3.`,
    (r) => `Leave the deposit working for at least 4 weeks and add a second deposit of $50-$250 in week two or three; vaults reward time-in-vault, and each deposit takes about 5 minutes.`,
    (r) => `Check the vault's yield, fees and any points page weekly, and harvest or compound rewards when the gas cost is less than the reward; a harvest takes about 5 minutes.`,
    (r) => `Exit by withdrawing from the vault back to stablecoins in one transaction, about 5 minutes, and keep the receipt until any airdrop claim window is announced for ${r.n}.`,
  ],
  rwa: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with gas plus $100-$500 in stablecoins to allocate through ${r.n}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Allocate about $50-$250 into the largest live offering on ${r.n} and complete any identity check it asks for first; onboarding can take 10-30 minutes and the allocation a few minutes more.`,
    (r) => `Hold the allocation for the offering's full term (often 4-12 weeks) and reinvest any yield it pays into a second offering on ${r.n}; each reinvestment takes about 5 minutes.`,
    (r) => `Read the offering's documents and track maturity dates and payouts weekly; real-world-asset products reward holders who stay through maturity, not quick flippers.`,
    (r) => `At maturity, redeem back to stablecoins on ${r.n} in one transaction, about 5 minutes, and keep records of every allocation for the tax year.`,
  ],
  deriv: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with gas plus $100-$500 in collateral (usually stablecoins) for ${r.n}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Open a small test position of about $25-$50 notional on ${r.n} with low leverage (2x or less) to learn the interface, fees and funding rate; opening takes a few minutes.`,
    (r) => `Trade at least once a week for 4-8 weeks on ${r.n}, keeping each position small and closing it the same week; regular trading volume is what derivatives farming trackers weight, and each trade takes minutes.`,
    (r) => `Set a stop-loss on every position and never risk more than 5% of your collateral on one trade on ${r.n}; liquidations erase farming progress, so size positions to survive normal volatility.`,
    (r) => `Track your volume, fees paid and any points page weekly; close all positions before any announced snapshot, then withdraw collateral in one transaction, about 5 minutes.`,
  ],
  cex: [
    (r) => `Create an account on ${r.n} and finish its identity verification, then fund it with $100-$500; verification usually takes 10 minutes to a day, and a first deposit minutes more.`,
    (r) => `Make a first spot trade of about $25-$50 on ${r.n} and confirm the fill, fees and withdrawal address whitelist; the trade takes a few minutes and fees are typically under $1.`,
    (r) => `Use ${r.n} at least twice a week for 4-8 weeks -- trade, convert or use its earn product -- because account activity over weeks is what centralized-platform rewards track; each session takes minutes.`,
    (r) => `Opt into any points, rewards or referral program ${r.n} runs and complete its beginner tasks; most take 5-15 minutes each and stack with trading activity.`,
    (r) => `Withdraw a test amount back to your own wallet before any snapshot to confirm the withdrawal path works; a withdrawal takes minutes to an hour and usually costs a small flat fee.`,
  ],
  chain: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with the chain's gas token plus $50-$500 in stablecoins; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Make a first transaction on ${chainOf(r)} through ${r.n} -- a swap, a transfer or a mint -- of about $25 to confirm the wallet, gas and confirmations; it takes a few minutes.`,
    (r) => `Use an app on ${chainOf(r)} at least once a week for 4-8 weeks through ${r.n} (swap, stake, provide liquidity or mint); weekly on-chain activity is the core of chain-level farming.`,
    (r) => `Bridge $50-$200 of assets into ${chainOf(r)} from another chain at least twice during the period to add cross-chain activity to your address; each bridge takes 2-15 minutes.`,
    (r) => `Keep the wallet active and funded with gas until any snapshot or claim is announced, then claim from the chain's official app; claiming usually takes about 5 minutes plus gas.`,
  ],
  risk: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with gas plus $100-$500 in stablecoins to use on ${r.n}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Open a first position of about $50-$100 on ${r.n} -- a vault, a cover or a curated allocation -- and read its terms, fees and lock-up before confirming; it takes about 10 minutes.`,
    (r) => `Add a second position of $50-$100 in a different vault or pool on ${r.n} two weeks later to diversify; each allocation takes about 5 minutes plus gas.`,
    (r) => `Review performance, fees and any points or governance activity weekly for 6-8 weeks; curators and insurers reward depositors who stay through full cycles, not one-week visitors.`,
    (r) => `Exit by withdrawing at the end of a term or epoch on ${r.n}, about 5 minutes, and keep records of deposits and withdrawals for any future claim.`,
  ],
  gov: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with gas plus $50-$200 to participate in ${r.n}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Take a first position of about $25-$50 on ${r.n} -- a vote, a prediction, a stake or an index buy -- and confirm it on-chain; it takes a few minutes and gas is typically $0.10-$3.`,
    (r) => `Participate at least once a week for 4-8 weeks on ${r.n}: vote on live proposals, place small predictions or rebalance the index; each action takes about 5 minutes.`,
    (r) => `Join ${r.n}'s community channels and complete any listed quests or feedback tasks; most take 5-15 minutes each and stack with on-chain activity in farming trackers.`,
    (r) => `Track your participation history and points weekly, and unwind positions in one transaction when you stop, about 5 minutes, keeping the wallet funded until any claim window closes.`,
  ],
  generic: [
    (r) => `Set up a wallet on ${chainOf(r)} and fund it with gas plus $50-$500 to use on ${r.n}; funding takes about 10 minutes and setup gas is usually under $2.`,
    (r) => `Make a first transaction of about $25 on ${r.n} -- a deposit, a swap or a stake, whichever it offers -- and confirm it settles; it takes a few minutes and gas is typically $0.10-$3.`,
    (r) => `Use ${r.n} at least once a week for 4-8 weeks, repeating its core action with $50-$200 each time; steady weekly use is what most farming trackers reward, and each visit takes about 5 minutes.`,
    (r) => `Join ${r.n}'s community and complete any quests, points tasks or testnet steps it lists; most take 5-15 minutes each and add to your on-chain footprint.`,
    (r) => `Track your activity and any points page weekly, and unwind in one or two transactions when you stop, about 10 minutes, keeping gas in the wallet until any claim is announced.`,
  ],
};

function stepSetFor(category) {
  const c = category || '';
  if (['Dexs', 'Liquidity Manager', 'Farm', 'Leveraged Farming'].includes(c)) return STEP_SETS.dex;
  if (['Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Uncollateralized Lending'].includes(c)) return STEP_SETS.lending;
  if (['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'].includes(c)) return STEP_SETS.bridge;
  if (['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Restaked BTC', 'Staking Pool'].includes(c)) return STEP_SETS.stake;
  if (['Yield', 'Yield Aggregator'].includes(c)) return STEP_SETS.yield;
  if (['RWA', 'Onchain Capital Allocator'].includes(c)) return STEP_SETS.rwa;
  if (['Derivatives', 'Basis Trading', 'Interest Rate Derivatives', 'Options Vault'].includes(c)) return STEP_SETS.deriv;
  if (['CEX', 'CeDeFi', 'OTC Marketplace', 'Crypto Card Issuer', 'Payments'].includes(c)) return STEP_SETS.cex;
  if (['Chain', 'Stablecoin Wrapper', 'Dual-Token Stablecoin', 'Decentralized BTC', 'Anchor BTC'].includes(c)) return STEP_SETS.chain;
  if (['Risk Curators', 'Insurance'].includes(c)) return STEP_SETS.risk;
  if (['Governance Incentives', 'Indexes', 'Prediction Market', 'Privacy'].includes(c)) return STEP_SETS.gov;
  return STEP_SETS.generic;
}

function farmSteps(row) { return stepSetFor(row.c).map((fn) => fn(row)); }

// ---------------------------------------------------------------- rendering

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ROWS = DATA.rows;
let selected = null;

function fillSelect(id, values) {
  const el = $(id);
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    el.appendChild(o);
  }
}

function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const cat = $('cat').value;
  const chain = $('chain').value;
  const watchOnly = $('watchOnly').checked;
  const sort = $('sort').value;
  let rows = ROWS.filter((r) => {
    if (watchOnly && !r.w) return false;
    if (cat && r.c !== cat) return false;
    if (chain && !r.h.includes(chain)) return false;
    if (q && !(r.n.toLowerCase().includes(q) || r.s.toLowerCase().includes(q))) return false;
    return true;
  });
  const by = {
    rank: (a, b) => a.r - b.r,
    tvl: (a, b) => b.t - a.t,
    growth: (a, b) => (b.g === null ? -Infinity : b.g) - (a.g === null ? -Infinity : a.g),
    age: (a, b) => (b.l === null ? '' : b.l).localeCompare(a.l === null ? '' : a.l),
    name: (a, b) => a.n.localeCompare(b.n),
  };
  rows = [...rows].sort(by[sort] || by.rank);
  return rows;
}

function renderRows() {
  const rows = filtered();
  if (selected && !rows.some((r) => r.s === selected.s)) {
    selected = null;
    $('detail').innerHTML = '';
  }
  const tb = $('rows');
  tb.innerHTML = '';
  for (const r of rows) {
    const f = factors(r);
    const tr = document.createElement('tr');
    if (selected && selected.s === r.s) tr.className = 'sel';
    const g = r.g === null ? '<span>n/a</span>' : `<span class="${r.g >= 0 ? 'up' : 'down'}">${pct(r.g)}</span>`;
    tr.innerHTML =
      `<td class="rank num">${r.r}</td>` +
      `<td>${esc(r.n)}${r.w ? '<span class="badge">WATCHLIST</span>' : ''}</td>` +
      `<td>${esc(r.c || '—')}</td>` +
      `<td class="chains">${esc(r.h.slice(0, 3).join(', '))}${r.h.length > 3 ? ' +' + (r.h.length - 3) : ''}</td>` +
      `<td class="num">${money(r.t)}</td>` +
      `<td class="num">${g}</td>` +
      `<td class="num">${ageText(f.days)}</td>` +
      `<td class="num impl">${money(r.v)}</td>`;
    tr.addEventListener('click', () => select(r.s));
    tb.appendChild(tr);
  }
  $('count').textContent = rows.length + ' of ' + ROWS.length + ' protocols';
}

function select(slug) {
  const r = ROWS.find((x) => x.s === slug);
  if (!r) return;
  selected = r;
  renderRows();
  const f = factors(r);
  const steps = farmSteps(r);
  const check = Math.round(r.t * f.multiple * f.growth * f.age * f.chain);
  $('detail').innerHTML =
    `<h2>${esc(r.n)} <small>${esc(r.s)}${r.w ? '<span class="badge">WATCHLIST</span>' : ''}</small></h2>` +
    `<p class="sub">${esc(r.c || 'Uncategorized')} &middot; ${esc(r.h.join(', '))} &middot; TVL ${money(r.t)} &middot; 7d ${pct(r.g)} &middot; tracked since ${esc(r.l || 'unknown')} (${ageText(f.days)} with no token)</p>` +
    `<h3>Implied value — how it is derived</h3>` +
    `<div class="derive">` +
    `<div><b>${money(r.t)}</b><span>TVL</span></div>` +
    `<div><b>&times; ${f.multiple.toFixed(3)}</b><span>category multiple (${esc(r.c || 'global median')})</span></div>` +
    `<div><b>&times; ${f.growth.toFixed(2)}</b><span>growth factor (7d ${pct(r.g)})</span></div>` +
    `<div><b>&times; ${f.age.toFixed(2)}</b><span>age factor (${ageText(f.days)} no token)</span></div>` +
    `<div><b>&times; ${f.chain.toFixed(2)}</b><span>chain factor (${r.h.length} chains)</span></div>` +
    `<div><b class="eq">= ${money(r.v)}</b><span>implied value (recomputed ${money(check)})</span></div>` +
    `</div>` +
    `<h3>How to farm it</h3>` +
    `<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  const el = $('detail');
  if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}

function renderMeta() {
  $('meta').innerHTML =
    `<div><b>${ROWS.length}</b><span>ranked</span></div>` +
    `<div><b>${DATA.watchlist}</b><span>watchlist</span></div>` +
    `<div><b>${DATA.preToken}</b><span>pre-token in snapshot</span></div>` +
    `<div><b>${esc(DATA.asOf)}</b><span>snapshot date</span></div>`;
}

function renderMethod() {
  $('excluded').textContent = DATA.excluded + '';
  const cats = Object.entries(DATA.multiples.byCategory).sort((a, b) => b[1] - a[1]);
  $('multiples').innerHTML =
    `<table class="mini"><thead><tr><th>Category</th><th class="num">Multiple</th></tr></thead><tbody>` +
    cats.map(([c, m]) => `<tr><td>${esc(c)}</td><td class="num">${m.toFixed(3)}</td></tr>`).join('') +
    `<tr><td>Global median (fallback)</td><td class="num">${DATA.multiples.global.toFixed(3)}</td></tr>` +
    `</tbody></table>`;
  $('traded').innerHTML =
    `<table class="mini"><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>` +
    DATA.traded.map((t) =>
      `<tr><td>${esc(t.name)}</td><td>${esc(t.category || '—')}</td><td class="num">${money(t.tvl_usd)}</td><td class="num">${money(t.mcap_usd)}</td><td class="num">${(t.mcap_usd / t.tvl_usd).toFixed(3)}</td></tr>`).join('') +
    `</tbody></table>`;
}

// ---------------------------------------------------------------- init

function init() {
  const cats = [...new Set(ROWS.map((r) => r.c).filter(Boolean))].sort();
  const chains = [...new Set(ROWS.flatMap((r) => r.h))].sort();
  fillSelect('cat', cats);
  fillSelect('chain', chains);
  renderMeta();
  renderMethod();
  for (const id of ['q', 'cat', 'chain', 'watchOnly', 'sort']) {
    $(id).addEventListener('input', renderRows);
    $(id).addEventListener('change', renderRows);
  }
  renderRows();
  applyHash(cats);
}

function applyHash(cats) {
  const m = location.hash.match(/detail=([^&]+)/);
  if (m) select(decodeURIComponent(m[1]));
  const f = location.hash.match(/filter=([^&]+)/);
  if (f) {
    const v = decodeURIComponent(f[1]);
    if (v === 'watchlist') { $('watchOnly').checked = true; renderRows(); }
    else if (cats.includes(v)) { $('cat').value = v; renderRows(); }
  }
}

init();
window.addEventListener('hashchange', () => applyHash([...new Set(DATA.rows.map((r) => r.c).filter(Boolean))].sort()));
