#!/usr/bin/env node
// Characterization tests of web/grid.js (DOM-free): `node tools/grid_test.js` (exit 1 = a test failed).
// They pin what the grid does today, so a change to it shows up here first.
const assert = require('assert');
const Grid = require('../web/grid.js');

const row = (id, ctype, value, level = 'صلب', extra = {}) => ({ id, ctype, value, level, weight: null, active: true, duration: 'ثابتة', target: 'أحمد علي', ...extra });
const tests = {
  'لا حصّة blocks the period on all five days'() {
    assert.deepStrictEqual(Grid.cellsOf(row(1, 'لا حصّة', '1، 7')), ['0|1', '0|7', '1|1', '1|7', '2|1', '2|7', '3|1', '3|7', '4|1', '4|7']);
  },
  'period words and Arabic digits are read'() {
    assert.deepStrictEqual(Grid.cellsOf(row(1, 'لا حصّة', 'الأولى و٧')), ['0|1', '0|7', '1|1', '1|7', '2|1', '2|7', '3|1', '3|7', '4|1', '4|7']);
  },
  'خانات محجوبة: days then periods, hamza ignored'() {
    assert.deepStrictEqual(Grid.cellsOf(row(1, 'خانات محجوبة', 'الاثنين، الخميس: 6، 7')), ['1|6', '1|7', '4|6', '4|7']);
  },
  'unreadable values are left alone (null, not managed)'() {
    for (const v of ['8', '1 ثم 2', '', 'الأحد 7', 'الأحد: 0']) {
      const r = row(1, v.includes('الأحد') ? 'خانات محجوبة' : 'لا حصّة', v);
      assert.strictEqual(Grid.cellsOf(r), null, v);
      assert.strictEqual(Grid.managed(r), false, v);
    }
  },
  'managed: only active rows of the two types and a known level'() {
    assert.strictEqual(Grid.managed(row(1, 'لا حصّة', '1')), true);
    assert.strictEqual(Grid.managed(row(1, 'لا حصّة', '1', 'صلب', { active: false })), false);
    assert.strictEqual(Grid.managed(row(1, 'لا حصّة', '1', 'مرن')), false);
    assert.strictEqual(Grid.managed(row(1, 'أيام التفرّغ', 'الأحد')), false);
    assert.strictEqual(Grid.managed(row(1, 'لا حصّة', '1', 'إعفاء')), true);
  },
  'overlapping rows: the stronger binding wins'() {
    const g = Grid.fromRows([row(1, 'لا حصّة', '7', 'مرن موزون', { weight: 100 }), row(2, 'خانات محجوبة', 'الأحد: 7')]);
    assert.deepStrictEqual(g.get('0|7'), { lv: 'صلب', w: null, dur: 'ثابتة' });
    assert.deepStrictEqual(g.get('1|7'), { lv: 'مرن موزون', w: 100, dur: 'ثابتة' });
  },
  'generate: a full period is «لا حصّة», days sharing periods share a row'() {
    const cells = new Map();
    for (let d = 0; d < 5; d++) cells.set(Grid.key(d, 7), { lv: 'صلب', w: null, dur: 'ثابتة' });
    cells.set(Grid.key(0, 6), { lv: 'صلب', w: null, dur: 'ثابتة' });
    cells.set(Grid.key(4, 6), { lv: 'صلب', w: null, dur: 'ثابتة' });
    cells.set(Grid.key(2, 1), { lv: 'مرن موزون', w: 50, dur: 'مؤقتة' });
    assert.deepStrictEqual(Grid.generate(cells), [
      { level: 'صلب', weight: null, duration: 'ثابتة', ctype: 'لا حصّة', value: '7' },
      { level: 'صلب', weight: null, duration: 'ثابتة', ctype: 'خانات محجوبة', value: 'الأحد، الخميس: 6' },
      { level: 'مرن موزون', weight: 50, duration: 'مؤقتة', ctype: 'خانات محجوبة', value: 'الثلاثاء: 1' }]);
  },
  'plan: untouched rows are kept, a changed row goes and its cells come back'() {
    const rows = [row(1, 'لا حصّة', '1'), row(2, 'خانات محجوبة', 'الخميس: 7')];
    const next = Grid.fromRows(rows);
    next.delete(Grid.key(0, 1)); // Sunday period 1 freed
    const p = Grid.plan(rows, next);
    assert.deepStrictEqual(p.keep.map(r => r.id), [2]);
    assert.deepStrictEqual(p.del.map(r => r.id), [1]);
    assert.deepStrictEqual(p.add, [{ level: 'صلب', weight: null, duration: 'ثابتة', ctype: 'خانات محجوبة', value: 'الإثنين، الثلاثاء، الأربعاء، الخميس: 1' }]);
  },
  'plan: no change, nothing to do'() {
    const rows = [row(1, 'لا حصّة', '1، 2')];
    assert.deepStrictEqual(Grid.plan(rows, Grid.fromRows(rows)), { keep: rows, del: [], add: [] });
  },
  'otherTargets: rows spelled otherwise, grouped by their spelling'() {
    const rows = [row(1, 'لا حصّة', '1'), row(2, 'لا حصّة', '2', 'صلب', { target: 'احمد علي' }), row(3, 'لا حصّة', '3', 'صلب', { target: 'احمد علي' }), row(4, 'لا حصّة', '4', 'صلب', { target: 'أحمد  علي' })];
    assert.deepStrictEqual(Grid.otherTargets(rows, 'أحمد علي'), [['احمد علي', [2, 3]], ['أحمد  علي', [4]]]);
    assert.deepStrictEqual(Grid.otherTargets(rows.slice(0, 1), 'أحمد علي'), []);
  },
};

let failed = 0;
for (const [name, t] of Object.entries(tests)) {
  try { t(); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + String(e.message).split('\n').join('\n  ')); }
}
console.log('grid_test: ' + (Object.keys(tests).length - failed) + '/' + Object.keys(tests).length + ' pass');
process.exit(failed ? 1 : 0);
