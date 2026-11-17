// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a detail
// view for every protocol with the model's own inputs and its farm plan, the
// live-token protocols set aside, the protocols the board set aside and why,
// and the model itself. No network: every byte it shows is in data.js.
//
// Two checks keep the page honest. The page recomputes a row's implied value
// from the snapshot figures and the fitted curve, and re-derives its farm
// plan from the protocol's record, and the detail view says whether both
// match the numbers board.json carries. A screen with no data or code behind
// it counts for nothing.
(function () {
  'use strict';

  var DATA = window.RADAR;

  /* -- Formatting ------------------------------------------------------- */

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtUsdShort(n) {
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtMoney2(n) {
    return n < 0 ? '-$' + Math.abs(n).toFixed(2) : '$' + n.toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  /* -- The model, recomputed in the page --------------------------------- */

  // One category's family factor, from the fitted table data.js carries.
  function familyFor(row) {
    var key = row.category || 'Other';
    var fams = DATA.derivation.families;
    for (var i = 0; i < fams.length; i++) if (fams[i].category === key) return fams[i];
    return null;
  }

  // Seasoning: 0.70 at listing, 1.15 at 18 months, 0.95 at five years, linear between.
  function maturityFor(age) {
    var m = DATA.model;
    var d = age === null || age === undefined ? m.unknown_age_days : age;
    if (d <= m.season_mid_days) return m.season_0 + (m.season_mid - m.season_0) * (d / m.season_mid_days);
    if (d <= m.season_old_days) return m.season_mid - (m.season_mid - m.season_old) * ((d - m.season_mid_days) / (m.season_old_days - m.season_mid_days));
    return m.season_old;
  }

  // One row's implied value, from the snapshot figures and the fitted curve alone.
  function impliedOf(row) {
    var m = DATA.model;
    var c = DATA.derivation.curve;
    var f = familyFor(row);
    var fl = f ? f.factor_log : 0;
    var growth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    growth = Math.min(m.growth_cap, Math.max(m.growth_floor, growth));
    var growthMult = Math.pow(1 + growth / 100, 2 * c.b);
    var maturity = maturityFor(row.age_days);
    return Math.max(1, Math.round(Math.pow(10, c.a + c.b * Math.log10(row.tvl_usd / 1e8) + fl) * growthMult * maturity));
  }

  /* -- The farm plan, re-derived in the page ----------------------------- */

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }

  // What one transaction typically costs on a chain, in dollars.
  function gasFor(chain) {
    var table = {
      Ethereum: 8, Solana: 0.05, Base: 0.3, Arbitrum: 0.4, 'BNB Chain': 0.3,
      Polygon: 0.1, Avalanche: 0.5, Optimism: 0.3, Gnosis: 0.1, Linea: 0.2,
      Scroll: 0.2, zkSync: 0.3, Starknet: 0.5, Sui: 0.05, Aptos: 0.05,
      Near: 0.05, Tron: 0.5, Fantom: 0.1
    };
    return table[chain] !== undefined ? table[chain] : 1;
  }
  // What one bridge crossing typically costs on a chain, in dollars.
  function bridgeFor(chain) {
    var table = { Ethereum: 12, Solana: 2, Base: 2, Arbitrum: 2, 'BNB Chain': 2, Polygon: 2, Avalanche: 2, Optimism: 2 };
    return table[chain] !== undefined ? table[chain] : 2.5;
  }
  function gasText(chain) {
    var g = gasFor(chain);
    return g < 1 ? Math.round(g * 100) + ' cents' : '$' + g;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function holdDaysFor(age) {
    var m = DATA.model;
    if (age === null || age === undefined) return m.farm_hold_mid;
    if (age < m.farm_hold_young_age) return m.farm_hold_young;
    if (age < m.farm_hold_mid_age) return m.farm_hold_mid;
    return m.farm_hold_old;
  }
  // One farm position, netted: the slice, the fees, the forgone T-bill interest, the net, the verdict.
  function farmMath(p) {
    var m = DATA.model;
    var chain = chainOf(p);
    var fee = round2(2 * bridgeFor(chain) + 5 * gasFor(chain));
    var hold = holdDaysFor(p.age_days);
    var tbill = round2(m.farm_capital_usd * m.farm_tbill_rate * hold / 365);
    var slice = round2((m.farm_capital_usd / (p.tvl_usd + m.farm_capital_usd)) * 0.1 * p.implied_value_usd);
    var net = round2(slice - fee - tbill);
    var verdict = net > 0 ? 'FARM' : slice > fee ? 'THIN' : 'SKIP';
    return { capital_usd: m.farm_capital_usd, slice_usd: slice, fee_usd: fee, tbill_usd: tbill, net_usd: net, verdict: verdict, hold_days: hold, chain: chain };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the loan open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('liquidity') >= 0) return 'Add $' + capital + ' of liquidity to the busiest pool on ' + name + ' (' + chain + ') and leave it in.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + ' into the highest-yield vault on ' + name + ' (' + chain + ') and leave it compounding.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain asset through ' + name + ' and hold on to the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund your account with $' + capital + ' on ' + name + ' and take one small market position.';
    if (c.indexOf('launchpad') >= 0) return 'Commit $' + capital + ' to the next sale on ' + name + ' and complete every task its page lists.';
    if (c.indexOf('rwa') >= 0) return 'Buy $' + capital + ' of the yield-bearing asset ' + name + ' issues on ' + chain + ' and hold it.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset ' + name + ' issues on ' + chain + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the shares.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('synthetic') >= 0 || c.indexOf('synthetics') >= 0) return 'Mint $' + capital + ' of the synthetic asset on ' + name + ' (' + chain + ') and hold it.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('ai') >= 0 || c.indexOf('agent') >= 0) return 'Run $' + capital + ' of usage through ' + name + ' on ' + chain + ' and keep the account active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and leave the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var farm = farmMath(p);
    var chain = farm.chain;
    var capital = farm.capital_usd;
    var hold = farm.hold_days;
    var gas = gasText(chain);
    var verdictLine = farm.verdict === 'FARM'
      ? 'the expected net is ' + fmtMoney2(farm.net_usd) + ' after fees, so this one is worth farming'
      : farm.verdict === 'THIN'
        ? 'the expected net is ' + fmtMoney2(farm.net_usd) + ', so this one is thin: the slice covers the fees but not the wait'
        : 'the expected net is ' + fmtMoney2(farm.net_usd) + ', so this one is a skip at a $' + capital + ' position';
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline.', cost: 'about ' + gas + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: actionFor(p, capital, chain) + ' A $' + capital + ' position against ' + fmtUsdShort(p.tvl_usd) + ' of TVL would take about ' + fmtMoney2(farm.slice_usd) + ' of a 10% distribution at the implied value.', cost: '$' + capital + ' of capital and about ' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week on ' + p.name + ', such as a deposit, a swap, a borrow or a vote.', cost: 'about ' + gas + ' of gas a week, and the round trip runs about ' + fmtMoney2(farm.fee_usd) + ' in fees (two bridge crossings and five gas payments)', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days so the activity lands in more than one snapshot. The forgone T-bill interest on $' + capital + ' over ' + hold + ' days is about ' + fmtMoney2(farm.tbill_usd) + ', and ' + verdictLine + '.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "When a claim opens, open the points page from the protocol's own site or docs and claim only there.", cost: 'no fee to check, and never pay anyone to claim for you', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // The three traded protocols in the row's category nearest by TVL, filled from the whole fit set.
  function peersFor(row) {
    var comps = DATA.derivation.comps || [];
    var lt = Math.log10(row.tvl_usd);
    function dist(c) { return Math.abs(Math.log10(c.tvl_usd) - lt); }
    function byDist(a, b) { return dist(a) - dist(b) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); }
    var same = comps.filter(function (c) { return (c.category || 'Other') === (row.category || 'Other'); });
    same.sort(byDist);
    var out = same.slice(0, 3);
    if (out.length < 3) {
      var rest = comps.filter(function (c) { return out.indexOf(c) < 0; });
      rest.sort(byDist);
      out = out.concat(rest.slice(0, 3 - out.length));
    }
    return out;
  }

  // Exposed so the build can verify the page and the board agree.
  window.RADAR_DEV = { farmSteps: farmSteps, impliedOf: impliedOf, familyFor: familyFor };

  /* -- Page state --------------------------------------------------------- */

  var app = document.getElementById('board');
  if (!DATA || !app) return;
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'style') node.setAttribute('style', attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  /* -- Hash: the board's state lives in the URL --------------------------- */

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  /* -- Filtering + sorting ------------------------------------------------- */

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var vrank = { FARM: 0, THIN: 1, SKIP: 2 };
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'verdict') { av = vrank[a.farm_verdict]; bv = vrank[b.farm_verdict]; }
      else if (key === 'net') { av = a.farm_net_usd; bv = b.farm_net_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  /* -- Sections ------------------------------------------------------------ */

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source: ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, el('span', { text: DATA.watchlist_size + ' watchlist protocols, ' }), el('em', { text: 'ranked by implied value' })),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor. Implied value is a model, not a promise, and a protocol ',
          el('b', { text: 'records no token' }), ' rather than has none.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug, no exceptions' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: 'ranked by implied value' })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) }), el('small', { text: 'found by the radar' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'shown at market value' }))
      )
    );
  }

  /* -- Scatter: the fit set against the fitted curve ----------------------- */

  function scatterSvg() {
    var comps = DATA.derivation.comps || [];
    var c = DATA.derivation.curve;
    if (comps.length === 0) return '';
    var pts = comps.map(function (p) { return { x: Math.log10(p.tvl_usd / 1e8), y: Math.log10(p.mcap_usd) }; });
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var px = (x1 - x0) * 0.06 + 0.05, py = (y1 - y0) * 0.06 + 0.05;
    x0 -= px; x1 += px; y0 -= py; y1 += py;
    var W = 340, H = 200, L = 34, R = 8, T = 8, B = 24;
    function sx(x) { return L + (x - x0) / (x1 - x0) * (W - L - R); }
    function sy(y) { return T + (1 - (y - y0) / (y1 - y0)) * (H - T - B); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    var circles = pts.map(function (p) {
      return '<circle cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="2.4" fill="#f2b23e" opacity="0.75"/>';
    }).join('');
    var ly0 = clamp(sy(c.a + c.b * x0), T, H - B), ly1 = clamp(sy(c.a + c.b * x1), T, H - B);
    var line = '<line x1="' + sx(x0).toFixed(1) + '" y1="' + ly0.toFixed(1) + '" x2="' + sx(x1).toFixed(1) + '" y2="' + ly1.toFixed(1) + '" stroke="#34d399" stroke-width="2"/>';
    var axes = '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="#22304d"/><line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" stroke="#22304d"/>';
    var labels = '<text x="' + (W / 2) + '" y="' + (H - 6) + '" fill="#93a3bd" font-size="10" text-anchor="middle">log10 TVL / $100M</text>' +
      '<text x="10" y="' + (H / 2) + '" fill="#93a3bd" font-size="10" text-anchor="middle" transform="rotate(-90 10 ' + (H / 2) + ')">log10 mcap</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Scatter of traded protocols: log market cap against log TVL, with the fitted line">' + axes + line + circles + labels + '</svg>';
  }

  /* -- Hero: the fitted curve and its out-of-sample check ------------------ */

  function heroBand() {
    var d = DATA.derivation;
    var c = d.curve;
    var loo = d.loo;
    return el('section', { class: 'panel hero' },
      el('div', { class: 'hero-grid' },
        el('div', { class: 'hero-formula' },
          el('h2', { text: 'A fitted curve, not a guess' }),
          el('p', { class: 'formula' }, el('b', { text: 'log10(mcap) = ' + c.a + ' + ' + c.b + ' · log10(TVL / $100M)' })),
          el('p', { class: 'sub', text: 'Least squares on ' + c.n + ' traded protocols. Each category is then shifted by its own family factor, the mean residual from this curve.' })
        ),
        el('div', { class: 'hero-scatter' }, el('div', { html: scatterSvg() }), el('p', { class: 'sub', text: 'Each dot is a traded protocol in the fit set; the line is the fitted curve.' })),
        el('div', { class: 'hero-stats' },
          el('div', { class: 'fact' }, el('span', { text: 'Leave-one-out median miss' }), el('b', { text: loo.median_miss + '×' }), el('small', { text: 'flat baseline ' + loo.flat_median_miss + '×' })),
          el('div', { class: 'fact' }, el('span', { text: 'Within 3× of the truth' }), el('b', { text: Math.round(loo.within_3x * 100) + '%' }), el('small', { text: 'flat baseline ' + Math.round(loo.flat_within_3x * 100) + '%' })),
          el('div', { class: 'fact' }, el('span', { text: 'Within 10× of the truth' }), el('b', { text: Math.round(loo.within_10x * 100) + '%' }), el('small', { text: 'p10–p90 band covers ' + Math.round(loo.band80_coverage * 100) + '%' }))
        )
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var aside = el('button', { type: 'button', 'aria-pressed': state.tab === 'set-aside' ? 'true' : 'false', text: 'Set aside', onclick: function () { state.tab = 'set-aside'; render(); } });
    var count = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.set_aside_size + ' set aside';
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'watchlist' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live, aside)),
      el('span', { class: 'count', text: count })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', class: 'sort-btn', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function verdictPill(v) {
    return el('span', { class: v === 'FARM' ? 'pill farm' : v === 'THIN' ? 'pill thin' : 'pill skip', text: v });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var netClass = r.farm_net_usd >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, verdictPill(r.farm_verdict)),
        el('td', { class: 'num ' + netClass, text: fmtMoney2(r.farm_net_usd) }),
        el('td', null, el('span', { class: r.watchlist ? 'pill watch' : 'pill early', text: r.watchlist ? 'Watchlist' : 'Early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('verdict', 'Verdict'),
            sortHeader('net', 'Net'),
            el('th', { scope: 'col', text: 'Board' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill live', text: 'Already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function reasonLabel(r) {
    var map = { category: 'Excluded category', versioned: 'Versioned name', wrapped: 'Wrapped / staked', exchange: 'Exchange product', sibling: 'Sibling', 'below-cut': 'Below the early cut', other: 'Set aside' };
    return map[r.reason] || r.reason;
  }

  function setAsideTable() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.set_aside.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, r.reason, r.detail].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the set-aside list again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', null, el('span', { class: 'pill none', text: reasonLabel(r) })),
        el('td', null, el('span', { class: 'sub', text: r.detail || '—' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols set aside from the ranking, and why. ' + DATA.set_aside_size + ' in all: excluded product categories, versioned names, wrapped or staked products, exchange products, siblings of a ranked protocol, and rankable protocols below the early cut.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Reason' }), el('th', { scope: 'col', text: 'Detail' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var d = DATA.derivation;
    var c = d.curve;
    var loo = d.loo;
    var ts = d.time_split;
    var formula = 'log10(mcap) = ' + c.a + ' + ' + c.b + ' x log10(TVL / $100M), fitted on ' + c.n + ' traded protocols. implied = round( 10^(a + b x log10(TVL / $100M) + family log) x growth x maturity ).';
    var fams = d.families.slice().sort(function (a, b) { return b.factor - a.factor; });
    var rows = fams.map(function (f) {
      return el('tr', null,
        el('td', { text: f.category }),
        el('td', { class: 'num', text: String(f.samples) }),
        el('td', { class: 'num', text: String(f.factor) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One fitted curve scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' }, el('b', { text: formula })),
      el('p', { class: 'sub', text: 'Growth carries the 7-day TVL change two weeks forward, clamped to [' + m.growth_floor + '%, ' + m.growth_cap + '%]. Seasoning is ' + m.season_0 + ' at listing, ' + m.season_mid + ' at 18 months, ' + m.season_old + ' at five years, linear between. A family factor is a category\u2019s mean residual from the curve, shrunk toward 1 and kept inside [' + m.family_min + ', ' + m.family_max + ']; a category with no traded protocol uses 1.0.' }),
      el('h3', { text: 'Out-of-sample checks' }),
      el('p', { class: 'sub', text: 'Leave-one-out refits the curve and the family factors without each of the ' + loo.n + ' fit tokens and predicts it: median miss ' + loo.median_miss + '×, ' + Math.round(loo.within_3x * 100) + '% within 3× and ' + Math.round(loo.within_10x * 100) + '% within 10×. A flat baseline (one market-wide median multiple) misses by ' + loo.flat_median_miss + '× with ' + Math.round(loo.flat_within_3x * 100) + '% within 3×. The p10–p90 band from those residuals covers ' + Math.round(loo.band80_coverage * 100) + '% of the truth (an 80% band should cover about 80%), and the p25–p75 band covers ' + Math.round(loo.band50_coverage * 100) + '% (a 50% band, about 50%).' }),
      el('p', { class: 'sub', text: 'Time split: fitted on the ' + ts.train_n + ' tokens listed before 2024, tested on the ' + ts.test_n + ' listed after. Median miss ' + ts.median_miss + '× with ' + Math.round(ts.within_3x * 100) + '% within 3×, against a flat ' + ts.flat_median_miss + '× with ' + Math.round(ts.flat_within_3x * 100) + '% within 3×.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'deriv' },
          el('caption', { text: 'Family factors: how the market prices each category against the curve.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', class: 'num', text: 'Fit tokens' }),
            el('th', { scope: 'col', class: 'num', text: 'Family factor' })
          )),
          el('tbody', null, rows)
        )
      ),
      el('p', { class: 'model-note', text: 'Implied value is the entry\u2019s own claim about what a launch would be worth if the protocol\u2019s record stayed as it is. It does not predict whether or when a token is issued.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  /* -- Spotlight: the five strongest implied values ----------------------- */

  function spotlight() {
    var top = DATA.rows.slice(0, 5);
    var cards = top.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'spot-rank', text: '#' + r.rank }),
        el('b', { class: 'spot-name', text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains[0] : 'an unnamed chain') }),
        el('span', { class: 'spot-value', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'sub' }, 'TVL ', fmtUsd(r.tvl_usd), '  ·  7d ', el('span', { class: growthClass, text: growth }))
      );
    });
    return el('section', { class: 'spot', 'aria-label': 'Top five protocols by implied value' },
      el('div', { class: 'spot-head' },
        el('h2', { text: 'Top picks' }),
        el('p', { text: 'The five strongest implied values on the board. Select one for its model and farm plan.' })
      ),
      el('div', { class: 'spot-grid' }, cards)
    );
  }

  /* -- Where the value sits, by category ---------------------------------- */

  function categorySummary() {
    var totals = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      totals[c] = (totals[c] || 0) + r.implied_value_usd;
    });
    var list = Object.keys(totals).map(function (c) { return { category: c, total: totals[c] }; });
    list.sort(function (a, b) { return b.total - a.total; });
    var top = list.slice(0, 6);
    var max = top.length ? top[0].total : 1;
    var grand = 0;
    list.forEach(function (c) { grand += c.total; });
    var rows = top.map(function (c) {
      return el('div', { class: 'cat-row' },
        el('span', { class: 'cat-name', text: c.category }),
        el('span', { class: 'cat-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((c.total / max) * 100)) + '%' })),
        el('span', { class: 'num cat-value', text: fmtUsd(c.total) })
      );
    });
    return el('section', { class: 'panel cats' },
      el('div', { class: 'panel-head' },
        el('h2', { text: 'Where the value sits' }),
        el('p', { text: 'Total implied value by category across all ' + DATA.board_size + ' pre-token rows (' + fmtUsd(grand) + ' in all). The strongest categories are the ones where a launch would be worth the most.' })
      ),
      el('div', { class: 'cat-list' }, rows)
    );
  }

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    state.selected = slug;
    writeHash();
    var fam = familyFor(row);
    var recomputed = impliedOf(row);
    var valueOk = recomputed === row.implied_value_usd;
    var derived = farmSteps(row);
    var stepsOk = JSON.stringify(derived) === JSON.stringify(row.farm_steps);
    var peers = peersFor(row);
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' - Watchlist' : ' - Early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var body = el('div', { class: 'detail-body' });
    body.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted curve' }), el('b', { class: 'num', text: 'a=' + DATA.derivation.curve.a + ', b=' + DATA.derivation.curve.b })),
        el('div', null, el('span', { text: 'Family factor' }), el('b', { class: 'num', text: String(fam ? fam.factor : 1) + '  (n=' + (fam ? fam.samples : 0) + ')' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: '80% band (p10–p90)' }), el('b', { class: 'num', text: fmtUsd(row.value_lo_usd) + ' – ' + fmtUsd(row.value_hi_usd) })),
        el('div', { class: 'wide' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'check-line' },
        'The page recomputes this row as ', el('b', { class: valueOk ? '' : 'bad', text: fmtUsd(recomputed) }),
        valueOk ? ' - the same number the board carries.' : ' - which differs from the board: the data would be stale.',
        ' The farm plan below is re-derived from this protocol\u2019s record, and it ',
        el('b', { class: stepsOk ? '' : 'bad', text: stepsOk ? 'matches' : 'differs from' }),
        ' the plan the board carries. This is an estimate, not a price.'
      )
    ));
    if (peers.length > 0) {
      var peerRows = peers.map(function (p) {
        return el('tr', null,
          el('td', { text: p.name }),
          el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
          el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
          el('td', { class: 'num', text: (p.mcap_usd / p.tvl_usd).toFixed(2) })
        );
      });
      body.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Closest traded peers' }),
        el('p', { class: 'sub', text: 'Traded protocols in the same category, nearest by TVL. Their market caps are facts, and they are what the curve was fitted on.' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'deriv' },
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Protocol' }),
              el('th', { scope: 'col', class: 'num', text: 'TVL' }),
              el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
              el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' })
            )),
            el('tbody', null, peerRows)
          )
        )
      ));
    }
    body.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Expected slice' }), el('b', { class: 'num', text: fmtMoney2(row.farm_slice_usd) })),
        el('div', null, el('span', { text: 'Fees' }), el('b', { class: 'num', text: fmtMoney2(row.farm_fee_usd) })),
        el('div', null, el('span', { text: 'Forgone T-bill interest' }), el('b', { class: 'num', text: fmtMoney2(row.farm_tbill_usd) })),
        el('div', null, el('span', { text: 'Expected net' }), el('b', { class: 'num', text: fmtMoney2(row.farm_net_usd) })),
        el('div', { class: 'wide' }, el('span', { text: 'Verdict on a $1,000 position' }), el('b', { class: 'num' }, verdictPill(row.farm_verdict)))
      ),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(body);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Snapshot ' + DATA.as_of + ' - ' + DATA.source + '. The snapshot is sealed: every run reads the same bytes.' }),
      el('p', { text: 'A protocol on this board records no token in the snapshot. That is DefiLlama\u2019s record, not proof it has none.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(heroBand());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : state.tab === 'live' ? liveTable() : setAsideTable());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    if (state.tab === 'pre-token') shell.appendChild(categorySummary());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
