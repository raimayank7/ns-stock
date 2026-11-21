/* Big lists (Tabulator 6.6.1, Oli Folkerd, MIT; a copy in /assets/vendor/, loaded only when a long list is on the screen).
   Any report table on the screen with MIN rows or more (day book, voucher and sales/purchase registers, party ledger, ledger of an
   account, stock ledger and stock summary...) is shown as a fast grid: only the rows in view are drawn, so lakhs of rows scroll
   smoothly; click a column title to sort, drag its edge to resize, type in the box under a title to filter, arrow keys move a
   row, Enter opens it. The screens are not changed: this file finds the long table after it is drawn, reads its rows, hides
   it and puts the grid in its place. The table is kept aside (out of the page: lakhs of hidden rows still slow every scroll)
   and comes back by itself for Print, the PDF and the picture (PNG), so they look exactly as before; Excel is made from the
   records as before; a click in the grid presses the same button or link of the table (Open, a voucher number, a month...). Small tables, tables with boxes to type in, and tables with group or sub-total lines in the middle stay
   plain tables. NSBig.off = true (or localStorage ns-big = 'off') keeps every table plain. */
(function () {
  if (window.NSBig) return;
  var VER = '6.6.1', JS = '/assets/vendor/tabulator-6.6.1.min.js', CSS = '/assets/vendor/tabulator-6.6.1.min.css';
  var MIN = 200, SEQ = 0;
  var B = window.NSBig = { min: MIN, off: false, ver: VER, grids: [] };
  function off() { if (B.off) return true; try { return localStorage.getItem('ns-big') === 'off'; } catch (e) { return false; } }
  function T(k, d) { var v = window.NS && NS.t ? NS.t(k) : k; return v && v !== k ? v : d; }

  /* our own look: the grid takes the sheet's colours (paper in light, dark in dark), so it matches the page */
  var STYLE = '#main .bt-src{display:none!important}.bt-grid{display:none}#main .bt-grid{display:block}' +
    '.bt-grid.tabulator{background:transparent;border:1px solid var(--line,#d9e2ec);border-radius:8px;font:inherit;font-size:inherit;color:inherit}' +
    '.bt-grid.tabulator .tabulator-header{background:rgba(127,127,127,.12);color:inherit;border-bottom:1px solid rgba(127,127,127,.35);font-weight:600}' +
    '.bt-grid.tabulator .tabulator-header .tabulator-col{background:transparent;color:inherit;border-inline-end:1px solid rgba(127,127,127,.3)}' +
    '.bt-grid.tabulator .tabulator-header .tabulator-col:hover{background:rgba(127,127,127,.08)}' +
    '.bt-grid.tabulator .tabulator-header .tabulator-col .tabulator-col-content .tabulator-col-sorter .tabulator-arrow{border-bottom-color:var(--soft,#4a5b6e)}' +
    '.bt-grid.tabulator .tabulator-header .tabulator-col[aria-sort=ascending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow{border-bottom-color:var(--accent,#0b3b5b)}' +
    '.bt-grid.tabulator .tabulator-header .tabulator-col[aria-sort=descending] .tabulator-col-content .tabulator-col-sorter .tabulator-arrow{border-top-color:var(--accent,#0b3b5b)}' +
    '.bt-grid.tabulator .tabulator-tableholder{background:transparent}.bt-grid.tabulator .tabulator-tableholder .tabulator-table{background:transparent;color:inherit}' +
    '.bt-grid.tabulator{border-color:rgba(127,127,127,.35)}.bt-grid .tabulator-row{background:transparent;color:inherit;border-bottom:1px solid rgba(127,127,127,.25);min-height:32px}' +
    '.bt-grid .tabulator-row.tabulator-row-even{background:rgba(127,127,127,.045)}' +
    '.bt-grid .tabulator-row .tabulator-cell{border-inline-end:0;padding:6px 8px;white-space:normal;overflow-wrap:anywhere}' +
    '.bt-grid .tabulator-row .tabulator-cell.bt-n{white-space:nowrap;font-variant-numeric:tabular-nums}.bt-grid .tabulator-row .tabulator-cell.bt-d{white-space:nowrap}' +
    '.bt-grid .tabulator-row.bt-cur{background:rgba(245,165,36,.18)!important;box-shadow:inset 3px 0 0 var(--focus,#f5a524)}' +
    '.bt-grid .tabulator-row.bt-warn{color:var(--bad,#b42318)}.bt-grid .tabulator-row.bt-b,.bt-grid .tabulator-row.bt-fz{font-weight:600}' +
    '.bt-grid .tabulator-frozen-rows-holder,.bt-grid.tabulator .tabulator-header .tabulator-frozen-rows-holder{background:transparent;color:inherit}' +
    '.bt-grid.tabulator .tabulator-footer{background:rgba(127,127,127,.12);color:inherit;border-top:1px solid rgba(127,127,127,.35);font-weight:600}' +
    '.bt-grid.tabulator .tabulator-footer .tabulator-calcs-holder{background:transparent!important;border:0}' +
    '.bt-grid.tabulator .tabulator-footer .tabulator-calcs-holder .tabulator-row{background:transparent!important;min-height:0;border:0}' +
    '.bt-grid.tabulator .tabulator-footer .tabulator-calcs-holder .tabulator-row .tabulator-cell{white-space:nowrap}.bt-grid.tabulator .tabulator-calcs-holder .tabulator-row .tabulator-cell:first-child{overflow:visible;position:relative;z-index:1}' +
    '.bt-grid.tabulator .tabulator-col .tabulator-header-filter input{width:100%;box-sizing:border-box;font:inherit;font-size:.85em;padding:3px 6px;border:1px solid rgba(127,127,127,.45);border-radius:6px;background:transparent;color:inherit}' +
    '.bt-grid.tabulator .tabulator-tableholder:focus{outline:3px solid var(--focus,#f5a524);outline-offset:-3px}' +
    '.bt-grid.tabulator .btn.sm{min-height:30px}' +
    '@media print{.bt-grid,#main .bt-grid{display:none!important}table.bt-src,#main table.bt-src{display:table!important}}';
  function style() {
    if (document.getElementById('bt-style')) return;
    var s = document.createElement('style'); s.id = 'bt-style'; s.textContent = STYLE; document.head.appendChild(s);
  }
  var LIB = null;
  function lib() {
    if (window.Tabulator) return Promise.resolve();
    if (LIB) return LIB;
    if (!document.querySelector('link[data-bt-css]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CSS; l.setAttribute('data-bt-css', ''); document.head.insertBefore(l, document.head.firstChild); }
    LIB = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = JS;
      s.onload = function () { window.Tabulator ? res() : rej(new Error('Tabulator')); };
      s.onerror = function () { LIB = null; rej(new Error('Tabulator')); };
      document.head.appendChild(s);
    });
    return LIB;
  }

  /* ---------- which tables become grids ---------- */
  function spans(tr) { var n = 0; for (var i = 0; i < tr.cells.length; i++) n += tr.cells[i].colSpan || 1; return n; }
  function plain(tr, n) { if (tr.cells.length !== n) return false; for (var i = 0; i < n; i++) if ((tr.cells[i].colSpan || 1) > 1) return false; return true; }
  function check(t) {
    if (t.hasAttribute('data-bt') || t.closest('.bt-grid, .sb-print, .fr-print, dialog, form') || !t.closest('#main')) return null;
    if (t.tBodies.length !== 1 || !t.tHead || t.tHead.rows.length !== 1) return null;
    var hr = t.tHead.rows[0], n = hr.cells.length; if (n < 2 || spans(hr) !== n) return null;
    var R = t.tBodies[0].rows; if (R.length < MIN) return null;
    if (t.tBodies[0].querySelector('input, select, textarea')) return null;
    var lead = 0; while (lead < R.length && lead < 3 && !plain(R[lead], n) && spans(R[lead]) === n) lead++;
    for (var i = lead; i < R.length; i++) if (!plain(R[i], n)) return null;   /* a group line or sub-total in the middle: keep the table */
    return { n: n, lead: lead };
  }

  /* ---------- reading the table ---------- */
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function dateKey(s) {
    var m = /^\s*(\d{1,2})[\-\/ .]([A-Za-z]{3}|\d{1,2})[\-\/ .](\d{4})\s*$/.exec(s); if (!m) return null;
    var mo = isNaN(+m[2]) ? MON[m[2].toLowerCase()] : +m[2]; if (!mo) return null;
    return +m[3] * 10000 + mo * 100 + +m[1];
  }
  function numKey(s) {
    var t = String(s || '').replace(/[,\s₹]/g, ''); if (!t || t === '—' || t === '-') return null;
    var m = /-?\d+(\.\d+)?/.exec(t); if (!m) return null;
    var v = parseFloat(m[0]); return /Cr\b|Cr$/.test(s) ? -Math.abs(v) : v;
  }
  function read(t, c) {
    var hr = t.tHead.rows[0], cols = [], i, j, kinds = [];
    for (i = 0; i < c.n; i++) {
      var th = hr.cells[i], cs = getComputedStyle(th);
      cols.push({ title: (th.textContent || '').trim(), n: th.classList.contains('n'), act: th.classList.contains('noprint') && !(th.textContent || '').trim(), hide: cs.display === 'none', dir: cs.textAlign });
      kinds.push({ d: 0, x: 0 });
    }
    var R = t.tBodies[0].rows, rows = [], top = [];
    for (i = 0; i < R.length; i++) {
      var tr = R[i], o = { _i: i, _c: tr.className || '' }, k = 0;
      for (j = 0; j < tr.cells.length; j++) {
        var td = tr.cells[j], tx = (td.textContent || '').replace(/\s+/g, ' ').trim();
        o['h' + k] = td.innerHTML; o['t' + k] = tx;
        if (i >= c.lead && tx) { if (cols[k].n) o['s' + k] = numKey(tx); else if (kinds[k].x < 3 && dateKey(tx) != null) kinds[k].d++; else kinds[k].x++; }
        k += td.colSpan || 1;
      }
      (i < c.lead ? top : rows).push(o);
    }
    /* a column whose words are all dates sorts by the date; the day book's detailed view leaves the date out on a voucher's
       second line, and such a list keeps its own order (no sorting, no filters) so the lines of one voucher stay together */
    var keep = false;
    cols.forEach(function (col, k) {
      col.date = !col.n && kinds[k].d > 0 && kinds[k].x === 0;
      if (col.date) rows.forEach(function (o) { o['s' + k] = dateKey(o['t' + k]); if (o['s' + k] == null) keep = true; });
    });
    var foot = [];
    if (t.tFoot) Array.prototype.forEach.call(t.tFoot.rows, function (tr) {
      var f = [], k = 0; Array.prototype.forEach.call(tr.cells, function (td) { f[k] = td.innerHTML; k += td.colSpan || 1; }); foot.push(f);
    });
    return { cols: cols, rows: rows, top: top, foot: foot, keep: keep };
  }

  /* ---------- the grid ---------- */
  function sorter(k) {
    return function (a, b, ra, rb) {
      var x = ra.getData()['s' + k], y = rb.getData()['s' + k];
      if (x == null && y == null) return ra.getData()._i - rb.getData()._i; if (x == null) return -1; if (y == null) return 1;
      return x - y || ra.getData()._i - rb.getData()._i;
    };
  }
  function textSort(k) { return function (a, b, ra, rb) { return String(ra.getData()['t' + k]).localeCompare(String(rb.getData()['t' + k]), 'en', { numeric: true, sensitivity: 'base' }) || ra.getData()._i - rb.getData()._i; }; }
  function filterBox(title) {
    var lbl = T('bt.filter', 'Filter');
    return function (cell, onRendered, success) {
      var i = document.createElement('input'); i.type = 'search'; i.placeholder = lbl + '…'; i.setAttribute('aria-label', lbl + ': ' + title); i.autocomplete = 'off';
      var go = function () { success(i.value); };
      i.addEventListener('input', go); i.addEventListener('search', go);
      i.addEventListener('keydown', function (e) { e.stopPropagation(); });   /* typing here never moves the row or opens it */
      return i;
    };
  }
  /* a column wide enough for its longest words (looked at in the first rows, the title and the totals), so amounts never break */
  function fit(D, k) {
    var n = (D.cols[k].title || '').length + (D.cols[k].n || D.cols[k].date ? 3 : 0), L = D.top.concat(D.rows.slice(0, 400));
    for (var i = 0; i < L.length; i++) { var t = String(L[i]['t' + k] || ''); if (!D.cols[k].n && !D.cols[k].date) t = t.split(' ').reduce(function (a, w) { return w.length > a.length ? w : a; }, ''); if (t.length > n) n = t.length; }
    D.foot.forEach(function (f) { var d = document.createElement('div'); d.innerHTML = f[k] || ''; var t = (d.textContent || '').trim(); if (D.cols[k].n && t.length > n) n = t.length; });
    return Math.min(240, Math.round(n * 8.4 + 24));
  }
  function build(t, c, D) {
    var host = document.createElement('div'); host.className = 'bt-grid';
    var rtl = getComputedStyle(t).direction === 'rtl';
    var cols = D.cols.map(function (col, k) {
      var def = { title: col.title, field: 'h' + k, formatter: 'html', headerSort: !D.keep && !col.act, resizable: true, visible: !col.hide,
        hozAlign: col.n ? (rtl ? 'left' : 'right') : undefined, headerHozAlign: col.n ? (rtl ? 'left' : 'right') : undefined, cssClass: col.n ? 'bt-n' : '' };
      var wd = fit(D, k);
      if (col.act) { def.width = 56; def.resizable = false; def.headerSort = false; }
      else if (col.n || col.date) { def.width = wd; if (col.date) def.cssClass = 'bt-d'; }   /* amounts and dates: just as wide as they need */
      else { def.minWidth = Math.min(Math.max(wd, 100), 200); def.widthGrow = 2; }   /* words share the rest of the width */
      if (!col.act) def.sorter = col.n || col.date ? sorter(k) : textSort(k);
      if (!D.keep && !col.act && !col.n && !col.date) { def.headerFilter = filterBox(col.title); def.headerFilterFunc = function (v, cv, row) { return String(row['t' + k]).toLowerCase().indexOf(String(v).toLowerCase()) >= 0; }; def.headerFilterLiveFilter = true; def.headerFilterPlaceholder = T('bt.filter', 'Filter') + '…'; }
      if (D.foot.length) { def.bottomCalc = function () { return D.foot.map(function (f) { return f[k] || ''; }).filter(Boolean).join('<br>'); }; def.bottomCalcFormatter = 'html'; }
      return def;
    });
    var all = D.top.concat(D.rows), h = Math.max(320, Math.min(Math.round(window.innerHeight * 0.72), 760));
    var id = 'bt' + (++SEQ), mark = document.createComment('bt ' + id);
    t.parentNode.insertBefore(host, t); t.parentNode.insertBefore(mark, t);
    host.setAttribute('data-bt-k', id);
    t.classList.add('bt-src'); t.setAttribute('data-bt', '1'); t.setAttribute('aria-hidden', 'true');
    t.remove();
    var g = new window.Tabulator(host, {
      data: all, columns: cols, height: h, layout: 'fitColumns', renderVertical: 'virtual', reactiveData: false, index: '_i',
      textDirection: rtl ? 'rtl' : 'ltr', frozenRows: D.top.length || 0, placeholder: '—',
      rowFormatter: function (row) { var d = row.getData(), el = row.getElement(); if (/\b(neg|low)\b/.test(d._c)) el.classList.add('bt-warn'); if (/\bb\b/.test(d._c)) el.classList.add('bt-b'); if (d._i < D.top.length) el.classList.add('bt-fz'); }
    });
    var G = { t: t, host: host, g: g, cur: -1, mark: mark, id: id };
    B.grids.push(G);
    wire(G, D);
    return G;
  }

  /* a click in the grid presses the same button or link in the hidden table (Open, a voucher number, a month link...) */
  function original(G, i, k) { var tr = G.t.tBodies[0].rows[i]; if (!tr) return null; var kk = 0; for (var j = 0; j < tr.cells.length; j++) { if (kk === k || (kk < k && kk + (tr.cells[j].colSpan || 1) > k)) return tr.cells[j]; kk += tr.cells[j].colSpan || 1; } return null; }
  function path(el, top) { var p = []; while (el && el !== top) { p.unshift(Array.prototype.indexOf.call(el.parentNode.children, el)); el = el.parentNode; } return el === top ? p : null; }
  function follow(top, p) { var e = top; for (var i = 0; i < p.length && e; i++) e = e.children[p[i]]; return e || null; }
  var HIT = 'a[href], button, summary, [data-view], [data-sldoc], [data-k] a';
  function rowsOf(G) { return G.g.getRows('active'); }
  function setCur(G, n, scroll) {
    var R = rowsOf(G); if (!R.length) return; n = Math.max(0, Math.min(R.length - 1, n));
    var old = G.curRow; if (old && old.getElement()) old.getElement().classList.remove('bt-cur');
    G.cur = n; G.curRow = R[n];
    var el = R[n].getElement(); if (el) el.classList.add('bt-cur');
    if (scroll) G.g.scrollToRow(R[n], 'nearest', false).then(function () { var e2 = G.curRow && G.curRow.getElement(); if (e2) e2.classList.add('bt-cur'); }).catch(function () {});
  }
  function openRow(G, row) {
    var tr = G.t.tBodies[0].rows[row.getData()._i]; if (!tr) return;
    var h = tr.querySelector('[data-view], [data-sldoc], a[href]:not([href="#"]), a[href], button');
    if (h) press(G, h);
  }
  /* the table goes back into the page (still hidden) for the moment of the click, so the screen's own handlers see it */
  function press(G, el) { var on = attach(G); try { el.click(); } finally { if (on) detach(G); } }
  function attach(G) { if (G.t.isConnected || !G.mark.parentNode) return false; G.mark.parentNode.insertBefore(G.t, G.mark); return true; }
  function detach(G) { if (G.t.isConnected) G.t.remove(); }

  /* Print: the tables come back (the print style shows them and hides the grids); afterwards they go aside again.
     The PDF and the picture draw copies of the sheet (html2canvas): in a copy the grid is swapped for a copy of its table. */
  function byId(id) { for (var i = 0; i < B.grids.length; i++) if (B.grids[i].id === id) return B.grids[i]; return null; }
  function fixCopy(root) {
    if (!root || !root.querySelectorAll) return;
    var hs = root.matches && root.matches('.bt-grid[data-bt-k]') ? [root] : [];
    hs = hs.concat([].slice.call(root.querySelectorAll('.bt-grid[data-bt-k]')));
    hs.forEach(function (h) {
      var G = byId(h.getAttribute('data-bt-k')); if (!G || h === G.host) return;
      var c = G.t.cloneNode(true); c.classList.remove('bt-src'); c.removeAttribute('aria-hidden');
      h.parentNode.replaceChild(c, h);
    });
  }
  B.fixCopy = fixCopy;
  window.addEventListener('beforeprint', function () { B.grids.forEach(function (G) { if (G.host.isConnected) attach(G); }); fixCopy(document.body); });
  window.addEventListener('afterprint', function () { B.grids.forEach(detach); });
  function wrapH2c(f) {
    if (!f || f.nsBig) return f;
    var w = function (el) { try { if (el && !(el.closest && el.closest('#main'))) fixCopy(el); } catch (e) {} return f.apply(this, arguments); };
    w.nsBig = 1; return w;
  }
  (function () {
    var cur = wrapH2c(window.html2canvas);
    try { Object.defineProperty(window, 'html2canvas', { configurable: true, get: function () { return cur; }, set: function (v) { cur = wrapH2c(v); } }); } catch (e) {}
  })();
  function wire(G, D) {
    var g = G.g, host = G.host;
    host.addEventListener('click', function (e) {
      var cellEl = e.target.closest('.tabulator-cell'); if (!cellEl || !host.contains(cellEl)) return;
      var rowEl = cellEl.closest('.tabulator-row'); if (!rowEl || rowEl.closest('.tabulator-calcs-holder')) return;
      var row = g.getRow(rowEl), k = +(String(cellEl.getAttribute('tabulator-field') || 'h0').slice(1)); if (!row) return;
      var R = rowsOf(G), at = R.indexOf(row); if (at >= 0) setCur(G, at, false);
      var hit = e.target.closest(HIT); if (!hit || !cellEl.contains(hit)) return;
      var td = original(G, row.getData()._i, k), p = td && path(hit, cellEl), o = p && follow(td, p);
      if (!o) return;
      e.preventDefault(); e.stopPropagation();
      press(G, o);
    }, true);
    host.addEventListener('dblclick', function (e) {
      var rowEl = e.target.closest('.tabulator-row'); if (!rowEl || rowEl.closest('.tabulator-calcs-holder') || e.target.closest(HIT)) return;
      var row = g.getRow(rowEl); if (row) openRow(G, row);
    });
    /* the keyboard: arrows move a row, Page Up / Page Down a screenful, Home / End the first / last row, Enter opens it */
    g.on('tableBuilt', function () {
      var hold = host.querySelector('.tabulator-tableholder'); if (!hold) return;
      hold.tabIndex = 0; hold.setAttribute('role', 'grid'); var sh = host.closest('.stsheet, [data-sheet]'), tt = sh && sh.querySelector('.r b, b, h3'); hold.setAttribute('aria-label', (tt && tt.textContent.trim()) || 'List');
      hold.addEventListener('keydown', function (e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        var R = rowsOf(G), n = G.cur, page = Math.max(1, Math.floor(hold.clientHeight / 34) - 1);
        var to = e.key === 'ArrowDown' ? n + 1 : e.key === 'ArrowUp' ? (n < 0 ? 0 : n - 1) : e.key === 'PageDown' ? n + page : e.key === 'PageUp' ? n - page : e.key === 'Home' ? 0 : e.key === 'End' ? R.length - 1 : null;
        if (to != null) { e.preventDefault(); e.stopPropagation(); setCur(G, to, true); return; }
        if (e.key === 'Enter' && G.curRow) { e.preventDefault(); e.stopPropagation(); openRow(G, G.curRow); }
      });
    });
    g.on('dataSorted', function () { G.cur = -1; G.curRow = null; });
    g.on('dataFiltered', function () { G.cur = -1; G.curRow = null; });
  }

  /* ---------- finding long tables as screens are drawn ---------- */
  var queued = false;
  function scan() {
    queued = false;
    if (off() || !window.NS) return;
    var list = [];
    Array.prototype.forEach.call(document.querySelectorAll('#main table'), function (t) { var c = check(t); if (c) list.push([t, c]); });
    B.grids = B.grids.filter(function (G) { if (G.host.isConnected) return true; try { G.g.destroy(); } catch (e) {} return false; });
    if (!list.length) return;
    style();
    /* until the grid is ready the long table waits hidden, so the browser never lays out lakhs of rows */
    list.forEach(function (x) { x[0].classList.add('bt-src'); });
    var t0 = performance.now();
    lib().then(function () {
      list.forEach(function (x) {
        var t = x[0]; if (!t.isConnected || t.hasAttribute('data-bt')) return;
        try { var D = read(t, x[1]); build(t, x[1], D); B.last = { rows: D.rows.length, ms: Math.round(performance.now() - t0) }; }
        catch (e) { t.classList.remove('bt-src'); t.setAttribute('data-bt', '0'); if (window.console) console.warn('NSBig', e); }
      });
    }, function () { list.forEach(function (x) { x[0].classList.remove('bt-src'); x[0].setAttribute('data-bt', '0'); }); });
  }
  function soon() { if (!queued) { queued = true; Promise.resolve().then(scan); } }
  B.scan = scan;
  function start() {
    var main = document.getElementById('main'); if (!main) return;
    new MutationObserver(function (M) {
      for (var i = 0; i < M.length; i++) {
        var a = M[i].addedNodes;
        for (var j = 0; j < a.length; j++) { var n = a[j]; if (n.nodeType === 1 && (n.tagName === 'TABLE' || n.querySelector && n.querySelector('table'))) { soon(); return; } }
      }
    }).observe(main, { childList: true, subtree: true });
    soon();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
