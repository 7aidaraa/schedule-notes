// ---- Department editor as a table (wide screens): one row per teacher × subject, like the official form ----
// Writes the same fields as the cards (cells, subj, split, subjects), so both views and «ميزانية كل الأقسام» agree.
const WIDE = window.matchMedia('(min-width: 900px)');
let TABLE_VIEW = true;
try { TABLE_VIEW = localStorage.getItem('beView') !== 'cards'; } catch {}
const tableOn = () => WIDE.matches && TABLE_VIEW;

const cardsView = renderTeachers;
renderTeachers = function () {
  $('beView').classList.toggle('hidden', !WIDE.matches);
  $('beView').textContent = tableOn() ? 'عرض البطاقات' : 'عرض الجدول';
  $('beAdd').classList.toggle('hidden', tableOn());
  document.body.classList.toggle('wideEdit', tableOn());
  if (!tableOn()) return cardsView();
  renderTable(); renderSums();
};
$('beView').onclick = () => {
  TABLE_VIEW = !tableOn();
  try { localStorage.setItem('beView', TABLE_VIEW ? 'table' : 'cards'); } catch {}
  renderTeachers();
};
// The table gets the whole screen width; leaving the editor gives the page its usual width back.
const closeNarrow = closeBudget;
closeBudget = function () { document.body.classList.remove('wideEdit'); closeNarrow(); };
$('beBack').onclick = closeBudget;
WIDE.addEventListener('change', () => { if (BUDGET && BUDGET.data) renderTeachers(); });

// The lines of one teacher: every subject that has hours or that the teacher teaches, in the department's order.
function tableLines(dp, t) {
  if (!isMulti(dp)) return [null];
  const subs = deptSubjects(dp, BUDGET.data.teachers), have = new Set(t.subjects || []);
  for (const c of CLASSES) if (c in t.cells) for (const p of partsOf(dp, t, c)) have.add(p.subj);
  const keys = [...have].sort((a, b) => subs.indexOf(a) - subs.indexOf(b));
  return keys.length ? keys : [''];
}
const lineHours = (dp, t, s, c) => {
  if (!(c in t.cells)) return undefined;
  const p = partsOf(dp, t, c).find(x => isMulti(dp) ? x.subj === s : true);
  return p ? p.h : undefined;
};
function setLine(dp, t, s, c, h) {
  if (!isMulti(dp)) { if (h === null) { delete t.cells[c]; if (t.subj) delete t.subj[c]; if (t.split) delete t.split[c]; } else t.cells[c] = h; return; }
  const subs = deptSubjects(dp, BUDGET.data.teachers);
  const parts = (c in t.cells ? partsOf(dp, t, c) : []).filter(p => p.subj !== s);
  if (h !== null) parts.push({ subj: s, h });
  parts.sort((a, b) => subs.indexOf(a.subj) - subs.indexOf(b.subj));
  setParts(t, c, parts);
  if (s && h !== null) { t.subjects = t.subjects || []; if (!t.subjects.includes(s)) t.subjects.push(s); }
}
const defaultFor = (dp, s, c) => officialFor(dp, isMulti(dp) ? s || null : null, c) ?? BUDGET.data.periods[trackOf(c)];
// A class × subject held by more than one teacher.
function tableDupes(dp, teachers) {
  const seen = {}, d = new Set();
  teachers.forEach(t => CLASSES.forEach(c => { if (c in t.cells) partsOf(dp, t, c).forEach(p => { const k = c + '|' + (isMulti(dp) ? p.subj : ''); if (seen[k]) d.add(k); seen[k] = 1; }); }));
  return d;
}

let TYPED = { key: '', at: 0 };
function renderTable(focus) {
  const dp = BUDGET.department, d = BUDGET.data, multi = isMulti(dp), dup = tableDupes(dp, d.teachers);
  const classes = CLASSES.filter(c => !HIDDEN.includes(c) || d.teachers.some(t => c in t.cells));
  const grades = GRADES.map(g => ({ g, cs: g.classes.filter(c => classes.includes(c)) })).filter(x => x.cs.length);
  const th = (text, props) => el('th', { textContent: text, ...props });
  const head = el('thead', {},
    el('tr', {}, th('م', { rowSpan: 2, className: 's1' }), th('المعلم', { rowSpan: 2, className: 's2' }), th('النصاب', { rowSpan: 2 }), multi ? th('المادة', { rowSpan: 2 }) : null,
      ...grades.map(x => th(x.g.short, { colSpan: x.cs.length, className: 'gr' })), th('ملاحظة', { rowSpan: 2 }), th('', { rowSpan: 2 })),
    el('tr', {}, ...grades.flatMap(x => x.cs.map(c => th(clsShort(c), { className: 'cl', title: cls(c) })))));
  const body = el('tbody');
  let r = 0;
  d.teachers.forEach((t, i) => {
    const lines = tableLines(dp, t), span = lines.length;
    lines.forEach((s, li) => {
      const tr = el('tr', { className: li === span - 1 ? 'last' : '' });
      if (li === 0) {
        const name = t.added ? el('input', { value: t.name, placeholder: 'اسم المعلم', maxLength: 120 }) : el('span', { textContent: t.name });
        if (t.added) name.oninput = () => { t.name = name.value.trim(); changed(); };
        const cell = el('td', { rowSpan: span, className: 's2 nm' }, name);
        if (multi) {
          const rest = deptSubjects(dp, d.teachers).filter(x => !lines.includes(x));
          if (rest.length) {
            const add = el('select', { className: 'addSub', title: 'إضافة مادة لهذا المعلم' }, el('option', { value: '', textContent: '+ مادة' }), ...rest.map(x => el('option', { value: x, textContent: x })));
            add.onchange = () => { if (!add.value) return; t.subjects = (t.subjects || []).filter(x => x); t.subjects.push(add.value); changed(); renderTable(); };
            cell.append(add);
          }
        }
        const del = el('button', { className: 'del', type: 'button', textContent: '🗑️', title: 'حذف المعلم من الميزانية' });
        del.onclick = () => {
          if (del.dataset.arm) { d.teachers.splice(i, 1); changed(); renderTable(); return; }
          del.dataset.arm = '1'; del.textContent = 'تأكيد؟';
          setTimeout(() => { delete del.dataset.arm; del.textContent = '🗑️'; }, 4000);
        };
        const note = el('input', { value: t.note || '', maxLength: 300, placeholder: '—' });
        note.oninput = () => { t.note = note.value; changed(); };
        tr.append(el('td', { rowSpan: span, className: 's1', textContent: i + 1 }), cell, el('td', { rowSpan: span, className: 'ns', textContent: nisab(t) }));
        tr.__tail = [el('td', { rowSpan: span, className: 'nt' }, note), el('td', { rowSpan: span }, del)];
      }
      if (multi) {
        if (s === '') {
          const pick = el('select', {}, el('option', { value: '', textContent: 'المادة؟' }), ...deptSubjects(dp, d.teachers).map(x => el('option', { value: x, textContent: x })));
          pick.onchange = () => { if (!pick.value) return; t.subjects = [pick.value]; for (const c of Object.keys(t.cells)) { t.subj = t.subj || {}; t.subj[c] = pick.value; } changed(); renderTable(); };
          tr.append(el('td', { className: 'sj' }, pick));
        } else tr.append(el('td', { className: 'sj', textContent: s }));
      }
      const row = r++;
      classes.forEach((c, ci) => {
        const h = lineHours(dp, t, s, c), off = officialFor(dp, multi ? s || null : null, c);
        const known = OFFICIAL[multi ? SHEET_SUBJECT[s] || s : dp];
        const k = el('td', { tabIndex: 0, className: 'hc' + (h !== undefined ? ' on' : '') + (h !== undefined && off != null && h !== off ? ' odd' : '') + (h !== undefined && dup.has(c + '|' + (multi ? s : '')) ? ' dup' : '') + (known && off == null ? ' off' : ''), textContent: h === undefined ? '' : h === off ? '✓' : h, title: cls(c) + (s ? ' — ' + s : '') + (off != null ? ' — المقرر ' + off : '') });
        k.dataset.r = row; k.dataset.c = ci;
        const put = v => { setLine(dp, t, s, c, v); changed(); renderTable({ r: row, c: ci }); };
        k.onclick = () => {
          if (h !== undefined) return put(null);
          const def = defaultFor(dp, s, c);
          if (def === null || def === undefined) { $('beMsg').textContent = 'حدد حصص الأسبوع لهذا الصف أولاً، أو اكتب العدد في الخانة'; k.focus(); return; }
          put(def);
        };
        k.onkeydown = e => {
          if (/^\d$/.test(e.key)) {
            // Two quick digits make one number (e.g. 1 then 2 → 12).
            const now = Date.now(), cont = TYPED.key === row + ':' + ci && now - TYPED.at < 1200 && h !== undefined && h < 10;
            const v = Math.min(40, cont ? h * 10 + Number(e.key) : Number(e.key));
            TYPED = { key: row + ':' + ci, at: now }; e.preventDefault(); return put(v);
          }
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (h !== undefined) put(null); return; }
          if (e.key === ' ') { e.preventDefault(); k.click(); return; }
          const move = { ArrowRight: [0, -1], ArrowLeft: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1] }[e.key];
          if (!move) return;
          const to = $('beTeachers').querySelector('td.hc[data-r="' + (row + move[0]) + '"][data-c="' + (ci + move[1]) + '"]');
          if (to) { e.preventDefault(); to.focus(); }
        };
        tr.append(k);
      });
      if (tr.__tail) tr.append(...tr.__tail);
      body.append(tr);
    });
  });
  // Totals per class, then a row to add a teacher.
  const lead = 3 + (multi ? 1 : 0);
  const total = sum(d.teachers, nisab);
  body.append(el('tr', { className: 'tot' }, el('td', { colSpan: lead, className: 'st0', textContent: 'المجموع: ' + total }),
    ...classes.map(c => el('td', { textContent: sum(d.teachers, t => t.cells[c] || 0) || '' })), el('td', { colSpan: 2 })));
  const inBudget = new Set(d.teachers.map(t => t.name));
  const others = TEACHERS.filter(t => t.department === dp && !inBudget.has(t.name));
  const add = el('select', {}, el('option', { value: '', textContent: '+ إضافة معلم' }), ...others.map(t => el('option', { value: t.name, textContent: t.name })), el('option', { value: '*', textContent: 'اسم آخر…' }));
  add.onchange = () => {
    if (!add.value) return;
    d.teachers.push(add.value === '*' ? { name: '', cells: {}, note: '', added: true } : { name: add.value, cells: {}, note: '' });
    if (add.value !== '*') changed();
    renderTable();
    if (add.value === '*') { const ins = $('beTeachers').querySelectorAll('input[placeholder="اسم المعلم"]'); ins[ins.length - 1].focus(); }
  };
  body.append(el('tr', { className: 'addRow' }, el('td', { colSpan: lead + classes.length + 2, style: 'text-align:right' }, el('div', { className: 'st0' }, add))));
  const wrap = el('div', { className: 'btWrap' }, el('table', { className: 'bedT' }, head, body));
  $('beTeachers').replaceChildren(el('p', { className: 'meta', style: 'margin:0 0 6px', textContent: 'الضغطة تضع المقرر (✓) أو تزيله؛ اكتب رقماً لعدد آخر؛ Delete يفرّغ؛ الأسهم وEnter وTab للتنقل.' }), wrap);
  if (focus) { const f = wrap.querySelector('td.hc[data-r="' + focus.r + '"][data-c="' + focus.c + '"]'); if (f) f.focus(); }
}
if (BUDGET && BUDGET.data) renderTeachers();
