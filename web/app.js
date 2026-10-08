const API = 'https://zywdedrtcaolsosufoae.supabase.co/functions/v1/api';
const MAX = 10 * 1024 * 1024; // all files of a request together
const MAX_FILES = 10;
const EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar', '7z'];
const ZIPS = ['zip', 'rar', '7z'];
const ext = n => n.split('.').pop().toLowerCase();
let PASS = '';
let ROLE = '';
let BOOK = null; // admin: phone book, used to pre-fill the number when adding a request for a teacher
let ROWS = [];
const $ = id => document.getElementById(id);

async function call(action, data) {
  let res;
  try {
    res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: PASS, action, ...data }) });
  } catch { throw 'تعذر الاتصال، تحقق من الإنترنت'; }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw out.error || 'حدث خطأ، حاول مجدداً';
  return out;
}
function msg(el, text, kind) { el.textContent = text; el.className = 'msg ' + (kind || ''); }
function el(tag, props, ...kids) {
  const n = Object.assign(document.createElement(tag), props || {});
  kids.forEach(k => k && n.append(k));
  return n;
}

// ---- Login ----
$('loginBtn').onclick = async () => {
  const btn = $('loginBtn'); btn.disabled = true;
  PASS = $('pass').value.trim();
  try {
    const { role, teachers } = await call('login');
    $('login').classList.add('hidden');
    $(role).classList.remove('hidden');
    ROLE = role;
    if (role === 'admin') $('whoTitle').textContent = 'بيانات المعلم';
    setupForm(teachers || []);
    if (role === 'admin') { $('teacher').classList.add('hidden'); loadList(); }
  } catch (e) { msg($('loginMsg'), e, 'err'); }
  btn.disabled = false;
};
$('pass').onkeydown = e => { if (e.key === 'Enter') $('loginBtn').click(); };

// ---- Teacher ----
function readFile(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej('تعذرت قراءة الملف');
    r.readAsDataURL(f);
  });
}

// Budget files accumulate across picks (easier on phones than one multi-select).
let FILES = [];
const mb = b => (b / 1024 / 1024).toFixed(1) + ' ميغابايت';
function showFiles() {
  $('fileList').replaceChildren(...FILES.map(f => {
    const x = el('button', { className: 'ghost', type: 'button', textContent: 'حذف' });
    x.onclick = () => { FILES = FILES.filter(g => g !== f); showFiles(); };
    return el('div', { className: 'file' }, el('span', {}, el('bdi', { textContent: f.name }), ' — ' + mb(f.size)), x);
  }), ...(FILES.length > 1 ? [el('div', { className: 'meta', textContent: FILES.length + ' ملفات، المجموع ' + mb(FILES.reduce((a, f) => a + f.size, 0)) })] : []));
}
$('budgetFile').onchange = () => {
  for (const f of $('budgetFile').files)
    if (!FILES.some(g => g.name === f.name && g.size === f.size)) FILES.push(f);
  $('budgetFile').value = '';
  showFiles();
};

// Department and name accept free typing; the lists only suggest.
let TEACHERS = [];
const options = (list, values) => list.replaceChildren(...values.map(v => el('option', { value: v })));
function fillNames() {
  const d = $('dept').value.trim();
  options($('nameList'), TEACHERS.filter(t => !d || t.department === d).map(t => t.name));
}
function setupForm(teachers) {
  TEACHERS = teachers;
  options($('deptList'), [...new Set(teachers.map(t => t.department))]);
  fillNames();
  $('dept').oninput = () => {
    fillNames();
    const t = person();
    if (t && t.department !== $('dept').value.trim()) $('name').value = '';
    showRole();
  };
  $('name').oninput = () => {
    const t = person();
    if (t && !$('dept').value.trim()) { $('dept').value = t.department; fillNames(); }
    showRole();
    const c = ROLE === 'admin' && BOOK && BOOK.find(c => c.name === $('name').value.trim());
    if (c && !$('phone').value.trim()) $('phone').value = c.phone;
  };
  showRole();
  if (!$('items').children.length) addItem();
}
// The role is known from the staff directory: heads of department get the budget field.
const person = () => TEACHERS.find(t => t.name === $('name').value.trim());
const isHead = () => !!(person() || {}).is_head;
function showRole() {
  const t = person();
  $('roleTag').replaceChildren(...(t ? [t.is_head ? el('b', { textContent: 'رئيس قسم ' + t.department }) : 'معلم'] : []));
  $('budget').classList.toggle('hidden', !isHead());
  if (!isHead()) { FILES = []; showFiles(); }
  showBudgetState();
}

// Each request is its own card with its own reason (and attachment for heads of department).
function addItem() {
  const box = el('div', { className: 'card item' });
  const remove = el('button', { className: 'ghost', type: 'button', textContent: 'حذف' });
  remove.onclick = () => { box.remove(); renumber(); };
  box.append(
    el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' }, el('h2'), remove),
    el('label', { textContent: 'الطلب' }), el('textarea', { className: 'req', maxLength: 3000 }),
    el('label', { textContent: 'سبب الطلب' }), el('textarea', { className: 'why', maxLength: 3000 }));
  $('items').append(box);
  renumber();
}
function renumber() {
  const items = [...$('items').children];
  items.forEach((b, i) => {
    b.querySelector('h2').textContent = 'الطلب ' + (i + 1);
    b.querySelector('button').classList.toggle('hidden', items.length === 1);
  });
}
$('addBtn').onclick = () => { addItem(); $('items').lastChild.querySelector('.req').focus(); };

const digits = v => v.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

$('sendBtn').onclick = async () => {
  const out = $('sendMsg'), btn = $('sendBtn');
  const base = { name: $('name').value.trim(), department: $('dept').value.trim(),
    phone: digits($('phone').value).replace(/[\s-]/g, '').replace(/^(\+|00)965/, '') };
  const items = [...$('items').children].map(b => ({
    box: b, request: b.querySelector('.req').value.trim(), reason: b.querySelector('.why').value.trim() }));
  // The budget travels once, with the first request.
  if (items[0] && isHead()) items[0].files = FILES;
  if (!base.department || !base.name || !base.phone || items.some(i => !i.request || !i.reason))
    return msg(out, 'جميع الحقول مطلوبة، ولكل طلب سببه', 'err');
  if (!/^[2569]\d{7}$/.test(base.phone)) return msg(out, 'رقم الهاتف يجب أن يكون 8 أرقام', 'err');
  if (FILES.length > MAX_FILES) return msg(out, 'الحد ' + MAX_FILES + ' ملفات', 'err');
  if (FILES.reduce((a, f) => a + f.size, 0) > MAX) return msg(out, 'مجموع حجم المرفقات يتجاوز 10 ميغابايت', 'err');
  const bad = FILES.find(f => !EXTS.includes(ext(f.name)));
  if (bad) return msg(out, 'نوع الملف «' + bad.name + '» غير مقبول: PDF أو صورة أو Word أو Excel أو ملف مضغوط', 'err');
  btn.disabled = true;
  // One request per call: each becomes its own row, and a failure keeps only the unsent ones on screen.
  let sent = 0;
  try {
    for (const i of items) {
      msg(out, 'جارٍ إرسال الطلب ' + (sent + 1) + ' من ' + items.length + '...');
      const data = { ...base, request: i.request, reason: i.reason };
      if (i.files && i.files.length) data.files = await Promise.all(i.files.map(async f => ({ name: f.name, data: await readFile(f) })));
      await call('submit', data);
      i.box.remove(); sent++;
    }
    $('phone').value = ''; FILES = []; showFiles();
    addItem();
    if (ROLE === 'admin') { $('name').value = ''; $('dept').value = ''; fillNames(); showRole(); BOOK = null; }
    msg(out, ROLE === 'admin' ? 'تمت إضافة ' + (sent > 1 ? 'الطلبات (' + sent + ')' : 'الطلب') + ' ✓' : sent > 1 ? 'تم إرسال جميع الطلبات (' + sent + ') بنجاح ✓' : 'تم إرسال طلبك بنجاح ✓', 'ok');
  } catch (e) {
    renumber();
    msg(out, (sent ? 'أُرسل ' + sent + '، وتعذر إرسال الباقي: ' : '') + e, 'err');
  }
  btn.disabled = false;
};

// ---- Admin ----
async function loadList() {
  $('count').textContent = 'جارٍ التحميل...';
  try { ROWS = (await call('list')).rows; render(); }
  catch (e) { $('count').textContent = e; }
}
$('refreshBtn').onclick = loadList;
$('hideDone').onchange = render;

function field(label, text) {
  return el('div', { className: 'field' }, el('b', { textContent: label }), el('p', { textContent: text || '—' }));
}

function delBtn(r) {
  const b = el('button', { className: 'del', type: 'button', textContent: '🗑️', title: 'حذف الطلب', ariaLabel: 'حذف الطلب' });
  b.onclick = async () => {
    if (!confirm('حذف طلب «' + r.request.slice(0, 40) + '» من ' + r.name + ' نهائياً؟')) return;
    b.disabled = true;
    try { await call('delete', { id: r.id }); ROWS = ROWS.filter(x => x.id !== r.id); render(); }
    catch (e) { alert(e); b.disabled = false; }
  };
  return b;
}

function card(r) {
  const c = el('div', { className: 'card' + (r.done ? ' done' : '') });
  c.append(
    el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' },
      el('strong', {}, r.name, r.by_admin ? el('span', { className: 'mine', textContent: ' أضفته أنت', style: 'margin-inline-start:6px' }) : null),
      el('div', { className: 'row', style: 'margin-top:0' },
        el('span', { className: 'badge', textContent: r.done ? 'تم ✓' : 'جديد' }), delBtn(r))),
    el('div', { className: 'meta', textContent: [r.role === 'head' ? 'رئيس قسم' : 'معلم', r.department, new Date(r.created_at).toLocaleString('ar-KW')].filter(Boolean).join(' · ') }),
    field('الطلب', r.request),
    field('السبب', r.reason));
  if (r.phone) c.append(el('div', { className: 'row', style: 'margin-top:0' }, waBtn(r.phone, r.name, r.request),
    el('a', { href: 'tel:+965' + r.phone, textContent: r.phone, dir: 'ltr' })));

  // Rows saved before multi-file support carry a single file in file_*.
  const files = r.files && r.files.length ? r.files : r.file_path ? [{ name: r.file_name, type: r.file_type }] : [];
  if (files.length) c.append(el('div', { className: 'field' }, el('b', { textContent: 'ميزانية القسم' + (files.length > 1 ? ' (' + files.length + ' ملفات)' : '') + ':' })),
    ...files.map((f, n) => fileRow(r, f, n)));

  const note = el('textarea', { value: r.draft ?? r.note, placeholder: 'ملاحظاتي على هذا الطلب' });
  note.oninput = () => { r.draft = note.value; };
  const nmsg = el('span', { className: 'meta' });
  const saveBtn = el('button', { className: 'ghost', textContent: 'حفظ الملاحظة' });
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try { await call('note', { id: r.id, note: note.value }); r.note = note.value; r.draft = undefined; nmsg.textContent = 'حُفظت ✓'; }
    catch (e) { nmsg.textContent = e; }
    saveBtn.disabled = false;
  };
  const doneBtn = el('button', { className: r.done ? 'ghost' : 'ok', textContent: r.done ? 'إلغاء الإنجاز' : 'تم ✓' });
  doneBtn.onclick = async () => {
    doneBtn.disabled = true;
    try { await call('done', { id: r.id, done: !r.done }); r.done = !r.done; render(); }
    catch (e) { nmsg.textContent = e; doneBtn.disabled = false; }
  };
  c.append(el('label', { textContent: 'ملاحظاتي' }), note, el('div', { className: 'row' }, saveBtn, doneBtn, nmsg));
  return c;
}

// One attachment: its name, view (not for archives) and download.
function fileRow(r, f, n) {
  const preview = el('div', { className: 'preview' });
  const fmsg = el('span', { className: 'meta' });
  const isImg = (f.type || '').startsWith('image/');
  const getUrls = () => call('file', { id: r.id, n });
  const viewBtn = el('button', { className: 'ghost', textContent: 'عرض' });
  const dlBtn = el('button', { className: 'ghost', textContent: 'تحميل' });
  viewBtn.onclick = async () => {
    // Open the tab synchronously so mobile popup blockers allow it.
    const tab = isImg ? null : window.open('', '_blank');
    viewBtn.disabled = true; fmsg.textContent = 'جارٍ الجلب...';
    try {
      const u = await getUrls();
      if (isImg) preview.replaceChildren(el('img', { src: u.view, alt: f.name }));
      else if (tab) tab.location = u.view;
      else location.href = u.view;
      fmsg.textContent = '';
    } catch (e) { if (tab) tab.close(); fmsg.textContent = e; }
    viewBtn.disabled = false;
  };
  dlBtn.onclick = async () => {
    dlBtn.disabled = true; fmsg.textContent = 'جارٍ التحميل...';
    try { location.href = (await getUrls()).download; fmsg.textContent = ''; }
    catch (e) { fmsg.textContent = e; }
    dlBtn.disabled = false;
  };
  return el('div', {}, el('div', { className: 'meta' }, el('bdi', { textContent: f.name })),
    el('div', { className: 'row', style: 'margin-top:4px' }, ZIPS.includes(ext(f.name || '')) ? null : viewBtn, dlBtn, fmsg), preview);
}

// Opens a WhatsApp chat with the sender; the message quotes the request when there is one.
function waBtn(phone, name, request) {
  const text = 'السلام عليكم أ. ' + name.split(' ')[0] + (request ? '، بخصوص طلبك: «' + request.slice(0, 80) + '»' : '');
  return el('a', { className: 'wa', href: 'https://wa.me/965' + phone + '?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener', textContent: 'واتساب' });
}

// ---- Phone book: last number each sender used, kept even after requests are deleted ----
function tab(which) {
  ['req', 'book', 'add', 'school'].forEach(k => $('tab' + k[0].toUpperCase() + k.slice(1)).classList.toggle('on', which === k));
  $('reqView').classList.toggle('hidden', which !== 'req'); $('book').classList.toggle('hidden', which !== 'book'); $('school').classList.toggle('hidden', which !== 'school');
  if (which === 'school') loadSchool();
  $('teacher').classList.toggle('hidden', which !== 'add');
  if (which === 'book') loadBook();
  if (which === 'req') loadList();
  if (which === 'add' && !BOOK) call('contacts').then(o => { BOOK = o.rows; }).catch(() => {});
}
$('tabReq').onclick = () => tab('req');
$('tabBook').onclick = () => tab('book');
$('tabAdd').onclick = () => tab('add');
async function loadBook() {
  $('bookList').replaceChildren(el('div', { className: 'meta', textContent: 'جارٍ التحميل...' }));
  try {
    const rows = (await call('contacts')).rows;
    $('bookList').replaceChildren(...(rows.length ? rows.map(c => el('div', { className: 'card contact' },
      el('div', {}, el('strong', { textContent: c.name }),
        el('div', { className: 'meta', textContent: [c.role === 'head' ? 'رئيس قسم' : 'معلم', c.department].filter(Boolean).join(' · ') })),
      el('div', { className: 'row', style: 'margin-top:0' }, waBtn(c.phone, c.name),
        el('a', { href: 'tel:+965' + c.phone, textContent: c.phone, dir: 'ltr' }))))
      : [el('div', { className: 'card meta', textContent: 'لا توجد أرقام بعد؛ تُحفظ تلقائياً مع كل طلب' })]));
  } catch (e) { $('bookList').replaceChildren(el('div', { className: 'card meta', textContent: e })); }
}

function render() {
  const rows = $('hideDone').checked ? ROWS.filter(r => !r.done) : ROWS;
  const open = ROWS.filter(r => !r.done).length;
  $('count').textContent = 'الإجمالي: ' + ROWS.length + ' — غير المنجزة: ' + open;
  $('list').replaceChildren(...(rows.length ? rows.map(card) : [el('div', { className: 'card meta', textContent: 'لا توجد طلبات' })]));
}

// ---- Department budget ----
// Class ids match the server. Each grade/track has a default number of weekly periods per class.
const GRADES = [
  { track: 'g10', label: 'العاشر', short: 'العاشر', classes: ['10-1', '10-2', '10-3', '10-4', '10-5', '10-6', '10-7'] },
  { track: 'g11a', label: 'الحادي عشر أدبي', short: '11 أدبي', classes: ['11a-1', '11a-2'] },
  { track: 'g11s', label: 'الحادي عشر علمي', short: '11 علمي', classes: ['11s-1', '11s-2', '11s-3', '11s-4', '11s-5'] },
  { track: 'g12a', label: 'الثاني عشر أدبي', short: '12 أدبي', classes: ['12a-1'] },
  { track: 'g12s', label: 'الثاني عشر علمي', short: '12 علمي', classes: ['12s-1', '12s-2', '12s-3', '12s-4', '12s-5'] },
];
const CLASSES = GRADES.flatMap(g => g.classes);
const trackOf = c => GRADES.find(g => g.classes.includes(c)).track;
// "11s-3" → "11ع3", "10-4" → "4" inside its grade group, full label elsewhere.
const cls = c => { const [g, n] = c.split('-'); return g.replace('a', 'د').replace('s', 'ع') + n; };
const clsShort = c => { const [g, n] = c.split('-'); return g === '10' ? n : g.slice(2).replace('a', 'د').replace('s', 'ع') + n; };
const nisab = t => CLASSES.reduce((a, c) => a + (t.cells[c] || 0), 0);
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
// Classes assigned to more than one teacher in the same department.
function dupes(teachers) {
  const seen = {}, d = new Set();
  teachers.forEach(t => CLASSES.forEach(c => { if (c in t.cells) { if (seen[c]) d.add(c); seen[c] = true; } }));
  return d;
}

let BUDGET = null; // { department, name, data, onDone }
let saveTimer = null, dirty = false;

function openBudget(department, name, onDone) {
  BUDGET = { department, name, data: null, onDone };
  $('teacher').classList.add('hidden'); $('admin').classList.add('hidden'); $('bedit').classList.remove('hidden');
  $('beTitle').textContent = 'ميزانية قسم ' + department;
  $('beTeachers').replaceChildren(el('div', { className: 'card meta', textContent: 'جارٍ التحميل...' }));
  $('beMsg').textContent = '';
  call('budget_get', { department, name }).then(o => {
    BUDGET.data = o.budget.data;
    BUDGET.data.teachers.forEach(t => { t.cells = t.cells || {}; });
    renderBudget();
    $('beMsg').textContent = o.budget.updated_at ? 'آخر حفظ: ' + new Date(o.budget.updated_at).toLocaleString('ar-KW') + (o.budget.updated_by ? ' (' + o.budget.updated_by + ')' : '') : 'لم تُحفظ بعد';
    window.scrollTo(0, 0);
  }).catch(e => $('beTeachers').replaceChildren(el('div', { className: 'card meta', textContent: e })));
}
function closeBudget() {
  if (dirty) saveBudget();
  $('bedit').classList.add('hidden');
  const done = BUDGET && BUDGET.onDone; BUDGET = null;
  if (done) done();
}
$('beBack').onclick = closeBudget;

function changed() {
  dirty = true; renderSums();
  clearTimeout(saveTimer); saveTimer = setTimeout(saveBudget, 800);
  $('beMsg').textContent = 'جارٍ الحفظ...';
}
async function saveBudget() {
  if (!BUDGET || !BUDGET.data) return;
  clearTimeout(saveTimer);
  const snapshot = JSON.stringify(BUDGET.data);
  try {
    const o = await call('budget_save', { department: BUDGET.department, name: BUDGET.name, data: BUDGET.data });
    if (JSON.stringify(BUDGET.data) === snapshot) dirty = false;
    $('beMsg').textContent = 'حُفظ ✓ ' + new Date(o.updated_at).toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { $('beMsg').textContent = 'لم يُحفظ: ' + e; }
}
$('beSave').onclick = saveBudget;
window.addEventListener('beforeunload', e => { if (dirty) { saveBudget(); e.preventDefault(); e.returnValue = ''; } });

function renderBudget() {
  const d = BUDGET.data;
  $('bePeriods').replaceChildren(...GRADES.map(g => {
    const inp = el('input', { type: 'number', inputMode: 'numeric', min: 0, max: 40, value: d.periods[g.track] ?? '', placeholder: '—' });
    inp.oninput = () => { d.periods[g.track] = inp.value === '' ? null : Number(inp.value); changed(); };
    return el('div', {}, el('label', { textContent: g.short }), inp);
  }));
  $('beReq').value = d.required ?? '';
  $('beReq').oninput = () => { d.required = $('beReq').value === '' ? null : Number($('beReq').value); changed(); };
  $('beNote').value = d.note || '';
  $('beNote').oninput = () => { d.note = $('beNote').value; changed(); };
  renderTeachers();
}
function renderTeachers() {
  const d = BUDGET.data, dup = dupes(d.teachers);
  $('beTeachers').replaceChildren(...d.teachers.map((t, i) => teacherCard(t, i, dup)));
  renderSums();
}
function renderSums() {
  const d = BUDGET.data, have = d.teachers.length;
  $('beHave').textContent = have;
  const gap = d.required === null || d.required === undefined ? null : d.required - have;
  $('beGap').textContent = gap === null ? '—' : gap;
  $('beGap').className = gap > 0 ? 'neg' : '';
}
function teacherCard(t, i, dup) {
  const box = el('div', { className: 'card' });
  const tag = el('span', { className: 'nisab', textContent: 'النصاب: ' + nisab(t) });
  const remove = el('button', { className: 'del', type: 'button', textContent: '🗑️', title: 'حذف المعلم من الميزانية' });
  remove.onclick = () => { if (confirm('حذف «' + t.name + '» من ميزانية القسم؟')) { BUDGET.data.teachers.splice(i, 1); changed(); renderTeachers(); } };
  const nameEl = t.added ? el('input', { value: t.name, placeholder: 'اسم المعلم', maxLength: 120 }) : el('strong', { textContent: (i + 1) + '. ' + t.name });
  if (t.added) nameEl.oninput = () => { t.name = nameEl.value.trim(); changed(); };
  box.append(el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' }, nameEl, el('div', { className: 'row', style: 'margin-top:0' }, tag, remove)));
  const editor = el('div');
  GRADES.forEach(g => {
    const row = el('div', { className: 'grade' }, el('span', { textContent: g.short }));
    g.classes.forEach(c => {
      const on = c in t.cells;
      const b = el('button', { className: 'chip' + (on ? ' on' : '') + (dup.has(c) && on ? ' dup' : ''), type: 'button', title: cls(c) },
        clsShort(c), on ? el('small', { textContent: t.cells[c] }) : null);
      b.onclick = () => {
        if (!on) {
          const def = BUDGET.data.periods[g.track];
          t.cells[c] = def ?? 0; changed(); renderTeachers();
          if (def === null || def === undefined) { $('bePeriods').children[GRADES.indexOf(g)].querySelector('input').focus(); $('beMsg').textContent = 'حدد حصص الأسبوع لهذا الصف أولاً'; }
        } else {
          // Second tap: change the periods of this one class, or remove it.
          const inp = el('input', { type: 'number', inputMode: 'numeric', min: 0, max: 40, value: t.cells[c] });
          const ok = el('button', { className: 'ghost', type: 'button', textContent: 'تم' });
          const rm = el('button', { className: 'ghost', type: 'button', textContent: 'إزالة' });
          ok.onclick = () => { t.cells[c] = Number(inp.value) || 0; changed(); renderTeachers(); };
          rm.onclick = () => { delete t.cells[c]; changed(); renderTeachers(); };
          inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
          editor.replaceChildren(el('div', { className: 'cellEdit' }, el('span', { textContent: 'حصص ' + cls(c) + ':' }), inp, ok, rm));
          inp.focus(); inp.select();
        }
      };
      row.append(b);
    });
    box.append(row);
  });
  const note = el('input', { value: t.note || '', placeholder: 'ملاحظة (اختياري)', maxLength: 300, style: 'margin-top:8px;font-size:14px;padding:7px 10px' });
  note.oninput = () => { t.note = note.value; changed(); };
  box.append(editor, note);
  return box;
}
$('beAdd').onclick = () => {
  BUDGET.data.teachers.push({ name: '', cells: {}, note: '', added: true });
  renderTeachers();
  const inputs = $('beTeachers').querySelectorAll('input[placeholder="اسم المعلم"]');
  inputs[inputs.length - 1].focus();
};

// Head of department: opens the editor from the form; the state line shows whether a budget is saved.
$('budgetOpen').onclick = () => {
  const t = person();
  if (!t) return;
  openBudget(t.department, t.name, () => { $('teacher').classList.remove('hidden'); if (ROLE === 'admin') $('admin').classList.remove('hidden'); stateKey = ''; showBudgetState(); });
};
let stateKey = '';
function showBudgetState() {
  const t = person();
  const key = t && t.is_head ? t.department + '|' + t.name : '';
  if (key === stateKey) return;
  stateKey = key; $('budgetState').textContent = '';
  if (!key) return;
  call('budget_get', { department: t.department, name: t.name }).then(o => {
    const b = o.budget, n = b.data.teachers.filter(x => Object.keys(x.cells || {}).length).length;
    $('budgetState').textContent = b.updated_at ? 'محفوظة (' + n + ' معلمين لهم فصول) — آخر تعديل ' + new Date(b.updated_at).toLocaleDateString('ar-KW') : 'لم تُدخل بعد';
  }).catch(() => {});
}

// ---- Admin: the whole school on one page ----
let SCHOOL = [];
$('tabSchool').onclick = () => tab('school');
$('schoolRefresh').onclick = loadSchool;
$('schoolPrint').onclick = () => { $('schoolDetail').classList.remove('hidden'); print(); };
$('schoolToggle').onclick = () => { const h = $('schoolDetail').classList.toggle('hidden'); $('schoolToggle').textContent = h ? 'عرض التفاصيل' : 'إخفاء التفاصيل'; };
async function loadSchool() {
  $('schoolMsg').textContent = 'جارٍ التحميل...';
  try { SCHOOL = (await call('budgets')).rows; renderSchool(); $('schoolMsg').textContent = ''; }
  catch (e) { $('schoolMsg').textContent = e; }
}
function renderSchool() {
  const depts = [...new Set(TEACHERS.map(t => t.department))];
  const rows = depts.map(dp => {
    const b = SCHOOL.find(x => x.department === dp);
    const head = (TEACHERS.find(t => t.department === dp && t.is_head) || {}).name || '—';
    const have = b ? b.data.teachers.length : TEACHERS.filter(t => t.department === dp).length;
    const req = b ? b.data.required : null;
    return { dp, b, head, have, req, gap: req === null || req === undefined ? null : req - have, periods: b ? sum(b.data.teachers, nisab) : 0 };
  });
  const td = (v, cls) => el('td', { className: cls || '', textContent: v === null || v === undefined ? '—' : v });
  const table = el('table', { className: 'bsum' },
    el('thead', {}, el('tr', {}, ...['القسم', 'رئيس القسم', 'المطلوب', 'الموجود', 'العجز', 'الحصص', 'آخر تحديث', ''].map(h => el('th', { textContent: h })))),
    el('tbody', {}, ...rows.map(r => {
      const edit = el('button', { className: 'ghost noprint', textContent: 'تعديل', style: 'padding:4px 12px' });
      edit.onclick = () => openBudget(r.dp, 'المدير', () => { $('admin').classList.remove('hidden'); loadSchool(); });
      return el('tr', {}, td(r.dp), td(r.head), td(r.req), td(r.have), td(r.gap, r.gap > 0 ? 'neg' : ''), td(r.periods),
        td(r.b ? new Date(r.b.updated_at).toLocaleDateString('ar-KW') + ' · ' + (r.b.updated_by || '') : 'لم تُدخل بعد'), el('td', {}, edit));
    }),
    el('tr', { className: 'tot' }, td('المجموع'), td(''), td(sum(rows, r => r.req || 0)), td(sum(rows, r => r.have)), td(sum(rows, r => r.gap > 0 ? r.gap : 0)), td(sum(rows, r => r.periods)), td(''), td(''))));
  $('schoolSummary').replaceChildren(el('h2', { textContent: 'ميزانية المدرسة ' }), el('div', { className: 'meta', textContent: rows.filter(r => r.b).length + ' من ' + rows.length + ' أقسام أدخلت ميزانيتها' }), el('div', { className: 'wrap' }, table));
  $('schoolDetail').replaceChildren(...rows.filter(r => r.b).map(r => deptTable(r)));
}
// The department's budget in the layout of the paper form: teacher × classes, then نصاب and notes.
function deptTable(r) {
  const d = r.b.data, dup = dupes(d.teachers);
  const th = (t, props) => el('th', Object.assign({ textContent: t }, props || {}));
  const head1 = el('tr', {}, th('م', { rowSpan: 2 }), th('المعلم', { rowSpan: 2 }), ...GRADES.map(g => th(g.label, { colSpan: g.classes.length })), th('النصاب', { rowSpan: 2 }), th('ملاحظات', { rowSpan: 2 }));
  const head2 = el('tr', {}, ...CLASSES.map(c => th(clsShort(c))));
  const body = d.teachers.map((t, i) => el('tr', {}, el('td', { textContent: i + 1 }), el('td', { className: 'n', textContent: t.name }),
    ...CLASSES.map(c => el('td', { className: c in t.cells ? (dup.has(c) ? 'dup' : 'on') : '', textContent: c in t.cells ? t.cells[c] : '' })),
    el('td', { textContent: nisab(t) }), el('td', { className: 'n', textContent: t.note || '' })));
  const per = GRADES.map(g => g.short + ': ' + (d.periods[g.track] ?? '—')).join(' · ');
  return el('div', { className: 'card' },
    el('h2', { textContent: 'قسم ' + r.dp }),
    el('div', { className: 'meta', textContent: 'رئيس القسم: ' + r.head + ' · حصص الأسبوع — ' + per + ' · المطلوب ' + (r.req ?? '—') + ' · الموجود ' + r.have + ' · العجز ' + (r.gap ?? '—') }),
    dup.size ? el('div', { className: 'msg err', textContent: 'فصول مسندة لأكثر من معلم: ' + [...dup].map(cls).join('، ') }) : null,
    el('div', { className: 'wrap' }, el('table', { className: 'bt' }, el('thead', {}, head1, head2), el('tbody', {}, ...body))),
    d.note ? el('div', { className: 'field', style: 'margin-top:8px' }, el('b', { textContent: 'ملاحظات: ' }), el('span', { textContent: d.note })) : null);
}
