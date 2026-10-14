// The week grid (5 days × 7 periods) ⇄ rows of the sheet «القيود» of type «لا حصّة» and «خانات محجوبة».
// A cell holds the binding of its block: { lv: 'صلب' | 'مرن موزون' | 'إعفاء', w: weight or null, dur: 'ثابتة' | 'مؤقتة' }.
// «إعفاء» (a teacher's own cell only): the cell its layers block is free for this teacher.
// Saving changes only what changed: a row whose cells are all untouched stays as it is (its label, tick and note too).
const Grid = (() => {
  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const PERIODS = [1, 2, 3, 4, 5, 6, 7];
  const MANAGED = ['لا حصّة', 'خانات محجوبة'];
  const ORD = { 'الأولى': 1, 'الثانية': 2, 'الثالثة': 3, 'الرابعة': 4, 'الخامسة': 5, 'السادسة': 6, 'السابعة': 7, 'الأخيرة': 7 };
  const fold = s => String(s ?? '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ًٌٍَُِّْـ]/g, '');
  const latin = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const key = (d, p) => d + '|' + p;

  // «1، 7» · «الأولى» → [1, 7]; anything else in the text makes it unreadable (null): such a row is left alone.
  function periods(s) {
    let rest = latin(s);
    const out = new Set();
    for (const [w, n] of Object.entries(ORD)) if (rest.includes(w)) { out.add(n); rest = rest.split(w).join(' '); }
    rest = rest.replace(/\d+/g, m => { const n = Number(m); if (n >= 1 && n <= 7) out.add(n); else out.add(NaN); return ' '; });
    if (/[^\s،,و]/.test(rest) || !out.size || [...out].some(Number.isNaN)) return null;
    return [...out].sort((a, b) => a - b);
  }
  function days(s) {
    let rest = fold(s);
    const out = [];
    DAYS.forEach((d, i) => { if (rest.includes(fold(d))) { out.push(i); rest = rest.split(fold(d)).join(' '); } });
    return /[^\s،,و]/.test(rest) || !out.length ? null : out;
  }
  // The cells a row blocks, or null when its value cannot be read.
  function cellsOf(r) {
    if (r.ctype === 'لا حصّة') {
      const p = periods(r.value);
      return p && DAYS.flatMap((_, d) => p.map(x => key(d, x)));
    }
    if (r.ctype === 'خانات محجوبة') {
      const parts = String(r.value || '').split(':');
      if (parts.length !== 2) return null;
      const d = days(parts[0]), p = periods(parts[1]);
      return d && p && d.flatMap(x => p.map(y => key(x, y)));
    }
    return null;
  }
  const weightOf = r => r.level === 'مرن موزون' && r.weight !== null && r.weight !== undefined && r.weight !== '' ? Number(r.weight) : null;
  const LEVELS = ['صلب', 'مرن موزون', 'إعفاء'];
  const durOf = r => r.duration === 'مؤقتة' ? 'مؤقتة' : 'ثابتة';
  const cellOf = r => ({ lv: r.level, w: r.level === 'مرن موزون' ? weightOf(r) : null, dur: durOf(r) });
  const rank = c => c.lv === 'صلب' ? Infinity : c.lv === 'إعفاء' ? -1 : c.w ?? 0;
  const same = (a, b) => !!a && !!b && a.lv === b.lv && (a.lv !== 'مرن موزون' || a.w === b.w) && (a.dur || 'ثابتة') === (b.dur || 'ثابتة');
  // Rows the grid takes charge of: active, of the two types, readable. The rest are shown and kept untouched.
  const managed = r => MANAGED.includes(r.ctype) && r.active !== false && LEVELS.includes(r.level) && !!cellsOf(r);

  // Rows → { cell: binding }; where rows overlap, the stronger wins (as the sheet's engine charges it).
  function fromRows(rows) {
    const g = new Map();
    for (const r of rows) for (const k of cellsOf(r)) { const c = cellOf(r), o = g.get(k); if (!o || rank(c) > rank(o)) g.set(k, c); }
    return g;
  }
  const valueText = (ds, ps) => (ds ? ds.map(d => DAYS[d]).join('، ') + ': ' : '') + ps.join('، ');
  // Cells → rows: per binding and duration, a period blocked on all five days is «لا حصّة»,
  // and days blocked at the same periods share one «خانات محجوبة» row: «الأحد، الخميس: 6، 7».
  function generate(cells) {
    const groups = new Map();
    for (const [k, c] of cells) {
      const gk = c.lv + '|' + (c.lv === 'مرن موزون' ? c.w : '') + '|' + (c.dur || 'ثابتة');
      if (!groups.has(gk)) groups.set(gk, { c, set: new Set() });
      groups.get(gk).set.add(k);
    }
    const out = [];
    const order = [...groups.values()].sort((a, b) => rank(b.c) - rank(a.c));
    for (const { c, set } of order) {
      const base = { level: c.lv, weight: c.lv === 'مرن موزون' ? c.w : null, duration: c.dur || 'ثابتة' };
      const full = PERIODS.filter(p => DAYS.every((_, d) => set.has(key(d, p))));
      if (full.length) out.push({ ...base, ctype: 'لا حصّة', value: valueText(null, full) });
      const byDay = DAYS.map((_, d) => PERIODS.filter(p => set.has(key(d, p)) && !full.includes(p)));
      const seen = new Map();
      byDay.forEach((ps, d) => { if (!ps.length) return; const s = ps.join(','); if (!seen.has(s)) seen.set(s, { ps, ds: [] }); seen.get(s).ds.push(d); });
      for (const { ps, ds } of seen.values()) out.push({ ...base, ctype: 'خانات محجوبة', value: valueText(ds, ps) });
    }
    return out;
  }
  // What saving the grid does to the target's rows: keep / delete / add.
  // A row stays when every cell it blocks is unchanged; the cells the kept rows no longer give are written anew.
  function plan(rows, next) {
    const before = fromRows(rows);
    const keep = [], del = [];
    for (const r of rows) (cellsOf(r).every(k => same(next.get(k), before.get(k))) ? keep : del).push(r);
    const given = fromRows(keep);
    const rest = new Map([...next].filter(([k, c]) => !same(given.get(k), c)));
    return { keep, del, add: generate(rest) };
  }
  // Rows to delete whose target is spelled otherwise than `target` (a teacher's rows match its nick loosely):
  // [[spelling, ids]], each sent under its own spelling, as the server deletes only the rows of the exact target.
  function otherTargets(rows, target) {
    const m = new Map();
    for (const r of rows) if (r.target !== target) m.set(r.target, [...(m.get(r.target) || []), r.id]);
    return [...m];
  }
  return { DAYS, PERIODS, MANAGED, key, cellsOf, cellOf, managed, fromRows, generate, plan, otherTargets, same, rank };
})();
if (typeof module !== 'undefined') module.exports = Grid;
