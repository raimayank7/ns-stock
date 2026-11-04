/* stock.niveshsahayak.in: stock register on the shared data home.
   Stock in and out come by themselves from saved purchase bills, self invoices, sales bills, cash memos, purchase
   returns and credit notes for returned goods (NSStock in stockcore.js). This site adds opening stock, adjustments
   (damage, own use, samples, gifts, lost, expired, found) and physical counts as 'stk' records, low-stock levels on
   the item masters (field min), and prints the stock summary and each item's register. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, qty = NS.qty, K = NSStock, t = NSB.t, key = NSB.key;
  var SECS = ['home', 'item', 'entries', 'low'], cur = 'home', arg = '', q = '', filt = 'all';
  var REASONS = ['damage', 'own', 'sample', 'gift', 'lost', 'expired', 'short', 'found', 'extra'];

  function route() {
    var h = decodeURIComponent(location.hash.slice(1)), p = h.split('/');
    cur = SECS.indexOf(p[0]) >= 0 ? p[0] : 'home'; arg = p.slice(1).join('/');
    show(true);
  }
  function show(focus) {
    NSB.navMark(cur === 'item' ? 'home' : cur);
    return NSB.load().then(function () {
      var pane = $('[data-pane]');
      NSB.modeLine();
      if (!NSB.biz()) { pane.innerHTML = NSB.noBiz(); return; }
      pane.innerHTML = NSB.bizBar() + ({ home: homeHtml, item: itemHtml, entries: entriesHtml, low: lowHtml })[cur]();
      wire(pane);
      if (focus) NSB.focusH2(pane);
    });
  }
  function D() { return NSB.mine(); }
  function items() { return NSB.data().item; }
  function P() { return NSB.period('stock'); }
  function sum(from, to) { return K.summary(D(), items(), NSB.bizName(), from, to); }

  /* ---------- summary ---------- */
  function homeHtml() {
    var p = P(), S = sum(p.from, p.to);
    var list = S.items.filter(function (s) { return (!q || s.name.toLowerCase().indexOf(q.toLowerCase()) >= 0) && (filt !== 'low' || s.low) && (filt !== 'neg' || s.close < 0); });
    var head = '<div class="pane-hd"><h2>' + esc(t('stk.sum')) + '</h2><div class="quick"><button type="button" class="btn primary" data-form="adj">+ ' + esc(t('stk.adj')) + '</button>' +
      '<button type="button" class="btn" data-form="open">+ ' + esc(t('stk.open')) + '</button><button type="button" class="btn" data-form="count">' + esc(t('stk.count')) + '</button></div></div>';
    var tiles = '<div class="tiles"><div class="tile"><span>' + esc(t('stk.nitems')) + '</span><b>' + S.items.length + '</b></div>' +
      '<div class="tile"><span>' + esc(t('stk.value')) + '</span><b>' + money(S.value) + '</b></div>' +
      '<a class="tile' + (S.low ? ' warn' : '') + '" href="#low"><span>' + esc(t('stk.lowc')) + '</span><b>' + S.low + '</b></a>' +
      (S.neg ? '<div class="tile neg"><span>' + esc(t('stk.negc')) + '</span><b>' + S.neg + '</b></div>' : '') + '</div>';
    if (!S.items.length) return head + NSB.periodBar('stock') + '<div class="card"><h3>' + esc(t('stk.empty')) + '</h3><p>' + esc(t('stk.emptyp')) + '</p><div class="quick">' +
      '<button type="button" class="btn primary" data-form="open">+ ' + esc(t('stk.open')) + '</button><a class="btn" href="' + NSB.toolUrl('app') + '#buy">' + esc(t('stk.addpb')) + '</a></div></div>';
    var rows = list.map(function (s) {
      return '<tr class="' + (s.low ? 'low' : '') + (s.close < 0 ? ' neg' : '') + '"><th scope="row" class="l"><a href="#item/' + encodeURIComponent(s.k) + '">' + esc(s.name) + '</a>' +
        (s.low ? ' <span class="pill warn">' + esc(t('stk.lowp')) + '</span>' : '') + (s.close < 0 ? ' <span class="pill bad">' + esc(t('stk.negp')) + '</span>' : '') + '</th>' +
        '<td class="n">' + qty(s.open) + '</td><td class="n">' + qty(s.inq) + '</td><td class="n">' + qty(s.outq) + '</td><td class="n">' + (s.adj ? qty(s.adj) : '—') + '</td>' +
        '<td class="n cl"><b>' + qty(s.close) + '</b> ' + esc(s.unit) + '</td><td class="n">' + (s.cost ? money(s.cost, false) : '—') + '</td><td class="n">' + (s.value ? money(s.value, false) : '—') + '</td></tr>';
    }).join('');
    return head + NSB.periodBar('stock') + tiles +
      '<div class="tools-row"><label class="sr" for="sb-q">' + esc(t('stk.search')) + '</label><input id="sb-q" type="search" data-q value="' + esc(q) + '" placeholder="' + esc(t('stk.search')) + '">' +
      '<div class="seg" role="group">' + ['all', 'low', 'neg'].map(function (f) { return '<button type="button" class="btn sm" data-filt="' + f + '" aria-pressed="' + (filt === f) + '">' + esc(t('stk.f_' + f)) + '</button>'; }).join('') + '</div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">' + esc(t('stk.item')) + '</th><th class="n">' + esc(t('stk.c_open')) + '</th><th class="n">' + esc(t('stk.c_in')) + '</th><th class="n">' + esc(t('stk.c_out')) +
      '</th><th class="n">' + esc(t('stk.c_adj')) + '</th><th class="n">' + esc(t('stk.c_close')) + '</th><th class="n">' + esc(t('stk.c_cost')) + '</th><th class="n">' + esc(t('stk.c_val')) + '</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8" class="sb-empty">' + esc(t('stk.nomatch')) + '</td></tr>') + '</tbody><tfoot><tr><th class="l" colspan="7">' + esc(t('stk.total')) + '</th><th class="n">' + money(S.value, false) + '</th></tr></tfoot></table></div>' +
      '<p class="sb-note">' + esc(t('stk.how')) + '</p>' +
      '<div class="btns"><button type="button" class="btn" data-print>' + esc(t('sb.print')) + '</button><button type="button" class="btn" data-pdf>' + esc(t('sb.pdf')) + '</button><button type="button" class="btn" data-csv>' + esc(t('sb.csv')) + '</button></div>' +
      '<div class="sb-print">' + sumSheet(S, p) + '</div>';
  }
  function sheetHead(title, p) {
    var b = NSB.biz() || {};
    return '<div class="st-hd"><div><h3>' + esc(b.name || '') + '</h3><div class="soft">' + esc([b.addr, b.city, b.gstin && 'GSTIN ' + b.gstin].filter(Boolean).join(', ')) + '</div></div>' +
      '<div class="r"><b>' + esc(title) + '</b><div class="soft">' + esc(p ? 'From ' + NS.fmtDate(p.from) + ' to ' + NS.fmtDate(p.to) : '') + '</div></div></div>';
  }
  function sumSheet(S, p) {
    return '<div class="stsheet" data-sheet>' + sheetHead('Stock summary', p) + '<table class="tbl"><thead><tr><th>Item</th><th class="n">Opening</th><th class="n">In</th><th class="n">Out</th><th class="n">Adjusted</th><th class="n">Closing</th><th class="n">Avg cost</th><th class="n">Value (Rs)</th></tr></thead><tbody>' +
      S.items.map(function (s) { return '<tr' + (s.low ? ' class="low"' : '') + '><td>' + esc(s.name) + '</td><td class="n">' + qty(s.open) + '</td><td class="n">' + qty(s.inq) + '</td><td class="n">' + qty(s.outq) + '</td><td class="n">' + qty(s.adj) + '</td><td class="n">' + qty(s.close) + ' ' + esc(s.unit) + '</td><td class="n">' + money(s.cost, false) + '</td><td class="n">' + money(s.value, false) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th colspan="7">Stock value at weighted average cost</th><th class="n">' + money(S.value, false) + '</th></tr></tfoot></table>' +
      '<div class="st-ft">Made with Nivesh Sahayak Stock (stock.niveshsahayak.in) on ' + NS.fmtDate(NS.today()) + '</div></div>';
  }

  /* ---------- one item's register ---------- */
  function particulars(x, en) {
    var d = x.d, nm = en ? NSB.enName(d) : NSB.docName(d), who = d.buyer && d.buyer.name;
    var why = x.src === 'adj' && x.reason ? (en ? ' (' + ({ damage: 'damaged', own: 'own use', sample: 'free sample', gift: 'gift', lost: 'lost or stolen', expired: 'expired', short: 'short on count', found: 'found', extra: 'extra on count' })[x.reason] + ')' : ' (' + t('stk.r_' + x.reason) + ')') : '';
    return nm + ' ' + (d.no || d.billNo || '') + (who ? ' · ' + who : '') + why;
  }
  function itemHtml() {
    var p = P(), s = sum(p.from, p.to).items.filter(function (x) { return x.k === arg; })[0];
    if (!s) return '<p><a href="#">' + esc(t('sb.back')) + '</a></p><p class="soft">' + esc(t('stk.nomatch')) + '</p>';
    var L = K.ledger(D(), items(), NSB.bizName(), arg, p.from, p.to);
    var rows = L.rows.map(function (r) {
      return '<tr><td>' + NS.fmtDate(r.date) + '</td><td class="l">' + esc(particulars(r)) + '</td><td class="n">' + (r.qty > 0 ? qty(r.qty) : '') + '</td><td class="n">' + (r.qty < 0 ? qty(-r.qty) : '') + '</td><td class="n">' + qty(r.bal) + '</td></tr>';
    }).join('');
    var sheet = '<div class="stsheet" data-sheet>' + sheetHead('Stock register: ' + s.name, p) + '<table class="tbl"><thead><tr><th>Date</th><th>Particulars</th><th class="n">In</th><th class="n">Out</th><th class="n">Balance</th></tr></thead><tbody>' +
      '<tr><td>' + NS.fmtDate(p.from) + '</td><td>Opening balance</td><td></td><td></td><td class="n">' + qty(L.open) + '</td></tr>' +
      L.rows.map(function (r) { return '<tr><td>' + NS.fmtDate(r.date) + '</td><td>' + esc(particulars(r, true)) + '</td><td class="n">' + (r.qty > 0 ? qty(r.qty) : '') + '</td><td class="n">' + (r.qty < 0 ? qty(-r.qty) : '') + '</td><td class="n">' + qty(r.bal) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><th colspan="2">Closing balance (' + esc(s.unit || 'units') + ')</th><th class="n">' + qty(L.inq) + '</th><th class="n">' + qty(L.outq) + '</th><th class="n">' + qty(L.close) + '</th></tr></tfoot></table>' +
      '<div class="st-ft">Value at weighted average cost Rs ' + money(s.value, false) + '. Made with Nivesh Sahayak Stock on ' + NS.fmtDate(NS.today()) + '</div></div>';
    return '<p><a href="#">' + esc(t('sb.back')) + '</a></p><div class="pane-hd"><h2>' + esc(s.name) + '</h2><div class="quick"><button type="button" class="btn" data-form="adj" data-for="' + esc(s.k) + '">+ ' + esc(t('stk.adj')) + '</button>' +
      '<button type="button" class="btn" data-min="' + esc(s.k) + '">' + esc(t('stk.setmin')) + '</button></div></div>' + NSB.periodBar('stock') +
      '<div class="tiles"><div class="tile"><span>' + esc(t('stk.c_close')) + '</span><b>' + qty(s.close) + ' ' + esc(s.unit) + '</b></div><div class="tile"><span>' + esc(t('stk.c_cost')) + '</span><b>' + money(s.cost) + '</b></div>' +
      '<div class="tile"><span>' + esc(t('stk.c_val')) + '</span><b>' + money(s.value) + '</b></div><div class="tile' + (s.low ? ' warn' : '') + '"><span>' + esc(t('stk.minl')) + '</span><b>' + (s.min ? qty(s.min) : '—') + '</b></div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(t('sb.date')) + '</th><th class="l">' + esc(t('sb.part')) + '</th><th class="n">' + esc(t('stk.c_in')) + '</th><th class="n">' + esc(t('stk.c_out')) + '</th><th class="n">' + esc(t('stk.bal')) + '</th></tr></thead><tbody>' +
      '<tr><td>' + NS.fmtDate(p.from) + '</td><td class="l">' + esc(t('stk.c_open')) + '</td><td></td><td></td><td class="n">' + qty(L.open) + '</td></tr>' + rows +
      '</tbody><tfoot><tr><th colspan="2" class="l">' + esc(t('stk.c_close')) + '</th><th class="n">' + qty(L.inq) + '</th><th class="n">' + qty(L.outq) + '</th><th class="n">' + qty(L.close) + '</th></tr></tfoot></table></div>' +
      '<div class="btns"><button type="button" class="btn" data-print>' + esc(t('sb.print')) + '</button><button type="button" class="btn" data-pdf>' + esc(t('sb.pdf')) + '</button></div><div class="sb-print">' + sheet + '</div>';
  }

  /* ---------- opening stock and adjustments saved here ---------- */
  function entriesHtml() {
    var list = D().filter(function (d) { return d.type === 'stk'; }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.updated || 0) - (a.updated || 0); });
    return '<div class="pane-hd"><h2>' + esc(t('stk.entries')) + '</h2><div class="quick"><button type="button" class="btn primary" data-form="adj">+ ' + esc(t('stk.adj')) + '</button><button type="button" class="btn" data-form="open">+ ' + esc(t('stk.open')) + '</button></div></div>' +
      '<p class="sb-note">' + esc(t('stk.entriesh')) + '</p>' +
      (list.length ? '<ul class="rows">' + list.map(function (d) {
        var n = (d.lines || []).length;
        return '<li><div class="ln"><span><b>' + esc(NSB.docName(d)) + ' ' + esc(d.no || '') + '</b><span class="soft"> · ' + NS.fmtDate(d.date) + ' · ' + esc(t('stk.nlines', { n: n })) + '</span>' +
          '<span class="soft"> · ' + esc((d.lines || []).slice(0, 3).map(function (l) { return l.desc + ' ' + qty(num(l.qty)); }).join(', ')) + (n > 3 ? '…' : '') + '</span></span></div>' +
          '<div class="acts"><button type="button" class="btn sm" data-edit="' + esc(d.id) + '">' + esc(t('sb.edit')) + '</button><button type="button" class="btn sm danger" data-del="' + esc(d.id) + '">' + esc(t('sb.del')) + '</button></div></li>';
      }).join('') + '</ul>' : '<p class="soft">' + esc(t('sb.none')) + '</p>');
  }
  function lowHtml() {
    var S = sum('', NS.today()), low = S.items.filter(function (s) { return s.low; }), unset = S.items.filter(function (s) { return !s.min; }).length;
    return '<div class="pane-hd"><h2>' + esc(t('stk.low')) + '</h2><a class="btn primary" href="' + NSB.toolUrl('purchase-order') + '">' + esc(t('stk.makepo')) + '</a></div><p class="sb-note">' + esc(t('stk.lowh')) + '</p>' +
      (low.length ? '<ul class="rows">' + low.map(function (s) {
        return '<li><a href="#item/' + encodeURIComponent(s.k) + '"><b>' + esc(s.name) + '</b><span class="soft">' + esc(t('stk.lowline', { a: qty(s.close) + ' ' + s.unit, b: qty(s.min) })) + '</span></a><div class="acts"><button type="button" class="btn sm" data-min="' + esc(s.k) + '">' + esc(t('stk.setmin')) + '</button></div></li>';
      }).join('') + '</ul>' : '<p class="soft">' + esc(t('stk.nolow')) + '</p>') +
      (unset ? '<p class="sb-note">' + esc(t('stk.unset', { n: unset })) + '</p>' : '');
  }

  /* ---------- forms ---------- */
  function itemNames() {
    var seen = {}, out = [];
    items().forEach(function (m) { if (m.desc && m.kind !== 'service' && !seen[key(m.desc)]) { seen[key(m.desc)] = 1; out.push(m.desc); } });
    sum('', '').items.forEach(function (s) { if (!seen[s.k]) { seen[s.k] = 1; out.push(s.name); } });
    return out.sort();
  }
  function unitOf(name) { var k = key(name), m = items().filter(function (x) { return key(x.desc) === k; })[0], s = sum('', '').items.filter(function (x) { return x.k === k; })[0]; return m && m.unit || s && s.unit || ''; }
  function lineHtml(kind, l, i) {
    var id = function (x) { return 'l' + i + '-' + x; };
    return '<div class="adjl" data-line><label class="lc lc-desc" for="' + id('d') + '"><span>' + esc(t('stk.item')) + '</span><input id="' + id('d') + '" data-k="desc" list="sb-items" value="' + esc(l.desc || '') + '" dir="auto"></label>' +
      '<label class="lc" for="' + id('q') + '"><span>' + esc(t(kind === 'open' ? 'stk.qtyh' : 'stk.qty')) + '</span><input id="' + id('q') + '" data-k="qty" inputmode="decimal" value="' + esc(l.qty != null ? Math.abs(num(l.qty)) || '' : '') + '"></label>' +
      (kind === 'open' ? '<label class="lc" for="' + id('r') + '"><span>' + esc(t('stk.cost')) + '</span><input id="' + id('r') + '" data-k="rate" inputmode="decimal" value="' + esc(l.rate != null ? l.rate : '') + '"></label>'
        : '<label class="lc" for="' + id('r') + '"><span>' + esc(t('stk.reason')) + '</span><select id="' + id('r') + '" data-k="reason">' + REASONS.map(function (r) { return '<option value="' + r + '"' + (l.reason === r ? ' selected' : '') + '>' + esc(t('stk.r_' + r)) + '</option>'; }).join('') + '</select></label>') +
      '<label class="lc" for="' + id('u') + '"><span>' + esc(t('stk.unit')) + '</span><input id="' + id('u') + '" data-k="unit" value="' + esc(l.unit || '') + '"></label>' +
      '<button type="button" class="btn sm rm" data-rm aria-label="' + esc(t('sb.rmline')) + '">✕</button></div>';
  }
  function nextNo(kind) {
    var fy = NS.fy(NS.today()), pre = (kind === 'open' ? 'OS/' : 'SA/') + fy.slice(2) + '/';
    var n = D().filter(function (d) { return d.type === 'stk' && d.kind === kind && String(d.no || '').indexOf(pre) === 0; }).length;
    return pre + String(n + 1).padStart(3, '0');
  }
  function form(kind, rec, forKey) {
    if (kind === 'count') return countForm();
    var r = rec || { type: 'stk', kind: kind, date: kind === 'open' ? NSB.fyStart(NS.today()) : NS.today(), lines: [{ desc: forKey ? sum('', '').items.filter(function (s) { return s.k === forKey; })[0].name : '', reason: 'damage' }] };
    var lines = (r.lines || []).map(function (l) { return Object.assign({}, l); });
    var f = NSB.dialog(t(kind === 'open' ? 'stk.open' : 'stk.adj'),
      '<datalist id="sb-items">' + itemNames().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<p class="hint">' + esc(t(kind === 'open' ? 'stk.openh' : 'stk.adjh')) + '</p>' +
      '<div class="fg"><div class="f"><label for="f-date">' + esc(t('sb.date')) + '</label><input type="date" id="f-date" value="' + esc(r.date) + '" required></div>' +
      '<div class="f"><label for="f-no">' + esc(t('stk.no')) + '</label><input id="f-no" value="' + esc(r.no || nextNo(kind)) + '"></div>' +
      '<div class="f wide"><label for="f-note">' + esc(t('sb.note')) + '</label><input id="f-note" value="' + esc(r.note || '') + '" dir="auto"></div></div>' +
      '<fieldset><legend>' + esc(t('stk.items')) + '</legend><div data-lines></div><button type="button" class="btn sm" data-add>' + esc(t('sb.addline')) + '</button></fieldset>' +
      '<div class="dlg-foot"><button type="submit" class="btn primary">' + esc(t('sb.save')) + '</button><button type="button" class="btn" data-cancel>' + esc(t('sb.cancel')) + '</button></div>');
    function draw() { $('[data-lines]', f).innerHTML = lines.map(function (l, i) { return lineHtml(kind, l, i); }).join(''); }
    function read() { lines = $$('[data-line]', f).map(function (row) { var l = {}; $$('[data-k]', row).forEach(function (e) { l[e.getAttribute('data-k')] = e.value; }); return l; }); }
    draw();
    f.addEventListener('input', function (e) { if (e.target.getAttribute('data-k') === 'desc') { var u = e.target.closest('[data-line]').querySelector('[data-k=unit]'); if (!u.value) u.value = unitOf(e.target.value); } });
    f.addEventListener('click', function (e) {
      if (e.target.closest('[data-add]')) { read(); lines.push({ reason: lines.length ? lines[lines.length - 1].reason : 'damage' }); draw(); var d = $$('[data-k=desc]', f); d[d.length - 1].focus(); }
      if (e.target.closest('[data-rm]')) { read(); var i = $$('[data-rm]', f).indexOf(e.target.closest('[data-rm]')); lines.splice(i, 1); if (!lines.length) lines.push({ reason: 'damage' }); draw(); }
      if (e.target.closest('[data-cancel]')) NSB.closeDialog();
    });
    f.onsubmit = function (e) {
      e.preventDefault(); read();
      var good = lines.filter(function (l) { return String(l.desc || '').trim() && num(l.qty); });
      if (!$('#f-date', f).value || !good.length) { NS.toast(t('stk.need'), 'bad'); return; }
      var d = Object.assign(rec || { type: 'stk', kind: kind, app: 1 }, { date: $('#f-date', f).value, no: $('#f-no', f).value.trim(), note: $('#f-note', f).value.trim(), seller: rec ? rec.seller : NSB.sellerCopy(),
        lines: good.map(function (l) {
          var o = { desc: String(l.desc).trim(), unit: String(l.unit || '').trim(), qty: Math.abs(num(l.qty)) };
          if (kind === 'open') o.rate = num(l.rate); else { o.reason = l.reason; if (K.OUTR[l.reason]) o.qty = -o.qty; }
          return o;
        }) });
      saveMasters(d.lines).then(function () { return NSStore.put('doc', d); }).then(done);
    };
  }
  /* physical count: every item with what the books say; the differences are saved as one adjustment */
  function countForm() {
    var dt = NS.today(), hand = K.inHand(D(), items(), NSB.bizName(), dt), S = sum('', dt).items;
    var f = NSB.dialog(t('stk.count'), '<p class="hint">' + esc(t('stk.counth')) + '</p>' +
      '<div class="fg"><div class="f"><label for="f-date">' + esc(t('sb.date')) + '</label><input type="date" id="f-date" value="' + dt + '"></div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(t('stk.item')) + '</th><th class="n">' + esc(t('stk.book')) + '</th><th class="n">' + esc(t('stk.counted')) + '</th></tr></thead><tbody>' +
      S.map(function (s, i) { return '<tr><th scope="row"><label for="c' + i + '">' + esc(s.name) + '</label></th><td class="n">' + qty(hand[s.k] || 0) + ' ' + esc(s.unit) + '</td><td class="n"><input id="c' + i + '" data-c="' + esc(s.k) + '" inputmode="decimal" style="width:110px"></td></tr>'; }).join('') +
      '</tbody></table></div><div class="dlg-foot"><button type="submit" class="btn primary">' + esc(t('stk.savecount')) + '</button><button type="button" class="btn" data-cancel>' + esc(t('sb.cancel')) + '</button></div>');
    $('[data-cancel]', f).addEventListener('click', NSB.closeDialog);
    f.onsubmit = function (e) {
      e.preventDefault();
      var date = $('#f-date', f).value || dt, h = K.inHand(D(), items(), NSB.bizName(), date), lines = [];
      $$('[data-c]', f).forEach(function (inp) {
        if (inp.value.trim() === '') return;
        var k = inp.getAttribute('data-c'), s = S.filter(function (x) { return x.k === k; })[0], diff = K.r3(num(inp.value) - (h[k] || 0));
        if (diff) lines.push({ desc: s.name, unit: s.unit, qty: diff, reason: diff < 0 ? 'short' : 'extra' });
      });
      if (!lines.length) { NS.toast(t('stk.nodiff')); NSB.closeDialog(); return; }
      NSStore.put('doc', { type: 'stk', kind: 'adj', app: 1, date: date, no: nextNo('adj'), note: t('stk.countnote'), seller: NSB.sellerCopy(), lines: lines }).then(done);
    };
  }
  function minForm(k) {
    var s = sum('', '').items.filter(function (x) { return x.k === k; })[0]; if (!s) return;
    var f = NSB.dialog(t('stk.setmin') + ': ' + s.name, '<p class="hint">' + esc(t('stk.minh')) + '</p><div class="fg"><div class="f"><label for="f-min">' + esc(t('stk.minl')) + ' (' + esc(s.unit || '') + ')</label><input id="f-min" inputmode="decimal" value="' + esc(s.min || '') + '"></div></div>' +
      '<div class="dlg-foot"><button type="submit" class="btn primary">' + esc(t('sb.save')) + '</button><button type="button" class="btn" data-cancel>' + esc(t('sb.cancel')) + '</button></div>');
    $('[data-cancel]', f).addEventListener('click', NSB.closeDialog);
    f.onsubmit = function (e) {
      e.preventDefault();
      var m = items().filter(function (x) { return key(x.desc) === k; })[0] || { desc: s.name, kind: 'goods', unit: s.unit, rate: '', gst: '' };
      m.min = num($('#f-min', f).value);
      NSStore.put('item', m).then(done);
    };
  }
  /* names typed here become item masters (goods), so the billing tools suggest them too */
  function saveMasters(lines) {
    var have = {}; items().forEach(function (m) { have[key(m.desc)] = m; });
    return Promise.all(lines.map(function (l) {
      var m = have[key(l.desc)];
      if (!m) return NSStore.put('item', { desc: l.desc, kind: 'goods', unit: l.unit, rate: '', gst: '' });
      if (!m.kind) { m.kind = 'goods'; if (!m.unit && l.unit) m.unit = l.unit; return NSStore.put('item', m); }
    }));
  }
  function done() { NSB.closeDialog(); NS.toast(t('sb.saved')); if (NS.checkReminder) NS.checkReminder(); show(); }

  function wire(pane) {
    NSB.wireBiz(pane, show); NSB.wirePeriod(pane, 'stock', show);
    var qi = $('[data-q]', pane);
    if (qi) qi.addEventListener('input', function () { q = qi.value; var pos = qi.selectionStart; show().then(function () { var n = $('[data-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
    $$('[data-filt]', pane).forEach(function (b) { b.addEventListener('click', function () { filt = b.getAttribute('data-filt'); show(); }); });
    $$('[data-form]', pane).forEach(function (b) { b.addEventListener('click', function () { form(b.getAttribute('data-form'), null, b.getAttribute('data-for')); }); });
    $$('[data-min]', pane).forEach(function (b) { b.addEventListener('click', function () { minForm(b.getAttribute('data-min')); }); });
    $$('[data-edit]', pane).forEach(function (b) { b.addEventListener('click', function () { var d = D().filter(function (x) { return x.id === b.getAttribute('data-edit'); })[0]; if (d) form(d.kind, d); }); });
    $$('[data-del]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var d = D().filter(function (x) { return x.id === b.getAttribute('data-del'); })[0];
      if (d && confirm(t('sb.cdel', { x: NSB.docName(d) + ' ' + (d.no || '') }))) NSStore.del('doc', d.id).then(function () { NS.toast(t('sb.deleted')); show(); });
    }); });
    var pr = $('[data-print]', pane), pdf = $('[data-pdf]', pane), cv = $('[data-csv]', pane);
    if (pr) pr.addEventListener('click', NSB.printSheet);
    if (pdf) pdf.addEventListener('click', function () { var h = $('h2', pane).textContent; NSB.shareSheet($('[data-sheet]', pane), NSB.bizName() + ' ' + h + ' ' + NS.today()); });
    if (cv) cv.addEventListener('click', function () {
      var p = P(), S = sum(p.from, p.to);
      NSB.csv('stock-summary-' + p.to + '.csv', [['Item', 'Unit', 'Opening', 'In', 'Out', 'Adjusted', 'Closing', 'Low-stock level', 'Average cost', 'Value']].concat(S.items.map(function (s) { return [s.name, s.unit, s.open, s.inq, s.outq, s.adj, s.close, s.min || '', s.cost, s.value]; })));
    });
  }

  function init() {
    if (!$('#stock')) return;
    window.addEventListener('hashchange', route);
    $$('[data-sec]').forEach(function (b) { b.addEventListener('click', function () { q = ''; filt = 'all'; }); });
    document.addEventListener('ns-lang', function () { show(); });
    NSStore.ready().then(route).then(function () { NSStore.persist().catch(function () {}); });
    window.addEventListener('focus', function () { var dl = $('#sb-form'); if (!dl || !dl.open) show(); });   /* bills made in another tab show up when you come back */
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
