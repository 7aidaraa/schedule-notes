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
    if (role === 'admin') tab('school'); // the admin lands on the budgets
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

  // The admin's constraint for this request: saving it lists it under «قيود الجدول» and marks the request done.
  const note = el('textarea', { value: r.draft ?? r.note, placeholder: 'اكتب القيد كما سيُطبَّق في الجدول' });
  note.oninput = () => { r.draft = note.value; };
  const nmsg = el('span', { className: 'meta' });
  const saveBtn = el('button', { className: 'ghost', textContent: 'حفظ القيد' });
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      const o = await call('note', { id: r.id, note: note.value.trim() });
      r.note = note.value.trim(); r.draft = undefined; RULES = null;
      if (o.done) r.done = true;
      render(); return;
    } catch (e) { nmsg.textContent = e; }
    saveBtn.disabled = false;
  };
  const doneBtn = el('button', { className: r.done ? 'ghost' : 'ok', textContent: r.done ? 'إلغاء الإنجاز' : 'تم ✓' });
  doneBtn.onclick = async () => {
    doneBtn.disabled = true;
    try { await call('done', { id: r.id, done: !r.done }); r.done = !r.done; render(); }
    catch (e) { nmsg.textContent = e; doneBtn.disabled = false; }
  };
  c.append(el('label', { textContent: 'القيد' + (r.note ? ' ✓ في قيود الجدول' : '') }), note, el('div', { className: 'row' }, saveBtn, doneBtn, nmsg));
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
  ['req', 'book', 'add', 'school', 'rules'].forEach(k => $('tab' + k[0].toUpperCase() + k.slice(1)).classList.toggle('on', which === k));
  $('reqView').classList.toggle('hidden', which !== 'req'); $('book').classList.toggle('hidden', which !== 'book'); $('school').classList.toggle('hidden', which !== 'school');
  $('rules').classList.toggle('hidden', which !== 'rules');
  if (which === 'school') loadSchool();
  if (which === 'rules') loadRules();
  $('teacher').classList.toggle('hidden', which !== 'add');
  if (which === 'book') loadBook();
  if (which === 'req') loadList();
  if (which === 'add' && !BOOK) call('contacts').then(o => { BOOK = o.rows; }).catch(() => {});
}
$('tabReq').onclick = () => tab('req');
$('tabBook').onclick = () => tab('book');
$('tabAdd').onclick = () => tab('add');
$('tabRules').onclick = () => tab('rules');

// ---- «قيود الجدول»: tick each constraint after checking the exported timetable; clear all for the next round ----
let RULES = null;
const SECTIONS = ['الآلي العام', 'الآلي الفردي', 'اليدوي العام', 'اليدوي الفردي', 'مسودة', 'من الطلبات'];
async function loadRules() {
  $('rulesMsg').textContent = 'جارٍ التحميل...';
  try { RULES = (await call('rules')).rows; renderRules(); }
  catch (e) { $('rulesMsg').textContent = e; }
}
$('rulesRefresh').onclick = loadRules;
// Edit mode: ✏️ edit, 🗑️ delete (two taps), ⬆️⬇️ order within the group, + add; ticking is off meanwhile.
let EDIT = false, EDITING = null, delArmed = { id: null, at: 0 };
$('rulesEdit').onclick = () => { EDIT = !EDIT; EDITING = null; $('rulesEdit').textContent = EDIT ? 'إنهاء التحرير' : 'تحرير القائمة'; $('rulesEdit').className = EDIT ? 'warn' : 'ghost'; renderRules(); };
const meta = x => el('span', { className: 'm' }, [x.department, x.teacher].filter(Boolean).join(' · '), x.level ? el('span', { className: 'lv', textContent: x.level }) : null);
function ruleForm(x, section) {
  const text = el('textarea', { value: x ? x.text : '', placeholder: 'نص القيد', maxLength: 3000 });
  const dep = el('input', { value: x ? x.department : '', placeholder: 'القسم', maxLength: 80 });
  const tea = el('input', { value: x ? x.teacher : '', placeholder: 'المعلم', maxLength: 200 });
  const lvl = el('input', { value: x ? x.level : '', placeholder: 'الإلزام (صلب، مرن، لازم…)', maxLength: 40 });
  const fmsg = el('span', { className: 'meta' });
  const save = el('button', { type: 'button', textContent: 'حفظ' });
  const cancel = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
  cancel.onclick = () => { EDITING = null; renderRules(); };
  save.onclick = async () => {
    const f = { text: text.value.trim(), department: dep.value.trim(), teacher: tea.value.trim(), level: lvl.value.trim() };
    if (!f.text) { fmsg.textContent = 'نص القيد مطلوب'; return; }
    save.disabled = true;
    try {
      const o = await call('rule_save', x ? { id: x.id, ...f } : { section, ...f });
      if (x) {
        if (x.text !== f.text) x.checked = false;
        Object.assign(x, f);
        const r = x.request_id && ROWS.find(r => r.id === x.request_id); if (r) r.note = f.text;
      } else RULES.push({ id: o.id, section, checked: false, request_id: null, ...f });
      EDITING = null; renderRules();
    } catch (e) { fmsg.textContent = e; save.disabled = false; }
  };
  return el('div', { className: 'ruleForm' }, text, el('div', { className: 'ruleFields' }, dep, tea, lvl), el('div', { className: 'row' }, save, cancel, fmsg));
}
async function moveRule(x, d) {
  const list = RULES.filter(y => y.section === x.section), i = list.indexOf(x), j = i + d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  RULES = [...RULES.filter(y => y.section !== x.section), ...list];
  renderRules();
  try { await call('rules_order', { ids: list.map(y => y.id) }); }
  catch (e) { $('rulesMsg').textContent = e; loadRules(); }
}
function ruleItem(x, i, list) {
  if (EDIT) {
    if (EDITING === x.id) return ruleForm(x);
    const ib = (t, label, fn, dis) => { const b = el('button', { type: 'button', className: 'ib', textContent: t, title: label, ariaLabel: label, disabled: !!dis }); b.onclick = fn; return b; };
    const armed = delArmed.id === x.id && Date.now() - delArmed.at < 4000;
    const del = ib(armed ? 'تأكيد الحذف' : '🗑️', 'حذف', async () => {
      if (!(delArmed.id === x.id && Date.now() - delArmed.at < 4000)) {
        delArmed = { id: x.id, at: Date.now() }; renderRules();
        setTimeout(() => { if (delArmed.id === x.id) { delArmed = { id: null, at: 0 }; renderRules(); } }, 4100);
        return;
      }
      delArmed = { id: null, at: 0 };
      try {
        await call('rule_delete', { id: x.id });
        RULES = RULES.filter(y => y !== x);
        const r = x.request_id && ROWS.find(r => r.id === x.request_id); if (r) r.note = '';
        renderRules();
      } catch (e) { $('rulesMsg').textContent = e; }
    });
    if (armed) del.className = 'ib warn';
    return el('div', { className: 'rule editing' },
      el('span', {}, el('span', { className: 't', textContent: x.text }), meta(x)),
      el('span', { className: 'tools' },
        ib('⬆️', 'إلى الأعلى', () => moveRule(x, -1), i === 0), ib('⬇️', 'إلى الأسفل', () => moveRule(x, 1), i === list.length - 1),
        ib('✏️', 'تعديل', () => { EDITING = x.id; renderRules(); }), del));
  }
  const b = el('button', { type: 'button', className: 'rule' + (x.checked ? ' on' : '') },
    el('span', { className: 'box', textContent: x.checked ? '✓' : '' }),
    el('span', {}, el('span', { className: 't', textContent: x.text }), meta(x)));
  b.onclick = async () => {
    x.checked = !x.checked; renderRules();
    try { await call('rule_check', { id: x.id, checked: x.checked }); }
    catch (e) { x.checked = !x.checked; renderRules(); $('rulesMsg').textContent = e; }
  };
  return b;
}
function renderRules() {
  const rows = RULES || [];
  const done = rows.filter(x => x.checked).length;
  $('rulesMsg').textContent = rows.length ? 'مستوفى ' + done + ' من ' + rows.length + (done === rows.length ? ' — اكتملت ✓' : '') : '';
  const secs = [...SECTIONS, ...new Set(rows.map(x => x.section).filter(s => !SECTIONS.includes(s)))];
  const cards = secs.map(s => {
    const list = rows.filter(x => x.section === s);
    if (!list.length && !EDIT) return null;
    const n = list.filter(x => x.checked).length;
    const add = EDIT && (EDITING === 'new:' + s ? ruleForm(null, s)
      : Object.assign(el('button', { type: 'button', className: 'ghost addRule', textContent: '+ إضافة قيد' }), { onclick: () => { EDITING = 'new:' + s; renderRules(); } }));
    return el('div', { className: 'card' }, el('h2', { textContent: s + ' (' + n + '/' + list.length + ')' }), ...list.map(ruleItem), add || null);
  }).filter(Boolean);
  $('rulesList').replaceChildren(...(cards.length ? cards : [el('div', { className: 'card meta', textContent: 'لا توجد قيود بعد' })]));
}
// Two taps (no confirm(): in-app browsers block it).
let resetArmed = 0;
$('rulesReset').onclick = async () => {
  const b = $('rulesReset');
  if (Date.now() - resetArmed > 4000) {
    resetArmed = Date.now(); b.textContent = 'اضغط مرة أخرى للتأكيد'; b.className = 'warn';
    setTimeout(() => { if (Date.now() - resetArmed >= 4000) { b.textContent = 'رفع الشطب عن الكل'; b.className = 'ghost'; } }, 4100);
    return;
  }
  resetArmed = 0; b.disabled = true;
  try { await call('rules_reset'); (RULES || []).forEach(x => { x.checked = false; }); renderRules(); }
  catch (e) { $('rulesMsg').textContent = e; }
  b.disabled = false; b.textContent = 'رفع الشطب عن الكل'; b.className = 'ghost';
};
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
// Subjects offered in multi-subject departments; a saved subject not listed here is added when the editor opens.
// Official weekly periods per subject per class (sheet «المواد»). Subject names as the sheet spells them.
const OFFICIAL = {"التربية الإسلامية":{"10-1":3,"10-2":3,"10-3":3,"10-4":3,"10-5":3,"10-6":3,"11a-1":3,"11s-1":3,"11s-2":3,"11s-3":3,"11s-4":3,"11s-5":3,"12a-1":3,"12s-1":3,"12s-2":3,"12s-3":3,"12s-4":3,"12s-5":3},"اللغة العربية":{"10-1":6,"10-2":6,"10-3":6,"10-4":6,"10-5":6,"10-6":6,"11a-1":6,"11s-1":6,"11s-2":6,"11s-3":6,"11s-4":6,"11s-5":6,"12a-1":6,"12s-1":6,"12s-2":6,"12s-3":6,"12s-4":6,"12s-5":6},"اللغة الإنجليزية":{"10-1":5,"10-2":5,"10-3":5,"10-4":5,"10-5":5,"10-6":5,"11a-1":6,"11s-1":5,"11s-2":5,"11s-3":5,"11s-4":5,"11s-5":5,"12a-1":5,"12s-1":5,"12s-2":5,"12s-3":5,"12s-4":5,"12s-5":5},"الرياضيات":{"10-1":6,"10-2":6,"10-3":6,"10-4":6,"10-5":6,"10-6":6,"11s-1":6,"11s-2":6,"11s-3":6,"11s-4":6,"11s-5":6,"12s-1":6,"12s-2":6,"12s-3":6,"12s-4":6,"12s-5":6},"الكيمياء":{"10-1":3,"10-2":3,"10-3":3,"10-4":3,"10-5":3,"10-6":3,"11s-1":3,"11s-2":3,"11s-3":3,"11s-4":3,"11s-5":3,"12s-1":3,"12s-2":3,"12s-3":3,"12s-4":3,"12s-5":3},"الفيزياء":{"10-1":3,"10-2":3,"10-3":3,"10-4":3,"10-5":3,"10-6":3,"11s-1":3,"11s-2":3,"11s-3":3,"11s-4":3,"11s-5":3,"12s-1":3,"12s-2":3,"12s-3":3,"12s-4":3,"12s-5":3},"الأحياء":{"10-1":2,"10-2":2,"10-3":2,"10-4":2,"10-5":2,"10-6":2,"11s-1":2,"11s-2":2,"11s-3":2,"11s-4":2,"11s-5":2,"12s-1":3,"12s-2":3,"12s-3":3,"12s-4":3,"12s-5":3},"الاجتماعيات":{"10-1":3,"10-2":3,"10-3":3,"10-4":3,"10-5":3,"10-6":3},"الحاسوب":{"10-1":2,"10-2":2,"10-3":2,"10-4":2,"10-5":2,"10-6":2,"11a-1":1,"11s-1":1,"11s-2":1,"11s-3":1,"11s-4":1,"11s-5":1,"12a-1":1,"12s-1":1,"12s-2":1,"12s-3":1,"12s-4":1,"12s-5":1},"التربية البدنية":{"10-1":2,"10-2":2,"10-3":2,"10-4":2,"10-5":2,"10-6":2,"11a-1":1,"11s-1":1,"11s-2":1,"11s-3":1,"11s-4":1,"11s-5":1,"12a-1":1,"12s-1":1,"12s-2":1,"12s-3":1,"12s-4":1,"12s-5":1},"المجموع":{"10-1":35,"10-2":35,"10-3":35,"10-4":35,"10-5":35,"10-6":35,"11a-1":35,"11s-1":35,"11s-2":35,"11s-3":35,"11s-4":35,"11s-5":35,"12a-1":35,"12s-1":35,"12s-2":35,"12s-3":35,"12s-4":35,"12s-5":35},"اللغة الفرنسية":{"11a-1":5,"12a-1":5},"التاريخ":{"11a-1":3,"12a-1":3},"الجغرافيا":{"11a-1":3,"12a-1":3},"علم النفس":{"11a-1":2},"التربية الموسيقية":{"11a-1":2,"11s-1":2,"11s-2":2,"11s-3":2,"11s-4":2,"11s-5":2},"الإحصاء":{"11a-1":2,"12a-1":2},"اللغة الفرنسية (اختيار حرّ)":{"11a-1":1,"12a-1":1},"الجيولوجيا":{"11s-1":2,"11s-2":2,"11s-3":2,"11s-4":2,"11s-5":2},"المكتبات":{"11s-1":1,"12s-1":1,"12s-4":1},"التربية البيئية":{"11s-2":1,"11s-3":1,"11s-4":1,"11s-5":1},"الفلسفة":{"12a-1":2},"الدستور":{"12a-1":1,"12s-1":1,"12s-2":1,"12s-3":1,"12s-4":1,"12s-5":1},"التربية الفنية":{"12a-1":2,"12s-1":2,"12s-2":2,"12s-3":2,"12s-4":2,"12s-5":2},"الدراسات العملية":{"12s-2":1,"12s-3":1,"12s-5":1}};
// Sections that exist in the ministry form but not in the school this year: hidden unless a teacher already has them.
const HIDDEN = ['10-7', '11a-2'];
const SUBJECTS = {
  'الاجتماعيات': ['تاريخ الكويت', 'الدستور', 'علم النفس', 'الجغرافيا', 'التاريخ', 'الفلسفة'],
  'الفيزياء والكيمياء': ['الفيزياء', 'الكيمياء'],
  'الأحياء والجيولوجيا': ['الأحياء', 'الجيولوجيا', 'التربية البيئية'],
  'الرياضيات': ['الرياضيات', 'الإحصاء'],
  'اللغة الفرنسية': ['اللغة الفرنسية', 'اختيار حر'],
};
const deptSubjects = (dp, teachers) => [...new Set([...(SUBJECTS[dp] || []), ...teachers.flatMap(t => t.subjects || [])])];
// The subject of one class: the class's own, else the teacher's only subject.
const subjOf = (t, c) => (t.subj || {})[c] || ((t.subjects || []).length === 1 ? t.subjects[0] : '');
const sheetSubjectOf = (dp, t, c) => { const multi = (SUBJECTS[dp] || []).length > 0; const sj = multi ? (subjOf(t, c) || (t.subjects || [])[0] || '') : dp; return SHEET_SUBJECT[sj] || sj; };
const officialOf = (dp, t, c) => { const o = OFFICIAL[sheetSubjectOf(dp, t, c)]; return o && c in o ? o[c] : null; };
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
    const inp = el('input', { type: 'number', inputMode: 'numeric', min: 0, max: 40, value: d.periods[g.track] ?? '', placeholder: '—', title: 'يُستعمل حين لا يكون للمادة عدد مقرر في هذا الصف' });
    inp.oninput = () => {
      const old = d.periods[g.track], now = inp.value === '' ? null : Number(inp.value);
      d.periods[g.track] = now;
      if (now !== null) d.teachers.forEach(t => g.classes.forEach(c => { if (c in t.cells && (t.cells[c] === old || t.cells[c] === 0)) t.cells[c] = now; }));
      changed(); renderTeachers();
      inp.focus();
    };
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
  remove.onclick = () => {
    // Second tap confirms; the button reverts after a few seconds.
    if (remove.dataset.arm) { BUDGET.data.teachers.splice(i, 1); changed(); renderTeachers(); return; }
    remove.dataset.arm = '1'; remove.textContent = 'تأكيد حذف ' + t.name.split(' ')[0] + '؟'; remove.style.fontSize = '13px';
    setTimeout(() => { delete remove.dataset.arm; remove.textContent = '🗑️'; remove.style.fontSize = ''; }, 4000);
  };
  const nameEl = t.added ? el('input', { value: t.name, placeholder: 'اسم المعلم', maxLength: 120 }) : el('strong', { textContent: (i + 1) + '. ' + t.name });
  if (t.added) nameEl.oninput = () => { t.name = nameEl.value.trim(); changed(); };
  box.append(el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' }, nameEl, el('div', { className: 'row', style: 'margin-top:0' }, tag, remove)));
  // Multi-subject departments: the teacher's subjects, one tap each.
  const subjects = deptSubjects(BUDGET.department, BUDGET.data.teachers);
  if (subjects.length) {
    t.subjects = t.subjects || [];
    const row = el('div', { className: 'subjects' });
    subjects.forEach(sj => {
      const on = t.subjects.includes(sj);
      const b = el('button', { className: 'sub' + (on ? ' on' : ''), type: 'button', textContent: sj });
      b.onclick = () => { t.subjects = on ? t.subjects.filter(x => x !== sj) : [...t.subjects, sj]; changed(); renderTeachers(); };
      row.append(b);
    });
    const add = el('button', { className: 'sub', type: 'button', textContent: '+ مادة' });
    add.onclick = () => {
      const inp = el('input', { placeholder: 'اسم المادة', maxLength: 40, style: 'width:140px;padding:4px 8px;font-size:13px' });
      const ok = el('button', { className: 'sub', type: 'button', textContent: 'إضافة' });
      ok.onclick = () => { const v = inp.value.trim(); if (v && !t.subjects.includes(v)) { t.subjects.push(v); changed(); } renderTeachers(); };
      inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
      add.replaceWith(inp, ok); inp.focus();
    };
    row.append(add);
    box.append(row);
  }
  // One row per grade, equal cells: a class sits in the same spot on every card.
  // Tap toggles the class; long press changes its periods when they differ from the grade default.
  const editor = el('div');
  const grid = el('div', { className: 'cgrid' });
  GRADES.forEach(g => {
    grid.append(el('div', { className: 'glabel', textContent: g.short }));
    g.classes.forEach(c => {
      const on = c in t.cells;
      if (HIDDEN.includes(c) && !BUDGET.data.teachers.some(x => c in x.cells)) { grid.append(el('div')); return; }
      const official = officialOf(BUDGET.department, t, c);
      const def = official ?? BUDGET.data.periods[g.track];
      const odd = on && def !== null && def !== undefined && t.cells[c] !== def;
      const sj = on ? subjOf(t, c) : '';
      const b = el('button', { className: 'cell' + (on ? ' on' : '') + (dup.has(c) && on ? ' dup' : '') + (odd ? ' odd' : ''), type: 'button', title: cls(c) + (sj ? ' — ' + sj : '') + (official !== null ? ' — المقرر ' + official : '') },
        el('span', { textContent: c.split('-')[1] }), on ? el('small', { textContent: t.cells[c] + (sj && (t.subjects || []).length > 1 ? ' ' + sj.replace(/^ال/, '').slice(0, 3) : '') }) : null);
      let timer = null, held = false;
      const editPeriods = () => {
        const inp = el('input', { type: 'number', inputMode: 'numeric', min: 0, max: 40, value: t.cells[c] ?? def ?? '' });
        const ok = el('button', { className: 'ghost', type: 'button', textContent: 'تم' });
        // A teacher with several subjects says which one this class gets.
        const pick = (t.subjects || []).length > 1 ? el('select', {}, el('option', { value: '', textContent: 'المادة؟' }), ...t.subjects.map(x => el('option', { value: x, textContent: x, selected: (t.subj || {})[c] === x }))) : null;
        ok.onclick = () => {
          t.cells[c] = Number(inp.value) || 0;
          if (pick) { t.subj = t.subj || {}; if (pick.value) t.subj[c] = pick.value; else delete t.subj[c]; }
          changed(); renderTeachers();
        };
        inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
        editor.replaceChildren(el('div', { className: 'cellEdit' }, el('span', { textContent: 'حصص ' + cls(c) + ':' }), inp, pick, ok));
        inp.focus(); inp.select();
      };
      b.onpointerdown = () => { held = false; timer = setTimeout(() => { held = true; editPeriods(); }, 500); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => clearTimeout(timer);
      b.oncontextmenu = e => e.preventDefault();
      b.onclick = () => {
        if (held) return;
        if (on) { delete t.cells[c]; changed(); renderTeachers(); return; }
        t.cells[c] = def ?? 0; changed(); renderTeachers();
        if (def === null || def === undefined) { $('bePeriods').children[GRADES.indexOf(g)].querySelector('input').focus(); $('beMsg').textContent = 'حدد حصص الأسبوع لهذا الصف أولاً'; }
      };
      grid.append(b);
    });
    for (let k = g.classes.length; k < 7; k++) grid.append(el('div'));
    if (g.classes.every(c => HIDDEN.includes(c))) grid.lastChild.remove();
  });
  box.append(grid);
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

// ---- Export for the timetable sheet: one row per teacher × class × subject ----
// Subject names as the sheet's «التوزيع» columns spell them; single-subject departments use the department name.
const SHEET_SUBJECT = { 'تاريخ الكويت': 'الاجتماعيات', 'اختيار حر': 'اللغة الفرنسية (اختيار حرّ)' };
const sheetClass = c => { const [g, n] = c.split('-'); return g === '10' ? '10/' + n : g.slice(0, 2) + (g.endsWith('a') ? 'د' : 'ع') + n; };
// Teachers' schedule notes (request + reason) travel in the same file as «قيد» rows; the sheet keeps them
// in «القيود بلغة عرفية» under a heading of their own so the owner can filter them.
const HEADERS = ['المعرف', 'اسم الشهرة', 'الاسم الثلاثي', 'القسم', 'الصف', 'المادة', 'الحصص', 'السجل', 'القيد', 'السبب', 'الحالة', 'التاريخ', 'معرف الطلب'];
function noteRows() {
  return ROWS.map(r => {
    const tt = TEACHERS.find(x => x.name === r.name) || {};
    return [tt.uid || '', tt.nick || r.name, r.name, tt.department || r.department, '', '', '', 'قيد', r.request, r.reason, r.done ? 'تم' : 'جديد', new Date(r.created_at).toISOString().slice(0, 10), r.id];
  });
}
function exportRows() {
  const rows = [];
  for (const b of SCHOOL) {
    if (!TEACHERS.some(t => t.department === b.department)) continue; // departments that no longer exist
    for (const t of b.data.teachers) {
      const tt = TEACHERS.find(x => x.name === t.name) || {};
      for (const c of CLASSES) {
        if (!(c in t.cells)) continue;
        rows.push([tt.uid || '', tt.nick || t.name, t.name, b.department, sheetClass(c), sheetSubjectOf(b.department, t, c), t.cells[c], 'توزيع', '', '', '', '', '']);
      }
    }
  }
  return rows;
}
$('schoolCsv').onclick = async () => {
  if (!ROWS.length) { try { ROWS = (await call('list')).rows; } catch (e) { $('schoolMsg').textContent = e; return; } }
  const dist = exportRows(), notes = noteRows(), rows = [...dist, ...notes];
  if (!rows.length) { $('schoolMsg').textContent = 'لا توجد ميزانيات للتصدير'; return; }
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '\uFEFF' + [HEADERS, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'ميزانية_المنصة_' + new Date().toISOString().slice(0, 10) + '.csv' });
  document.body.append(a); a.click(); a.remove();
  const blank = dist.filter(r => !r[5]).length;
  $('schoolMsg').textContent = dist.length + ' سطر توزيع لـ' + new Set(dist.map(r => r[2])).size + ' معلماً، و' + notes.length + ' ملاحظة' + (blank ? ' — ' + blank + ' بلا مادة' : '');
};

// ---- Admin: the whole school on one page ----
let SCHOOL = [];
$('tabSchool').onclick = () => tab('school');
$('schoolRefresh').onclick = loadSchool;
$('schoolPrint').onclick = () => { $('schoolDetail').classList.remove('hidden'); print(); };
$('schoolToggle').onclick = () => { if ($('schoolDetail').classList.contains('hidden')) showDetail(SCHOOL_ROWS); else { $('schoolDetail').classList.add('hidden'); $('schoolToggle').textContent = 'عرض التفاصيل'; } };
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
      const view = el('button', { className: 'ghost noprint', textContent: 'معاينة', style: 'padding:4px 12px' });
      view.onclick = () => showDetail([r]);
      return el('tr', {}, td(r.dp), td(r.head), td(r.req), td(r.have), td(r.gap, r.gap > 0 ? 'neg' : ''), td(r.periods),
        td(r.b ? new Date(r.b.updated_at).toLocaleDateString('ar-KW') + ' · ' + (r.b.updated_by || '') : 'لم تُدخل بعد'), el('td', {}, el('div', { className: 'row', style: 'margin:0;flex-wrap:nowrap;justify-content:center' }, r.b ? view : null, edit)));
    }),
    el('tr', { className: 'tot' }, td('المجموع'), td(''), td(sum(rows, r => r.req || 0)), td(sum(rows, r => r.have)), td(sum(rows, r => r.gap > 0 ? r.gap : 0)), td(sum(rows, r => r.periods)), td(''), td(''))));
  $('schoolSummary').replaceChildren(el('h2', { textContent: 'ميزانية المدرسة ' }), el('div', { className: 'meta', textContent: rows.filter(r => r.b).length + ' من ' + rows.length + ' أقسام أدخلت ميزانيتها' }), el('div', { className: 'wrap' }, table));
  SCHOOL_ROWS = rows.filter(r => r.b);
  $('schoolDetail').replaceChildren(...SCHOOL_ROWS.map(r => deptTable(r)));
}
// Read-only view of one department (or all), scrolled into view.
let SCHOOL_ROWS = [];
function showDetail(rows) {
  const one = rows.length === 1;
  const all = el('button', { className: 'ghost noprint', textContent: 'عرض كل الأقسام', style: 'margin-bottom:10px' });
  all.onclick = () => showDetail(SCHOOL_ROWS);
  $('schoolDetail').replaceChildren(...(one ? [all] : []), ...rows.map(r => deptTable(r)));
  $('schoolDetail').classList.remove('hidden'); $('schoolToggle').textContent = 'إخفاء التفاصيل';
  $('schoolDetail').scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
}
// The department's budget in the layout of the paper form: teacher × classes, then نصاب and notes.
function deptTable(r) {
  const d = r.b.data, dup = dupes(d.teachers), multi = deptSubjects(r.dp, d.teachers).length > 0;
  const shown = CLASSES.filter(c => !HIDDEN.includes(c) || d.teachers.some(t => c in t.cells));
  const th = (t, props) => el('th', Object.assign({ textContent: t }, props || {}));
  const head1 = el('tr', {}, th('م', { rowSpan: 2 }), th('المعلم', { rowSpan: 2 }), ...(multi ? [th('المادة', { rowSpan: 2 })] : []), ...GRADES.map(g => { const n = g.classes.filter(c => shown.includes(c)).length; return n ? th(g.label, { colSpan: n }) : null; }), th('النصاب', { rowSpan: 2 }), th('ملاحظات', { rowSpan: 2 }));
  const head2 = el('tr', {}, ...shown.map(c => th(clsShort(c))));
  const body = d.teachers.map((t, i) => el('tr', {}, el('td', { textContent: i + 1 }), el('td', { className: 'n', textContent: t.name }),
    ...(multi ? [el('td', { className: 'n', textContent: (t.subjects || []).join(' / ') })] : []),
    ...shown.map(c => { const sj = c in t.cells && (t.subjects || []).length > 1 ? subjOf(t, c) : '';
      return el('td', { className: c in t.cells ? (dup.has(c) ? 'dup' : 'on') : '', title: sj }, c in t.cells ? String(t.cells[c]) : '', sj ? el('div', { className: 'sj', textContent: sj.replace(/^ال/, '') }) : null); }),
    el('td', { textContent: nisab(t) }), el('td', { className: 'n', textContent: t.note || '' })));
  const per = GRADES.map(g => g.short + ': ' + (d.periods[g.track] ?? '—')).join(' · ');
  return el('div', { className: 'card' },
    el('h2', { textContent: 'قسم ' + r.dp }),
    el('div', { className: 'meta', textContent: 'رئيس القسم: ' + r.head + ' · حصص الأسبوع — ' + per + ' · المطلوب ' + (r.req ?? '—') + ' · الموجود ' + r.have + ' · العجز ' + (r.gap ?? '—') }),
    dup.size ? el('div', { className: 'meta', style: 'color:#7a5300;font-weight:700', textContent: 'فصول عند أكثر من معلم (طبيعي إذا اختلفت المادة): ' + [...dup].map(cls).join('، ') }) : null,
    el('div', { className: 'wrap' }, el('table', { className: 'bt' }, el('thead', {}, head1, head2), el('tbody', {}, ...body))),
    d.note ? el('div', { className: 'field', style: 'margin-top:8px' }, el('b', { textContent: 'ملاحظات: ' }), el('span', { textContent: d.note })) : null);
}
