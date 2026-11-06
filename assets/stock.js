/* stock.niveshsahayak.in: stock register on the shared data home.
   Stock in and out come by themselves from saved purchase bills, self invoices, sales bills, cash memos, purchase
   returns and credit notes for returned goods (NSStock in stockcore.js). This site adds opening stock, adjustments
   (damage, own use, samples, gifts, lost, expired, found) and physical counts as 'stk' records, low-stock levels on
   the item masters (field min), and prints the stock summary and each item's register. */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, money = NS.money, qty = NS.qty, K = NSStock, t = NSB.t, key = NSB.key;
  var SECS = ['home', 'item', 'ledger', 'move', 'entries', 'low'], cur = 'home', arg = '', q = '', filt = 'all';
  var GM = null, SET = {};   /* data home meta 'groups' and 'settings' */
  var SV = kept('ns-stock-sv', { g: '', flat: false, shut: {} }), LV = kept('ns-stock-lv', { scope: 'item', k: '', g: '', gd: '*', vt: '' }), MV = kept('ns-stock-mv', { days: 90, f: 'all' });
  var REASONS = ['damage', 'own', 'sample', 'gift', 'lost', 'expired', 'short', 'found', 'extra'];

  function route() {
    var h = decodeURIComponent(location.hash.slice(1)), p = h.split('/');
    cur = SECS.indexOf(p[0]) >= 0 ? p[0] : 'home'; arg = p.slice(1).join('/');
    show(true);
  }
  function show(focus) {
    NSB.navMark(cur === 'item' ? 'home' : cur);
    return Promise.all([NSB.load(), NSStore.meta('groups').catch(function () {}), NSStore.meta('settings').catch(function () {})]).then(function (r) {
      GM = r[1] || null; SET = NS.cfgFor(r[2] || {}, NSB.biz());   /* this business's godowns and settings */
      var pane = $('[data-pane]');
      NSB.modeLine();
      if (!NSB.biz()) { pane.innerHTML = NSB.noBiz(); return; }
      pane.innerHTML = NSB.bizBar() + ({ home: homeHtml, item: itemHtml, ledger: ledgerHtml, move: moveHtml, entries: entriesHtml, low: lowHtml })[cur]();
      wire(pane);
      if (focus) NSB.focusH2(pane);
    });
  }
  function D() { return NSB.mine(); }
  function items() { return NSB.data().item; }
  function P() { return NSB.period('stock'); }
  /* second unit (mfgcore.js): closing stock also shown as e.g. 2 Box + 6 Pcs */
  function alt2(s) { var x = window.NSMfg && s.m ? NSMfg.altText(s.m, s.close) : ''; return x ? '<br><small class="soft" dir="ltr">= ' + esc(x) + '</small>' : ''; }
  /* English words of the valuation method for printed sheets (My data › Settings › Stock valuation) */
  function isFifo() { return !!(K.valuation && K.valuation() === 'fifo'); }
  function valEn() { return K.valuation && K.valuation() === 'fifo' ? 'FIFO cost (first in, first out)' : 'weighted average cost'; }
  function sum(from, to) { return K.summary(D(), items(), NSB.bizName(), from, to); }
  function keep(n, v) { try { localStorage.setItem(n, JSON.stringify(v)); } catch (e) {} }
  function kept(n, d) { try { return Object.assign(d, JSON.parse(localStorage.getItem(n) || '{}')); } catch (e) { return d; } }

  /* ---------- item groups (meta 'groups'.item; NS.itemGroup / NS.groupsOf from core.js when there) ---------- */
  function gList() { return (NS.groupsOf ? NS.groupsOf(GM, 'item') : GM && GM.item) || []; }
  function gOf(m) {
    if (!m) return { id: '', name: '', top: '' };
    var g = (NS.itemGroup ? NS.itemGroup(m, GM) : K.itemGroupOf(m, gList())) || {};
    if (!g.id && m.cat) g = K.itemGroupOf(m, gList());   /* a category with no group of that name still shows as a group */
    var top = g.top && typeof g.top === 'object' ? g.top.id : g.top || '';
    return { id: g.id || '', name: g.name || '', top: top === g.id ? '' : top, topName: g.top && g.top.name };
  }
  function inGroup(m, gid) { var g = gOf(m); return gid === '-' ? !g.id : g.id === gid || g.top === gid; }
  function gName(n, en) { return n.name || (en ? 'No group' : t('sl.nogroup')); }
  /* group choices for a select: top groups, then their sub-groups as "Top › Sub", then "No group" */
  function gOptions(list, sel) {
    var tree = K.groupTree(list, gOf, gList(), []);
    if (tree.length < 2 && !(tree[0] && tree[0].id)) return '';
    return tree.map(function (g) {
      return '<option value="' + esc(g.id || '-') + '"' + ((g.id || '-') === sel ? ' selected' : '') + '>' + esc(gName(g)) + '</option>' +
        g.subs.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(gName(g) + ' › ' + s.name) + '</option>'; }).join('');
    }).join('');
  }
  function godownNames() { return (SET.godowns || []).filter(Boolean); }
  function gdLabel(g, en) { return g ? g : en ? 'Main godown' : t('b2.main'); }

  /* ---------- summary, by group ---------- */
  var SF = ['open', 'inq', 'outq', 'adj', 'close', 'value'];
  function homeHtml() {
    var p = P(), S = sum(p.from, p.to);
    var list = S.items.filter(function (s) { return (!q || s.name.toLowerCase().indexOf(q.toLowerCase()) >= 0) && (filt !== 'low' || s.low) && (filt !== 'neg' || s.close < 0) && (!SV.g || inGroup(s.m, SV.g)); });
    var head = '<div class="pane-hd"><h2>' + esc(t('stk.sum')) + '</h2><div class="quick"><button type="button" class="btn primary" data-form="adj">+ ' + esc(t('stk.adj')) + '</button>' +
      '<button type="button" class="btn" data-form="open">+ ' + esc(t('stk.open')) + '</button><button type="button" class="btn" data-form="count">' + esc(t('stk.count')) + '</button></div></div>';
    var tiles = '<div class="tiles"><div class="tile"><span>' + esc(t('stk.nitems')) + '</span><b>' + S.items.length + '</b></div>' +
      '<div class="tile"><span>' + esc(t('stk.value')) + '</span><b>' + money(S.value) + '</b></div>' +
      '<a class="tile' + (S.low ? ' warn' : '') + '" href="#low"><span>' + esc(t('stk.lowc')) + '</span><b>' + S.low + '</b></a>' +
      (S.neg ? '<div class="tile neg"><span>' + esc(t('stk.negc')) + '</span><b>' + S.neg + '</b></div>' : '') + '</div>';
    if (!S.items.length) return head + NSB.periodBar('stock') + '<div class="card"><h3>' + esc(t('stk.empty')) + '</h3><p>' + esc(t('stk.emptyp')) + '</p><div class="quick">' +
      '<button type="button" class="btn primary" data-form="open">+ ' + esc(t('stk.open')) + '</button><a class="btn" href="' + NSB.toolUrl('app') + '#buy">' + esc(t('stk.addpb')) + '</a></div></div>';
    var gopts = gOptions(S.items, SV.g), byG = !!gopts && !SV.flat;
    function row(s, sub) {
      return '<tr class="' + (s.low ? 'low' : '') + (s.close < 0 ? ' neg' : '') + (sub ? ' in-sub' : '') + '"><th scope="row" class="l"><a href="#item/' + encodeURIComponent(s.k) + '">' + esc(s.name) + '</a>' +
        (s.low ? ' <span class="pill warn">' + esc(t('stk.lowp')) + '</span>' : '') + (s.close < 0 ? ' <span class="pill bad">' + esc(t('stk.negp')) + '</span>' : '') + '</th>' +
        '<td class="n">' + qty(s.open) + '</td><td class="n">' + qty(s.inq) + '</td><td class="n">' + qty(s.outq) + '</td><td class="n">' + (s.adj ? qty(s.adj) : '—') + '</td>' +
        '<td class="n cl"><b>' + qty(s.close) + '</b> ' + esc(s.unit) + alt2(s) + '</td><td class="n">' + (s.cost ? money(s.cost, false) : '—') + '</td><td class="n">' + (s.value ? money(s.value, false) : '—') + '</td></tr>';
    }
    function gRow(id, label, tot, cls) {
      var open = !SV.shut[id];
      return '<tr class="g-row ' + cls + '"><th scope="rowgroup" class="l"><button type="button" class="g-tog" data-tog="' + esc(id) + '" aria-expanded="' + open + '"><span class="g-ar" aria-hidden="true"></span>' + esc(label) +
        ' <span class="soft">(' + esc(t('sl.nitems', { n: tot.n })) + ')</span></button></th><td class="n">' + qty(tot.open) + '</td><td class="n">' + qty(tot.inq) + '</td><td class="n">' + qty(tot.outq) + '</td><td class="n">' + (tot.adj ? qty(tot.adj) : '—') +
        '</td><td class="n cl"><b>' + qty(tot.close) + '</b></td><td></td><td class="n"><b>' + money(tot.value, false) + '</b></td></tr>';
    }
    var body;
    if (byG && list.length) {
      body = K.groupTree(list, gOf, gList(), SF).map(function (g) {
        var id = g.id || '-', open = !SV.shut[id];
        return '<tbody class="grp">' + gRow(id, gName(g), g.tot, 'g-top') + (open ? g.list.map(function (s) { return row(s); }).join('') + g.subs.map(function (s) {
          var so = !SV.shut[s.id];
          return gRow(s.id, s.name, s.tot, 'g-sub') + (so ? s.list.map(function (x) { return row(x, 1); }).join('') : '');
        }).join('') : '') + '</tbody>';
      }).join('');
    } else body = '<tbody>' + (list.map(function (s) { return row(s); }).join('') || '<tr><td colspan="8" class="sb-empty">' + esc(t('stk.nomatch')) + '</td></tr>') + '</tbody>';
    var shown = list.reduce(function (a, s) { return r2(a + s.value); }, 0);
    return head + NSB.periodBar('stock') + tiles +
      '<div class="tools-row"><label class="sr" for="sb-q">' + esc(t('stk.search')) + '</label><input id="sb-q" type="search" data-q value="' + esc(q) + '" placeholder="' + esc(t('stk.search')) + '">' +
      '<div class="seg" role="group">' + ['all', 'low', 'neg'].map(function (f) { return '<button type="button" class="btn sm" data-filt="' + f + '" aria-pressed="' + (filt === f) + '">' + esc(t('stk.f_' + f)) + '</button>'; }).join('') + '</div>' +
      (gopts ? '<label for="sl-g">' + esc(t('sl.group')) + '<select id="sl-g" data-sv-g><option value="">' + esc(t('sl.allg')) + '</option>' + gopts + '</select></label>' +
        '<button type="button" class="btn sm" data-flat aria-pressed="' + byG + '">' + esc(t('sl.bygroup')) + '</button>' : '') + '</div>' +
      (byG && list.length ? '<div class="btns g-all"><button type="button" class="btn sm" data-tog-all="1">' + esc(t('sl.openall')) + '</button><button type="button" class="btn sm" data-tog-all="0">' + esc(t('sl.closeall')) + '</button></div>' : '') +
      '<div class="tbl-wrap"><table class="tbl sl-sum"><thead><tr><th class="l">' + esc(t('stk.item')) + '</th><th class="n">' + esc(t('stk.c_open')) + '</th><th class="n">' + esc(t('stk.c_in')) + '</th><th class="n">' + esc(t('stk.c_out')) +
      '</th><th class="n">' + esc(t('stk.c_adj')) + '</th><th class="n">' + esc(t('stk.c_close')) + '</th><th class="n">' + esc(t(isFifo() ? 'fr.c_cost_fifo' : 'stk.c_cost')) + '</th><th class="n">' + esc(t('stk.c_val')) + '</th></tr></thead>' + body +
      '<tfoot><tr><th class="l" colspan="7">' + esc(t(isFifo() ? 'fr.total_fifo' : 'stk.total')) + '</th><th class="n">' + money(list.length === S.items.length ? S.value : shown, false) + '</th></tr></tfoot></table></div>' +
      '<p class="sb-note">' + esc(t('stk.how')) + (isFifo() ? ' ' + esc(t('fr.how_fifo')) : '') + '</p>' +
      '<div class="btns"><button type="button" class="btn" data-print>' + esc(t('sb.print')) + '</button><button type="button" class="btn" data-pdf>' + esc(t('sb.pdf')) + '</button><button type="button" class="btn" data-xl="sum">' + esc(t('sl.excel')) + '</button>' +
      '<a class="btn" href="#ledger">' + esc(t('sl.nav_ledger')) + '</a></div>' +
      '<div class="sb-print">' + sumSheet(list, p, byG) + '</div>';
  }
  function sheetHead(title, p, asOn) {
    var b = NSB.biz() || {};
    return '<div class="st-hd"><div><h3>' + esc(b.name || '') + '</h3><div class="soft">' + esc([b.addr, b.city, b.gstin && 'GSTIN ' + b.gstin].filter(Boolean).join(', ')) + '</div></div>' +
      '<div class="r"><b>' + esc(title) + '</b><div class="soft">' + esc(asOn ? 'As on ' + NS.fmtDate(asOn) : p ? 'From ' + NS.fmtDate(p.from) + ' to ' + NS.fmtDate(p.to) : '') + '</div></div></div>';
  }
  function sheetFoot(extra) { return '<div class="st-ft">' + (extra ? esc(extra) + ' ' : '') + 'Made with Nivesh Sahayak Stock (stock.niveshsahayak.in) on ' + NS.fmtDate(NS.today()) + '</div>'; }
  function sumSheet(list, p, byG) {
    function row(s, sub) { return '<tr' + (s.low ? ' class="low"' : '') + '><td' + (sub ? ' class="ind"' : '') + '>' + esc(s.name) + '</td><td class="n">' + qty(s.open) + '</td><td class="n">' + qty(s.inq) + '</td><td class="n">' + qty(s.outq) + '</td><td class="n">' + qty(s.adj) + '</td><td class="n">' + qty(s.close) + ' ' + esc(s.unit) + alt2(s) + '</td><td class="n">' + money(s.cost, false) + '</td><td class="n">' + money(s.value, false) + '</td></tr>'; }
    function gRow(label, tot, sub) { return '<tr class="b"><td' + (sub ? ' class="ind"' : '') + '>' + esc(label) + '</td><td class="n">' + qty(tot.open) + '</td><td class="n">' + qty(tot.inq) + '</td><td class="n">' + qty(tot.outq) + '</td><td class="n">' + qty(tot.adj) + '</td><td class="n">' + qty(tot.close) + '</td><td></td><td class="n">' + money(tot.value, false) + '</td></tr>'; }
    var body = byG ? K.groupTree(list, gOf, gList(), SF).map(function (g) {
      return gRow(gName(g, true), g.tot) + g.list.map(function (s) { return row(s, 1); }).join('') + g.subs.map(function (s) { return gRow(s.name, s.tot, 1) + s.list.map(function (x) { return row(x, 1); }).join(''); }).join('');
    }).join('') : list.map(function (s) { return row(s); }).join('');
    var tot = list.reduce(function (a, s) { return r2(a + s.value); }, 0);
    return '<div class="stsheet" data-sheet>' + sheetHead('Stock summary' + (SV.g ? ': ' + gLabelOf(SV.g, true) : ''), p) + '<table class="tbl"><thead><tr><th>Item</th><th class="n">Opening</th><th class="n">In</th><th class="n">Out</th><th class="n">Adjusted</th><th class="n">Closing</th><th class="n">Avg cost</th><th class="n">Value (Rs)</th></tr></thead><tbody>' +
      body + '</tbody><tfoot><tr><th colspan="7">Stock value at ' + valEn() + '</th><th class="n">' + money(tot, false) + '</th></tr>' + as2Rows(p, tot) + '</tfoot></table>' + sheetFoot() + '</div>';
  }
  /* goods made here: valued at full cost in the final accounts (AS 2, facore.js fullCost; needs the books on the page) */
  function as2Rows(p, tot) {
    if (!window.NSFA || !NSFA.fullCost || q || filt !== 'all' || SV.g) return '';
    var b = NSB.biz() || {}, a = NSFA.fullCost(NSB.data().doc, NSB.data().item, NSB.bizName(), p.to, b.fa && b.fa.direct || null);
    if (!a.uplift) return '';
    return '<tr><td colspan="7">Add: factory overheads on goods made (full cost, AS 2): ' + money(a.overheads, false) + ' over production of ' + money(a.made, false) + ' since ' + NS.fmtDate(a.from) + '</td><td class="n">' + money(a.uplift, false) + '</td></tr>' +
      '<tr><th colspan="7">Stock value at full cost (used in the final accounts)</th><th class="n">' + money(r2(tot + a.uplift), false) + '</th></tr>';
  }
  function gLabelOf(id, en) {
    if (id === '-') return en ? 'No group' : t('sl.nogroup');
    var g = gList().filter(function (x) { return x.id === id; })[0], top = g && g.under ? gList().filter(function (x) { return x.id === g.under; })[0] : null;
    if (g) return (top ? top.name + ' › ' : '') + g.name;
    var h = items().filter(function (m) { return gOf(m).id === id; })[0]; return h ? gOf(h).name : id;
  }

  /* ---------- ledgers: one item, a group, all items, godown-wise, batch-wise ---------- */
  var SCOPES = ['item', 'group', 'all', 'godown', 'batch'], VTS = ['sale', 'buy', 'sret', 'pret', 'adj', 'open', 'move', 'make'];
  var VT_EN = { open: 'Opening stock', buy: 'Purchase', sret: 'Sales return', sale: 'Sale', pret: 'Purchase return', adj: 'Adjustment', move: 'Transfer', make: 'Production' };
  var R_EN = { damage: 'damaged', own: 'own use', sample: 'free sample', gift: 'gift', lost: 'lost or stolen', expired: 'expired', short: 'short on count', found: 'found', extra: 'extra on count' };
  function vtName(r, en) {
    var n = en ? VT_EN[r.vt] : t('sl.vt_' + r.vt);
    if (r.src === 'use') n = en ? 'Used in production' : t('sl.use');
    if (r.vt === 'adj' && r.reason) n += ' (' + (en ? R_EN[r.reason] : t('stk.r_' + r.reason)) + ')';
    return n;
  }
  function types() { if (!LV.vt) return null; var o = {}; o[LV.vt] = 1; return o; }
  /* rows of one ledger on screen (or in the English sheet) */
  function ledRows(l, en, noVal) {
    var p = P();
    return '<tr class="op"><td>' + NS.fmtDate(p.from) + '</td><td class="l" colspan="3">' + esc(en ? 'Opening balance' : t('stk.c_open')) + '</td><td></td><td></td><td class="n">' + qty(l.open) + '</td>' + (noVal ? '' : '<td class="n">' + (l.openValue ? money(l.openValue, false) : '—') + '</td>') + '</tr>' +
      l.rows.map(function (r) {
        return '<tr' + (r.neg ? ' class="neg"' : '') + '><td>' + NS.fmtDate(r.date) + '</td><td class="l">' + esc(vtName(r, en)) + '</td><td class="l">' + esc(r.no) + '</td><td class="l">' + esc(r.party) + '</td>' +
          '<td class="n">' + (r.inq ? qty(r.inq) : '') + '</td><td class="n">' + (r.outq ? qty(r.outq) : '') + '</td><td class="n cl">' + qty(r.bal) + (r.neg && !en ? ' <span class="pill bad">' + esc(t('stk.negp')) + '</span>' : '') + '</td>' +
          (noVal ? '' : '<td class="n">' + (r.value ? money(r.value, false) : '—') + '</td>') + '</tr>';
      }).join('');
  }
  function ledFoot(l, en, noVal) {
    return '<tr><th class="l" colspan="4">' + esc(en ? 'Closing balance' + (l.unit ? ' (' + l.unit + ')' : '') : t('stk.c_close') + (l.unit ? ' (' + l.unit + ')' : '')) + '</th><th class="n">' + qty(l.inq) + '</th><th class="n">' + qty(l.outq) + '</th><th class="n">' + qty(l.close) + '</th>' +
      (noVal ? '' : '<th class="n">' + money(l.value, false) + '</th>') + '</tr>';
  }
  function ledHead(en, noVal) {
    var c = en ? ['Date', 'Voucher', 'No.', 'Party', 'In', 'Out', 'Balance', 'Value (Rs)'] : [t('sb.date'), t('sl.vt'), t('sl.no'), t('sl.party'), t('stk.c_in'), t('stk.c_out'), t('stk.bal'), t('stk.c_val')];
    if (noVal) c.pop();
    return '<thead><tr>' + c.map(function (h, i) { return '<th class="' + (i > 3 ? 'n' : 'l') + '">' + esc(h) + '</th>'; }).join('') + '</tr></thead>';
  }
  function ledTable(l, en, noVal) { return '<table class="tbl sl-led">' + ledHead(en, noVal) + '<tbody>' + ledRows(l, en, noVal) + '</tbody><tfoot>' + ledFoot(l, en, noVal) + '</tfoot></table>'; }
  function negNote(n) { return n ? '<p class="sl-warn" role="note"><span class="pill bad">' + esc(t('stk.negp')) + '</span> ' + esc(t('sl.negwarn', { n: n })) + '</p>' : ''; }
  /* one tracked item's ledger with the screen's period, godown and voucher filter */
  function oneLedger(k, gd) { return K.ledgers(D(), items(), NSB.bizName(), { keys: [k], from: P().from, to: P().to, gd: gd, types: types() })[0]; }
  /* what the ledger screen shows now: { title (English), list | matrix | batches, total } */
  function ledgerData() {
    var p = P(), all = sum('', p.to).items, sc = LV.scope, o = { from: p.from, to: p.to, types: types() };
    if ((sc === 'item' || sc === 'batch') && !all.some(function (s) { return s.k === LV.k; })) LV.k = all[0] ? all[0].k : '';
    if (sc === 'item') { var s = all.filter(function (x) { return x.k === LV.k; })[0]; return { title: 'Stock ledger: ' + (s ? s.name : ''), list: LV.k ? K.ledgers(D(), items(), NSB.bizName(), Object.assign(o, { keys: [LV.k] })) : [] }; }
    if (sc === 'batch') { var b = all.filter(function (x) { return x.k === LV.k; })[0]; return { title: 'Batch-wise stock ledger: ' + (b ? b.name : ''), unit: b ? b.unit : '', batches: LV.k ? K.batchLedger(D(), items(), NSB.bizName(), LV.k, p.from, p.to, LV.gd === '*' ? '' : LV.gd) : [] }; }
    if (sc === 'godown' && LV.gd === '*') return { title: 'Godown-wise stock', matrix: K.godownMatrix(D(), items(), NSB.bizName(), p.to, godownNames()), asOn: p.to };
    if (sc === 'group') { if (!LV.g) { var first = K.groupTree(all, gOf, gList(), [])[0]; LV.g = first ? first.id || '-' : '-'; } o.keys = all.filter(function (s) { return inGroup(s.m, LV.g); }).map(function (s) { return s.k; }); }
    if (sc === 'godown') { o.gd = LV.gd || K.MAIN; if (LV.k) o.keys = [LV.k]; }
    var list = K.ledgers(D(), items(), NSB.bizName(), o), quiet = list.filter(function (l) { return !l.rows.length && !l.open; }).length;
    list = list.filter(function (l) { return l.rows.length || l.open; });
    return { title: sc === 'group' ? 'Stock ledger of group: ' + gLabelOf(LV.g, true) : sc === 'godown' ? 'Stock ledger of ' + gdLabel(LV.gd === K.MAIN ? '' : LV.gd, true) + (LV.k && list[0] ? ': ' + list[0].name : '') : 'Stock ledger of all items',
      list: list, total: K.ledgerTotals(list), quiet: quiet };
  }
  function ledgerHtml() {
    var p = P(), all = sum('', p.to).items, X = ledgerData(), sc = LV.scope, gds = [''].concat(godownNames());
    if (!all.length) return '<div class="pane-hd"><h2>' + esc(t('sl.nav_ledger')) + '</h2></div><p class="soft">' + esc(t('stk.emptyp')) + '</p>';
    var gopts = gOptions(all, LV.g);
    var itemSel = function (any) { return '<div class="f"><label for="sl-k">' + esc(t('stk.item')) + '</label><select id="sl-k" data-lv="k">' + (any ? '<option value="">' + esc(t('sl.allitems')) + '</option>' : '') +
      all.map(function (s) { return '<option value="' + esc(s.k) + '"' + (s.k === LV.k ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select></div>'; };
    var ctl = '<div class="sb-period sl-ctl"><div class="f"><label for="sl-sc">' + esc(t('sl.of')) + '</label><select id="sl-sc" data-lv="scope">' + SCOPES.map(function (s) {
        return '<option value="' + s + '"' + (s === sc ? ' selected' : '') + '>' + esc(t('sl.sc_' + s)) + '</option>'; }).join('') + '</select></div>' +
      (sc === 'item' || sc === 'batch' ? itemSel(false) : '') +
      (sc === 'group' ? '<div class="f"><label for="sl-gg">' + esc(t('sl.group')) + '</label><select id="sl-gg" data-lv="g">' + (gopts || '<option value="-">' + esc(t('sl.nogroup')) + '</option>') + '</select></div>' : '') +
      (sc === 'godown' || sc === 'batch' ? '<div class="f"><label for="sl-gd">' + esc(t('sl.godown')) + '</label><select id="sl-gd" data-lv="gd"><option value="*">' + esc(t(sc === 'batch' ? 'sl.allgd' : 'sl.sidebyside')) + '</option>' +
        gds.map(function (g) { var v = g || K.MAIN; return '<option value="' + esc(v) + '"' + (v === LV.gd ? ' selected' : '') + '>' + esc(gdLabel(g)) + '</option>'; }).join('') + '</select></div>' : '') +
      (sc === 'godown' && LV.gd !== '*' ? itemSel(true) : '') +
      (X.matrix ? '' : '<div class="f"><label for="sl-vt">' + esc(t('sl.vt')) + '</label><select id="sl-vt" data-lv="vt"><option value="">' + esc(t('sl.allvt')) + '</option>' +
        VTS.map(function (v) { return '<option value="' + v + '"' + (v === LV.vt ? ' selected' : '') + '>' + esc(t('sl.vt_' + v)) + '</option>'; }).join('') + '</select></div>') + '</div>';
    var body = '', sheet = '';
    if (X.matrix) {
      var M = X.matrix, cols = M.gds.map(function (g) { return gdLabel(g); }), colsEn = M.gds.map(function (g) { return gdLabel(g, true); });
      var mt = function (en) {
        return '<table class="tbl sl-gm"><thead><tr><th class="l">' + esc(en ? 'Item' : t('stk.item')) + '</th>' + (en ? colsEn : cols).map(function (c) { return '<th class="n">' + esc(c) + '</th>'; }).join('') +
          '<th class="n">' + esc(en ? 'Total' : t('sl.total')) + '</th><th class="n">' + esc(en ? 'Value (Rs)' : t('stk.c_val')) + '</th></tr></thead><tbody>' +
          (M.rows.map(function (r) {
            return '<tr' + (r.total < 0 ? ' class="neg"' : '') + '><th scope="row" class="l">' + esc(r.name) + '</th>' + M.keys.map(function (g) { var v = r.q[g] || 0; return '<td class="n' + (v < 0 ? ' cl' : '') + '">' + (v ? qty(v) : '—') + '</td>'; }).join('') +
              '<td class="n cl"><b>' + qty(r.total) + '</b> ' + esc(r.unit) + '</td><td class="n">' + (r.value ? money(r.value, false) : '—') + '</td></tr>';
          }).join('') || '<tr><td colspan="' + (M.keys.length + 3) + '" class="sb-empty">' + esc(en ? 'No stock.' : t('stk.nomatch')) + '</td></tr>') +
          '</tbody><tfoot><tr><th class="l">' + esc(en ? 'Total' : t('sl.total')) + '</th>' + M.keys.map(function (g) { return '<th class="n">' + qty(M.tot[g] || 0) + '</th>'; }).join('') + '<th></th><th class="n">' +
          money(M.rows.reduce(function (a, r) { return r2(a + r.value); }, 0), false) + '</th></tr></tfoot></table>';
      };
      body = '<p class="sb-note">' + esc(t('sl.gmh', { d: NS.fmtDate(p.to) })) + '</p><div class="tbl-wrap">' + mt() + '</div>';
      sheet = sheetHead(X.title, p, X.asOn) + mt(true);
    } else if (X.batches) {
      var bt = function (b, en) {
        var l = { open: b.open, rows: b.rows, inq: b.inq, outq: b.outq, close: b.close, unit: X.unit, openValue: 0, value: 0 };
        if (LV.vt) l.rows = b.rows.filter(function (r) { return r.vt === LV.vt; });
        var name = b.batch || (en ? 'No batch' : t('sl.nobatch')), exp = b.exp ? (en ? 'Expiry ' : t('sl.exp') + ' ') + b.exp.slice(5) + '/' + b.exp.slice(0, 4) : '';
        var gone = b.end && b.end < NS.today() && b.close > 0;
        return (en ? '<h4>' : '<h3 class="sl-h">') + esc(name) + (exp ? ' · ' + esc(exp) : '') + (gone && !en ? ' <span class="pill bad">' + esc(t('sl.expired')) + '</span>' : gone ? ' (expired)' : '') + (en ? '</h4>' : '</h3>') +
          (en ? ledTable(l, true, true) : '<div class="tbl-wrap">' + ledTable(l, false, true) + '</div>');
      };
      var nb = X.batches.reduce(function (a, b) { return a + b.rows.filter(function (r) { return r.neg; }).length; }, 0);
      body = negNote(nb) + (X.batches.length ? X.batches.map(function (b) { return bt(b); }).join('') : '<p class="soft">' + esc(t('sl.nobatches')) + '</p>');
      sheet = sheetHead(X.title, p) + X.batches.map(function (b) { return bt(b, true); }).join('');
    } else {
      var many = sc !== 'item' && !(sc === 'godown' && LV.k), neg = X.list.reduce(function (a, l) { return a + l.rows.filter(function (r) { return r.neg; }).length; }, 0);
      var tot = X.total || K.ledgerTotals(X.list);
      var totT = function (en) {
        return '<table class="tbl sl-tot"><tbody><tr><th class="l">' + esc(en ? 'Opening value' : t('sl.openv')) + '</th><td class="n">' + money(tot.openValue, false) + '</td></tr><tr><th class="l">' + esc(en ? 'Closing value' : t('sl.closev')) + '</th><td class="n"><b>' + money(tot.value, false) + '</b></td></tr>' +
          '<tr><th class="l">' + esc(en ? 'Items' : t('stk.nitems')) + '</th><td class="n">' + X.list.length + '</td></tr></tbody></table>';
      };
      body = negNote(neg) + (many ? '<div class="tiles"><div class="tile"><span>' + esc(t('stk.nitems')) + '</span><b>' + X.list.length + '</b></div><div class="tile"><span>' + esc(t('sl.openv')) + '</span><b>' + money(tot.openValue) + '</b></div>' +
        '<div class="tile"><span>' + esc(t('sl.closev')) + '</span><b>' + money(tot.value) + '</b></div>' + (tot.neg ? '<div class="tile neg"><span>' + esc(t('stk.negc')) + '</span><b>' + tot.neg + '</b></div>' : '') + '</div>' : '') +
        (X.list.length ? X.list.map(function (l) {
          return (many ? '<h3 class="sl-h"><a href="#item/' + encodeURIComponent(l.k) + '">' + esc(l.name) + '</a>' + (l.neg ? ' <span class="pill bad">' + esc(t('stk.negp')) + '</span>' : '') + '</h3>' : '') + '<div class="tbl-wrap">' + ledTable(l) + '</div>';
        }).join('') : '<p class="soft">' + esc(t('sl.noentries')) + '</p>') +
        (X.quiet ? '<p class="sb-note">' + esc(t('sl.quiet', { n: X.quiet })) + '</p>' : '');
      sheet = sheetHead(X.title, p) + (LV.vt ? '<p class="soft">Only: ' + esc(VT_EN[LV.vt]) + ' (balance counts every entry)</p>' : '') +
        X.list.map(function (l) { return (many ? '<h4>' + esc(l.name) + '</h4>' : '') + ledTable(l, true); }).join('') + (many ? totT(true) : '');
    }
    return '<div class="pane-hd"><h2>' + esc(t('sl.nav_ledger')) + '</h2></div>' + ctl + (X.matrix ? '<div class="sb-period"><div class="f"><label for="sb-to">' + esc(t('sl.ason')) + '</label><input type="date" id="sb-to" value="' + esc(p.to) + '"><input type="hidden" id="sb-from" value="' + esc(p.from) + '"></div></div>' : NSB.periodBar('stock')) +
      body + '<div class="btns"><button type="button" class="btn" data-print>' + esc(t('sb.print')) + '</button><button type="button" class="btn" data-pdf>' + esc(t('sb.pdf')) + '</button><button type="button" class="btn" data-xl="led">' + esc(t('sl.excel')) + '</button></div>' +
      '<div class="sb-print"><div class="stsheet" data-sheet>' + sheet + sheetFoot() + '</div></div>';
  }

  /* ---------- one item's register (summary link) ---------- */
  function itemHtml() {
    var p = P(), s = sum(p.from, p.to).items.filter(function (x) { return x.k === arg; })[0];
    if (!s) return '<p><a href="#">' + esc(t('sb.back')) + '</a></p><p class="soft">' + esc(t('stk.nomatch')) + '</p>';
    var L = oneLedger(arg), g = gOf(s.m), neg = L.rows.filter(function (r) { return r.neg; }).length;
    var hasB = K.batches(D(), items(), NSB.bizName(), arg, p.to).some(function (b) { return b.batch; });
    return '<p><a href="#">' + esc(t('sb.back')) + '</a></p><div class="pane-hd"><h2>' + esc(s.name) + '</h2><div class="quick"><button type="button" class="btn" data-form="adj" data-for="' + esc(s.k) + '">+ ' + esc(t('stk.adj')) + '</button>' +
      '<button type="button" class="btn" data-min="' + esc(s.k) + '">' + esc(t('stk.setmin')) + '</button>' + (hasB ? '<button type="button" class="btn" data-goled="batch" data-k="' + esc(s.k) + '">' + esc(t('sl.sc_batch')) + '</button>' : '') + '</div></div>' +
      (g.id ? '<p class="soft">' + esc(t('sl.group')) + ': ' + esc(gLabelOf(g.id)) + '</p>' : '') + NSB.periodBar('stock', '<div class="f"><label for="sl-vt">' + esc(t('sl.vt')) + '</label><select id="sl-vt" data-lv="vt"><option value="">' + esc(t('sl.allvt')) + '</option>' +
        VTS.map(function (v) { return '<option value="' + v + '"' + (v === LV.vt ? ' selected' : '') + '>' + esc(t('sl.vt_' + v)) + '</option>'; }).join('') + '</select></div>') +
      '<div class="tiles"><div class="tile"><span>' + esc(t('stk.c_close')) + '</span><b>' + qty(s.close) + ' ' + esc(s.unit) + '</b></div><div class="tile"><span>' + esc(t(isFifo() ? 'fr.c_cost_fifo' : 'stk.c_cost')) + '</span><b>' + money(s.cost) + '</b></div>' +
      '<div class="tile"><span>' + esc(t('stk.c_val')) + '</span><b>' + money(s.value) + '</b></div><div class="tile' + (s.low ? ' warn' : '') + '"><span>' + esc(t('stk.minl')) + '</span><b>' + (s.min ? qty(s.min) : '—') + '</b></div></div>' +
      negNote(neg) + '<div class="tbl-wrap">' + ledTable(L) + '</div>' +
      '<div class="btns"><button type="button" class="btn" data-print>' + esc(t('sb.print')) + '</button><button type="button" class="btn" data-pdf>' + esc(t('sb.pdf')) + '</button><button type="button" class="btn" data-xl="item">' + esc(t('sl.excel')) + '</button></div>' +
      '<div class="sb-print"><div class="stsheet" data-sheet>' + sheetHead('Stock ledger: ' + s.name, p) + (LV.vt ? '<p class="soft">Only: ' + esc(VT_EN[LV.vt]) + ' (balance counts every entry)</p>' : '') + ledTable(L, true) +
      sheetFoot('Value at ' + valEn() + ' Rs ' + money(s.value, false) + '.') + '</div></div>';
  }

  /* ---------- fast, slow and non-moving items ---------- */
  function moveHtml() {
    var p = P(), A = K.movement(D(), items(), NSB.bizName(), p.from, p.to, MV.days), n = { fast: 0, slow: 0, none: 0 };
    A.forEach(function (a) { n[a.cls]++; });
    var list = A.filter(function (a) { return MV.f === 'all' || a.cls === MV.f; });
    var cls = function (a, en) { return en ? ({ fast: 'Fast', slow: 'Slow', none: 'No movement' })[a.cls] : '<span class="pill ' + ({ fast: 'ok', slow: 'warn', none: 'bad' })[a.cls] + '">' + esc(t('sl.m_' + a.cls)) + '</span>'; };
    var head = function (en) {
      var c = en ? ['Item', 'Moving', 'Sold in period', 'Last sale', 'Days without movement', 'In hand', 'Value (Rs)', 'Days of stock'] : [t('stk.item'), t('sl.moving'), t('sl.sold'), t('sl.lastsale'), t('sl.idle'), t('stk.c_close'), t('stk.c_val'), t('sl.cover')];
      return '<thead><tr>' + c.map(function (h, i) { return '<th class="' + (i < 2 ? 'l' : 'n') + '">' + esc(h) + '</th>'; }).join('') + '</tr></thead>';
    };
    var rows = function (en) {
      return list.map(function (a) {
        return '<tr><th scope="row" class="l">' + (en ? esc(a.name) : '<a href="#item/' + encodeURIComponent(a.k) + '">' + esc(a.name) + '</a>') + '</th><td class="l">' + cls(a, en) + '</td><td class="n">' + (a.sold ? qty(a.sold) + ' ' + esc(a.unit) : '—') + '</td>' +
          '<td class="n">' + (a.lastSale ? NS.fmtDate(a.lastSale) : '—') + '</td><td class="n">' + (a.idle != null ? a.idle : '—') + '</td><td class="n">' + qty(a.close) + ' ' + esc(a.unit) + '</td><td class="n">' + (a.value ? money(a.value, false) : '—') + '</td>' +
          '<td class="n">' + (a.cover != null ? a.cover : '—') + '</td></tr>';
      }).join('');
    };
    return '<div class="pane-hd"><h2>' + esc(t('sl.nav_move')) + '</h2></div>' +
      NSB.periodBar('stock', '<div class="f"><label for="sl-days">' + esc(t('sl.days')) + '</label><input id="sl-days" type="number" min="1" max="3650" inputmode="numeric" value="' + esc(MV.days) + '" data-mv-days style="width:7em"></div>') +
      '<div class="tiles">' + ['fast', 'slow', 'none'].map(function (c) { return '<div class="tile' + (c === 'none' && n.none ? ' warn' : '') + '"><span>' + esc(t('sl.m_' + c)) + '</span><b>' + n[c] + '</b></div>'; }).join('') + '</div>' +
      '<div class="tools-row"><div class="seg" role="group">' + ['all', 'fast', 'slow', 'none'].map(function (f) { return '<button type="button" class="btn sm" data-mv-f="' + f + '" aria-pressed="' + (MV.f === f) + '">' + esc(f === 'all' ? t('stk.f_all') : t('sl.m_' + f)) + '</button>'; }).join('') + '</div></div>' +
      '<div class="tbl-wrap"><table class="tbl sl-mv">' + head() + '<tbody>' + (rows() || '<tr><td colspan="8" class="sb-empty">' + esc(t('stk.nomatch')) + '</td></tr>') + '</tbody></table></div>' +
      '<p class="sb-note">' + esc(t('sl.moveh', { n: MV.days })) + '</p>' +
      '<div class="btns"><button type="button" class="btn" data-print>' + esc(t('sb.print')) + '</button><button type="button" class="btn" data-pdf>' + esc(t('sb.pdf')) + '</button><button type="button" class="btn" data-xl="move">' + esc(t('sl.excel')) + '</button></div>' +
      '<div class="sb-print"><div class="stsheet" data-sheet>' + sheetHead('Fast, slow and non-moving items', p) + '<table class="tbl">' + head(true) + '<tbody>' + rows(true) + '</tbody></table>' +
      '<p class="soft">Fast = the top third of the items sold, by value sold at cost. No movement = in hand with nothing in or out for ' + MV.days + ' days or more. Days of stock = how long the stock in hand lasts at the speed it sold in this period.</p>' + sheetFoot() + '</div></div>';
  }

  /* ---------- Excel files (English headings, numbers stay numbers) ---------- */
  function xl(kind) {
    var p = P(), biz = (NSB.bizName() || 'business').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase(), file = function (n) { return biz + '-' + n + '-' + p.from + '-to-' + p.to + '.xlsx'; }, sheets = [];
    var vt = function (r) { return vtName(r, true); };
    if (kind === 'sum') {
      var S = sum(p.from, p.to), head = ['Group', 'Sub-group', 'Item', 'Unit', 'Opening', 'In', 'Out', 'Adjusted', 'Closing', 'Closing in second unit', 'Low-stock level', 'Average cost', 'Value'], rows = [head], by = [['Group', 'Sub-group', 'Items', 'Closing quantity', 'Value']];
      var list = S.items.filter(function (s) { return !SV.g || inGroup(s.m, SV.g); });
      K.groupTree(list, gOf, gList(), SF).forEach(function (g) {
        var gn = gName(g, true), line = function (s, sub) { rows.push([gn, sub || '', s.name, s.unit, s.open, s.inq, s.outq, s.adj, s.close, window.NSMfg && s.m ? NSMfg.altText(s.m, s.close) : '', s.min || '', s.cost, s.value]); };
        g.list.forEach(function (s) { line(s); });
        g.subs.forEach(function (s) { s.list.forEach(function (x) { line(x, s.name); }); by.push([gn, s.name, s.tot.n, s.tot.close, s.tot.value]); });
        by.push([gn, g.subs.length ? 'Whole group' : '', g.tot.n, g.tot.close, g.tot.value]);
        rows.push(['Total ' + gn, '', '', '', g.tot.open, g.tot.inq, g.tot.outq, g.tot.adj, g.tot.close, '', '', '', g.tot.value]);
      });
      rows.push(['Stock value at ' + valEn(), '', '', '', '', '', '', '', '', '', '', '', list.reduce(function (a, s) { return r2(a + s.value); }, 0)]);
      sheets = [{ name: 'Stock summary', rows: rows }, { name: 'By group', rows: by }];
      return NS.xlsx(file('stock-summary'), sheets);
    }
    if (kind === 'move') {
      var A = K.movement(D(), items(), NSB.bizName(), p.from, p.to, MV.days).filter(function (a) { return MV.f === 'all' || a.cls === MV.f; });
      return NS.xlsx(file('stock-movement'), [{ name: 'Movement', rows: [['Item', 'Unit', 'Moving', 'Sold in period', 'Value sold at cost', 'Last sale', 'Last movement', 'Days without movement', 'In hand', 'Value', 'Days of stock']].concat(A.map(function (a) {
        return [a.name, a.unit, ({ fast: 'Fast', slow: 'Slow', none: 'No movement (' + MV.days + '+ days)' })[a.cls], a.sold, a.soldValue, a.lastSale ? NS.fmtDate(a.lastSale) : '', a.lastMove ? NS.fmtDate(a.lastMove) : '', a.idle == null ? '' : a.idle, a.close, a.value, a.cover == null ? '' : a.cover];
      })) }]);
    }
    var X = kind === 'item' ? { title: 'Stock ledger', list: [oneLedger(arg)] } : ledgerData();
    if (X.matrix) {
      var M = X.matrix;
      return NS.xlsx(file('godown-stock'), [{ name: 'Godown-wise stock', rows: [['Item', 'Unit'].concat(M.gds.map(function (g) { return gdLabel(g, true); })).concat(['Total', 'Value'])].concat(M.rows.map(function (r) {
        return [r.name, r.unit].concat(M.keys.map(function (g) { return r.q[g] || 0; })).concat([r.total, r.value]);
      })).concat([['Total', ''].concat(M.keys.map(function (g) { return M.tot[g] || 0; })).concat(['', M.rows.reduce(function (a, r) { return r2(a + r.value); }, 0)])]) }]);
    }
    if (X.batches) {
      var br = [['Batch', 'Expiry', 'Date', 'Voucher', 'Number', 'Party', 'In', 'Out', 'Balance']];
      X.batches.forEach(function (b) {
        var nm = b.batch || 'No batch', ex = b.exp ? b.exp.slice(5) + '/' + b.exp.slice(0, 4) : '';
        br.push([nm, ex, NS.fmtDate(p.from), 'Opening balance', '', '', '', '', b.open]);
        b.rows.filter(function (r) { return !LV.vt || r.vt === LV.vt; }).forEach(function (r) { br.push([nm, ex, NS.fmtDate(r.date), vt(r), r.no, r.party, r.inq || '', r.outq || '', r.bal]); });
        br.push([nm, ex, '', 'Closing balance', '', '', b.inq, b.outq, b.close]);
      });
      return NS.xlsx(file('batch-ledger'), [{ name: 'Batch-wise ledger', rows: br }]);
    }
    var lr = [['Item', 'Unit', 'Date', 'Voucher', 'Number', 'Party', 'In', 'Out', 'Balance', 'Value', 'Below zero']];
    X.list.forEach(function (l) {
      lr.push([l.name, l.unit, NS.fmtDate(p.from), 'Opening balance', '', '', '', '', l.open, l.openValue, '']);
      l.rows.forEach(function (r) { lr.push([l.name, l.unit, NS.fmtDate(r.date), vt(r), r.no, r.party, r.inq || '', r.outq || '', r.bal, r.value, r.neg ? 'Yes' : '']); });
      lr.push([l.name, l.unit, NS.fmtDate(p.to), 'Closing balance', '', '', l.inq, l.outq, l.close, l.value, '']);
    });
    return NS.xlsx(file('stock-ledger'), [{ name: 'Stock ledger', rows: lr }]);
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
    var pr = $('[data-print]', pane), pdf = $('[data-pdf]', pane);
    if (pr) pr.addEventListener('click', NSB.printSheet);
    if (pdf) pdf.addEventListener('click', function () { var h = $('h2', pane).textContent; NSB.shareSheet($('[data-sheet]', pane), NSB.bizName() + ' ' + h + ' ' + NS.today()); });
    $$('[data-xl]', pane).forEach(function (b) { b.addEventListener('click', function () { xl(b.getAttribute('data-xl')); }); });
    /* summary by group */
    var gs = $('[data-sv-g]', pane), fl = $('[data-flat]', pane);
    function sv() { keep('ns-stock-sv', SV); }
    if (gs) gs.addEventListener('change', function () { SV.g = gs.value; sv(); show(); });
    if (fl) fl.addEventListener('click', function () { SV.flat = !SV.flat; sv(); show(); });
    $$('[data-tog]', pane).forEach(function (b) { b.addEventListener('click', function () {
      var id = b.getAttribute('data-tog'); if (SV.shut[id]) delete SV.shut[id]; else SV.shut[id] = 1; sv();
      show().then(function () { var n = $$('[data-tog]').filter(function (x) { return x.getAttribute('data-tog') === id; })[0]; if (n) n.focus(); });
    }); });
    $$('[data-tog-all]', pane).forEach(function (b) { b.addEventListener('click', function () {
      SV.shut = {}; if (b.getAttribute('data-tog-all') === '0') $$('[data-tog]', pane).forEach(function (x) { SV.shut[x.getAttribute('data-tog')] = 1; }); sv(); show();
    }); });
    /* ledger choices */
    $$('[data-lv]', pane).forEach(function (e) { e.addEventListener('change', function () { LV[e.getAttribute('data-lv')] = e.value; keep('ns-stock-lv', LV); show(); }); });
    $$('[data-goled]', pane).forEach(function (b) { b.addEventListener('click', function () { LV.scope = b.getAttribute('data-goled'); LV.k = b.getAttribute('data-k'); keep('ns-stock-lv', LV); location.hash = '#ledger'; }); });
    /* movement report */
    var dy = $('[data-mv-days]', pane);
    if (dy) dy.addEventListener('change', function () { var n = Math.round(num(dy.value)); MV.days = n > 0 ? Math.min(n, 3650) : 90; keep('ns-stock-mv', MV); show(); });
    $$('[data-mv-f]', pane).forEach(function (b) { b.addEventListener('click', function () { MV.f = b.getAttribute('data-mv-f'); keep('ns-stock-mv', MV); show(); }); });
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
