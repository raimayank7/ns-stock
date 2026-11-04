/* NSStock: the stock register underneath stock.niveshsahayak.in (and the closing stock of profit-loss.).
   Like NSBooks, nothing extra is stored for bills: every saved document in the data home is read on the fly.
   Pure functions: the page passes in documents and item masters and gets movements, a summary and item ledgers back.

   Goods come in:   pbill (purchase bill), self (self invoice), note credit with reason 'ret' (sales return),
                    stk open (opening stock), stk adj with a + quantity (found, extra on count)
   Goods go out:    invoice, cashmemo, pbill return (purchase return), stk adj with a − quantity
                    (damage, own use, free sample, gift, lost or stolen, expired, short on count)
   Record of this site (store 'doc', seller = our business):
     { type:'stk', kind:'open'|'adj', date, no, seller, note, lines:[{ desc, unit, qty, rate, reason }] }
     open: qty = quantity in hand on that date, rate = cost per unit. adj: qty signed (+ in, − out), reason code.
   Which lines count: item masters marked as goods, or any name that was bought, opened or adjusted.
   Services (master kind 'service' or SAC code 99…) and names that were only ever sold are left out.
   Value: weighted average cost of opening stock and purchases (rate after discount, without GST) up to the date. */
(function (G) {
  'use strict';
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function r3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  var OUTR = { damage: 1, own: 1, sample: 1, gift: 1, lost: 1, expired: 1, short: 1 };
  var INR = { found: 1, extra: 1 };

  function bizOf(d) { return key(d.seller && d.seller.name); }
  function lineQty(it) { return it.qty === '' || it.qty == null ? 1 : num(it.qty); }
  function lineCost(it) { var r = num(it.rate); return r2(r - r * num(it.disc) / 100); }
  function isService(m, it) { return m && m.kind === 'service' || /^99/.test(String(it && it.hsn || m && m.hsn || '').replace(/\D/g, '')); }

  /* every stock movement of one business, in date order: { k, name, unit, date, qty (+ in / − out), rate (cost, in only), src, reason, d } */
  function moves(docs, items, biz) {
    var b = key(biz), M = {}, out = [];
    (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
    (docs || []).forEach(function (d) {
      if (b && bizOf(d) !== b) return;
      var ty = d.type || 'invoice', src = '', sign = 0;
      if (ty === 'stk') src = d.kind === 'open' ? 'open' : 'adj';
      else if (ty === 'pbill') { src = d.kind === 'return' ? 'pret' : 'buy'; sign = d.kind === 'return' ? -1 : 1; }
      else if (ty === 'self') { src = 'buy'; sign = 1; }
      else if (ty === 'invoice' || ty === 'cashmemo') { src = 'sale'; sign = -1; }
      else if (ty === 'note' && d.kind !== 'debit' && d.reason === 'ret') { src = 'sret'; sign = 1; }
      if (!src) return;
      (src === 'open' || src === 'adj' ? d.lines : d.items || []).forEach(function (it) {
        var nm = String(it.desc || '').trim(); if (!nm) return;
        var k = key(nm), m = M[k];
        if (isService(m, it)) return;
        var q, rate = null;
        if (src === 'open') { q = num(it.qty); rate = num(it.rate); }
        else if (src === 'adj') { q = num(it.qty); if (OUTR[it.reason] && q > 0) q = -q; if (INR[it.reason] && q < 0) q = -q; }
        else { q = sign * lineQty(it); if (src === 'buy') rate = lineCost(it); }
        if (!q) return;
        out.push({ k: k, name: m ? m.desc : nm, unit: it.unit || m && m.unit || '', date: d.date || '', qty: r3(q), rate: rate, src: src, reason: it.reason || '', d: d });
      });
    });
    var ORD = { open: 0, buy: 1, sret: 1, adj: 2, pret: 3, sale: 3 };
    out.sort(function (x, y) { return x.date.localeCompare(y.date) || ORD[x.src] - ORD[y.src] || (x.d.created || 0) - (y.d.created || 0); });
    return out;
  }

  /* which names the register follows: goods masters + anything bought, opened or adjusted */
  function tracked(mv, items) {
    var T = {};
    (items || []).forEach(function (m) { if (m && m.desc && m.kind === 'goods' && !isService(m)) T[key(m.desc)] = { k: key(m.desc), name: m.desc, unit: m.unit || '', min: num(m.min), m: m }; });
    var M = {}; (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
    mv.forEach(function (x) {
      if (x.src === 'sale' || x.src === 'sret') return;
      if (!T[x.k]) T[x.k] = { k: x.k, name: x.name, unit: x.unit, min: num(M[x.k] && M[x.k].min), m: M[x.k] || null };
      if (!T[x.k].unit && x.unit) T[x.k].unit = x.unit;
    });
    return T;
  }

  /* summary of every tracked item for a period: opening, in, out, adjust, closing, average cost, value, low */
  function summary(docs, items, biz, from, to) {
    var mv = moves(docs, items, biz), T = tracked(mv, items), S = {};
    Object.keys(T).forEach(function (k) { S[k] = { k: k, name: T[k].name, unit: T[k].unit, min: T[k].min, m: T[k].m, open: 0, inq: 0, outq: 0, adj: 0, close: 0, cq: 0, cv: 0, n: 0 }; });
    mv.forEach(function (x) {
      var s = S[x.k]; if (!s) return;
      if (to && x.date > to) return;
      if (x.rate != null && x.qty > 0) { s.cq += x.qty; s.cv += x.qty * x.rate; }
      if (!from || x.date < from || x.src === 'open') s.open += x.qty;
      else if (x.src === 'adj') s.adj += x.qty;
      else if (x.qty > 0) s.inq += x.qty;
      else s.outq -= x.qty;
      s.n++;
    });
    var tot = 0, low = 0, neg = 0;
    var list = Object.keys(S).map(function (k) {
      var s = S[k];
      s.open = r3(s.open); s.inq = r3(s.inq); s.outq = r3(s.outq); s.adj = r3(s.adj);
      s.close = r3(s.open + s.inq - s.outq + s.adj);
      s.cost = s.cq > 0 ? r2(s.cv / s.cq) : 0;
      s.value = s.close > 0 ? r2(s.close * s.cost) : 0;
      s.low = s.min > 0 && s.close <= s.min;
      delete s.cq; delete s.cv;
      tot = r2(tot + s.value); if (s.low) low++; if (s.close < 0) neg++;
      return s;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { items: list, value: tot, low: low, neg: neg };
  }

  /* one item's register: opening, rows with running balance, closing */
  function ledger(docs, items, biz, k, from, to) {
    var open = 0, rows = [], bal;
    moves(docs, items, biz).forEach(function (x) {
      if (x.k !== k || to && x.date > to) return;
      if (from && x.date < from) { open = r3(open + x.qty); return; }
      rows.push(x);
    });
    bal = open;
    rows.forEach(function (r) { bal = r3(bal + r.qty); r.bal = bal; });
    return { open: open, rows: rows, close: bal, inq: r3(rows.reduce(function (a, r) { return a + (r.qty > 0 ? r.qty : 0); }, 0)), outq: r3(rows.reduce(function (a, r) { return a + (r.qty < 0 ? -r.qty : 0); }, 0)) };
  }

  /* quantity in hand of every tracked item on a date (for the count sheet and the adjustment form) */
  function inHand(docs, items, biz, upto) {
    var o = {}; summary(docs, items, biz, '', upto).items.forEach(function (s) { o[s.k] = s.close; }); return o;
  }

  var API = { num: num, r2: r2, r3: r3, key: key, moves: moves, tracked: tracked, summary: summary, ledger: ledger, inHand: inHand, OUTR: OUTR, INR: INR };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSStock = API;
})(this);
