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
// Departments in alphabetical order, the article «ال» ignored (الأحياء before التربية).
const alpha = list => [...list].sort((a, b) => a.replace(/^ال/, '').localeCompare(b.replace(/^ال/, ''), 'ar'));
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
    $(role === 'admin' ? 'admin' : 'teacher').classList.remove('hidden');
    ROLE = role;
    // Heads edit their budget outside the developer's tabs.
    if (role === 'head') document.querySelector('main').append($('bedit'));
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
$('budgetFile').onchange = async () => {
  const picked = [...$('budgetFile').files];
  $('budgetFile').value = '';
  for (const f of picked) {
    if (FILES.some(g => g.name === f.name && g.size === f.size)) continue;
    // The platform's own Excel form fills the budget instead of travelling as an attachment (form.js).
    if (await offerForm(f)) continue;
    FILES.push(f);
  }
  $('budgetPlea').classList.toggle('warnPlea', FILES.some(f => !/\.xlsx$/i.test(f.name)));
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
  options($('deptList'), alpha(new Set(teachers.map(t => t.department))));
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
// Heads of department see their budget only when signed in with the heads' password (role «head»).
const budgetForHeads = () => ROLE === 'head';
const person = () => TEACHERS.find(t => t.name === $('name').value.trim());
const isHead = () => !!(person() || {}).is_head;
function showRole() {
  const t = person();
  $('roleTag').replaceChildren(...(t ? [t.is_head ? el('b', { textContent: 'رئيس قسم ' + t.department }) : 'معلم'] : []));
  const head = budgetForHeads() && isHead();
  $('budget').classList.toggle('hidden', !head);
  if (!head) { FILES = []; showFiles(); }
  if (budgetForHeads()) showBudgetState();
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

  // Budget files are shown on the budgets page, grouped by department.
  if (filesOf(r).length) c.append(el('div', { className: 'meta', textContent: '📎 مرفق ميزانية القسم: في تبويب «الميزانيات»' }));

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

// Rows saved before multi-file support carry a single file in file_*.
const filesOf = r => r.files && r.files.length ? r.files : r.file_path ? [{ name: r.file_name, type: r.file_type }] : [];
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

// ---- «القيود»: one list the page orders itself; tick each constraint after checking the exported timetable ----
// Order: general automatic, general manual, then per department (the sheet's column order), the whole department
// before its teachers, each teacher's constraints together (automatic before manual, hard before soft).
let RULES = null;
const DEPT_ORDER = ['التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية', 'اللغة الفرنسية', 'الرياضيات', 'الفيزياء والكيمياء',
  'الأحياء والجيولوجيا', 'الاجتماعيات', 'الحاسوب', 'التربية البدنية', 'التربية الموسيقية', 'الفنية والموسيقية', 'التربية الفنية', 'التجاري', 'المكتبات', 'الدراسات العملية'];
// Older or shorthand department names in the sheet's list → the platform department they sort with.
const DEPT_ALIAS = { 'الجغرافيا والتاريخ': 'الاجتماعيات', 'العلوم الفلسفية': 'الاجتماعيات', 'فلسفه': 'الاجتماعيات', 'فلسفة': 'الاجتماعيات', 'تاريخ': 'الاجتماعيات',
  'انجليزي': 'اللغة الإنجليزية', 'اسلامية': 'التربية الإسلامية', 'كيمياء': 'الفيزياء والكيمياء', 'فيزياء': 'الفيزياء والكيمياء' };
const LEVELS = ['صلب', 'لازم', 'ثابت', 'صلب + ربط مرن', 'مرن', 'مُفضَّل', 'ربط مرن', 'للعلم', 'معطَّل'];
const strength = l => /صلب|لازم|ثابت/.test(l || '') ? 'hard' : /مرن|مفض|مُفضَّل/.test(l || '') ? 'soft' : '';
const deptRank = d => { const k = DEPT_ALIAS[(d || '').split('+')[0].trim()] || d; const i = DEPT_ORDER.indexOf(k); return i < 0 ? 99 : i; };
const WHOLE = /^(كل القسم|—|-)?$/;
function teacherKey(x) {
  const t = (x.teacher || '').trim();
  if (WHOLE.test(t)) return '';
  const hit = TEACHERS.find(y => y.name === t || y.nick === t);
  return hit ? hit.name : t;
}
function ruleOrder(rows) {
  const k = x => {
    const g = x.scope === 'عام' ? (x.mode === 'آلي' ? 0 : 1) : 2;
    if (g < 2) return [g, 0, '', 0, 0, x.pos ?? 0, x.id];
    const tk = teacherKey(x);
    return [2, deptRank(x.department), (tk ? '1' : '0') + tk, x.mode === 'آلي' ? 0 : 1, { hard: 0, soft: 1 }[strength(x.level)] ?? 2, x.pos ?? 0, x.id];
  };
  return rows.map(x => [k(x), x]).sort((p, q) => { for (let i = 0; i < p[0].length; i++) { const a = p[0][i], b = q[0][i]; if (a !== b) return typeof a === 'string' ? a.localeCompare(b, 'ar') : a - b; } return 0; }).map(p => p[1]);
}
// Pale orange: individual hard · pale red: general hard · pale green: soft.
const ruleColor = x => { const s = strength(x.level); return s === 'soft' ? 'soft' : s === 'hard' ? (x.scope === 'عام' ? 'hardAll' : 'hardOne') : ''; };
async function loadRules() {
  $('rulesMsg').textContent = 'جارٍ التحميل...';
  try { RULES = (await call('rules')).rows; renderRules(); }
  catch (e) { $('rulesMsg').textContent = e; }
}
$('rulesRefresh').onclick = loadRules;
let EDIT = false, EDITING = null, delArmed = { id: null, at: 0 }, OPEN = {};
$('rulesEdit').onclick = () => { EDIT = !EDIT; EDITING = null; $('rulesEdit').textContent = EDIT ? 'إنهاء التحرير' : 'تحرير القائمة'; $('rulesEdit').className = EDIT ? 'warn' : 'ghost'; renderRules(); };
const tag = x => x.section === 'مسودة' ? 'مسودة' : x.request_id || x.section === 'من الطلبات' ? 'من طلب' : '';
const meta = x => el('span', { className: 'm' }, [x.scope + ' ' + x.mode, x.department, x.teacher].filter(Boolean).join(' · '),
  x.level ? el('span', { className: 'lv', textContent: x.level }) : null, tag(x) ? el('span', { className: 'lv', textContent: tag(x) }) : null);
function ruleForm(x) {
  const sel = (vals, v) => { const s = el('select', {}, ...vals.map(o => el('option', { value: o, textContent: o || '— بلا —' }))); s.value = v; return s; };
  const text = el('textarea', { value: x ? x.text : '', placeholder: 'نص القيد', maxLength: 3000 });
  const dep = el('input', { value: x ? x.department : '', placeholder: 'القسم', maxLength: 80 });
  const tea = el('input', { value: x ? x.teacher : '', placeholder: 'المعلم (أو «كل القسم»)', maxLength: 200 });
  const scope = sel(['فردي', 'عام'], x ? x.scope : 'فردي'), mode = sel(['يدوي', 'آلي'], x ? x.mode : 'يدوي');
  const lvl = sel(['', ...LEVELS], x && LEVELS.includes(x.level) ? x.level : '');
  if (x && x.level && !LEVELS.includes(x.level)) lvl.prepend(el('option', { value: x.level, textContent: x.level })), lvl.value = x.level;
  const why = el('textarea', { value: x ? x.reason : '', placeholder: 'سبب القيد', maxLength: 3000 });
  const how = el('textarea', { value: x ? x.sheet_how : '', placeholder: 'كيف هو في الشيت (صفوف ورقة «القيود»)', maxLength: 5000 });
  const tip = el('textarea', { value: x ? x.sheet_tip : '', placeholder: 'المقترح لتقييده في الشيت', maxLength: 5000 });
  const fmsg = el('span', { className: 'meta' });
  const save = el('button', { type: 'button', textContent: 'حفظ' });
  const cancel = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
  cancel.onclick = () => { EDITING = null; renderRules(); };
  save.onclick = async () => {
    const f = { text: text.value.trim(), department: dep.value.trim(), teacher: tea.value.trim(), level: lvl.value, scope: scope.value, mode: mode.value,
      reason: why.value.trim(), sheet_how: how.value.trim(), sheet_tip: tip.value.trim() };
    if (!f.text) { fmsg.textContent = 'نص القيد مطلوب'; return; }
    save.disabled = true;
    try {
      const o = await call('rule_save', x ? { id: x.id, ...f } : { section: 'مضاف', ...f });
      if (x) {
        if (x.text !== f.text) x.checked = false;
        Object.assign(x, f);
        const r = x.request_id && ROWS.find(r => r.id === x.request_id); if (r) r.note = f.text;
      } else RULES.push({ id: o.id, section: 'مضاف', checked: false, request_id: null, pos: 1e9, ...f });
      EDITING = null; renderRules();
    } catch (e) { fmsg.textContent = e; save.disabled = false; }
  };
  const lab = (t, n) => el('label', { className: 'mini' }, t, n);
  return el('div', { className: 'ruleForm' }, text,
    el('div', { className: 'ruleFields' }, lab('النطاق', scope), lab('النوع', mode), lab('الإلزام', lvl)),
    el('div', { className: 'ruleFields two' }, dep, tea), why, how, tip,
    el('div', { className: 'row' }, save, cancel, fmsg));
}
function ruleItem(x) {
  if (EDIT && EDITING === x.id) return ruleForm(x);
  const ib = (t, label, fn) => { const b = el('button', { type: 'button', className: 'ib', textContent: t, title: label, ariaLabel: label }); b.onclick = fn; return b; };
  const toggle = k => () => { OPEN[x.id] = OPEN[x.id] === k ? null : k; renderRules(); };
  let tools;
  if (EDIT) {
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
    tools = [ib('✏️', 'تعديل', () => { EDITING = x.id; renderRules(); }), del];
  } else tools = [ib('⁉️', 'سبب القيد', toggle('why')), ib('⛓️‍💥', 'في الشيت والمقترح', toggle('how'))];
  const check = el('button', { type: 'button', className: 'tick', disabled: EDIT },
    el('span', { className: 'box', textContent: x.checked ? '✓' : '' }),
    el('span', {}, el('span', { className: 't', textContent: x.text }), meta(x)));
  check.onclick = async () => {
    x.checked = !x.checked; renderRules();
    try { await call('rule_check', { id: x.id, checked: x.checked }); }
    catch (e) { x.checked = !x.checked; renderRules(); $('rulesMsg').textContent = e; }
  };
  const panel = OPEN[x.id] === 'why'
    ? el('div', { className: 'panel' }, el('b', { textContent: 'السبب: ' }), x.reason || 'لا أعلم')
    : OPEN[x.id] === 'how'
      ? el('div', { className: 'panel' }, el('b', { textContent: 'كيف هو في الشيت:' }), el('div', { className: 'pre', textContent: x.sheet_how || 'لم يُكتب بعد' }),
        el('b', { textContent: 'المقترح:' }), el('div', { className: 'pre', textContent: x.sheet_tip || 'لم يُكتب بعد' }))
      : null;
  return el('div', { className: 'rule ' + ruleColor(x) + (x.checked ? ' on' : '') }, el('div', { className: 'ruleRow' }, check, el('span', { className: 'tools' }, ...tools)), panel);
}
function renderRules() {
  const rows = ruleOrder(RULES || []);
  const done = rows.filter(x => x.checked).length;
  $('rulesMsg').textContent = rows.length ? 'مستوفى ' + done + ' من ' + rows.length + (done === rows.length ? ' — اكتملت ✓' : '') : '';
  const add = EDIT && (EDITING === 'new' ? ruleForm(null)
    : Object.assign(el('button', { type: 'button', className: 'ghost addRule', textContent: '+ إضافة قيد' }), { onclick: () => { EDITING = 'new'; renderRules(); } }));
  $('rulesList').replaceChildren(el('div', { className: 'card rules' }, ...(rows.length ? rows.map(ruleItem) : [el('div', { className: 'meta', textContent: 'لا توجد قيود بعد' })]), add || null));
}
// The list for the sheet «القيود بلغة عرفية (حيدر)», in the platform's order; the sheet's importer replaces the whole sheet with it.
const RULE_HEAD = ['م', 'النطاق', 'النوع', 'القسم', 'المعلم', 'القيد', 'الإلزام', 'السبب', 'في الشيت', 'المقترح', 'المصدر'];
$('rulesCsv').onclick = async () => {
  if (!RULES) await loadRules();
  const rows = ruleOrder(RULES || []).map((x, i) => [i + 1, x.scope, x.mode, x.department, x.teacher, x.text, x.level, x.reason, x.sheet_how, x.sheet_tip, tag(x) || 'المنصة']);
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '﻿' + [RULE_HEAD, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'قيود_المنصة_' + new Date().toISOString().slice(0, 10) + '.csv' });
  document.body.append(a); a.click(); a.remove();
  $('rulesMsg').textContent = rows.length + ' قيداً في الملف';
};
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
const GRADES = SCHOOL_DATA.grades;
const CLASSES = GRADES.flatMap(g => g.classes);
const trackOf = c => GRADES.find(g => g.classes.includes(c)).track;
// "11s-3" → "11ع3", "10-4" → "4" inside its grade group, full label elsewhere.
const cls = c => { const [g, n] = c.split('-'); return g.replace('a', 'د').replace('s', 'ع') + n; };
const clsShort = c => { const [g, n] = c.split('-'); return g === '10' ? n : g.slice(2).replace('a', 'د').replace('s', 'ع') + n; };
// Subjects offered in multi-subject departments; a saved subject not listed here is added when the editor opens.
// Official weekly periods per subject per class (sheet «المواد»). Subject names as the sheet spells them.
const OFFICIAL = SCHOOL_DATA.official;
// Sections that exist in the ministry form but not in the school this year: hidden unless a teacher already has them.
const HIDDEN = SCHOOL_DATA.hidden;
const SUBJECTS = SCHOOL_DATA.subjects;
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

function openBudget(department, name, onDone, afterLoad) {
  BUDGET = { department, name, data: null, onDone, review: null };
  $('beReview').replaceChildren(); $('beReview').classList.add('hidden'); $('formMsg').textContent = '';
  // The developer edits inside the budgets tab (tabs stay on screen); a head gets the editor instead of the form.
  $('teacher').classList.add('hidden'); $(ROLE === 'admin' ? 'schoolMain' : 'admin').classList.add('hidden'); $('bedit').classList.remove('hidden');
  $('beTitle').textContent = 'ميزانية قسم ' + department;
  $('beTeachers').replaceChildren(el('div', { className: 'card meta', textContent: 'جارٍ التحميل...' }));
  $('beMsg').textContent = '';
  call('budget_get', { department, name }).then(o => {
    BUDGET.data = o.budget.data;
    BUDGET.data.teachers.forEach(t => { t.cells = t.cells || {}; });
    renderBudget();
    $('beMsg').textContent = o.budget.updated_at ? 'آخر حفظ: ' + new Date(o.budget.updated_at).toLocaleString('ar-KW') + (o.budget.updated_by ? ' (' + o.budget.updated_by + ')' : '') : 'لم تُحفظ بعد';
    window.scrollTo(0, 0);
    if (afterLoad) afterLoad();
  }).catch(e => $('beTeachers').replaceChildren(el('div', { className: 'card meta', textContent: e })));
}
function closeBudget() {
  // A filled form not yet approved is dropped, not saved.
  if (BUDGET && BUDGET.review) { BUDGET.data = BUDGET.review; BUDGET.review = null; dirty = false; clearTimeout(saveTimer); }
  if (dirty) saveBudget();
  $('bedit').classList.add('hidden');
  const done = BUDGET && BUDGET.onDone; BUDGET = null;
  if (done) done();
}
$('beBack').onclick = closeBudget;

function changed() {
  dirty = true; renderSums();
  if (BUDGET && BUDGET.review) { $('beMsg').textContent = 'لم يُحفظ: راجع ثم اضغط «اعتماد وحفظ»'; return; }
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
const SHEET_SUBJECT = SCHOOL_DATA.sheetSubject;
const sheetClass = c => { const [g, n] = c.split('-'); return g === '10' ? '10/' + n : g.slice(0, 2) + (g.endsWith('a') ? 'د' : 'ع') + n; };
// Constraints (teachers' requests included) travel in their own file from «القيود» → «تصدير CSV للشيت».
const HEADERS = ['المعرف', 'اسم الشهرة', 'الاسم الثلاثي', 'القسم', 'الصف', 'المادة', 'الحصص'];
function exportRows() {
  const rows = [];
  for (const b of SCHOOL) {
    if (!TEACHERS.some(t => t.department === b.department)) continue; // departments that no longer exist
    for (const t of b.data.teachers) {
      const tt = TEACHERS.find(x => x.name === t.name) || {};
      for (const c of CLASSES) {
        if (!(c in t.cells)) continue;
        for (const p of partsOf(b.department, t, c))
          rows.push([tt.uid || '', tt.nick || t.name, t.name, b.department, sheetClass(c), p.col, p.h]);
      }
    }
  }
  return rows;
}
$('schoolCsv').onclick = () => {
  const rows = exportRows();
  if (!rows.length) { $('schoolMsg').textContent = 'لا توجد ميزانيات للتصدير'; return; }
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '\uFEFF' + [HEADERS, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'ميزانية_المنصة_' + new Date().toISOString().slice(0, 10) + '.csv' });
  document.body.append(a); a.click(); a.remove();
  const blank = rows.filter(r => !r[5]).length;
  $('schoolMsg').textContent = rows.length + ' سطر توزيع لـ' + new Set(rows.map(r => r[2])).size + ' معلماً' + (blank ? ' — ' + blank + ' بلا مادة' : '');
};

// ---- «ميزانية كل الأقسام»: the budgets as the sheet's «التوزيع» — class × subject, one teacher per cell ----
// Columns in the sheet's order. dept = the platform department; subj = the subject name inside a multi-subject department.
const GRID_COLS = SCHOOL_DATA.gridCols.map(([col, dept = col, subj = null]) => ({ col, dept, subj }));
const isMulti = dp => (SUBJECTS[dp] || []).length > 0;
// A split is trusted only while it adds up to the cell (the department editor may have changed the hours since).
function splitOf(t, c) {
  const p = (t.split || {})[c];
  if (!p || Object.keys(p).length < 2 || Object.values(p).reduce((a, v) => a + v, 0) !== t.cells[c]) return null;
  return p;
}
// The subjects one teacher gives one class: [{ subj, col, h }] (col = the sheet's column name).
function partsOf(dp, t, c) {
  const p = splitOf(t, c);
  if (p) return Object.entries(p).map(([subj, h]) => ({ subj, col: SHEET_SUBJECT[subj] || subj, h }));
  const subj = isMulti(dp) ? (subjOf(t, c) || (t.subjects || [])[0] || '') : null;
  return [{ subj, col: subj ? SHEET_SUBJECT[subj] || subj : dp, h: t.cells[c] }];
}
function setParts(t, c, parts) {
  t.subj = t.subj || {}; t.split = t.split || {};
  delete t.split[c];
  if (!parts.length) { delete t.cells[c]; delete t.subj[c]; return; }
  t.cells[c] = parts.reduce((a, p) => a + p.h, 0);
  if (parts[0].subj) t.subj[c] = parts[0].subj; else delete t.subj[c];
  if (parts.length > 1) t.split[c] = Object.fromEntries(parts.map(p => [p.subj, p.h]));
}
let GRID_OPEN = false, GRID_BUSY = Promise.resolve();
$('gridOpen').onclick = () => { GRID_OPEN = true; $('schoolMain').classList.add('hidden'); $('grid').classList.remove('hidden'); renderGrid(); window.scrollTo(0, 0); };
$('gridBack').onclick = () => { GRID_OPEN = false; $('grid').classList.add('hidden'); $('schoolMain').classList.remove('hidden'); renderSchool(); };
$('gridRefresh').onclick = loadSchool;
const gridDepts = () => new Set(TEACHERS.map(t => t.department));
function renderGrid() {
  const depts = gridDepts();
  // who[col][class] = [{ name, h }]
  const who = {};
  for (const b of SCHOOL) {
    if (!depts.has(b.department)) continue;
    for (const t of b.data.teachers) for (const c of CLASSES) {
      if (!(c in (t.cells || {}))) continue;
      for (const p of partsOf(b.department, t, c)) ((who[p.col] = who[p.col] || {})[c] = who[p.col][c] || []).push({ name: t.name, h: p.h });
    }
  }
  const rows = CLASSES.filter(c => !HIDDEN.includes(c) || GRID_COLS.some(k => (who[k.col] || {})[c]));
  const nick = n => (TEACHERS.find(t => t.name === n) || {}).nick || n;
  const head = el('tr', {}, el('th', { className: 'stick', textContent: 'اسم الصف' }), ...GRID_COLS.map(k => el('th', { textContent: k.col })));
  const body = rows.map(c => el('tr', {}, el('th', { className: 'stick', textContent: sheetClass(c) }), ...GRID_COLS.map(k => {
    const off = (OFFICIAL[k.col] || {})[c], cur = (who[k.col] || {})[c] || [];
    if (!off && !cur.length) return el('td', { className: 'off' });
    if (!k.dept || !depts.has(k.dept)) return el('td', { className: 'ro', textContent: cur.map(x => nick(x.name)).join('، ') });
    const staff = TEACHERS.filter(t => t.department === k.dept).map(t => t.name);
    cur.forEach(x => { if (!staff.includes(x.name)) staff.push(x.name); });
    const sel = el('select', {}, el('option', { value: '', textContent: '—' }), ...staff.map(n => el('option', { value: n, textContent: nick(n) })));
    sel.value = cur.length ? cur[0].name : '';
    const bad = cur.some(x => off && x.h !== off);
    sel.onchange = () => setCell(k, c, sel.value);
    return el('td', { className: (cur.length > 1 ? 'dup' : '') + (bad ? ' odd' : ''), title: cur.map(x => x.name + ' (' + x.h + ')').join('\n') }, sel, cur.length > 1 ? el('small', { textContent: '+' + (cur.length - 1) }) : null);
  })));
  $('gridTable').replaceChildren(el('thead', {}, head), el('tbody', {}, ...body));
}
// One cell changed: the subject leaves whoever had it in that class and goes to the chosen teacher, in the department's own budget.
function setCell(k, c, name) {
  GRID_BUSY = GRID_BUSY.then(async () => {
    $('gridMsg').textContent = 'جارٍ الحفظ...';
    try {
      let b = SCHOOL.find(x => x.department === k.dept);
      if (!b) { const o = await call('budget_get', { department: k.dept, name: 'المدير' }); b = o.budget; SCHOOL.push(b); }
      const d = b.data;
      d.teachers.forEach(t => { t.cells = t.cells || {}; });
      for (const t of d.teachers) if (c in t.cells) {
        const parts = partsOf(k.dept, t, c), keep = parts.filter(p => p.col !== k.col);
        if (keep.length !== parts.length) setParts(t, c, keep);
      }
      if (name) {
        let t = d.teachers.find(x => x.name === name);
        if (!t) { t = { name, cells: {}, note: '', subjects: [], subj: {} }; d.teachers.push(t); }
        if (k.subj) { t.subjects = t.subjects || []; if (!t.subjects.includes(k.subj)) t.subjects.push(k.subj); }
        const h = (OFFICIAL[k.col] || {})[c] ?? d.periods[trackOf(c)] ?? 0;
        setParts(t, c, [...(c in t.cells ? partsOf(k.dept, t, c) : []), { subj: k.subj, col: k.col, h }]);
      }
      const o = await call('budget_save', { department: k.dept, name: 'المدير', data: d });
      b.updated_at = o.updated_at; b.updated_by = o.updated_by;
      $('gridMsg').textContent = 'حُفظ ✓ في ميزانية ' + k.dept;
    } catch (e) { $('gridMsg').textContent = 'لم يُحفظ: ' + e; await loadSchool(); }
    renderGrid();
  });
}

// ---- Admin: the whole school on one page ----
let SCHOOL = [];
$('tabSchool').onclick = () => tab('school');
$('schoolRefresh').onclick = loadSchool;
$('schoolPrint').onclick = () => { $('schoolDetail').classList.remove('hidden'); print(); };
$('schoolToggle').onclick = () => { if ($('schoolDetail').classList.contains('hidden')) showDetail(SCHOOL_ROWS); else { $('schoolDetail').classList.add('hidden'); $('schoolToggle').textContent = 'عرض التفاصيل'; } };
async function loadSchool() {
  $('schoolMsg').textContent = 'جارٍ التحميل...';
  try { SCHOOL = (await call('budgets')).rows; renderSchool(); if (GRID_OPEN) renderGrid(); $('schoolMsg').textContent = ''; }
  catch (e) { $('schoolMsg').textContent = e; }
  loadBudgetFiles();
}
// «ملفات الميزانية المرفقة»: the files sent with requests, by department (newest first).
async function loadBudgetFiles() {
  const box = $('schoolFiles');
  box.replaceChildren(el('h2', { textContent: 'ملفات الميزانية المرفقة' }), el('div', { className: 'meta', textContent: 'جارٍ التحميل...' }));
  try { ROWS = (await call('list')).rows; } catch (e) { box.lastChild.textContent = e; return; }
  const withFiles = ROWS.filter(r => filesOf(r).length);
  if (!withFiles.length) { box.lastChild.textContent = 'لا ملفات مرفقة.'; return; }
  const depts = alpha(new Set(withFiles.map(r => r.department || '—')));
  box.replaceChildren(el('h2', { textContent: 'ملفات الميزانية المرفقة' }), ...depts.map(dp => el('div', { className: 'field' },
    el('b', { textContent: dp }),
    ...withFiles.filter(r => (r.department || '—') === dp).map(r => el('div', { style: 'margin:6px 0 10px' },
      el('div', { className: 'meta', textContent: r.name + ' · ' + new Date(r.created_at).toLocaleDateString('ar-KW') }),
      ...filesOf(r).map((f, n) => fileRow(r, f, n)))))));
}
function renderSchool() {
  const depts = alpha(new Set(TEACHERS.map(t => t.department)));
  const rows = depts.map(dp => {
    const b = SCHOOL.find(x => x.department === dp);
    const head = (TEACHERS.find(t => t.department === dp && t.is_head) || {}).name || '—';
    const have = b ? b.data.teachers.length : TEACHERS.filter(t => t.department === dp).length;
    const req = b ? b.data.required : null;
    return { dp, b, head, have, req, gap: req === null || req === undefined ? null : req - have, periods: b ? sum(b.data.teachers, nisab) : 0 };
  });
  const td = (v, cls) => el('td', { className: cls || '', textContent: v === null || v === undefined ? '—' : v });
  const table = el('table', { className: 'bsum' },
    el('thead', {}, el('tr', {}, ...['القسم', 'رئيس القسم', 'آخر تحديث', ''].map(h => el('th', { textContent: h })))),
    el('tbody', {}, ...rows.map(r => {
      const edit = el('button', { className: 'ghost noprint', textContent: 'تعديل', style: 'padding:4px 12px' });
      edit.onclick = () => openBudget(r.dp, 'المدير', () => { $('schoolMain').classList.remove('hidden'); loadSchool(); });
      const view = el('button', { className: 'ghost noprint', textContent: 'معاينة', style: 'padding:4px 12px' });
      view.onclick = () => showPreview(r);
      return el('tr', {}, td(r.dp), td(r.head),
        td(r.b ? new Date(r.b.updated_at).toLocaleDateString('ar-KW') + ' · ' + (r.b.updated_by || '') : 'لم تُدخل بعد'), el('td', {}, el('div', { className: 'row', style: 'margin:0;flex-wrap:nowrap;justify-content:center' }, r.b ? view : null, edit)));
    })));
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
// «معاينة»: one department as the official Excel form (read only).
function showPreview(r) {
  const all = el('button', { className: 'ghost noprint', textContent: 'عرض كل الأقسام', style: 'margin-bottom:10px' });
  all.onclick = () => showDetail(SCHOOL_ROWS);
  $('schoolDetail').replaceChildren(all, el('div', { className: 'card fpWrap' }, el('h2', { textContent: 'ميزانية قسم ' + r.dp }), formPage(r.dp, r.b.data, true)));
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
