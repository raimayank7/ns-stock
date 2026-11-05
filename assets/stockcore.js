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
   Value: weighted average cost of opening stock and purchases (rate after discount, without GST) up to the date.
   Batch 2 (godowns, batches, manufacturing):
     godown   d.gd on a bill (or it.gd on a line) = the godown the goods left or came into; '' = the main godown.
     move     { type:'stk', kind:'move', from, to, lines:[{ desc, unit, qty, batch }] }: stock transfer between godowns
              (the business's total does not change, so the summary of all godowns leaves transfers out).
     make     { type:'stk', kind:'make', gd, out:{ desc, unit, qty, rate, batch, exp }, lines:[{ desc, unit, qty }], extra }:
              production; raw material lines go out, the finished item comes in at out.rate (cost of the raw material
              at average cost plus extra cost, per unit, worked out when it was saved), which joins the average cost.
     batch    it.batch, it.exp (YYYY-MM, usable to the end of that month), it.serial (serial / IMEI numbers, comma separated). */
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

  function serialsOf(it) { return String(it && it.serial || '').split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function mv(k, name, unit, d, q, rate, src, reason, gd, it) {
    return { k: k, name: name, unit: unit, date: d.date || '', qty: r3(q), rate: rate, src: src, reason: reason || '', d: d,
      g: String(gd || '').trim(), batch: String(it && it.batch || '').trim(), exp: String(it && it.exp || '').trim(), sn: serialsOf(it) };
  }
  /* godown filter: gd null/'' = the whole business (transfers left out), else that godown ('main' = the main godown, '') */
  var MAIN = 'main';
  function gdOk(x, gd) { if (gd == null || gd === '') return x.src !== 'move'; return key(x.g || MAIN) === key(gd); }

  /* every stock movement of one business, in date order: { k, name, unit, date, qty (+ in / − out), rate (cost, in only), src, reason, d } */
  function moves(docs, items, biz) {
    var b = key(biz), M = {}, out = [];
    (items || []).forEach(function (m) { if (m && m.desc) M[key(m.desc)] = m; });
    (docs || []).forEach(function (d) {
      if (b && bizOf(d) !== b) return;
      var ty = d.type || 'invoice', src = '', sign = 0;
      if (ty === 'stk' && d.kind === 'move') {
        (d.lines || []).forEach(function (it) {
          var nm = String(it.desc || '').trim(), q = num(it.qty); if (!nm || !q) return;
          var k = key(nm), m = M[k];
          [[d.from, -q], [d.to, q]].forEach(function (p) { out.push(mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, p[1], null, 'move', '', p[0], it)); });
        });
        return;
      }
      if (ty === 'stk' && d.kind === 'make') {
        var o = d.out || {}, onm = String(o.desc || '').trim(), oq = num(o.qty);
        (d.lines || []).forEach(function (it) {
          var nm = String(it.desc || '').trim(), q = num(it.qty); if (!nm || !q) return;
          var k = key(nm), m = M[k]; if (isService(m, it)) return;
          out.push(mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, -q, null, 'use', '', d.gd, it));
        });
        if (onm && oq) { var ok = key(onm), om = M[ok]; out.push(mv(ok, om ? om.desc : onm, o.unit || om && om.unit || '', d, oq, num(o.rate), 'make', '', d.gd, o)); }
        return;
      }
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
        out.push(mv(k, m ? m.desc : nm, it.unit || m && m.unit || '', d, q, rate, src, it.reason || '', it.gd != null && it.gd !== '' ? it.gd : d.gd, it));
      });
    });
    var ORD = { open: 0, buy: 1, sret: 1, make: 1, move: 2, use: 2, adj: 2, pret: 3, sale: 3 };
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
  function summary(docs, items, biz, from, to, gd) {
    var all = moves(docs, items, biz), T = tracked(all, items), S = {}, CQ = {};
    var mv = all.filter(function (x) { return gdOk(x, gd); });
    /* average cost is the business's own, whichever godown the goods sit in */
    all.forEach(function (x) { if (to && x.date > to || x.rate == null || x.qty <= 0) return; var c = CQ[x.k] = CQ[x.k] || [0, 0]; c[0] += x.qty; c[1] += x.qty * x.rate; });
    Object.keys(T).forEach(function (k) { S[k] = { k: k, name: T[k].name, unit: T[k].unit, min: T[k].min, m: T[k].m, open: 0, inq: 0, outq: 0, adj: 0, close: 0, n: 0 }; });
    mv.forEach(function (x) {
      var s = S[x.k]; if (!s) return;
      if (to && x.date > to) return;
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
      var c = CQ[k]; s.cost = c && c[0] > 0 ? r2(c[1] / c[0]) : 0;
      s.value = s.close > 0 ? r2(s.close * s.cost) : 0;
      s.low = s.min > 0 && s.close <= s.min;
            tot = r2(tot + s.value); if (s.low) low++; if (s.close < 0) neg++;
      return s;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { items: list, value: tot, low: low, neg: neg };
  }

  /* one item's register: opening, rows with running balance, closing */
  function ledger(docs, items, biz, k, from, to, gd) {
    var open = 0, rows = [], bal;
    moves(docs, items, biz).forEach(function (x) {
      if (x.k !== k || to && x.date > to || !gdOk(x, gd)) return;
      if (from && x.date < from) { open = r3(open + x.qty); return; }
      rows.push(x);
    });
    bal = open;
    rows.forEach(function (r) { bal = r3(bal + r.qty); r.bal = bal; });
    return { open: open, rows: rows, close: bal, inq: r3(rows.reduce(function (a, r) { return a + (r.qty > 0 ? r.qty : 0); }, 0)), outq: r3(rows.reduce(function (a, r) { return a + (r.qty < 0 ? -r.qty : 0); }, 0)) };
  }

  /* quantity in hand of every tracked item on a date (for the count sheet and the adjustment form) */
  function inHand(docs, items, biz, upto, gd) {
    var o = {}; summary(docs, items, biz, '', upto, gd).items.forEach(function (s) { o[s.k] = s.close; }); return o;
  }

  /* stock of each godown up to a date: [{ g ('' = main), value, n (items in hand), neg }]; names = godowns set in Settings */
  function godowns(docs, items, biz, upto, names) {
    var seen = {}, out = [];
    [''].concat(names || []).concat(moves(docs, items, biz).map(function (x) { return x.g; })).forEach(function (g) {
      var k = key(g || MAIN); if (seen[k]) return; seen[k] = 1;
      var s = summary(docs, items, biz, '', upto, g || MAIN);
      out.push({ g: g || '', value: s.value, n: s.items.filter(function (x) { return x.close; }).length, neg: s.neg, items: s.items });
    });
    return out;
  }

  /* expiry month YYYY-MM -> last day of that month (goods may be used until then) */
  function expEnd(m) { if (!/^\d{4}-\d{2}$/.test(m || '')) return ''; var d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)); return d.toISOString().slice(0, 10); }
  /* batches in hand of one item (k) or every item: [{ k, name, batch, exp, qty }], qty > 0 only.
     Goods going out take their own batch first; what is left (or a line without a batch) takes the earliest expiry first. */
  function batches(docs, items, biz, k, upto, gd) {
    var by = {}, order = [];
    moves(docs, items, biz).forEach(function (x) {
      if (k && x.k !== k || upto && x.date > upto || !gdOk(x, gd)) return;
      var id = x.k + '|' + key(x.batch);
      if (x.qty > 0) { if (!by[id]) { by[id] = { k: x.k, name: x.name, batch: x.batch, exp: x.exp, qty: 0 }; order.push(id); } if (x.exp && !by[id].exp) by[id].exp = x.exp; by[id].qty = r3(by[id].qty + x.qty); return; }
      var need = -x.qty;
      if (x.batch && by[id]) { var t = Math.min(need, by[id].qty); by[id].qty = r3(by[id].qty - t); need = r3(need - t); }
      order.filter(function (o) { return by[o].k === x.k && by[o].qty > 0; }).sort(function (a, b) { return (by[a].exp || '9999').localeCompare(by[b].exp || '9999'); }).forEach(function (o) {
        if (need <= 0) return; var t2 = Math.min(need, by[o].qty); by[o].qty = r3(by[o].qty - t2); need = r3(need - t2);
      });
    });
    return order.map(function (o) { return by[o]; }).filter(function (b) { return b.qty > 0.0005; });
  }
  /* batches that expire within `days` of today (or have expired), earliest first */
  function expiring(docs, items, biz, today, days) {
    var lim = new Date(Date.parse(today + 'T00:00:00Z') + (days || 0) * 864e5).toISOString().slice(0, 10);
    return batches(docs, items, biz, '', today).filter(function (b) { var e = expEnd(b.exp); return e && e <= lim; })
      .map(function (b) { b.end = expEnd(b.exp); b.gone = b.end < today; return b; }).sort(function (a, b) { return a.end.localeCompare(b.end); });
  }
  /* serial / IMEI numbers: in hand, and where each one went (last movement) */
  function serials(docs, items, biz, k) {
    var have = {}, went = {};
    moves(docs, items, biz).forEach(function (x) {
      if (k && x.k !== k || x.src === 'move') return;
      x.sn.forEach(function (n) { var nk = key(n); if (x.qty > 0) { have[nk] = { sn: n, k: x.k, name: x.name, d: x.d }; delete went[nk]; } else { delete have[nk]; went[nk] = { sn: n, k: x.k, name: x.name, d: x.d }; } });
    });
    return { inHand: Object.keys(have).map(function (n) { return have[n]; }), out: Object.keys(went).map(function (n) { return went[n]; }) };
  }
  /* cost of raw material at average cost on a date: { lines: [{ k, qty, cost, value, have }], total } */
  function makeCost(docs, items, biz, lines, date) {
    var S = {}; summary(docs, items, biz, '', date).items.forEach(function (s) { S[s.k] = s; });
    var tot = 0, out = (lines || []).map(function (l) { var k = key(l.desc), c = S[k] ? S[k].cost : 0, v = r2(num(l.qty) * c); tot += v; return { k: k, qty: num(l.qty), cost: c, value: v, have: S[k] ? S[k].close : 0 }; });
    return { lines: out, total: r2(tot) };
  }

  var API = { num: num, r2: r2, r3: r3, key: key, moves: moves, tracked: tracked, summary: summary, ledger: ledger, inHand: inHand, OUTR: OUTR, INR: INR,
    MAIN: MAIN, godowns: godowns, batches: batches, expiring: expiring, expEnd: expEnd, serials: serials, serialsOf: serialsOf, makeCost: makeCost };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSStock = API;
})(this);
