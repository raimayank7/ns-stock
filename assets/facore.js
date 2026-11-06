/* NSFA: more final accounts for the Nivesh Sahayak App (famore.js draws them). Pure functions over NSBooks, NSStock, NSPL.
     mfg      manufacturing account (businesses with production entries): raw material consumed (opening + purchases − closing
              of the items used in production), direct (factory) expenses, ± work in progress (typed), less by-products and
              scrap made = cost of goods manufactured, then the cost of goods sold for the trading part.
              Raw material = items used in a production entry or a BOM and never made; every other stock item is finished goods
              (or goods bought for resale). Presentation only: the profit stays the one of the statement of profit and loss.
     firm     partnership firm / LLP: profit and loss appropriation (interest on capital, partners' salary, the rest in the
              profit-sharing ratio) and each partner's capital account (opening, capital brought in, interest, salary, share of
              profit, drawings, closing). Partner accounts are the App's capital / drawings journal accounts cap:<name>, drw:<name>.
     remLimit Income-tax limit on working partners' remuneration (s.40(b) of the 1961 Act, kept in the Income-tax Act 2025):
              on the first Rs 6,00,000 of book profit (or a loss) Rs 3,00,000 or 90%, whichever is more; 60% of the rest.
              Interest on capital up to 12% a year. A hint only, never enforced.
     recPay   receipts and payments account (trust, society, school): cash and bank only, money in and out by head.
   Business type: biz.btype 'prop' (default) | 'firm' | 'llp' | 'co' | 'npo'; partners: biz.partners [{ name, share, ic, sal }];
   biz.apprMode 'profit' (default: interest and salary only out of profit, Indian Partnership Act s.13(d) and usual practice; in a
   loss year none, when the profit is smaller they are cut in proportion) | 'deed' (as per the deed, given even in a loss)
   (share = profit share %, ic = interest on capital % a year, sal = salary / remuneration a year); manufacturing settings:
   biz.fa = { wip: { 'YYYY-MM-DD': value of work in progress on that day }, direct: [expense account keys] (factory costs; when
   missing the expense names decide, see DIRECT) }. */
(function (G) {
  'use strict';
  var B = G.NSBooks || (typeof NSBooks !== 'undefined' ? NSBooks : null), S = G.NSStock || (typeof NSStock !== 'undefined' ? NSStock : null);
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function prevDay(iso) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
  function days(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5) + 1; }
  function bizOk(d, b) { return !b || key(d.seller && d.seller.name) === b; }

  var TYPES = ['prop', 'firm', 'llp', 'co', 'npo'];
  function btype(biz) { var t = biz && biz.btype; return TYPES.indexOf(t) >= 0 ? t : 'prop'; }
  function hasPartners(biz) { var t = btype(biz); return t === 'firm' || t === 'llp'; }

  /* ---------- manufacturing account ---------- */
  /* expense names that are factory (direct) costs unless the user chose otherwise */
  var DIRECT = /wage|labou?r|factory|power|electric|fuel|coal|carriage in|freight in|inward|job ?work|manufactur|production|machine|consumable|packing material/i;
  function isDirect(x, direct) { return direct ? direct.indexOf(x.k) >= 0 : DIRECT.test(x.name || '') || DIRECT.test(String(x.k || '').slice(4)); }

  /* which stock items are raw material: used in production or a BOM, and never made */
  function rawItems(docs, items, biz) {
    var mv = S.moves(docs, items, biz), made = {}, used = {};
    mv.forEach(function (x) { if (x.src === 'make') made[x.k] = 1; else if (x.src === 'use') used[x.k] = 1; });
    (items || []).forEach(function (m) {
      var L = [].concat(m && m.bom ? [m.bom] : [], m && m.boms || []);
      L.forEach(function (b) { (b && b.lines || []).forEach(function (l) { if (l && l.desc) used[key(l.desc)] = 1; }); });
    });
    var raw = {}; Object.keys(used).forEach(function (k) { if (!made[k]) raw[k] = 1; });
    return { raw: raw, made: made, mv: mv };
  }
  /* any production (made goods, not only by-products) between two dates */
  function hasProduction(docs, items, biz, from, to) {
    return S.moves(docs, items, biz).some(function (x) { return x.src === 'make' && !x.d._by && (!from || x.date >= from) && (!to || x.date <= to); });
  }
  /* purchases (taxable value, after discount) of the given items between two dates; returns and goods sent back reduce them */
  function purchasesOf(docs, biz, want, from, to) {
    var b = key(biz), v = 0;
    (docs || []).forEach(function (d) {
      if (!bizOk(d, b) || B.bounced && B.bounced(d) || d.date < from || d.date > to) return;
      var sign = d.type === 'pbill' ? (d.kind === 'return' ? -1 : 1) : d.type === 'self' ? 1 : d.type === 'note' && d.side === 'purchase' && d.kind === 'debit' && d.reason === 'ret' ? -1 : 0;
      if (!sign) return;
      (d.items || []).forEach(function (it) {
        if (!it || !want[key(it.desc)]) return;
        var q = it.qty === '' || it.qty == null ? 1 : num(it.qty), r = num(it.rate);
        v += sign * q * (r - r * num(it.disc) / 100);
      });
    });
    return r2(v);
  }
  /* finished goods at FULL cost (AS 2, owner 2026-11-06): a production entry carries the materials it used and any direct costs
     typed on it; the factory (direct) expenses booked in the books during the financial year so far are spread over the value
     made in that time (factor = factory expenses / production value), and every made item still in stock gets the same share.
     Returns { from, to, made (production value), overheads, factor, base (made goods in stock at production cost), uplift }. */
  function fyStartOf(iso) { var y = +iso.slice(0, 4); if (+iso.slice(5, 7) < 4) y--; return y + '-04-01'; }
  function fullCost(docs, items, biz, date, direct) {
    var from = fyStartOf(date), R = rawItems(docs, items, biz), made = {}, V = 0, oh = 0, seen = {};
    R.mv.forEach(function (x) { if (x.src === 'make' && !x.d._by && x.date >= from && x.date <= date) { V += x.qty * num(x.rate); made[x.k] = 1; } });
    var before = B.accounts(docs, biz, prevDay(from)), upto = B.accounts(docs, biz, date);
    Object.keys(upto).concat(Object.keys(before)).forEach(function (a) {
      if (seen[a] || a.indexOf('exp:') !== 0) return; seen[a] = 1;
      var v = r2((upto[a] || 0) - (before[a] || 0));
      if (v && isDirect({ k: a, name: a.slice(4) }, direct)) oh += v;
    });
    V = r2(V); oh = r2(Math.max(0, oh));
    var f = V > 0 ? oh / V : 0, base = 0, up = 0, capped = 0;
    /* AS 2: inventories at the LOWER of cost and net realisable value. The share of factory expenses added to an item never takes
       it above what it sells for (its sale rate in the item list, else the last sale rate on a bill) (round C: a pot made at
       Rs 194 carried Rs 979 while it sells at Rs 450, because the year's whole factory cost sat on the only production entry) */
    var sell = lastSale(docs, items, biz, date);
    S.summary(docs, items, biz, '', date).items.forEach(function (s) {
      if (!made[s.k] || !(s.value > 0)) return;
      base += s.value;
      var add = s.value * f, nrv = sell[s.k] && s.close > 0 ? sell[s.k] * s.close : null;
      if (nrv != null && s.value + add > nrv) { var a2 = Math.max(0, nrv - s.value); capped += add - a2; add = a2; }
      up += add;
    });
    base = r2(base);
    return { from: from, to: date, made: V, overheads: oh, factor: f, base: base, uplift: r2(up), capped: r2(capped), high: f > 1 };
  }
  /* the selling price of each item on a day: the rate in the item list, else the latest sale bill's rate */
  function lastSale(docs, items, biz, date) {
    var o = {}, at = {}, b = key(biz);
    (docs || []).forEach(function (d) {
      if (!/^(invoice|cashmemo)$/.test(d.type || 'invoice') || !bizOk(d, b) || (d.date || '') > date) return;
      (d.items || []).forEach(function (it) { var k = key(it.desc), r = num(it.rate) * (1 - num(it.disc) / 100); if (k && r > 0 && (!at[k] || d.date >= at[k])) { o[k] = r; at[k] = d.date; } });
    });
    (items || []).forEach(function (m) { var k = key(m.desc); if (k && num(m.rate) > 0) o[k] = num(m.rate); });
    return o;
  }
  function stockOf(sum, want, inv) { var v = 0; sum.items.forEach(function (s) { if (!!want[s.k] !== !!inv) v += s.value; }); return r2(v); }
  /* o: { exps: [{ k: 'exp:…', name, v }] (expenses of the period), direct: [keys] | null, wipOpen, wipClose, purTotal (all purchases,
     net of returns, from the books), rev (sales), os, cs (opening and closing stock of the statements, if known) } */
  function mfg(docs, items, biz, from, to, o) {
    o = o || {};
    var R = rawItems(docs, items, biz), raw = R.raw, b = key(biz);
    var sumO = S.summary(docs, items, biz, '', prevDay(from)), sumC = S.summary(docs, items, biz, '', to);
    var openIn = { raw: 0, fg: 0 };   /* opening stock records dated inside the period (as fromBooks counts them) */
    (docs || []).forEach(function (d) {
      if (d.type !== 'stk' || d.kind !== 'open' || !bizOk(d, b) || d.date < from || d.date > to) return;
      (d.lines || []).forEach(function (l) { openIn[raw[key(l.desc)] ? 'raw' : 'fg'] += num(l.qty) * num(l.rate); });
    });
    var x = { rawOpen: r2(stockOf(sumO, raw) + openIn.raw), rawClose: stockOf(sumC, raw) };
    x.fgOpen = r2(stockOf(sumO, raw, 1) + openIn.fg + num(o.as2Open)); x.fgClose = r2(stockOf(sumC, raw, 1) + num(o.as2Close));   /* AS 2: full cost (fullCost) */
    x.rawPur = purchasesOf(docs, biz, raw, from, to);
    x.consumed = r2(x.rawOpen + x.rawPur - x.rawClose);
    x.direct = (o.exps || []).filter(function (e) { return isDirect(e, o.direct); }).map(function (e) { return { k: e.k, name: e.name, v: r2(e.v) }; });
    x.indirect = (o.exps || []).filter(function (e) { return !isDirect(e, o.direct); }).map(function (e) { return e.k; });
    x.dirTotal = r2(x.direct.reduce(function (s, e) { return s + e.v; }, 0));
    x.prime = r2(x.consumed + x.dirTotal);
    x.wipOpen = r2(num(o.wipOpen)); x.wipClose = r2(num(o.wipClose));
    x.byp = 0; x.made = [];
    var made = {};
    R.mv.forEach(function (m) {
      if (m.src !== 'make' || m.date < from || m.date > to) return;
      var v = r2(m.qty * num(m.rate));
      if (m.d._by) x.byp = r2(x.byp + v);
      else { var a = made[m.k] = made[m.k] || { k: m.k, name: m.name, unit: m.unit, qty: 0, v: 0 }; a.qty = r2(a.qty + m.qty); a.v = r2(a.v + v); }
    });
    x.made = Object.keys(made).map(function (k) { return made[k]; }).sort(function (a, c) { return a.name.localeCompare(c.name); });
    x.cogm = r2(x.prime + x.wipOpen - x.wipClose - x.byp);
    var pt = o.purTotal != null ? num(o.purTotal) : x.rawPur;
    x.purOther = r2(pt - x.rawPur);
    x.cogs = r2(x.fgOpen + x.cogm + x.byp + x.purOther - x.fgClose);
    x.rev = r2(num(o.rev)); x.gross = r2(x.rev - x.cogs);
    x.on = hasProduction(docs, items, biz, from, to);
    return x;
  }

  /* ---------- partnership firm / LLP ---------- */
  function remLimit(bookProfit) {
    var bp = num(bookProfit);
    return r2(Math.max(300000, 0.9 * Math.max(0, Math.min(bp, 600000))) + 0.6 * Math.max(0, bp - 600000));
  }
  /* part of a year a period covers (a full financial year = 1) */
  function yearPart(from, to) { return Math.min(1, days(from, to) / 365); }
  function cleanPartners(list) {
    return (list || []).filter(function (p) { return p && String(p.name || '').trim(); }).map(function (p) {
      return { name: String(p.name).trim(), k: key(p.name), share: num(p.share), ic: num(p.ic), sal: num(p.sal) };
    });
  }
  /* each partner's capital and drawings accounts: opening (day before 'from'), money brought in / taken out of capital in the
     period with dates, drawings in the period. Accounts are found by the partner's name (cap:<name>, drw:<name>). */
  function partnerAccounts(docs, biz, from, to, partners) {
    var before = B.accounts(docs, biz, prevDay(from)), upto = B.accounts(docs, biz, to);
    return cleanPartners(partners).map(function (p) {
      var ck = 'cap:' + p.k, dk = 'drw:' + p.k, bk = B.book(docs, biz, ck, from, to);
      return Object.assign(p, { capOpen: r2(-(before[ck] || 0)), drwOpen: r2(before[dk] || 0), moves: bk.rows.map(function (r) { return { date: r.date, v: r2(r.cr - r.dr) }; }),
        intro: r2(-((upto[ck] || 0) - (before[ck] || 0))), drw: r2((upto[dk] || 0) - (before[dk] || 0)) });
    });
  }
  /* appropriation of the net profit: interest on capital (on the opening balance for the whole period, on money brought in from
     its date; capital taken out stops earning from its date), salary for the part of the year, the rest in the profit-sharing
     ratio (equal when no shares are given). The last partner takes the rounding so the shares add up to the divisible profit. */
  function appropriation(profit, accts, from, to, mode) {
    var part = yearPart(from, to), P = accts || [], n = days(from, to);
    var rows = P.map(function (p) {
      var base = (p.capOpen - p.drwOpen) * Math.min(n, 365);
      (p.moves || []).forEach(function (m) { base += m.v * Math.min(days(m.date, to), 365); });
      return { name: p.name, k: p.k, int: r2(Math.max(0, base) * p.ic / 100 / 365), sal: r2(p.sal * part), share: 0, ratio: p.share };
    });
    var full = r2(rows.reduce(function (s, r) { return s + r.int + r.sal; }, 0)), cut = 1;
    /* only out of profit: none in a loss year, cut in proportion when the profit does not cover them (deed = as worked out) */
    if (mode !== 'deed' && full > 0 && num(profit) < full) {
      cut = Math.max(0, num(profit)) / full;
      var left = r2(Math.max(0, num(profit))), cnt = 0, all = rows.length * 2;
      rows.forEach(function (r) {
        r.intDue = r.int; r.salDue = r.sal;
        ['int', 'sal'].forEach(function (k) { cnt++; if (!r[k]) return; var v = cnt === all ? left : Math.min(left, r2(r[k] * cut)); r[k] = v; left = r2(left - v); });
      });
      if (left && rows.length) { var z = rows.filter(function (r) { return r.int || r.sal; }).pop(); if (z) { if (z.sal) z.sal = r2(z.sal + left); else z.int = r2(z.int + left); } }
    }
    var int = r2(rows.reduce(function (s, r) { return s + r.int; }, 0)), sal = r2(rows.reduce(function (s, r) { return s + r.sal; }, 0));
    var div = r2(num(profit) - int - sal), tot = rows.reduce(function (s, r) { return s + r.ratio; }, 0), given = 0;
    rows.forEach(function (r, i) {
      r.share = i === rows.length - 1 ? r2(div - given) : r2(div * (tot ? r.ratio / tot : 1 / rows.length));
      given = r2(given + r.share); r.total = r2(r.int + r.sal + r.share);
    });
    return { profit: r2(num(profit)), int: int, sal: sal, divisible: div, rows: rows, equal: !tot, part: part, mode: mode === 'deed' ? 'deed' : 'profit', cut: r2(cut * 10000) / 10000, full: full };
  }
  /* each partner's capital account for the period */
  function capitals(accts, appr) {
    var A = {}; (appr && appr.rows || []).forEach(function (r) { A[r.k] = r; });
    return (accts || []).map(function (p) {
      var a = A[p.k] || { int: 0, sal: 0, share: 0 }, open = r2(p.capOpen - p.drwOpen);
      return { name: p.name, k: p.k, open: open, intro: p.intro, int: a.int, sal: a.sal, share: a.share, drw: p.drw, close: r2(open + p.intro + a.int + a.sal + a.share - p.drw) };
    });
  }
  /* everything for a firm: o = { profit, pbt } from the statement of profit and loss */
  function firm(docs, biz, from, to, partners, o) {
    o = o || {};
    var accts = partnerAccounts(docs, biz, from, to, partners), ap = appropriation(o.profit, accts, from, to, o.mode), caps = capitals(accts, ap);
    /* book profit for the remuneration limit: profit before tax after interest to partners, before their salary */
    var bp = r2(num(o.pbt != null ? o.pbt : o.profit) - ap.int), lim = r2(remLimit(bp) * ap.part);
    return { appr: ap, caps: caps, bookProfit: bp, limit: lim, overSal: ap.sal > lim + 0.005, overInt: accts.some(function (p) { return p.ic > 12; }),
      shares: accts.reduce(function (s, p) { return s + p.share; }, 0) };
  }

  /* ---------- receipts and payments (cash and bank only) ---------- */
  var MONEY = { cash: 1, bank: 1 };
  /* head of the other side of a money line: k (code for the screen words), name (English) */
  function rpHead(a, d, v, feeP, firm) {
    var fee = d.type === 'fee' || a.indexOf('p:') === 0 && v > 0 && !!(feeP && feeP[a]);   /* money later received against a fee bill */
    if (a === 'sales') return { k: fee ? 'fees' : 'sales', name: fee ? 'Fees received' : 'Sales' };
    if (a === 'sales-return') return { k: 'sret', name: 'Sales returns refunded' };
    if (a === 'purchases' || a === 'purchase-return') return { k: 'pur', name: 'Purchases' };
    if (a.indexOf('p:') === 0) return v > 0 ? { k: fee ? 'fees' : firm ? 'recvc' : 'recv', name: fee ? 'Fees received' : firm ? 'Received from customers' : 'Received from customers and members' } : { k: 'paid', name: 'Paid to suppliers' };
    if (/^gst-/.test(a)) return { k: 'gst', name: 'GST' };
    if (/^tds-|^tcs-/.test(a)) return { k: 'tds', name: 'TDS and TCS' };
    if (a === 'round-off') return { k: 'round', name: 'Round off' };
    if (a === 'opening') return { k: 'opening', name: 'Opening balances entered' };
    var px = a.split(':')[0], rest = a.slice(px.length + 1);
    var nm = { exp: '', inc: '', cap: firm ? 'Capital introduced: ' : 'Capital fund: ', drw: 'Drawings: ', loan: 'Loans: ', od: 'Loans: ', given: 'Loans given: ', fa: 'Fixed assets: ', ocl: '', oca: '' }[px];
    if (nm != null && rest) return { k: a, name: nm + rest.replace(/^./, function (c) { return c.toUpperCase(); }), px: px, rest: rest };
    return { k: a, name: a };
  }
  function recPay(docs, biz, from, to, firm) {
    var cb = B.book(docs, biz, 'cash', from, to), bb = B.book(docs, biz, 'bank', from, to), rec = {}, pay = {};
    var feeP = {}; B.inBooks(docs, biz).forEach(function (d) { if (d.type === 'fee') feeP['p:' + key(B.partyName(d))] = 1; });
    function add(T, h, v) { var x = T[h.k] = T[h.k] || { k: h.k, name: h.name, px: h.px || '', rest: h.rest || '', v: 0 }; x.v = r2(x.v + v); }
    B.inBooks(docs, biz).forEach(function (d) {
      var L = B.postings(d), cheq = d.mode === 'cheque' && d.chq && d.chq.st === 'ok' && d.chq.on;
      var inP = L.some(function (l) { if (!MONEY[l.a]) return false; var dt = l.a === 'bank' && cheq ? d.chq.on : d.date; return dt >= from && dt <= to; });
      if (!inP) return;
      var m = r2(L.reduce(function (s, l) { return s + (MONEY[l.a] ? l.dr - l.cr : 0); }, 0));
      if (!m) return;   /* cash deposited in the bank and the like: money stays inside */
      var other = {};
      L.forEach(function (l) { if (!MONEY[l.a]) other[l.a] = r2((other[l.a] || 0) + l.cr - l.dr); });
      Object.keys(other).forEach(function (a) { var v = other[a]; if (!v) return; var h = rpHead(a, d, v, feeP, firm); add(v > 0 ? rec : pay, h, v > 0 ? v : -v); });
    });
    /* a head on both sides (a customer paid and was refunded) keeps both, like a cash book */
    function list(T) { return Object.keys(T).map(function (k) { return T[k]; }).filter(function (x) { return x.v; }).sort(function (a, c) { return c.v - a.v; }); }
    var R = list(rec), P = list(pay), tr = r2(R.reduce(function (s, x) { return s + x.v; }, 0)), tp = r2(P.reduce(function (s, x) { return s + x.v; }, 0));
    var open = { cash: cb.open, bank: bb.open }, close = { cash: cb.close, bank: bb.close };
    /* money lines of a record with two dates (a cheque that cleared later) can fall half outside: show the gap honestly */
    var gap = r2(open.cash + open.bank + tr - tp - close.cash - close.bank);
    return { open: open, close: close, rec: R, pay: P, recTotal: tr, payTotal: tp, gap: gap };
  }

  var API = { TYPES: TYPES, btype: btype, hasPartners: hasPartners, DIRECT: DIRECT, isDirect: isDirect, rawItems: rawItems, hasProduction: hasProduction, purchasesOf: purchasesOf, mfg: mfg,
    fullCost: fullCost, fyStartOf: fyStartOf, remLimit: remLimit, yearPart: yearPart, partnerAccounts: partnerAccounts, appropriation: appropriation, capitals: capitals, firm: firm, rpHead: rpHead, recPay: recPay, prevDay: prevDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSFA = API;
})(typeof window !== 'undefined' ? window : this);
