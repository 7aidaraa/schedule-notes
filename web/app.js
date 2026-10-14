const API = 'https://zywdedrtcaolsosufoae.supabase.co/functions/v1/api';
const ext = n => n.split('.').pop().toLowerCase();
const ZIPS = ['zip', 'rar', '7z'];
let PASS = '';
let ROLE = '';
let TEACHERS = [];   // [{ name, department, nick }]
let PHONES = {};     // name → last four digits of the number in the phone book
let ROWS = [];       // requests
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
  kids.forEach(k => k !== null && k !== undefined && k !== false && n.append(k));
  return n;
}
// Every save says so (or why not).
let toastTimer = null;
function toast(text, err) {
  const t = $('toast');
  t.textContent = text; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = err ? 'err' : ''; }, err ? 3500 : 1800);
}
// Deleting takes two taps (no confirm(): in-app browsers block it).
function delButton(label, onConfirm) {
  const b = el('button', { type: 'button', className: 'del', textContent: '🗑️', title: label, ariaLabel: label });
  let timer = null;
  b.onclick = async () => {
    if (!b.classList.contains('armed')) {
      b.classList.add('armed'); b.textContent = 'اضغط للتأكيد';
      timer = setTimeout(() => { b.classList.remove('armed'); b.textContent = '🗑️'; }, 4000);
      return;
    }
    clearTimeout(timer); b.disabled = true;
    try { await onConfirm(); } catch (e) { toast(e, true); b.disabled = false; b.classList.remove('armed'); b.textContent = '🗑️'; }
  };
  return b;
}
const select = (values, value, first) => {
  const s = el('select', {}, ...(first ? [el('option', { value: '', textContent: first })] : []),
    ...values.map(v => Array.isArray(v) ? el('option', { value: v[0], textContent: v[1] }) : el('option', { value: v, textContent: v })));
  s.value = value ?? '';
  return s;
};
const nickOf = name => { const t = TEACHERS.find(x => x.name === name); return t && t.nick || name; };
const teacherOf = target => TEACHERS.find(t => t.nick === target || t.name === target);
const depts = () => alpha(new Set(TEACHERS.map(t => t.department)));
const digits = v => v.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

// ---- Login ----
$('loginBtn').onclick = async () => {
  const btn = $('loginBtn'); btn.disabled = true;
  PASS = $('pass').value.trim();
  try {
    const o = await call('login');
    ROLE = o.role; TEACHERS = o.teachers || []; PHONES = o.phones || {};
    $('login').classList.add('hidden');
    $(ROLE === 'admin' ? 'admin' : 'teacher').classList.remove('hidden');
    if (ROLE === 'admin') { $('helpBtn').classList.remove('hidden'); tab('rules'); }
    else setupForm();
  } catch (e) { msg($('loginMsg'), e, 'err'); }
  btn.disabled = false;
};
$('pass').onkeydown = e => { if (e.key === 'Enter') $('loginBtn').click(); };

// ---- Teacher: department and name from lists on screen, the phone remembered by the server ----
const OTHER = '__other';
function setupForm() {
  $('dept').replaceChildren(el('option', { value: '', textContent: 'اختر القسم' }), ...depts().map(d => el('option', { value: d, textContent: d })));
  $('dept').onchange = () => { fillNames(); showPhone(); };
  $('name').onchange = () => { $('nameOther').classList.toggle('hidden', $('name').value !== OTHER); showPhone(); };
  $('phoneChange').onclick = () => { $('phoneKnown').classList.add('hidden'); $('phone').classList.remove('hidden'); $('phone').focus(); };
  fillNames(); showPhone();
  if (!$('items').children.length) addItem();
}
function fillNames() {
  const d = $('dept').value;
  $('name').replaceChildren(el('option', { value: '', textContent: d ? 'اختر اسمك' : 'اختر القسم أولاً' }),
    ...TEACHERS.filter(t => t.department === d).sort((a, b) => (a.nick || a.name).localeCompare(b.nick || b.name, 'ar'))
      .map(t => el('option', { value: t.name, textContent: t.nick || t.name })),
    ...(d ? [el('option', { value: OTHER, textContent: 'اسمي غير موجود' })] : []));
  $('nameOther').classList.add('hidden');
}
const chosenName = () => $('name').value === OTHER ? $('nameOther').value.trim() : $('name').value;
function showPhone() {
  const tail = PHONES[chosenName()];
  $('phoneKnown').classList.toggle('hidden', !tail);
  $('phone').classList.toggle('hidden', !!tail);
  if (tail) { $('phone').value = ''; $('phoneTail').textContent = '•••• ' + tail; }
}
$('nameOther').oninput = showPhone;

// Each request is its own card with its own reason.
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

$('sendBtn').onclick = async () => {
  const out = $('sendMsg'), btn = $('sendBtn');
  const name = chosenName(), keep = !$('phoneKnown').classList.contains('hidden');
  const phone = keep ? '' : digits($('phone').value).replace(/[\s-]/g, '').replace(/^(\+|00)965/, '');
  const base = { name, department: $('dept').value, phone, keep_phone: keep };
  const items = [...$('items').children].map(b => ({
    box: b, request: b.querySelector('.req').value.trim(), reason: b.querySelector('.why').value.trim() }));
  if (!base.department || !base.name || (!keep && !phone) || items.some(i => !i.request || !i.reason))
    return msg(out, 'جميع الحقول مطلوبة، ولكل طلب سببه', 'err');
  if (!keep && !/^[2569]\d{7}$/.test(phone)) return msg(out, 'رقم الهاتف يجب أن يكون 8 أرقام', 'err');
  btn.disabled = true;
  // One request per call: each becomes its own row, and a failure keeps only the unsent ones on screen.
  let sent = 0;
  try {
    for (const i of items) {
      msg(out, 'جارٍ إرسال الطلب ' + (sent + 1) + ' من ' + items.length + '...');
      await call('submit', { ...base, request: i.request, reason: i.reason });
      i.box.remove(); sent++;
    }
    if (!keep) PHONES[name] = phone.slice(-4);
    showPhone(); addItem();
    msg(out, sent > 1 ? 'تم إرسال جميع الطلبات (' + sent + ') بنجاح ✓' : 'تم إرسال طلبك بنجاح ✓', 'ok');
    toast('أُرسل ✓');
  } catch (e) {
    renumber();
    msg(out, (sent ? 'أُرسل ' + sent + '، وتعذر إرسال الباقي: ' : '') + e, 'err');
  }
  btn.disabled = false;
};

// ---- Developer: tabs, help, pull to refresh ----
let TAB = 'rules';
function tab(which) {
  TAB = which;
  ['rules', 'req', 'book', 'old'].forEach(k => $('tab' + k[0].toUpperCase() + k.slice(1)).classList.toggle('on', which === k));
  $('rules').classList.toggle('hidden', which !== 'rules');
  $('reqView').classList.toggle('hidden', which !== 'req');
  $('book').classList.toggle('hidden', which !== 'book');
  $('oldView').classList.toggle('hidden', which !== 'old');
  return refresh();
}
function refresh() { return TAB === 'rules' ? loadRules() : TAB === 'req' ? loadList() : TAB === 'old' ? loadOld() : loadBook(); }
$('tabRules').onclick = () => tab('rules');
$('tabReq').onclick = () => tab('req');
$('tabBook').onclick = () => tab('book');
$('tabOld').onclick = () => tab('old');

// ---- Screens: whatever opens gets the whole page; screens stack (a teacher's page over its department's), and «→» (or the phone's back button) returns ----
// `build` redraws a screen when one above it closes (what was saved there shows here).
let SCREEN_Y = 0;
const STACK = [];
const screenOpen = () => !$('screen').classList.contains('hidden');
function showTop() {
  const s = STACK[STACK.length - 1];
  $('admin').classList.add('hidden'); $('screen').classList.remove('hidden');
  $('scrTitle').textContent = s.title; $('scrBody').replaceChildren(s.body);
  scrollTo(0, 0); fabSync();
}
function openScreen(title, body, build) {
  if (!STACK.length) SCREEN_Y = scrollY;
  STACK.push({ title, body, build });
  history.pushState({ screen: STACK.length }, '');
  showTop();
}
// The same screen drawn again (or another in its place): no new step back.
function replaceScreen(title, body, build) {
  if (!STACK.length) return openScreen(title, body, build);
  STACK[STACK.length - 1] = { title, body, build: build || STACK[STACK.length - 1].build };
  showTop();
}
function closeScreen() { if (screenOpen()) history.back(); }
addEventListener('popstate', e => {
  const depth = (e.state && e.state.screen) || 0;
  if (STACK.length <= depth) return;
  STACK.length = depth;
  document.querySelectorAll('.veil, .sheetMenu').forEach(n => n.remove());
  if (depth) { const s = STACK[depth - 1]; if (s.build) s.body = s.build(); return showTop(); }
  $('screen').classList.add('hidden'); $('scrBody').replaceChildren(); $('admin').classList.remove('hidden');
  if (TAB === 'rules') renderRules(); else if (TAB === 'req') render(); else if (TAB === 'old') renderOld(); else renderBook();
  scrollTo(0, SCREEN_Y); fabSync();
});

// Save and back are the two floating buttons in the bottom corner. A page keeps its own save button, hidden, and «✓» presses it.
function onFab(root, save, ...hide) {
  root.classList.add('hasSave');
  root._save = async () => { await save.onclick(); fabSync(); };
  root._can = () => !save.disabled;
  [save, ...hide].forEach(b => b && b.classList.add('hidden'));
  return root;
}
function fabHost() {
  const root = screenOpen() ? $('scrBody') : $('admin');
  return [...root.querySelectorAll('.hasSave')].find(n => n.offsetParent !== null) || null;
}
let fabQueued = false;
function fabSync() {
  if (fabQueued) return;
  fabQueued = true;
  requestAnimationFrame(() => {
    fabQueued = false;
    const host = ROLE === 'admin' ? fabHost() : null;
    $('fabSave').classList.toggle('hidden', !host);
    $('fabSave').disabled = !host || !host._can();
    $('fabBack').classList.toggle('hidden', !screenOpen());
    if (!screenOpen()) $('scrTitle').textContent = '';
    $('topbar').classList.toggle('hidden', !host && !screenOpen());
  });
}
$('fabSave').onclick = async () => { const h = fabHost(); if (h && h._can()) { $('fabSave').disabled = true; try { await h._save(); } finally { fabSync(); } } };
$('fabBack').onclick = closeScreen;
new MutationObserver(fabSync).observe(document.querySelector('main'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'disabled'] });
addEventListener('input', fabSync, true);
$('helpBtn').onclick = () => openScreen('تعليمات', el('div', { className: 'helpText', textContent: HELP }));

const HELP = `كيف أستعمل المنصة؟

الأزرار
✓ يحفظ ما غيّرته.   → يرجع إلى الصفحة السابقة.
(في الأعلى يميناً، ويظهر ✓ أخضر متى وُجد ما يُحفظ.)

القيود
١. افتح «التغطية»، ثم اختر دوراً أو قسماً أو ظرفاً.
٢. اضغط خانة في الجدول واختر: صلب أو مرن.
   - رقم الحصة في الأعلى = الحصة في كل الأيام.
   - اسم اليوم = اليوم كله.
   - زر «☰ الأسبوع» = قيود الأسبوع (مثل: حصص متتابعة).
٣. اضغط ✓ للحفظ.

المعلم
- يأخذ قيود قسمه ومادته وأدواره تلقائياً (تظهر باهتة).
- لتغييرها له وحده: اضغط الخانة واختر غيرها، أو «فارغ» لإعفائه.
- صفحته من: القسم ← «المعلمون» ← اسمه.
- ✏️ في صفحته لتعديل بياناته.

القائمة
- كل القيود مرتبة. اضغط القيد لتشطبه بعد مراجعته.
- اكتب تحته صياغة الشيت، ثم ✓.

للتحديث: اسحب الشاشة للأسفل.`;

// Pull down from the top of the page: the open tab reloads (an open form is never thrown away).
(() => {
  let y0 = null, dy = 0;
  const ptr = $('ptr');
  addEventListener('touchstart', e => { y0 = ROLE === 'admin' && scrollY <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) { ptr.style.height = '0'; return; }
    ptr.style.height = Math.min(dy / 2, 60) + 'px';
    ptr.textContent = dy > 130 ? 'أفلِت للتحديث' : 'اسحب للتحديث';
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (y0 === null) return;
    y0 = null;
    if (dy > 130) {
      if (screenOpen()) { ptr.style.height = '0'; return; }
      ptr.style.height = '40px'; ptr.textContent = 'جارٍ التحديث...';
      await refresh();
    }
    ptr.style.height = '0';
  });
})();

// ---- Requests ----
async function loadList() {
  $('count').textContent = 'جارٍ التحميل...';
  try { ROWS = (await call('list')).rows; render(); }
  catch (e) { $('count').textContent = e; }
}
function render() {
  $('count').textContent = ROWS.length ? 'الطلبات: ' + ROWS.length : '';
  $('list').replaceChildren(...(ROWS.length ? ROWS.map(card) : [el('div', { className: 'card meta', textContent: 'لا توجد طلبات' })]));
}
function field(label, text) {
  return el('div', { className: 'field' }, el('b', { textContent: label }), el('p', { textContent: text || '—' }));
}
function card(r) {
  const c = el('div', { className: 'card' });
  const del = delButton('حذف الطلب', async () => { await call('delete', { id: r.id }); ROWS = ROWS.filter(x => x !== r); render(); toast('حُذف ✓'); });
  c.append(
    el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' }, el('strong', { textContent: nickOf(r.name) }), del),
    el('div', { className: 'meta', textContent: [r.department, new Date(r.created_at).toLocaleString('ar-KW')].filter(Boolean).join(' · ') }),
    field('الطلب', r.request), field('السبب', r.reason));
  if (r.phone) c.append(el('div', { className: 'row', style: 'margin-top:0' }, waBtn(r.phone, r.name, r.request),
    el('a', { href: 'tel:+965' + r.phone, textContent: r.phone, dir: 'ltr' })));
  if (filesOf(r).length) c.append(el('div', { className: 'field' }, el('b', { textContent: 'المرفقات:' })), ...filesOf(r).map((f, n) => fileRow(r, f, n)));
  // The request becomes a constraint: saving it deletes the request (and its files) for good.
  const conv = el('button', { textContent: 'حوّل إلى قيد', style: 'margin-top:10px' });
  conv.onclick = () => openScreen('تحويل الطلب إلى قيد', builder({ request: r, onSaved: () => { ROWS = ROWS.filter(x => x !== r); } }));
  c.append(conv);
  return c;
}
// Rows saved before multi-file support carry a single file in file_*.
const filesOf = r => r.files && r.files.length ? r.files : r.file_path ? [{ name: r.file_name, type: r.file_type }] : [];
// One attachment (old requests only): its name, view (not for archives) and download.
function fileRow(r, f, n) {
  const preview = el('div', { className: 'preview' });
  const fmsg = el('span', { className: 'meta' });
  const isImg = (f.type || '').startsWith('image/');
  const getUrls = () => call('file', { id: r.id, n });
  const viewBtn = el('button', { className: 'ghost', textContent: 'عرض' });
  const dlBtn = el('button', { className: 'ghost', textContent: 'تحميل' });
  viewBtn.onclick = async () => {
    // Open the tab synchronously so mobile popup blockers allow it.
    const w = isImg ? null : window.open('', '_blank');
    viewBtn.disabled = true; fmsg.textContent = 'جارٍ الجلب...';
    try {
      const u = await getUrls();
      if (isImg) preview.replaceChildren(el('img', { src: u.view, alt: f.name }));
      else if (w) w.location = u.view;
      else location.href = u.view;
      fmsg.textContent = '';
    } catch (e) { if (w) w.close(); fmsg.textContent = e; }
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

// ---- Phone book: editable; the number a teacher entered once is offered back to them ----
let BOOK = [];
async function loadBook() {
  $('bookList').replaceChildren(el('div', { className: 'meta', textContent: 'جارٍ التحميل...' }));
  try { BOOK = (await call('contacts')).rows; renderBook(); }
  catch (e) { $('bookList').replaceChildren(el('div', { className: 'card meta', textContent: e })); }
}
function renderBook() {
  $('bookMsg').textContent = BOOK.length ? BOOK.length + ' رقماً' : '';
  $('bookList').replaceChildren(...(BOOK.length ? BOOK.map(contactCard)
    : [el('div', { className: 'card meta', textContent: 'لا توجد أرقام بعد؛ تُحفظ مع كل طلب' })]));
}
function contactCard(c) {
  const box = el('div', { className: 'card contact' });
  const show = () => {
    const edit = el('button', { type: 'button', className: 'ib', textContent: '✏️', title: 'تعديل' });
    edit.onclick = () => openScreen('تعديل رقم', contactForm(c));
    const del = delButton('حذف الرقم', async () => { await call('contact_delete', { name: c.name }); BOOK = BOOK.filter(x => x !== c); renderBook(); toast('حُذف ✓'); });
    box.replaceChildren(
      el('div', {}, el('strong', { textContent: nickOf(c.name) }), el('div', { className: 'meta', textContent: c.department || '' })),
      el('div', { className: 'row', style: 'margin-top:0' }, waBtn(c.phone, c.name), el('a', { href: 'tel:+965' + c.phone, textContent: c.phone, dir: 'ltr' }), edit, del));
  };
  show();
  return box;
}
function contactForm(c) {
  const name = el('input', { value: c ? c.name : '', placeholder: 'الاسم', maxLength: 120 });
  const dept = select(depts(), c ? c.department : '', 'القسم');
  const phone = el('input', { value: c ? c.phone : '', placeholder: '9xxxxxxx', type: 'tel', inputMode: 'numeric', dir: 'ltr', maxLength: 16 });
  const save = el('button', { type: 'button', textContent: 'حفظ' });
  const cancel = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
  const fmsg = el('span', { className: 'meta' });
  cancel.onclick = closeScreen;
  save.onclick = async () => {
    const f = { old: c ? c.name : '', name: name.value.trim(), department: dept.value, phone: digits(phone.value).replace(/[\s-]/g, '') };
    save.disabled = true;
    try {
      await call('contact_save', f);
      toast('حُفظ ✓');
      if (c) Object.assign(c, { name: f.name, department: f.department, phone: f.phone.replace(/^(\+|00)965/, '') });
      else BOOK.push({ name: f.name, department: f.department, phone: f.phone.replace(/^(\+|00)965/, '') });
      closeScreen();
    } catch (e) { fmsg.textContent = e; save.disabled = false; }
  };
  return onFab(el('div', { className: 'cform', style: 'width:100%' }, name, el('div', { className: 'row', style: 'margin-top:6px' }, dept), el('div', { className: 'row', style: 'margin-top:6px' }, phone),
    el('div', { className: 'row' }, save, cancel, fmsg)), save, cancel);
}
$('bookAdd').onclick = () => openScreen('رقم جديد', contactForm(null));

// ---- Constraints, in the terms of the timetable sheet «القيود» (section three, columns A–I) ----
const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
// Subjects as the sheet names them, and the platform department each belongs to.
const SUBJECTS = [['التربية الإسلامية'], ['اللغة العربية'], ['اللغة الإنجليزية'], ['اللغة الفرنسية'], ['الرياضيات'], ['الإحصاء', 'الرياضيات'],
  ['الكيمياء', 'الفيزياء والكيمياء'], ['الفيزياء', 'الفيزياء والكيمياء'], ['الأحياء', 'الأحياء والجيولوجيا'], ['الجيولوجيا', 'الأحياء والجيولوجيا'],
  ['التربية البيئية', 'الأحياء والجيولوجيا'], ['التاريخ', 'الاجتماعيات'], ['الجغرافيا', 'الاجتماعيات'], ['الاجتماعيات'], ['الفلسفة', 'الاجتماعيات'],
  ['علم النفس', 'الاجتماعيات'], ['الدستور', 'الاجتماعيات'], ['الحاسوب'], ['التربية البدنية'], ['التربية الموسيقية'], ['التربية الفنية'],
  ['التجاري'], ['المكتبات'], ['الدراسات العملية'], ['اللغة الفرنسية (اختيار حرّ)', 'اللغة الفرنسية']].map(([s, d]) => ({ s, d: d || s }));
const DEPT_ORDER = ['التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية', 'اللغة الفرنسية', 'الرياضيات', 'الفيزياء والكيمياء',
  'الأحياء والجيولوجيا', 'الاجتماعيات', 'الحاسوب', 'التربية البدنية', 'التربية الموسيقية', 'التربية الفنية', 'التجاري', 'المكتبات', 'الدراسات العملية'];
const ALL = 'كل الأقسام';
// The sheet's constraint types: who they apply to, what they read (the sheet locks the rest), their binding level.
// f: per = periods · per1 = one period · day = days · day1 = one day · num = a number · other = another teacher · free = text.
// lv: 'choose' (صلب or مرن موزون) · a fixed level · '' (does not apply).
const SHEET_TYPES = [
  { g: 'الحصص', n: 'لا حصّة', for: ['معلّم', 'دور'], f: ['per'], lv: 'choose', h: 'الحصص الممنوعة من كل يوم؛ المعلّم حاضر (يشرف ويحتاط).' },
  { g: 'الحصص', n: 'خانات محجوبة', for: ['معلّم', 'مادّة'], f: ['day', 'per'], lv: 'choose', h: 'لا درس في هذه الحصص من هذه الأيام فقط. بهدف «مادّة»: كل من يدرّسها.' },
  { g: 'الحصص', n: 'الحصص المسموحة', for: ['معلّم'], f: ['per'], lv: 'صلب', h: 'لا يحضر إلا في هذه الحصص (غياب فعلي). للتفضيل: «لا حصّة» مرن على ما خارجها.' },
  { g: 'الحصص', n: 'أيام التفرّغ', for: ['معلّم'], f: ['day'], lv: 'صلب', h: 'غائب تماماً هذه الأيام: لا درس ولا إشراف ولا اجتماع.' },
  { g: 'الحصة الأخيرة', n: 'عدد الحصص الأخيرة', for: ['معلّم', 'مادّة'], f: ['num'], lv: 'صلب', h: 'سقف الحصص الأخيرة في الأسبوع (فوق فقط، لا يُلزم بعدد).' },
  { g: 'الحصة الأخيرة', n: 'ربط السابعات', for: ['معلّم'], f: ['other'], lv: 'مرن موزون', h: 'حصتاهما الأخيرتان في الأيام نفسها قدر الإمكان.' },
  { g: 'شكل اليوم', n: 'يفضّل الحصص المتتابعة', for: ['معلّم'], f: [], lv: 'مرن موزون', h: 'حصصه متلاصقة بدل الفجوات.' },
  { g: 'شكل اليوم', n: 'يستثنى من يوم المراجعات', for: ['معلّم'], f: [], lv: '', h: 'لا يُشترط له يوم ينتهي مبكراً.' },
  { g: 'شكل اليوم', n: 'يوم الاستئذان الصباحي', for: ['معلّم'], f: [], lv: 'choose', h: 'يوم يبدأ فيه متأخراً؛ البرنامج يختار اليوم.' },
  { g: 'شكل اليوم', n: 'توزيع المادّة في اليوم', for: ['مادّة'], f: ['num'], lv: 'choose', pattern: 'متتاليتان', h: 'النمط «متتاليتان»: حصص المادّة كتلة واحدة متجاورة في يوم؛ القيمة الحدّ اليومي.' },
  { g: 'الاجتماع', n: 'إعفاء من اجتماع القسم', for: ['معلّم'], f: [], lv: '', h: 'لا يحضر اجتماع قسمه.' },
  { g: 'الاجتماع', n: 'عدد حصص اجتماع القسم', for: ['مادّة'], f: ['num'], lv: '', h: 'عدد الاجتماعات في الأسبوع (الافتراضي 1).' },
  { g: 'الاجتماع', n: 'يوم اجتماع القسم', for: ['مادّة'], f: ['day1'], lv: 'choose', h: 'يوم واحد لكل قيد؛ ليومين قيدان.' },
  { g: 'الاجتماع', n: 'حصّة اجتماع القسم', for: ['مادّة'], f: ['per1'], lv: 'choose', h: 'لا الأولى ولا الأخيرة.' },
];
const PARAM = { g: 'بارامتر', n: 'بارامتر', for: ['بارامتر'], f: ['free'], lv: 'choose-nw', h: 'قاعدة عامة من القسمين الأول والثاني في ورقة «القيود»؛ يطبّقها البرنامج على الجميع.' };
let TYPES = []; // proposed types: [{ name, targets, explain }]
const typeOf = n => n === 'بارامتر' ? PARAM : SHEET_TYPES.find(t => t.n === n)
  || (TYPES.find(t => t.name === n) && { g: 'مقترحة', n, for: TYPES.find(t => t.name === n).targets.split('،'), f: ['free'], lv: 'choose', h: TYPES.find(t => t.name === n).explain || 'نوع مقترح، لم يُضف إلى الشيت بعد.', proposed: true });
const isProposed = n => !!TYPES.find(t => t.name === n);
const DURS = ['ثابتة', 'مؤقتة'];
const STATE_ICON = { 'مسجّل': '✅', 'خامل': '⏸️', 'غير مسجّل': '⏳', 'نوع مقترح': '🆕' };

// Values in the sheet's own spelling: «1، 2» · «الخميس: 7» · «الإثنين، الأربعاء».
const ORD = { 'الأولى': 1, 'الثانية': 2, 'الثالثة': 3, 'الرابعة': 4, 'الخامسة': 5, 'السادسة': 6, 'السابعة': 7, 'الأخيرة': 7 };
const fold = s => String(s ?? '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ًٌٍَُِّْـ]/g, '');
const parsePer = s => { s = digits(String(s || '')); const out = new Set((s.match(/\d/g) || []).map(Number).filter(n => n >= 1 && n <= 7)); Object.entries(ORD).forEach(([w, n]) => { if (s.includes(w)) out.add(n); }); return [...out].sort((a, b) => a - b); };
const parseDays = s => DAYS.filter(d => fold(s).includes(fold(d)));
const perTxt = p => [...p].sort((a, b) => a - b).join('، ');
const dayTxt = d => DAYS.filter(x => d.includes(x)).join('، ');
function valueOf(st) {
  const t = typeOf(st.ctype); if (!t) return '';
  if (t.f.includes('free')) return st.free.trim();
  if (st.ctype === 'خانات محجوبة') return st.days.length && st.per.length ? dayTxt(st.days) + ': ' + perTxt(st.per) : '';
  if (t.f.includes('per') || t.f.includes('per1')) return perTxt(st.per);
  if (t.f.includes('day') || t.f.includes('day1')) return dayTxt(st.days);
  if (t.f.includes('num')) return st.num === '' ? '' : String(st.num);
  if (t.f.includes('other')) return st.other;
  return '';
}
const levelOf = (st, t) => t.lv === 'choose' || t.lv === 'choose-nw' ? st.level : t.lv;
const deptOf = (tt, target) => tt === 'معلّم' ? (teacherOf(target) || {}).department || '' : tt === 'مادّة' ? (SUBJECTS.find(x => x.s === target) || {}).d || '' : tt === 'قسم' ? target : ALL;
// A circumstance takes the teacher's types (its rows go to the sheet as one «معلّم» row per member).
const ttFor = tt => tt === 'ظرف' ? 'معلّم' : tt;
const durOf = () => 'ثابتة';
const lineOf = r => r.ctype + ': ' + r.target + (r.value ? ' — ' + (r.pattern ? r.pattern + ' · ' : '') + r.value : '');

let RULES = null, DUR = 'ثابتة', GROUPS = [], RVIEW = 'cover';
async function loadRules() {
  $('rulesMsg').textContent = 'جارٍ التحميل...';
  try { const o = await call('rules'); RULES = o.rows; TYPES = o.types || []; GROUPS = o.groups || []; renderRules(); $('rulesMsg').textContent = ''; }
  catch (e) { $('rulesMsg').textContent = e; }
}
const strength = r => r.active === false ? 'off' : /صلب/.test(r.level) ? 'hard' : /مرن/.test(r.level) ? 'soft' : 'none';
const ruleColor = r => { const s = strength(r); return s === 'off' ? 'off' : s === 'soft' ? 'soft' : s === 'hard' ? (r.target_type === 'معلّم' ? 'hardOne' : 'hardAll') : ''; };
const deptRank = d => d === ALL ? -1 : (i => i < 0 ? 99 : i)(DEPT_ORDER.indexOf(d));
const typeRank = n => (i => i < 0 ? 50 : i)(SHEET_TYPES.findIndex(t => t.n === n));
function ordered(rows) {
  const k = r => [deptRank(r.department), r.department || '', { 'بارامتر': 0, 'دور': 1, 'قسم': 2, 'مادّة': 3, 'ظرف': 4, 'معلّم': 5 }[r.target_type] ?? 5, r.target || '', typeRank(r.ctype), r.id];
  return [...rows].sort((a, b) => { const p = k(a), q = k(b); for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return typeof p[i] === 'string' ? p[i].localeCompare(q[i], 'ar') : p[i] - q[i]; return 0; });
}
// «التغطية» (teachers and the layers above them) or «القائمة» (the checklist by duration).
function renderRules() {
  $('rvCover').classList.toggle('on', RVIEW === 'cover'); $('rvList').classList.toggle('on', RVIEW === 'list');
  $('coverView').classList.toggle('hidden', RVIEW !== 'cover'); $('listView').classList.toggle('hidden', RVIEW !== 'list');
  if (RVIEW === 'cover') return renderCover();
  const all = RULES || [];
  $('durTabs').replaceChildren(...DURS.map(d => {
    const b = el('button', { className: 'ghost' + (d === DUR ? ' on' : '') }, d + ' ', el('small', { textContent: '(' + all.filter(r => r.duration === d).length + ')' }));
    b.onclick = () => { DUR = d; renderRules(); };
    return b;
  }));
  const rows = ordered(all.filter(r => r.duration === DUR));
  const done = rows.filter(r => r.checked).length;
  const appr = rows.filter(r => r.approved).length;
  $('rulesMsg').textContent = rows.length ? 'مستوفى ' + done + ' من ' + rows.length + (done === rows.length ? ' — اكتملت ✓' : '') + ' · معتمد ' + appr + ' من ' + rows.length : '';
  const out = [];
  let dept = null;
  for (const r of rows) {
    if (r.department !== dept) { dept = r.department; out.push(el('div', { className: 'grp', textContent: dept || '—' })); }
    out.push(ruleItem(r));
  }
  $('rulesList').replaceChildren(stxHost(el('div', { className: 'card', style: 'padding:12px' }, ...(out.length ? out : [el('div', { className: 'meta', textContent: 'لا قيود في هذه الصفحة' })]))));
}
const levelText = r => r.level === 'مرن موزون' ? 'مرن' + (r.weight !== null && r.weight !== undefined ? ' ' + r.weight : '') : r.level;
const targetText = r => r.target_type === 'معلّم' || r.target_type === 'بارامتر' ? r.target : r.target_type + ': ' + r.target;
// «معتمد من الإدارة / غير معتمد»: one tap switches it (it does not tick the constraint off).
function approveBtn(r, redraw) {
  const b = el('button', { type: 'button', className: 'appr' + (r.approved ? ' on' : ''), textContent: r.approved ? '✓ معتمد' : 'غير معتمد', title: 'معتمد من الإدارة' });
  b.onclick = async e => {
    e.stopPropagation();
    r.approved = !r.approved; redraw();
    try { await call('rule_approve', { id: r.id, approved: r.approved }); }
    catch (err) { r.approved = !r.approved; redraw(); toast(err, true); }
  };
  return b;
}
// The constraint in the platform's own words: «رؤساء الأقسام — لا حصّة: الأحد 1، 2 — صلب».
const targetLabel = r => r.target_type === 'معلّم' || r.target_type === 'بارامتر' || r.target_type === 'دور' ? r.target : r.target_type + ' ' + r.target;
function phrase(r) {
  let what = r.ctype + (r.value ? ': ' + (r.pattern ? r.pattern + ' · ' : '') + r.value : '');
  const so = stickOf(r);
  if (so) what = stickText(so.s, so.pos, so.x);
  else if (r.ctype === 'لا حصّة') what = 'لا حصّة ' + r.value + ' كل الأيام';
  else if (r.ctype === 'خانات محجوبة') what = 'لا حصّة ' + r.value;
  if (r.level === 'إعفاء') what = 'إعفاء من ' + what;
  const lv = r.level === 'إعفاء' ? '' : levelText(r);
  return [targetLabel(r), what, [lv, r.duration === 'مؤقتة' ? 'مؤقت' : ''].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
}
// The label's icon, once it says more than «غير مسجّل» (its ⏳ would read as «مؤقت» now).
const stateIcon = r => r.sheet_state && r.sheet_state !== 'غير مسجّل' ? el('span', { className: 'st', textContent: STATE_ICON[r.sheet_state] || '', title: r.sheet_state }) : null;
// One item per constraint: a tap ticks it off (saved on the server); under it, the sheet's wording written by hand; «⋯» opens its details.
function ruleItem(r) {
  const box = el('div', { className: 'rule ' + ruleColor(r) + (r.checked ? ' done' : '') });
  const more = el('button', { type: 'button', className: 'more', textContent: '⋯', title: 'التفاصيل', ariaLabel: 'التفاصيل' });
  more.onclick = () => openScreen('تفاصيل القيد', ruleDetail(r));
  box.append(el('div', { className: 'top' },
    el('span', { className: 'box', textContent: r.checked ? '✓' : '' }),
    el('div', { className: 'tx' }, phrase(r)),
    stateIcon(r), approveBtn(r, renderRules), more));
  if (r.active === false) box.append(el('div', { className: 'sub', textContent: 'غير مفعَّل' }));
  box.append(sheetTextBox(r));
  box.onclick = async e => {
    if (e.target.closest('button, textarea, .stx')) return;
    r.checked = !r.checked; renderRules();
    try { await call('rule_check', { id: r.id, checked: r.checked }); }
    catch (err) { r.checked = !r.checked; renderRules(); toast(err, true); }
  };
  return box;
}
// «صياغة الشيت»: written by hand, saved with its button (shown once the text changes).
function sheetTextBox(r) {
  const ta = el('textarea', { value: r.sheet_text || '', placeholder: 'صياغة الشيت', maxLength: 3000, rows: 1 });
  const box = el('div', { className: 'stx' }, ta);
  ta.oninput = () => box.classList.toggle('dirty', ta.value.trim() !== (r.sheet_text || ''));
  box._saveOne = async () => { await call('rule_sheet_text', { id: r.id, sheet_text: ta.value.trim() }); r.sheet_text = ta.value.trim(); box.classList.remove('dirty'); };
  return box;
}
// A list (or a detail) of constraints: the floating «✓» saves every sheet wording that changed.
function stxHost(node) {
  node.classList.add('hasSave');
  node._can = () => !!node.querySelector('.stx.dirty');
  node._save = async () => {
    try { for (const b of node.querySelectorAll('.stx.dirty')) await b._saveOne(); toast('حُفظ ✓'); }
    catch (e) { toast(e, true); }
  };
  return node;
}
// The details screen: note, sheet wording and label, moving between pages, editing and deleting.
function ruleDetail(r) {
  const link = r.link_id && (RULES || []).find(x => x.id === r.link_id);
  const again = () => replaceScreen('تفاصيل القيد', ruleDetail(r));
  const sec = (title, ...kids) => el('div', { className: 'dsec' }, el('b', { textContent: title }), ...kids);
  const move = el('div', { className: 'chips' }, ...DURS.map(d => {
    const b = el('button', { type: 'button', className: 'chip' + (d === r.duration ? ' on' : ''), textContent: d });
    b.onclick = async () => {
      if (d === r.duration) return;
      try { await call('rule_move', { id: r.id, duration: d }); r.duration = d; toast('نُقل إلى «' + d + '» ✓'); again(); }
      catch (e) { toast(e, true); }
    };
    return b;
  }));
  // The label is set by hand now that nothing is exported to the sheet.
  const states = el('div', { className: 'chips' }, ...Object.keys(STATE_ICON).map(s => {
    const b = el('button', { type: 'button', className: 'chip' + (s === r.sheet_state ? ' on' : ''), textContent: STATE_ICON[s] + ' ' + s });
    b.onclick = async () => {
      if (s === r.sheet_state) return;
      try { await call('rules_state', { states: { [r.id]: s } }); r.sheet_state = s; toast('حُفظ ✓'); again(); }
      catch (e) { toast(e, true); }
    };
    return b;
  }));
  // A grid row is edited on its grid; any other row in the builder.
  const onGrid = Grid.managed(r) || !!stickOf(r);
  const edit = el('button', { type: 'button', textContent: onGrid ? '▦ افتح الشبكة' : '✏️ تعديل' });
  edit.onclick = () => onGrid ? openTarget(r.target_type, r.target) : openScreen('تعديل قيد', builder({ rule: r }));
  const del = delButton('حذف القيد', async () => { await call('rule_delete', { id: r.id }); RULES = RULES.filter(x => x !== r); toast('حُذف ✓'); closeScreen(); });
  del.textContent = '🗑️ حذف';
  return stxHost(el('div', {},
    el('div', { className: 'detailLine', textContent: phrase(r) }),
    el('div', { className: 'meta' }, [r.active === false ? 'غير مفعَّل' : '', r.department].filter(Boolean).join(' · ')),
    link ? el('div', { className: 'meta', textContent: '🔗 مرتبط بـ: ' + lineOf(link) }) : null,
    sec('⁉️ الملاحظة', el('div', { className: 'panel', style: 'margin-top:0', textContent: r.reason || 'لا أعلم' })),
    sec('✍️ صياغة الشيت', sheetTextBox(r)),
    sec('🏷️ الوسم', states),
    sec('🏛️ الإدارة', el('div', { className: 'chips' }, approveBtn(r, again))),
    sec('↪️ نقل إلى', move),
    el('div', { className: 'row', style: 'margin-top:18px' }, edit, del)));
}
// The constraint as a row of the sheet «القيود» (section three).
const SHEET_COLS = ['نوع الهدف', 'الهدف', 'نوع القيد', 'النمط', 'القيمة', 'مستوى الإلزام', 'الوزن', 'مفعَّل', 'ملاحظة'];
const rowOf = r => [r.target_type, r.target, r.ctype, r.pattern, r.value, r.level, r.weight ?? '', r.active === false ? 'لا' : 'نعم', r.reason];
$('ruleAdd').onclick = () => openScreen('إضافة قيد', builder({}));
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
  try { await call('rules_reset'); (RULES || []).forEach(r => { r.checked = false; }); renderRules(); toast('رُفع الشطب ✓'); }
  catch (e) { toast(e, true); }
  b.disabled = false; b.textContent = 'رفع الشطب عن الكل'; b.className = 'ghost';
};

// The builder: buttons only; only the fields the chosen type reads are shown, as the sheet locks the others.
// `fixed`: { tt, target, ctype } set by a card (the choosers are hidden); `onCancel`: the card closes it in place.
function builder({ rule, request, link, onSaved, fixed, onCancel }) {
  const r = rule || {};
  const reqTeacher = request && TEACHERS.find(t => t.name === request.name);
  const st = {
    tt: r.target_type || (fixed ? fixed.tt : link ? link.target_type : 'معلّم'),
    target: r.target ?? (fixed ? fixed.target : reqTeacher ? reqTeacher.nick || reqTeacher.name : ''),
    ctype: r.ctype || (fixed ? fixed.ctype : ''), per: parsePer(r.ctype === 'خانات محجوبة' ? (r.value || '').split(':')[1] : r.value), days: parseDays(r.ctype === 'خانات محجوبة' ? (r.value || '').split(':')[0] : r.value),
    num: /^\d+$/.test(digits(r.value || '')) ? digits(r.value) : '', other: r.ctype === 'ربط السابعات' ? r.value : '', free: r.value || '',
    level: r.level || 'صلب', weight: r.weight ?? '', active: r.active !== false, duration: r.duration || (fixed ? durOf(fixed.tt) : link ? link.duration : DUR),
    reason: r.reason ?? (request ? request.reason : link ? link.reason : ''),
  };
  const box = el('div', { className: 'builder' });
  const pv = el('div', { className: 'pv' });
  const fmsg = el('span', { className: 'meta' });
  const chips = (vals, cur, onPick, sq) => el('div', { className: 'chips' }, ...vals.map(v => {
    const [val, label] = Array.isArray(v) ? v : [v, v];
    const on = Array.isArray(cur) ? cur.includes(val) : cur === val;
    const b = el('button', { type: 'button', className: 'chip' + (sq ? ' sq' : '') + (on ? ' on' : ''), textContent: label });
    b.onclick = () => { onPick(val); draw(); };
    return b;
  }));
  const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  const lbl = t => el('div', { className: 'lbl', textContent: t });
  function preview() {
    const t = typeOf(st.ctype);
    if (!t) { pv.replaceChildren('اختر نوع القيد'); return; }
    const v = valueOf(st), lv = levelOf(st, t);
    pv.replaceChildren('سيُحفظ هكذا:', el('br'), el('b', { textContent: lineOf({ ctype: st.ctype, target: st.target || '؟', value: v, pattern: t.pattern || '' }) }),
      ' 〔' + [lv === 'مرن موزون' ? 'مرن موزون ' + (st.weight === '' ? '؟' : st.weight) : lv, st.active ? '' : 'غير مفعَّل', st.duration].filter(Boolean).join(' · ') + '〕');
  }
  function draw() {
    const parts = [];
    if (request) parts.push(el('div', { className: 'meta', textContent: 'من طلب ' + nickOf(request.name) + ': ' + request.request }));
    if (!fixed) {
    parts.push(lbl('نوع الهدف'), chips(['معلّم', 'مادّة', 'دور', 'بارامتر', ...(circs().length || st.tt === 'ظرف' ? ['ظرف'] : [])], st.tt, v => { if (st.tt !== v) { st.tt = v; st.target = ''; st.ctype = ''; } }));
    parts.push(lbl('الهدف'));
    if (st.tt === 'ظرف') {
      const s = select(circs().map(g => g.name), st.target, 'اختر الظرف'); s.onchange = () => { st.target = s.value; preview(); };
      if (st.target && !circs().some(g => g.name === st.target)) s.append(el('option', { value: st.target, textContent: st.target }));
      s.value = st.target; parts.push(s);
    } else if (st.tt === 'معلّم') {
      const s = el('select', {}, el('option', { value: '', textContent: 'اختر المعلّم' }), ...depts().map(d => el('optgroup', { label: d },
        ...TEACHERS.filter(t => t.department === d).map(t => el('option', { value: t.nick || t.name, textContent: t.nick || t.name })))));
      if (st.target && ![...s.options].some(o => o.value === st.target)) s.append(el('option', { value: st.target, textContent: st.target }));
      s.value = st.target; s.onchange = () => { st.target = s.value; preview(); };
      parts.push(s);
    } else if (st.tt === 'مادّة') {
      const s = select(SUBJECTS.map(x => x.s), st.target, 'اختر المادّة'); s.onchange = () => { st.target = s.value; preview(); };
      parts.push(s);
    } else if (st.tt === 'دور') parts.push(chips(roles().map(g => g.name), st.target, v => { st.target = v; }));
    else { const i = el('input', { value: st.target, placeholder: 'اسم البارامتر كما في ورقة «القيود»', maxLength: 200 }); i.oninput = () => { st.target = i.value.trim(); preview(); }; parts.push(i); }
    }

    if (!fixed) parts.push(lbl('نوع القيد'));
    if (fixed) { /* the card chose the type */ }
    else if (st.tt === 'بارامتر') st.ctype = 'بارامتر';
    else {
      const tf = ttFor(st.tt);
      const list = [...SHEET_TYPES.filter(t => t.for.includes(tf)), ...TYPES.filter(t => t.targets.split('،').includes(tf)).map(t => ({ g: 'مقترحة', n: t.name }))];
      if (st.ctype && !list.some(t => t.n === st.ctype)) list.push({ g: 'مقترحة', n: st.ctype });
      for (const g of [...new Set(list.map(t => t.g))]) parts.push(el('div', { className: 'gname', textContent: g }), chips(list.filter(t => t.g === g).map(t => t.n), st.ctype, v => { st.ctype = v; }));
      // A type the sheet does not have yet: named here, tagged 🆕 until the sheet's developer adds it.
      if (st.newType) {
        const name = el('input', { placeholder: 'اسم النوع بنسق أسماء ورقة «القيود»', maxLength: 120 });
        const explain = el('textarea', { placeholder: 'شرحه لمطور الشيت: ما الذي يمنعه أو يلزمه البرنامج', maxLength: 2000 });
        const ok = el('button', { type: 'button', textContent: 'حفظ النوع' });
        const no = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
        const tmsg = el('span', { className: 'meta' });
        no.onclick = () => { st.newType = false; draw(); };
        ok.onclick = async () => {
          const n = name.value.trim();
          if (!n) return (tmsg.textContent = 'اكتب اسم النوع');
          ok.disabled = true;
          try {
            await call('type_save', { name: n, targets: [ttFor(st.tt)], explain: explain.value.trim() });
            TYPES = TYPES.filter(t => t.name !== n).concat({ name: n, targets: ttFor(st.tt), explain: explain.value.trim() });
            st.ctype = n; st.newType = false; toast('حُفظ النوع ✓'); draw();
          } catch (e) { tmsg.textContent = e; ok.disabled = false; }
        };
        parts.push(el('div', { className: 'hint', style: 'background:var(--gold-soft)' }, el('b', { textContent: 'نوع جديد (' + st.tt + ')' }), name, explain, el('div', { className: 'row', style: 'margin-top:6px' }, ok, no, tmsg)));
      } else {
        const add = el('button', { type: 'button', className: 'chip', textContent: '+ نوع جديد', style: 'border-style:dashed;margin-top:6px' });
        add.onclick = () => { st.newType = true; draw(); };
        const manage = el('button', { type: 'button', className: 'chip', textContent: 'الأنواع المقترحة', style: 'margin-top:6px' });
        manage.onclick = () => openScreen('الأنواع المقترحة', typesView());
        parts.push(el('div', { className: 'chips' }, add, TYPES.length ? manage : null));
      }
    }
    const t = typeOf(st.ctype);
    if (t) {
      parts.push(el('div', { className: 'hint', textContent: 'ℹ️ ' + t.h + (t.lv && !t.lv.startsWith('choose') ? ' (' + t.lv + ' تلقائياً)' : '') }));
      if (t.f.includes('day') || t.f.includes('day1')) parts.push(lbl(st.ctype === 'أيام التفرّغ' ? 'أيام التفرّغ' : 'الأيام'), chips(DAYS, st.days, v => { st.days = t.f.includes('day1') ? [v] : toggle(st.days, v); }));
      if (t.f.includes('per') || t.f.includes('per1')) parts.push(lbl(st.ctype === 'الحصص المسموحة' ? 'الحصص التي يحضر فيها' : st.ctype === 'لا حصّة' ? 'الحصص الممنوعة' : 'الحصص'),
        chips(t.f.includes('per1') ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7], st.per, v => { st.per = t.f.includes('per1') ? [v] : toggle(st.per, v); }, true));
      if (t.f.includes('num')) parts.push(lbl(st.ctype === 'عدد الحصص الأخيرة' ? 'السقف في الأسبوع' : st.ctype === 'توزيع المادّة في اليوم' ? 'الحدّ اليومي' : 'العدد'),
        chips(st.ctype === 'عدد الحصص الأخيرة' ? ['0', '1', '2', '3'] : ['1', '2', '3'], st.num, v => { st.num = v; }, true));
      if (t.f.includes('other')) {
        const s = el('select', {}, el('option', { value: '', textContent: 'المعلّم الآخر' }), ...depts().map(d => el('optgroup', { label: d },
          ...TEACHERS.filter(x => x.department === d).map(x => el('option', { value: x.nick || x.name, textContent: x.nick || x.name })))));
        if (st.other && ![...s.options].some(o => o.value === st.other)) s.append(el('option', { value: st.other, textContent: st.other }));
        s.value = st.other; s.onchange = () => { st.other = s.value; preview(); };
        parts.push(lbl('المعلّم الآخر'), s);
      }
      if (t.f.includes('free')) { const i = el('input', { value: st.free, placeholder: 'القيمة (اختيارية)', maxLength: 500 }); i.oninput = () => { st.free = i.value; preview(); }; parts.push(lbl('القيمة'), i); }
      const lv = levelOf(st, t);
      if (t.lv.startsWith('choose')) parts.push(lbl('مستوى الإلزام'), chips(t.lv === 'choose-nw' ? ['صلب', 'مرن'] : ['صلب', 'مرن موزون'], st.level, v => { st.level = v; }));
      if (lv === 'مرن موزون') {
        const w = el('input', { className: 'w', type: 'number', inputMode: 'numeric', min: 0, value: st.weight, placeholder: 'الوزن' });
        w.oninput = () => { st.weight = w.value; preview(); };
        parts.push(lbl('الوزن'), el('div', { className: 'row', style: 'margin-top:0' }, chips([['10', '10 خفيف'], ['30', '30'], ['50', '50 عادي'], ['100', '100 قوي'], ['300', '300 قوي جداً']], String(st.weight), v => { st.weight = v; }), w));
      }
      parts.push(lbl('مفعَّل'), chips([['1', 'نعم'], ['0', 'لا']], st.active ? '1' : '0', v => { st.active = v === '1'; }));
    }
    parts.push(lbl('المدة'), chips(DURS, st.duration, v => { st.duration = v; }));
    const why = el('textarea', { value: st.reason, placeholder: 'ملاحظة: سبب القيد (اختيارية)', maxLength: 3000 });
    why.oninput = () => { st.reason = why.value; };
    parts.push(lbl('ملاحظة'), why, pv);
    const save = el('button', { type: 'button', textContent: 'حفظ القيد' });
    const saveLink = el('button', { type: 'button', className: 'ghost', textContent: 'حفظ وإضافة قيد مرتبط' });
    const cancel = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
    save.onclick = () => submit(false); saveLink.onclick = () => submit(true); cancel.onclick = onCancel || closeScreen;
    parts.push(el('div', { className: 'row' }, save, rule || fixed ? null : saveLink, cancel, fmsg));
    box.replaceChildren(...parts);
    onFab(box, save, cancel);
    preview();
  }
  async function submit(another) {
    const t = typeOf(st.ctype);
    const need = !st.target ? 'اختر الهدف' : !t ? 'اختر نوع القيد' : '';
    if (need) { fmsg.textContent = need; return toast(need, true); }
    const v = valueOf(st), lv = levelOf(st, t);
    const missing = (t.f.includes('day') || t.f.includes('day1')) && !st.days.length ? 'اختر الأيام'
      : (t.f.includes('per') || t.f.includes('per1')) && !st.per.length ? 'اختر الحصص'
      : t.f.includes('num') && st.num === '' ? 'اختر العدد' : t.f.includes('other') && !st.other ? 'اختر المعلّم الآخر'
      : lv === 'مرن موزون' && (st.weight === '' || Number(st.weight) < 0) ? 'اكتب الوزن' : '';
    if (missing) { fmsg.textContent = missing; return toast(missing, true); }
    const f = { target_type: st.tt, target: st.target, ctype: st.ctype, pattern: t.pattern || '', value: v, level: lv,
      weight: lv === 'مرن موزون' ? Number(st.weight) : null, active: st.active, duration: st.duration, reason: st.reason.trim(),
      department: deptOf(st.tt, st.target) };
    f.text = lineOf(f);
    // The label: a proposed type waits for the sheet; a changed constraint waits to be written there again.
    const same = rule && ['target_type', 'target', 'ctype', 'value'].every(k => rule[k] === f[k]) && rule.active === f.active;
    f.sheet_state = isProposed(st.ctype) ? 'نوع مقترح' : same ? rule.sheet_state : st.tt === 'بارامتر' ? 'مسجّل' : 'غير مسجّل';
    f.link_id = rule ? rule.link_id : link ? link.id : null;
    box.querySelectorAll('button').forEach(b => { b.disabled = true; });
    fmsg.textContent = 'جارٍ الحفظ...';
    try {
      const o = await call('rule_save', { ...f, id: rule ? rule.id : undefined, request_id: request ? request.id : undefined });
      toast(o.warning || 'حُفظ ✓', !!o.warning);
      if (RULES) {
        if (rule) Object.assign(rule, f);
        else RULES.push({ id: o.id, created_at: new Date().toISOString(), request_id: null, ...f });
      }
      if (onSaved) onSaved();
      // The second constraint of a pair (e.g. two teachers whose last periods must not meet) takes this screen's place.
      if (another) replaceScreen('قيد مرتبط', builder({ link: (RULES || []).find(x => x.id === o.id) || { id: o.id, ...f } }));
      else if (!fixed) closeScreen();
    } catch (e) { fmsg.textContent = e; box.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }
  draw();
  return box;
}

// ---- Proposed types: named in the sheet's style, until the sheet's developer adds them ----
function typesView(editing) {
  const box = el('div');
  const renderTypes = e => replaceScreen('الأنواع المقترحة', typesView(e));
  const form = t => {
    const name = el('input', { value: t ? t.name : '', placeholder: 'اسم النوع بنسق أسماء ورقة «القيود»', maxLength: 120 });
    let targets = t ? t.targets.split('،') : ['معلّم'];
    const tchips = el('div');
    const drawT = () => tchips.replaceChildren(el('div', { className: 'chips' }, ...['معلّم', 'مادّة', 'دور'].map(v => {
      const b = el('button', { type: 'button', className: 'chip' + (targets.includes(v) ? ' on' : ''), textContent: v });
      b.onclick = () => { targets = targets.includes(v) ? targets.filter(x => x !== v) : [...targets, v]; drawT(); };
      return b;
    })));
    drawT();
    const explain = el('textarea', { value: t ? t.explain : '', placeholder: 'شرحه لمطور الشيت: ما الذي يمنعه أو يلزمه البرنامج', maxLength: 2000 });
    const save = el('button', { type: 'button', textContent: 'حفظ' });
    const cancel = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
    const fmsg = el('span', { className: 'meta' });
    cancel.onclick = () => renderTypes();
    save.onclick = async () => {
      save.disabled = true;
      try {
        await call('type_save', { old: t ? t.name : '', name: name.value.trim(), targets, explain: explain.value.trim() });
        toast('حُفظ ✓'); await loadRules(); renderTypes();
      } catch (e) { fmsg.textContent = e; save.disabled = false; }
    };
    return onFab(el('div', { className: 'cform', style: 'margin-top:8px' }, name, el('div', { className: 'lbl', textContent: 'نوع الهدف', style: 'font-weight:700;color:var(--navy);font-size:14px;margin:8px 0 4px' }), tchips, explain, el('div', { className: 'row' }, save, cancel, fmsg)), save);
  };
  const items = TYPES.map(t => {
    if (editing === t.name) return form(t);
    const edit = el('button', { type: 'button', className: 'ib', textContent: '✏️', title: 'تعديل' });
    edit.onclick = () => renderTypes(t.name);
    const del = delButton('حذف النوع', async () => { await call('type_delete', { name: t.name }); toast('حُذف ✓'); await loadRules(); renderTypes(); });
    return el('div', { className: 'rule soft' }, el('div', { className: 'top' }, el('span', { className: 'ct', textContent: '🆕 ' + t.name }),
      el('span', { className: 'tx', textContent: (t.explain || '—') + ' (' + t.targets + ')' }), edit, del));
  });
  const add = el('button', { type: 'button', className: 'ghost', textContent: '+ نوع مقترح جديد', style: 'width:100%;border-style:dashed;margin-top:8px' });
  add.onclick = () => add.replaceWith(form(null));
  box.replaceChildren(
    el('p', { className: 'lead', style: 'font-size:14px', textContent: 'أنواع ليست في ورقة «القيود» بعد؛ قيودها موسومة 🆕 حتى يضيفها مطور الشيت.' }),
    ...(items.length ? items : [el('div', { className: 'meta', textContent: 'لا أنواع مقترحة بعد' })]), editing === 'new' ? form(null) : add);
  return box;
}

// ---- CSV: platform → sheet «القيود بلغة عرفية (حيدر)» ----
const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const EXPORT_HEAD = ['م', ...SHEET_COLS, 'المدة', 'الوسم', 'القسم', 'شرح النوع المقترح'];
$('rulesCsv').onclick = async () => {
  if (!RULES) await loadRules();
  const rows = DURS.flatMap(d => ordered((RULES || []).filter(r => r.duration === d && r.target_type !== 'بارامتر')))
    .flatMap(r => r.target_type === 'ظرف' ? membersOf(r.target).map(m => ({ ...r, target_type: 'معلّم', target: m, reason: r.reason + ' (ظرف: ' + r.target + ')', department: (teacherOf(m) || {}).department || r.department })) : [r])
    .map((r, i) => [i + 1, ...rowOf(r), r.duration, r.sheet_state, r.department, (TYPES.find(t => t.name === r.ctype) || {}).explain || '']);
  const csv = '﻿' + [EXPORT_HEAD, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'قيود_المنصة_' + new Date().toISOString().slice(0, 10) + '.csv' });
  document.body.append(a); a.click(); a.remove();
  toast('صُدِّر ' + rows.length + ' قيداً ✓');
};

// ---- CSV: sheet «القيود» (section three) → the labels here ----
function parseCsv(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.join('').trim());
}
// Matching ignores spacing, the comma's shape, digit shapes and hamza/ta marbuta spelling.
const keyVal = v => fold(digits(String(v ?? ''))).replace(/[،,]/g, ',').replace(/\s+/g, '');
const keyOf = (target, ctype, value) => [fold(target).replace(/\s+/g, ' ').trim(), fold(ctype).trim(), keyVal(value)].join('|');
$('sheetImport').onclick = () => $('sheetFile').click();
$('sheetFile').onchange = async () => {
  const f = $('sheetFile').files[0]; $('sheetFile').value = '';
  if (!f) return;
  try {
    if (!RULES) await loadRules();
    const rows = parseCsv(await f.text());
    const head = (rows.shift() || []).map(h => fold(h).trim());
    const col = n => head.indexOf(fold(n));
    if (col('الهدف') < 0 || col('نوع القيد') < 0) throw 'الملف ليس ملف قيود الشيت: لا عمودَي «الهدف» و«نوع القيد»';
    const get = (row, n) => { const i = col(n); return i < 0 ? '' : String(row[i] ?? '').trim(); };
    const sheet = rows.map(row => Object.fromEntries(SHEET_COLS.map(n => [n, get(row, n)]))).filter(x => x['الهدف'] && x['نوع القيد']);
    const byKey = new Map(sheet.map(x => [keyOf(x['الهدف'], x['نوع القيد'], x['القيمة']), x]));
    const sheetTypes = new Set(sheet.map(x => fold(x['نوع القيد'])));
    const states = {}, used = new Set();
    for (const r of RULES) {
      if (r.target_type === 'بارامتر') continue;
      // A circumstance: registered when every member has the row, idle when one of them has it switched off.
      const ks = r.target_type === 'ظرف' ? membersOf(r.target).map(m => keyOf(m, r.ctype, r.value)) : [keyOf(r.target, r.ctype, r.value)];
      const hits = ks.map(k => byKey.get(k));
      const all = ks.length && hits.every(Boolean);
      const next = all ? (hits.every(h => fold(h['مفعَّل']) === fold('نعم')) ? 'مسجّل' : 'خامل') : isProposed(r.ctype) && !sheetTypes.has(fold(r.ctype)) ? 'نوع مقترح' : 'غير مسجّل';
      ks.forEach((k, i) => { if (hits[i]) used.add(k); });
      if (next !== r.sheet_state) states[r.id] = next;
    }
    const n = Object.keys(states).length;
    if (n) await call('rules_state', { states });
    RULES.forEach(r => { if (states[r.id]) r.sheet_state = states[r.id]; });
    renderRules();
    showReport(sheet.length, n, sheet.filter(x => !used.has(keyOf(x['الهدف'], x['نوع القيد'], x['القيمة']))));
    toast('حُدِّثت الوسوم ✓');
  } catch (e) { toast(e, true); }
};
function showReport(total, changed, missing) {
  const box = el('div');
  const count = s => (RULES || []).filter(r => r.sheet_state === s).length;
  const fromSheet = x => {
    const tt = ['معلّم', 'مادّة', 'دور'].find(v => fold(v) === fold(x['نوع الهدف'])) || 'معلّم';
    const r = { target_type: tt, target: x['الهدف'], ctype: x['نوع القيد'], pattern: x['النمط'], value: x['القيمة'], level: x['مستوى الإلزام'],
      weight: x['الوزن'] === '' ? null : Number(digits(x['الوزن'])), active: fold(x['مفعَّل']) === fold('نعم'), reason: x['ملاحظة'] || 'من الشيت',
      duration: tt === 'معلّم' ? 'شبه دائمة' : 'دائمة', department: deptOf(tt, x['الهدف']) };
    return { ...r, text: lineOf(r), sheet_state: r.active ? 'مسجّل' : 'خامل' };
  };
  const addOne = async x => { const f = fromSheet(x); const o = await call('rule_save', f); RULES.push({ id: o.id, request_id: null, ...f }); };
  const list = el('ul', {}, ...missing.map(x => {
    const b = el('button', { type: 'button', className: 'ib', textContent: 'إضافة' });
    const li = el('li', {}, [x['نوع الهدف'], x['الهدف'], x['نوع القيد'], x['القيمة'], x['مستوى الإلزام'], x['مفعَّل'] === 'لا' ? 'غير مفعَّل' : ''].filter(Boolean).join(' · ') + ' ', b);
    b.onclick = async () => {
      b.disabled = true;
      try { await addOne(x); li.remove(); missing = missing.filter(y => y !== x); renderRules(); toast('أُضيف ✓'); }
      catch (e) { toast(e, true); b.disabled = false; }
    };
    return li;
  }));
  const all = el('button', { type: 'button', textContent: 'إضافة الكل (' + missing.length + ')' });
  all.onclick = async () => {
    all.disabled = true;
    try { for (const x of [...missing]) await addOne(x); toast('أُضيف ' + missing.length + ' ✓'); closeScreen(); }
    catch (e) { toast(e, true); all.disabled = false; }
  };
  const close = el('button', { type: 'button', className: 'ghost', textContent: 'إغلاق' });
  close.onclick = closeScreen;
  box.replaceChildren(
    el('div', { textContent: 'في الملف ' + total + ' صفاً · تغيّر وسم ' + changed + ' قيداً.' }),
    el('div', { className: 'meta', textContent: '✅ مسجّل ' + count('مسجّل') + ' · ⏸️ خامل ' + count('خامل') + ' · ⏳ غير مسجّل ' + count('غير مسجّل') + ' · 🆕 نوع مقترح ' + count('نوع مقترح') }),
    ...(missing.length ? [el('div', { className: 'field', style: 'margin-top:8px' }, el('b', { textContent: 'في الشيت وليس في المنصة (' + missing.length + '):' })), list] : []),
    el('div', { className: 'row' }, missing.length ? all : null, close));
  openScreen('تقرير الاستيراد', box);
}

// ---- Coverage and the week grid (spec 2026-10-13): roles, departments and their subjects, circumstances, then every teacher ----
// Roles and circumstances are groups named here, their members chosen by hand; a wing is a role under «مشرفو الأجنحة».
const subjectsOf = t => [t.subject, t.subject2].filter(Boolean);
const nickT = t => t.nick || t.name;
const sameName = (a, b) => fold(a).replace(/\s+/g, '') === fold(b).replace(/\s+/g, '');
const kindOf = g => g.kind || 'ظرف';
const roles = () => GROUPS.filter(g => kindOf(g) === 'دور');
const circs = () => GROUPS.filter(g => kindOf(g) === 'ظرف');
const membersOf = g => ((GROUPS.find(x => x.name === g) || {}).members || '').split('،').filter(Boolean);
const isMember = (g, t) => membersOf(g).some(m => sameName(m, nickT(t)));
// A teacher's roles: those that name it, and the role above each (a wing → «مشرفو الأجنحة»).
const rolesOf = t => [...new Set(roles().filter(g => isMember(g.name, t)).flatMap(g => [g.name, g.parent].filter(Boolean)))];
const circsOf = t => circs().filter(g => isMember(g.name, t)).map(g => g.name);
const sourcesOf = t => [['قسم', t.department], ...subjectsOf(t).map(s => ['مادّة', s]), ...rolesOf(t).map(s => ['دور', s]), ...circsOf(t).map(s => ['ظرف', s])];
const rowsOf = (tt, target) => (RULES || []).filter(r => r.target_type === tt && (tt === 'معلّم' ? sameName(r.target, target) : r.target === target));
const inheritedOf = t => sourcesOf(t).flatMap(([tt, s]) => rowsOf(tt, s)).filter(r => r.active !== false);
const teachersIn = (tt, target) => TEACHERS.filter(t => tt === 'قسم' ? t.department === target : tt === 'مادّة' ? subjectsOf(t).includes(target) : tt === 'دور' ? rolesOf(t).includes(target) : circsOf(t).includes(target));
// A department's subjects (several: a tab each, after «كل القسم»).
const deptSubjects = d => SUBJECTS.filter(x => x.d === d).map(x => x.s);
const deptCount = d => rowsOf('قسم', d).length + deptSubjects(d).reduce((n, s) => n + rowsOf('مادّة', s).length, 0);
const TT_TITLE = { 'دور': 'دور', 'ظرف': 'ظرف', 'قسم': 'قسم', 'مادّة': 'قسم', 'معلّم': 'بطاقة' };
// Opens the page of a target: a subject opens its department on its tab.
function openTarget(tt, target) {
  if (tt === 'معلّم') return openScreen('بطاقة ' + target, gridPage('معلّم', target), () => gridPage('معلّم', target));
  if (tt === 'قسم') return openScreen('قسم ' + target, deptPage(target), () => deptPage(target));
  if (tt === 'مادّة') { const d = (SUBJECTS.find(x => x.s === target) || {}).d || target; return openScreen('قسم ' + d, deptPage(d, target), () => deptPage(d, target)); }
  openScreen(TT_TITLE[tt] + ': ' + target, gridPage(tt, target), () => gridPage(tt, target));
}
// A folded list: its title (and count) opens it; it remembers being open while the page lives.
const OPEN = new Set();
function foldBox(key, title, n, ...kids) {
  const d = el('details', { className: 'fold' }, el('summary', {}, el('b', { textContent: title }), n !== undefined ? el('small', { textContent: ' (' + n + ')' }) : null), el('div', { className: 'fbody' }, ...kids.filter(Boolean)));
  d.open = OPEN.has(key);
  d.ontoggle = () => { if (d.open) OPEN.add(key); else OPEN.delete(key); };
  return d;
}

$('rvCover').onclick = () => { RVIEW = 'cover'; renderRules(); };
$('rvList').onclick = () => { RVIEW = 'list'; renderRules(); };

// Line icons for the three sections (drawn, so they follow the page's colours).
const ICONS = {
  roles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.3c2.3.2 4 1.8 4.5 4.7"/></svg>',
  depts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 5l9 5.5"/><path d="M5 10v8M9.7 10v8M14.3 10v8M19 10v8"/><path d="M3 20h18"/></svg>',
  circs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8.5 11.5h2l1-2 1.5 4 1-2h1.5"/></svg>',
};
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
// «التغطية»: three sections, each a card that unfolds into tiles (name, teachers, constraints).
function renderCover() {
  const tile = (tt, target, label, sub) => {
    const n = tt === 'قسم' ? deptCount(target) : rowsOf(tt, target).length;
    const m = teachersIn(tt, target).length;
    const b = el('button', { type: 'button', className: 'tile' + (n ? ' has' : '') + (sub ? ' sub' : '') },
      el('span', { className: 'tn', textContent: label }),
      el('span', { className: 'tm' }, el('span', { textContent: plural(m, 'معلم', 'معلمين') }), el('span', { className: 'tc', textContent: n ? plural(n, 'قيد', 'قيود') : 'بلا قيود' })));
    b.onclick = () => openTarget(tt, target);
    return b;
  };
  const addTile = (label, onClick) => { const b = el('button', { type: 'button', className: 'tile add', textContent: label }); b.onclick = onClick; return b; };
  const section = (key, title, icon, items, done, ...kids) => {
    const d = el('details', { className: 'sec' });
    const ic = el('span', { className: 'ic' }); ic.innerHTML = ICONS[icon];
    d.append(el('summary', {}, ic, el('span', { className: 'st' }, el('b', { textContent: title }), el('small', { textContent: items ? 'العدد ' + items + ' · بقيود ' + done : 'لا شيء بعد' }))),
      el('div', { className: 'tiles' }, ...kids.filter(Boolean)));
    d.open = OPEN.has(key);
    d.ontoggle = () => { if (d.open) OPEN.add(key); else OPEN.delete(key); };
    return d;
  };
  // Roles: each main role, then its sub-roles (the wings) right after it.
  const top = roles().filter(g => !g.parent || !roles().some(p => p.name === g.parent));
  const roleTiles = top.flatMap(g => [tile('دور', g.name, g.name), ...roles().filter(x => x.parent === g.name).map(x => tile('دور', x.name, x.name, true))]);
  const deptsHere = [...new Set(TEACHERS.map(t => t.department))].sort((a, b) => deptRank(a) - deptRank(b) || a.localeCompare(b, 'ar'));
  const imp = el('button', { type: 'button', className: 'tile add', textContent: '⇪ استيراد CSV المعلمين' });
  const file = el('input', { type: 'file', accept: '.csv,text/csv', className: 'hidden' });
  imp.onclick = () => file.click();
  file.onchange = () => { const f = file.files[0]; file.value = ''; if (f) importTeachers(f); };
  // The summary: constraints, teachers, and teachers with nothing at all yet.
  const all = (RULES || []).length;
  const bare = TEACHERS.filter(t => !inheritedOf(t).length && !rowsOf('معلّم', nickT(t)).length).length;
  const stat = (n, label, warn) => el('div', { className: 'stat' + (warn && n ? ' warn' : '') }, el('b', { textContent: n }), el('span', { textContent: label }));
  $('coverView').replaceChildren(
    el('div', { className: 'stats' }, stat(all, 'قيد'), stat(TEACHERS.length, 'معلم'), stat(bare, 'بلا قيد', true)),
    section('roles', 'الأدوار', 'roles', roles().length, roles().filter(g => rowsOf('دور', g.name).length).length,
      ...roleTiles, addTile('+ دور جديد', () => openScreen('دور جديد', groupForm(null, 'دور')))),
    section('depts', 'الأقسام', 'depts', deptsHere.length, deptsHere.filter(deptCount).length, ...deptsHere.map(d => tile('قسم', d, d)), imp, file),
    section('circs', 'الظروف', 'circs', circs().length, circs().filter(g => rowsOf('ظرف', g.name).length).length,
      ...circs().map(g => tile('ظرف', g.name, g.name)), addTile('+ ظرف جديد', () => openScreen('ظرف جديد', groupForm(null, 'ظرف')))));
}
const covLegend = () => el('div', { className: 'legend' }, el('span', { textContent: 'لا قيد', style: '--c:#fadcdc' }), el('span', { textContent: 'موروث فقط', style: '--c:#fff1cc' }), el('span', { textContent: 'له قيد خاص', style: '--c:#e2f4e8' }));
// A teacher's line: its name and «موروث · خاص», coloured by coverage.
function teacherLine(t) {
  const inh = inheritedOf(t).length, own = rowsOf('معلّم', nickT(t)).length;
  return el('div', { className: 'tline ' + (own ? 'cov2' : inh ? 'cov1' : 'cov0') },
    el('span', { className: 'nm', textContent: nickT(t) }), el('span', { className: 'ct', textContent: 'موروث ' + inh + ' · خاص ' + own }));
}

// The sheet «المعلمون» → subjects here (by User ID, then the nick); roles are chosen by hand (spec 2026-10-13).
async function importTeachers(f) {
  try {
    const rows = parseCsv(await f.text());
    const head = (rows.shift() || []).map(h => fold(h).trim());
    const col = n => head.indexOf(fold(n));
    if (col('اسم الشهرة') < 0 || col('المادة') < 0) throw 'الملف ليس ملف ورقة «المعلمون»: لا عمودَي «اسم الشهرة» و«المادة»';
    const get = (row, n) => { const i = col(n); return i < 0 ? '' : String(row[i] ?? '').trim(); };
    const list = rows.map(row => ({ nick: get(row, 'اسم الشهرة'), uid: get(row, 'User ID'), subject: get(row, 'المادة'), subject2: get(row, 'مادة ثانية'),
      category: get(row, 'الفئة'), wing_sup: fold(get(row, 'مشرف جناح؟')) === fold('نعم') })).filter(x => x.nick);
    const o = await call('teachers_sync', { rows: list });
    const fresh = await call('login');
    TEACHERS = fresh.teachers || TEACHERS;
    const absent = TEACHERS.filter(t => !list.some(x => (x.uid && x.uid === t.uid) || x.nick === t.nick)).map(nickT);
    renderRules();
    openScreen('تقرير استيراد المعلمين', el('div', {},
      el('div', { textContent: 'في الملف ' + list.length + ' معلماً · حُدِّث ' + o.n + '.' }),
      o.missing.length ? el('div', { className: 'field' }, el('b', { textContent: 'في الشيت وليس في المنصة (' + o.missing.length + '):' }), el('p', { textContent: o.missing.join('، ') })) : null,
      absent.length ? el('div', { className: 'field' }, el('b', { textContent: 'في المنصة وليس في الملف (' + absent.length + '):' }), el('p', { textContent: absent.join('، ') })) : null));
    toast('حُدِّث المعلمون ✓');
  } catch (e) { toast(e, true); }
}

// A role or a circumstance: its name, members (teachers) and a note; a role may sit under another (a wing under «مشرفو الأجنحة»).
function groupForm(g, kind) {
  kind = g ? kindOf(g) : kind;
  const word = kind === 'دور' ? 'الدور' : 'الظرف';
  let members = g ? membersOf(g.name) : [];
  const name = el('input', { value: g ? g.name : '', placeholder: kind === 'دور' ? 'اسم الدور (مثل: منسقو المواد)' : 'اسم الظرف (مثل: ظرف صحي)', maxLength: 120 });
  const parent = kind === 'دور' ? select(roles().filter(x => !x.parent && (!g || x.name !== g.name)).map(x => x.name), g ? g.parent : '', '— دور رئيسي —') : null;
  const note = el('textarea', { value: g ? g.note : '', placeholder: 'ملاحظة (اختيارية)', maxLength: 2000 });
  const box = el('div');
  const pick = el('select');
  const draw = () => {
    pick.replaceChildren(el('option', { value: '', textContent: '+ أضف معلماً' }), ...[...new Set(TEACHERS.map(t => t.department))].sort((a, b) => deptRank(a) - deptRank(b)).map(d =>
      el('optgroup', { label: d }, ...TEACHERS.filter(t => t.department === d && !members.includes(nickT(t))).map(t => el('option', { value: nickT(t), textContent: nickT(t) })))));
    box.replaceChildren(...members.map(m => { const b = el('button', { type: 'button', className: 'chip on', textContent: m + ' ✕' }); b.onclick = () => { members = members.filter(x => x !== m); draw(); }; return b; }));
  };
  pick.onchange = () => { if (pick.value) members.push(pick.value); draw(); };
  draw();
  const save = el('button', { type: 'button', textContent: 'حفظ' });
  const cancel = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
  const fmsg = el('span', { className: 'meta' });
  cancel.onclick = closeScreen;
  save.onclick = async () => {
    const f = { old: g ? g.name : '', name: name.value.trim(), kind, parent: parent ? parent.value : '', members, note: note.value.trim() };
    if (!f.name) return (fmsg.textContent = 'اكتب اسم ' + word);
    save.disabled = true;
    try {
      await call('group_save', f);
      const row = { name: f.name, kind, parent: f.parent, members: members.join('،'), note: f.note };
      if (g) {
        (RULES || []).forEach(r => { if (r.target_type === kind && r.target === g.name) r.target = f.name; });
        GROUPS.forEach(x => { if (x.parent === g.name) x.parent = f.name; });
        Object.assign(g, row);
      } else GROUPS.push(row);
      toast('حُفظ ✓'); closeScreen();
    } catch (e) { fmsg.textContent = e; save.disabled = false; }
  };
  const del = g ? delButton('حذف ' + word, async () => { await call('group_delete', { name: g.name }); GROUPS = GROUPS.filter(x => x !== g); toast('حُذف ✓'); history.go(-2); }) : null;
  const lbl = t => el('div', { className: 'lbl', textContent: t, style: 'font-weight:700;color:var(--navy);font-size:14px;margin:10px 0 5px' });
  return onFab(el('div', { className: 'cform' }, ...[name, parent ? lbl('تحت') : null, parent, lbl('الأعضاء'),
    el('div', { className: 'chips' }, box), el('div', { style: 'margin-top:6px' }, pick), note, el('div', { className: 'row' }, save, cancel, fmsg),
    del ? el('details', { className: 'danger' }, el('summary', { textContent: 'خيارات أخرى' }), el('div', { className: 'row' }, del, el('span', { className: 'meta', textContent: 'حذف ' + word })) ) : null].filter(Boolean)), save, cancel);
}

// A department: «كل القسم» first, then a tab for each of its subjects (a department of one subject has no tabs).
function deptPage(d, tab) {
  const subs = deptSubjects(d);
  const page = el('div');
  const draw = cur => {
    const tabs = subs.length > 1 ? el('div', { className: 'chips dtabs' }, ...[['قسم', d, 'كل القسم'], ...subs.map(s => ['مادّة', s, s])].map(([tt, target, label]) => {
      const n = rowsOf(tt, target).length;
      const b = el('button', { type: 'button', className: 'chip' + (target === cur ? ' on' : '') }, label, n ? el('small', { textContent: ' (' + n + ')' }) : null);
      b.onclick = () => draw(target);
      return b;
    })) : null;
    const tt = cur === d ? 'قسم' : 'مادّة';
    page.replaceChildren(...[tabs, gridPage(tt, cur, { onSaved: () => draw(cur) })].filter(Boolean));
  };
  draw(tab && subs.includes(tab) && subs.length > 1 ? tab : d);
  return page;
}

// The cell menu: «فارغ» · صلب · مرن 10 … 300 · مرن (a weight written by hand), and the switch ثابت / مؤقت (ثابت by default).
// On a teacher's inherited cell: «كما الموروث» drops the teacher's own cell, «فارغ» exempts the teacher from it.
// The same menu serves the stickers: `levels` says which bindings a sticker takes ('soft', 'fixed', 'none'), `extra` adds the stickers of a place,
// and 'off' leaves the stickers alone (the corner «الأسبوع»).
const WEIGHTS = [10, 30, 50, 100, 300];
function cellMenu({ title, cur, inh, onPick, extra, levels = 'all', nullLabel = 'فارغ' }) {
  let dur = cur ? cur.dur || 'ثابتة' : 'ثابتة';
  const veil = el('div', { className: 'veil' });
  const sheet = el('div', { className: 'sheetMenu', role: 'dialog' });
  const close = () => { veil.remove(); sheet.remove(); };
  veil.onclick = close;
  const pickIt = v => { close(); onPick(v); };
  const isCur = v => v === null ? !cur : !!cur && Grid.same(cur, { ...v, dur: cur.dur });
  const opt = (label, v, cls) => {
    const b = el('button', { type: 'button', className: 'opt' + (cls ? ' ' + cls : '') + (isCur(v) ? ' on' : ''), textContent: label });
    b.onclick = () => pickIt(v && { ...v, dur });
    return b;
  };
  const durSw = el('div', { className: 'durSw' });
  const drawSw = () => durSw.replaceChildren(...DURS.map(d => {
    const b = el('button', { type: 'button', className: d === dur ? 'on' : '', textContent: d === 'مؤقتة' ? '⏳ مؤقت' : 'ثابت' });
    b.onclick = () => { dur = d; drawSw(); };
    return b;
  }));
  drawSw();
  const w = el('input', { type: 'number', inputMode: 'numeric', min: 0, placeholder: 'الوزن', value: cur && cur.lv === 'مرن موزون' && !WEIGHTS.includes(cur.w) ? cur.w : '' });
  const wOk = el('button', { type: 'button', className: 'opt soft', textContent: 'مرن ✓' });
  wOk.onclick = () => { const n = Number(digits(w.value)); if (w.value === '' || !(n >= 0)) return w.focus(); pickIt({ lv: 'مرن موزون', w: Math.floor(n), dur }); };
  const inhText = inh ? (inh.lv === 'صلب' ? 'صلب' : inh.lv === 'مرن موزون' ? 'مرن ' + (inh.w ?? '؟') : 'مفعّل') : '';
  const weighted = levels === 'all' || levels === 'soft';
  // The weights fold behind one «مرن ▾» (open when the cell is already soft).
  const softBox = el('div', { className: 'softBox' + (cur && cur.lv === 'مرن موزون' ? '' : ' hidden') },
    el('div', { className: 'opts' }, ...WEIGHTS.map(n => opt('مرن ' + n, { lv: 'مرن موزون', w: n }, 'soft'))), el('div', { className: 'wrow' }, w, wOk));
  const softBtn = el('button', { type: 'button', className: 'opt soft' + (cur && cur.lv === 'مرن موزون' ? ' on' : ''), textContent: 'مرن ' + (cur && cur.lv === 'مرن موزون' ? cur.w : '') + ' ▾' });
  softBtn.onclick = () => softBox.classList.toggle('hidden');
  const opts = levels === 'off' ? [] : [
    inh ? opt('كما الموروث (' + inhText + ')', null, 'same') : null,
    inh ? opt('فارغ (إعفاء)', { lv: 'إعفاء', w: null }, 'free') : opt(nullLabel, null, 'free'),
    levels === 'all' ? opt('صلب', { lv: 'صلب', w: null }, 'hard') : null,
    levels === 'fixed' ? opt('✓ مفعّل', { lv: 'صلب', w: null }, 'hard') : null,
    levels === 'none' ? opt('✓ مفعّل', { lv: '', w: null }, 'soft') : null,
    weighted ? softBtn : null].filter(Boolean);
  sheet.append(...[el('div', { className: 'mt', textContent: title }),
    opts.length ? el('div', { className: 'opts' }, ...opts) : null,
    weighted ? softBox : null,
    extra ? extra(close) : null,
    levels === 'off' ? null : durSw].filter(Boolean));
  document.body.append(veil, sheet);
}

// ---- Stickers (spec 2026-10-13 §12): every other kind of constraint is a sticker on a place of the grid:
// a period's number ('col'), a day's name ('day'), the corner «الأسبوع» ('week') or a cell ('cell').
// A sticker is one row: its type, its value (enc/dec), its binding: 'fixed' (always صلب), 'none' (no binding), 'soft' (مرن only), 'choose'.
const TEACHERISH = ['معلّم', 'دور', 'ظرف'];
const CLASSES = ['10/1', '10/2', '10/3', '10/4', '10/5', '10/6', '10/7', '11د1', '11د2', '11ع1', '11ع2', '11ع3', '11ع4', '11ع5', '12د1', '12ع1', '12ع2', '12ع3', '12ع4', '12ع5'];
const colAt = (p, x) => ({ pos: p, x });
const STICKERS = [
  { id: 'absP', place: 'col', for: TEACHERISH, ctype: 'غائب في الحصة', lv: 'fixed', label: 'غائب في هذه الحصة',
    enc: p => String(p), dec: v => colAt(Number(v), ''), badge: () => 'غائب' },
  { id: 'cap7', place: 'col', at: [7], for: [...TEACHERISH, 'مادّة', 'قسم'], ctype: 'عدد الحصص الأخيرة', lv: 'fixed', label: 'حد أقصى في الأسبوع',
    input: { kind: 'num', opts: [0, 1, 2, 3], def: 1 }, enc: (p, x) => String(x), dec: v => colAt(7, v), badge: x => 'حد ' + x },
  { id: 'link7', place: 'col', at: [7], for: TEACHERISH, ctype: 'ربط السابعات', lv: 'soft', w: 5, label: 'سابعاته مع',
    input: { kind: 'teacher' }, enc: (p, x) => x, dec: v => colAt(7, v), badge: x => 'مع ' + x },
  { id: 'no67', place: 'col', at: [7], for: [...TEACHERISH, 'مادّة', 'قسم'], ctype: 'لا حصّتين أخيرتين متتاليتين', lv: 'choose', w: 50, label: 'لا تجتمع مع السادسة',
    enc: () => '', dec: () => colAt(7, ''), badge: () => 'لا 6+7' },
  { id: 'first', place: 'col', at: [1, 2], for: TEACHERISH, ctype: 'عدد الحصص الأولى', lv: 'choose', w: 50, label: 'يبدأ بها على الأقل (أيام)',
    input: { kind: 'num', opts: [1, 2, 3, 4, 5], def: 3 }, enc: (p, x) => p + ': ' + x, dec: v => colAt(Number(v.split(':')[0]), (v.split(':')[1] || '').trim()), badge: x => x + ' أيام+' },
  { id: 'subjClass', place: 'col', for: ['مادّة'], ctype: 'لا حصّة للمادّة في صفّ', lv: 'choose', label: 'لا حصة في الصف',
    input: { kind: 'class' }, enc: (p, x) => x + ': ' + p, dec: v => colAt(Number((v.split(':')[1] || '').trim()), v.split(':')[0].trim()), badge: x => 'لا ' + x },
  { id: 'absD', place: 'day', for: TEACHERISH, ctype: 'أيام التفرّغ', lv: 'fixed', label: 'غائب اليوم',
    enc: d => DAYS[d], dec: v => ({ pos: DAYS.indexOf(v), x: '' }), badge: () => 'غائب' },
  { id: 'dup', place: 'day', for: TEACHERISH, ctype: 'حصّة مكرّرة محجوبة', lv: 'choose', label: 'لا حصة مكررة فيه',
    enc: d => DAYS[d], dec: v => ({ pos: DAYS.indexOf(v), x: '' }), badge: () => 'لا مكررة' },
  { id: 'consec', place: 'week', for: TEACHERISH, ctype: 'يفضّل الحصص المتتابعة', lv: 'soft', w: 10, label: 'حصصه متتابعة' },
  { id: 'freeDay', place: 'week', for: [...TEACHERISH, 'مادّة'], ctype: 'يوم بلا حصص', lv: 'choose', w: 50, label: 'له يوم بلا حصص' },
  { id: 'late', place: 'week', for: TEACHERISH, ctype: 'يوم الاستئذان الصباحي', lv: 'choose', w: 200, label: 'يوم استئذان صباحي' },
  { id: 'noRev', place: 'week', for: TEACHERISH, ctype: 'يستثنى من يوم المراجعات', lv: 'none', label: 'يستثنى من يوم المراجعات' },
  { id: 'noMeet', place: 'week', for: TEACHERISH, ctype: 'إعفاء من اجتماع القسم', lv: 'none', label: 'لا يحضر اجتماع القسم' },
  { id: 'no6w7', place: 'week', for: TEACHERISH, ctype: 'لا سادسة بلا سابعة', lv: 'choose', w: 50, label: 'لا سادسة بلا سابعة' },
  { id: 'sync', place: 'week', for: TEACHERISH, ctype: 'عدم تزامن الحصص', lv: 'choose', label: 'لا تتزامن حصصه مع', input: { kind: 'teacher', cls: true } },
  { id: 'block', place: 'week', for: ['مادّة'], ctype: 'توزيع المادّة في اليوم', pattern: 'متتاليتان', lv: 'choose', label: 'حصصها كتلة متجاورة',
    input: { kind: 'num', opts: [2, 3], def: 2 } },
  { id: 'meet', place: 'cell', for: ['قسم', 'مادّة'], ctype: 'اجتماع القسم', lv: 'choose', label: 'اجتماع القسم',
    enc: k => { const [d, p] = k.split('|'); return DAYS[d] + ': ' + p; }, dec: v => { const [d, p] = v.split(':'); return { pos: Grid.key(DAYS.indexOf(d.trim()), Number(p)), x: '' }; } },
];
for (const s of STICKERS) if (s.place === 'week') { s.enc = s.enc || ((_, x) => String(x ?? '')); s.dec = s.dec || (v => ({ pos: 0, x: v })); }
const STICK_CT = Object.fromEntries(STICKERS.map(s => [s.ctype, s]));
const stickKey = (s, pos) => s.id + '|' + pos;
const isSticker = r => !!STICK_CT[r.ctype];
// A sticker row → { s, pos, x, lv, w, dur, key }; null when its value cannot be read.
function stickOf(r) {
  const s = STICK_CT[r.ctype];
  if (!s) return null;
  let d;
  try { d = s.dec(String(r.value ?? '')); } catch { return null; }
  if (d.pos === undefined || d.pos === null || Number.isNaN(d.pos) || d.pos === -1) return null;
  return { s, pos: d.pos, x: d.x, lv: r.level || '', w: r.level === 'مرن موزون' ? r.weight : null, dur: r.duration === 'مؤقتة' ? 'مؤقتة' : 'ثابتة', key: stickKey(s, d.pos), id: r.id };
}
// The default binding of a sticker when it is put on.
const stickDefault = s => s.lv === 'fixed' ? { lv: 'صلب', w: null } : s.lv === 'none' ? { lv: '', w: null } : s.w ? { lv: 'مرن موزون', w: s.w } : { lv: 'صلب', w: null };
const stickLevels = s => s.lv === 'choose' ? 'all' : s.lv;
const stickWhere = (s, pos) => s.place === 'col' ? 'الحصة ' + pos : s.place === 'day' ? DAYS[pos] : s.place === 'cell' ? (([d, p]) => DAYS[d] + ' ' + p)(String(pos).split('|')) : '';
// In the platform's words: «الحصة 7: حد أقصى في الأسبوع 1».
const stickText = (s, pos, x) => [stickWhere(s, pos), s.label + (x !== '' && x !== undefined && x !== null ? ' ' + x : '')].filter(Boolean).join(': ');
const sameStick = (a, b) => a.lv === b.lv && (a.lv !== 'مرن موزون' || a.w === b.w) && a.dur === b.dur && String(a.x ?? '') === String(b.x ?? '');

// The page of one target: its week grid, then (a role, department, subject or circumstance) its teachers, each with a grid of its own.
function gridPage(tt, target, opts = {}) {
  const page = el('div', { className: 'builder' + (opts.embedded ? ' embedded' : '') });
  const rows = rowsOf(tt, target);
  const managed = rows.filter(Grid.managed);
  const cells = new Map(Grid.fromRows(managed));
  const t = tt === 'معلّم' ? teacherOf(target) || TEACHERS.find(x => sameName(nickT(x), target)) : null;
  // Inherited cells (a teacher): the strongest of its layers, with where it comes from.
  const inh = new Map();
  const inhRows = t ? inheritedOf(t) : [];
  for (const r of inhRows.filter(Grid.managed)) for (const k of Grid.cellsOf(r)) {
    const o = inh.get(k), c = { lv: r.level, w: r.level === 'مرن موزون' ? r.weight : null, dur: Grid.cellOf(r).dur, src: targetLabel(r) };
    if (c.lv === 'إعفاء') continue;
    if (!o || Grid.rank(c) > Grid.rank(o)) inh.set(k, c);
  }
  // Stickers: the target's own (by place), and (a teacher) those its layers give; an own sticker on an inherited place is an exception.
  const stTT = tt;
  const own0 = new Map();
  for (const r of rows.filter(isSticker)) { const o = stickOf(r); if (o && o.s.for.includes(stTT)) own0.set(o.key, { ...o, row: r }); }
  const own = new Map([...own0].map(([k, v]) => [k, { ...v }]));
  const inhSt = new Map();
  for (const r of inhRows.filter(isSticker)) { const o = stickOf(r); if (o && o.s.for.includes('معلّم') && o.lv !== 'إعفاء') inhSt.set(o.key, { ...o, src: targetLabel(r) }); }
  const eff = key => { const o = own.get(key); return o ? (o.lv === 'إعفاء' ? null : o) : inhSt.get(key) || null; };
  const stickersAt = (place, pos) => STICKERS.filter(x => x.place === place && x.for.includes(stTT) && (!x.at || x.at.includes(pos)));
  const levelTxt = o => o.lv === 'صلب' ? 'صلب' : o.lv === 'مرن موزون' ? 'مرن ' + (o.w ?? '؟') : '';
  // A pick equal to the inherited sticker is no exception: the teacher's own sticker goes.
  const setStick = (key, st, pos, x, v) => {
    const i = inhSt.get(key);
    if (!v) return own.delete(key);
    const n = { s: st, pos, x, lv: v.lv, w: v.lv === 'مرن موزون' ? v.w : null, dur: v.dur || 'ثابتة', key };
    if (i && v.lv !== 'إعفاء' && sameStick(i, n)) own.delete(key); else own.set(key, n);
  };
  // The value a sticker needs: a number, a teacher (and a class), or a class.
  function inputFor(st, cur) {
    const sel = el('select', { className: 'sx' });
    if (st.input.kind === 'num') sel.append(...st.input.opts.map(n => el('option', { value: n, textContent: n })));
    else if (st.input.kind === 'class') sel.append(el('option', { value: '', textContent: 'الصف ▾' }), ...CLASSES.map(c => el('option', { value: c, textContent: c })));
    else sel.append(el('option', { value: '', textContent: 'معلم ▾' }), ...depts().map(d => el('optgroup', { label: d },
      ...TEACHERS.filter(x => x.department === d && nickT(x) !== target).map(x => el('option', { value: nickT(x), textContent: nickT(x) })))));
    const cls = st.input.cls ? el('select', { className: 'sx' }, el('option', { value: '', textContent: 'كل الصفوف' }), ...CLASSES.map(c => el('option', { value: c, textContent: c }))) : null;
    const m = st.input.cls && /^(.*?)\s*\((.*)\)$/.exec(cur || '');
    sel.value = String(m ? m[1] : cur !== '' && cur !== undefined && cur !== null ? cur : st.input.def ?? '');
    if (cls && m) cls.value = m[2];
    return { el: el('span', { className: 'sxs' }, sel, cls), sels: [sel, cls].filter(Boolean),
      get: () => sel.value === '' ? '' : sel.value + (cls && cls.value ? ' (' + cls.value + ')' : ''), focus: () => sel.focus() };
  }
  // The stickers of a place, in its menu: a tap on one that is off puts it on; on one that is on (or inherited), its binding.
  function stickSection(place, pos) {
    const defs = stickersAt(place, pos);
    if (!defs.length) return null;
    const name = { col: 'هذه الحصة', day: 'هذا اليوم', week: 'الأسبوع', cell: 'هذه الخانة' }[place];
    return close => el('div', { className: 'st' }, el('div', { className: 'lb', textContent: 'ملصقات ' + name }), ...defs.map(st => {
      const key = stickKey(st, pos), o = own.get(key), i = inhSt.get(key);
      const on = o && o.lv !== 'إعفاء' ? o : null, shown = on || (!o && i) || null;
      const inp = st.input ? inputFor(st, shown ? shown.x : '') : null;
      const box = el('div', { className: 'tg' + (on ? ' on' : shown ? ' inh' : o ? ' exc' : '') });
      const tail = o && o.lv === 'إعفاء' ? 'معفى ✎' : !o && i ? '🔒 ' + i.src : on ? [levelTxt(on), on.dur === 'مؤقتة' ? '⏳' : '', i ? '✎' : ''].filter(Boolean).join(' ') : '';
      box.append(...[el('span', { className: 'lbx', textContent: (on ? '✓ ' : shown ? '🔒 ' : '○ ') + st.label }), inp ? inp.el : null, el('span', { className: 'tail', textContent: tail })].filter(Boolean));
      if (inp) for (const sl of inp.sels) sl.onchange = () => { if (on) { on.x = inp.get(); draw(); } };
      box.onclick = e => {
        if (e.target.closest('select')) return;
        const x = inp ? inp.get() : '';
        if (inp && x === '') return inp.focus();
        close();
        if (!o && !i) { setStick(key, st, pos, x, { ...stickDefault(st), dur: 'ثابتة' }); return draw(); }
        cellMenu({ title: stickText(st, pos, x) + (i ? ' — موروث من ' + i.src : ''), cur: o || null, inh: i ? { lv: i.lv, w: i.w } : null,
          levels: stickLevels(st), nullLabel: 'حذف', onPick: v => { setStick(key, st, pos, x, v); draw(); } });
      };
      return box;
    }));
  }
  const note = el('textarea', { placeholder: 'ملاحظة: سبب القيد (اختيارية)', maxLength: 3000, rows: 2 });
  // A teacher's page: its roles and circumstances, chosen here and saved with the rest.
  const cls = t && !opts.embedded ? classify(t, () => drawPlan()) : null;
  const grid = el('div'), pv = el('div', { className: 'pv plan' }), fmsg = el('span', { className: 'meta' });
  // A pick equal to the inherited binding is no exception: the teacher's own cell goes.
  const set = (k, v) => {
    const i = inh.get(k);
    if (v && i && v.lv !== 'إعفاء' && Grid.same(v, { lv: i.lv, w: i.w, dur: v.dur }) && v.dur === 'ثابتة') v = null;
    if (v) cells.set(k, v); else cells.delete(k);
  };
  const menu = (title, ks, place, pos) => {
    const k0 = ks[0];
    const allInh = ks.every(k => inh.has(k));
    cellMenu({ title: title + (allInh ? ' — موروث من ' + inh.get(k0).src : ''), cur: cells.get(k0), inh: allInh ? inh.get(k0) : null,
      extra: place ? stickSection(place, pos) : null, onPick: v => { ks.forEach(k => set(k, v)); draw(); } });
  };
  const badgeOf = (place, pos) => stickersAt(place, pos).map(st => { const o = eff(stickKey(st, pos)); return o ? st.badge(o.x) : ''; }).filter(Boolean).join(' · ');
  function drawGrid() {
    // The corner «☰ الأسبوع (ن)»: the stickers of the whole week.
    const weekDefs = stickersAt('week', 0);
    const nWeek = weekDefs.filter(st => eff(stickKey(st, 0))).length;
    const corner = weekDefs.length ? el('button', { type: 'button', className: 'corner', textContent: '☰ الأسبوع' + (nWeek ? ' (' + nWeek + ')' : '') }) : null;
    if (corner) corner.onclick = () => cellMenu({ title: '☰ الأسبوع كله', levels: 'off', extra: stickSection('week', 0), onPick: () => {} });
    const bd = t => t ? el('span', { className: 'bd', textContent: t }) : null;
    const head = el('tr', {}, el('th', { className: 'd' }, corner), ...Grid.PERIODS.map(p => {
      const b = el('button', { type: 'button', textContent: p, title: 'الحصة ' + p + ' في كل الأيام' });
      b.onclick = () => menu('الحصة ' + p + ' — كل الأيام', Grid.DAYS.map((_, d) => Grid.key(d, p)), 'col', p);
      return el('th', {}, b, bd(badgeOf('col', p)));
    }));
    const absCol = p => STICKERS[0].for.includes(stTT) && eff(stickKey(STICKERS[0], p));
    const absDay = d => { const st = STICKERS.find(x => x.id === 'absD'); return st.for.includes(stTT) && eff(stickKey(st, d)); };
    const meetAt = k => { const st = STICKERS.find(x => x.id === 'meet'); return st.for.includes(stTT) && eff(stickKey(st, k)); };
    const body = Grid.DAYS.map((day, d) => {
      const db = el('button', { type: 'button', className: 'dayb', textContent: day, title: day + ' كله' });
      db.onclick = () => menu(day + ' — كل الحصص', Grid.PERIODS.map(p => Grid.key(d, p)), 'day', d);
      return el('tr', {}, el('th', { className: 'd' }, db, bd(badgeOf('day', d))), ...Grid.PERIODS.map(p => {
        const k = Grid.key(d, p), c = cells.get(k), i = inh.get(k);
        const b = el('button', { type: 'button' });
        const show = c || i;
        if (absCol(p) || absDay(d)) { b.className = 'abs'; b.textContent = 'غ'; b.title = 'غائب'; }
        else if (meetAt(k)) { b.className = 'meet'; b.textContent = 'اجتماع'; }
        else if (show) {
          b.className = c ? (c.lv === 'صلب' ? 'hard' : c.lv === 'إعفاء' ? 'free' : 'soft') : 'inh ' + (i.lv === 'صلب' ? 'ih' : 'is');
          b.textContent = show.lv === 'صلب' ? '✕' : show.lv === 'إعفاء' ? '—' : show.w ?? '؟';
          if (c && i) b.classList.add('exc');
          if (show.dur === 'مؤقتة') b.classList.add('tmp');
          b.title = [c && i ? 'استثناء من ' + i.src : i ? 'من ' + i.src : '', show.dur === 'مؤقتة' ? 'مؤقت' : ''].filter(Boolean).join(' · ');
        }
        b.onclick = () => menu(day + ' — الحصة ' + p, [k], stickersAt('cell', k).length ? 'cell' : null, k);
        return el('td', {}, b);
      }));
    });
    grid.replaceChildren(el('table', { className: 'wk' }, head, ...body));
  }
  const fmt = r => phrase({ ...r, target_type: tt, target }).split(' — ').slice(1).join(' — ');
  // The stickers that changed: the old row goes, the new one comes.
  function stickPlan() {
    const del = [], add = [];
    for (const [k, o] of own0) { const n = own.get(k); if (!n || !sameStick(o, n)) del.push(o.row); }
    for (const [k, n] of own) { const o = own0.get(k); if (!o || !sameStick(o, n)) add.push({ ctype: n.s.ctype, pattern: n.s.pattern || '', value: n.s.enc(n.pos, n.x), level: n.lv, weight: n.lv === 'مرن موزون' ? n.w : null, duration: n.dur }); }
    return { del, add };
  }
  function drawPlan() {
    const g = Grid.plan(managed, cells), sp = stickPlan();
    const p = { del: [...g.del, ...sp.del], add: [...g.add, ...sp.add] };
    const lines = [...p.del.map(r => el('div', { className: 'del', textContent: '− ' + fmt(r) })), ...p.add.map(r => el('div', { className: 'add', textContent: '+ ' + fmt(r) }))];
    pv.replaceChildren(...[el('b', { textContent: lines.length ? 'بعد الحفظ:' : 'لا تغيير' }), ...lines]);
    pv.classList.toggle('hidden', !lines.length);
    save.disabled = !lines.length && !(cls && cls._changed());
    return p;
  }
  function draw() { drawGrid(); drawPlan(); }
  const save = el('button', { type: 'button', textContent: 'حفظ' });
  save.onclick = async () => {
    const p = drawPlan();
    if (!p.add.length && !p.del.length && !(cls && cls._changed())) return (fmsg.textContent = 'لا تغيير');
    const add = p.add.map(r => {
      const f = { target_type: tt, target, ctype: r.ctype, pattern: r.pattern || '', value: r.value, level: r.level, weight: r.weight, active: true,
        duration: r.duration, reason: note.value.trim(), department: deptOf(tt, target), sheet_state: 'غير مسجّل', link_id: null };
      return { ...f, text: lineOf(f) };
    });
    save.disabled = true; fmsg.textContent = 'جارٍ الحفظ...';
    try {
      if (cls && cls._changed()) await cls._commit();
      if (p.add.length || p.del.length) {
        const o = await call('grid_save', { target_type: tt, target, del: p.del.map(r => r.id), add });
        const gone = new Set(p.del.map(r => r.id));
        RULES = RULES.filter(r => !gone.has(r.id)).concat(add.map((f, i) => ({ id: o.ids[i], created_at: new Date().toISOString(), request_id: null, checked: false, approved: false, sheet_text: '', ...f })));
      }
      toast('حُفظ ✓');
      if (opts.onSaved) opts.onSaved(); else page.replaceWith(gridPage(tt, target, opts));
    } catch (e) { fmsg.textContent = e; toast(e, true); save.disabled = false; }
  };

  // Above the grid: who this is, what it inherits, or whom it covers.
  const head = [];
  if (t && !opts.embedded) {
    const edit = el('button', { type: 'button', className: 'ib', textContent: '✏️', title: 'تعديل المعلم' });
    edit.onclick = () => openScreen('تعديل معلم', teacherForm(t));
    head.push(el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' },
      el('span', { className: 'meta', textContent: [t.department, ...subjectsOf(t)].filter((x, i, a) => a.indexOf(x) === i).join(' · ') }), edit),
      el('div', { className: 'hint', style: 'margin-top:4px' }, el('b', { textContent: 'يرث من: ' }), sourcesOf(t).map(([a, b]) => a === 'دور' ? b : a + ' ' + b).join(' · ')),
      cls);
  } else if (!t) {
    const g = GROUPS.find(x => x.name === target && kindOf(x) === tt);
    const ms = teachersIn(tt, target).map(nickT);
    head.push(el('div', { className: 'hint', style: 'margin-top:0' }, el('b', { textContent: 'يسري على ' + ms.length + ': ' }), ms.join('، ') || 'لا أعضاء بعد'));
    if (g) {
      const edit = el('button', { type: 'button', className: 'ghost', textContent: '✏️ الاسم والأعضاء', style: 'padding:6px 12px;font-size:14px' });
      edit.onclick = () => openScreen('تعديل ' + (tt === 'دور' ? 'الدور' : 'الظرف'), groupForm(g));
      head.push(el('div', { className: 'row', style: 'margin-top:6px' }, edit), g.note ? el('div', { className: 'meta', textContent: g.note }) : null);
    }
  }
  const legend = el('div', { className: 'legend' }, el('span', { textContent: 'صلب ✕', style: '--c:#f4c7c3' }), el('span', { textContent: 'مرن (الرقم = الوزن)', style: '--c:#cdebd8' }),
    el('span', { textContent: '⏳ مؤقت', style: '--c:#fff' }), t ? el('span', { textContent: 'موروث', style: '--c:#e9edf1' }) : null, t ? el('span', { textContent: '✎ استثناء', style: '--c:#fff' }) : null);
  // Other constraints of the target (from a request, before the grid): shown as they are.
  const stickIds = new Set([...own0.values()].map(o => o.row.id));
  const other = rows.filter(r => !Grid.managed(r) && !stickIds.has(r.id));
  page.append(...[...head, opts.embedded ? null : legend, grid,
    other.length ? el('div', { className: 'tsec' }, el('b', { textContent: 'قيود أخرى' }), ...other.map(r => miniRule(r))) : null,
    note, pv, el('div', { className: 'row' }, save, fmsg),
    t || opts.embedded ? null : memberList(tt, target)].filter(Boolean));
  draw();
  return onFab(page, save);
}
// Under a role, department or subject: its teachers, folded; a tap opens the teacher's own page. A department adds a teacher here.
function memberList(tt, target) {
  const list = teachersIn(tt, target).sort((a, b) => nickT(a).localeCompare(nickT(b), 'ar'));
  const add = tt === 'قسم' ? el('button', { type: 'button', className: 'chip', textContent: '+ معلم', style: 'border-style:dashed;margin-top:4px' }) : null;
  if (add) add.onclick = () => openScreen('معلم جديد', teacherForm(null, target));
  if (!list.length && !add) return null;
  return foldBox('m|' + tt + '|' + target, 'المعلمون', list.length, covLegend(), ...list.map(t => {
    const line = teacherLine(t);
    line.onclick = () => openTarget('معلّم', nickT(t));
    return line;
  }), add);
}
// A teacher's roles and circumstances, chosen by hand here; saved with the page («✓»).
function classify(t, onChange) {
  const nick = nickT(t);
  const all = [...roles(), ...circs()];
  const on = new Set(all.filter(g => membersOf(g.name).some(m => sameName(m, nick))).map(g => g.name));
  const start = new Set(on);
  const changedGroups = () => all.filter(g => on.has(g.name) !== start.has(g.name));
  const box = el('div', { className: 'tsec', style: 'margin-top:8px' });
  const draw = () => {
    const chip = g => {
      const b = el('button', { type: 'button', className: 'chip' + (on.has(g.name) ? ' on' : ''), textContent: (g.parent ? '↲ ' : '') + g.name });
      b.onclick = () => { on.has(g.name) ? on.delete(g.name) : on.add(g.name); draw(); onChange(); };
      return b;
    };
    box.replaceChildren(...[el('b', { textContent: 'الأدوار والظروف', style: 'color:var(--navy)' }),
      el('div', { className: 'chips', style: 'margin-top:4px' }, ...roles().map(chip)), circs().length ? el('div', { className: 'chips', style: 'margin-top:6px' }, ...circs().map(chip)) : null].filter(Boolean));
  };
  box._changed = () => changedGroups().length > 0;
  box._commit = async () => {
    for (const g of changedGroups()) {
      const members = on.has(g.name) ? [...membersOf(g.name), nick] : membersOf(g.name).filter(m => !sameName(m, nick));
      await call('group_save', { old: g.name, name: g.name, kind: kindOf(g), parent: g.parent || '', members, note: g.note || '' });
      g.members = members.join('،');
      on.has(g.name) ? start.add(g.name) : start.delete(g.name);
    }
  };
  draw();
  return box;
}
// A teacher: name, nick, department and subjects; deleting it is folded away under «خيارات أخرى».
function teacherForm(t, dept) {
  const name = el('input', { value: t ? t.name : '', placeholder: 'الاسم الكامل', maxLength: 120 });
  const nick = el('input', { value: t ? t.nick || '' : '', placeholder: 'اسم الشهرة', maxLength: 120 });
  const dsel = select(DEPT_ORDER.filter(d => d !== 'التجاري'), t ? t.department : dept || '', 'القسم');
  const subj = el('select'), subj2 = el('select');
  const fillSubj = () => {
    const list = deptSubjects(dsel.value);
    const fill = (sel, cur, first) => { sel.replaceChildren(el('option', { value: '', textContent: first }), ...list.map(x => el('option', { value: x, textContent: x }))); sel.value = list.includes(cur) ? cur : ''; };
    fill(subj, subj.value || (t ? t.subject : list.length === 1 ? list[0] : ''), 'المادة');
    fill(subj2, subj2.value || (t ? t.subject2 : ''), 'مادة ثانية (اختيارية)');
  };
  dsel.onchange = fillSubj; fillSubj();
  const save = el('button', { type: 'button', textContent: 'حفظ' });
  const fmsg = el('span', { className: 'meta' });
  save.onclick = async () => {
    const f = { old: t ? t.name : '', name: name.value.trim(), nick: nick.value.trim(), department: dsel.value, subject: subj.value, subject2: subj2.value === subj.value ? '' : subj2.value };
    if (!f.name || !f.department) { fmsg.textContent = 'الاسم والقسم مطلوبان'; return toast(fmsg.textContent, true); }
    save.disabled = true;
    try {
      await call('teacher_save', f);
      const oldNick = t ? nickT(t) : '';
      TEACHERS = (await call('login')).teachers || TEACHERS;
      const newNick = f.nick || f.name;
      // Its constraints and memberships follow a new nick (the server did the same).
      if (oldNick && oldNick !== newNick) {
        (RULES || []).forEach(r => { if (r.target_type === 'معلّم' && sameName(r.target, oldNick)) r.target = newNick; });
        GROUPS.forEach(g => { g.members = membersOf(g.name).map(m => sameName(m, oldNick) ? newNick : m).join('،'); });
      }
      toast('حُفظ ✓');
      // A renamed teacher's page is the page of its new name.
      if (t && STACK.length > 1 && oldNick !== newNick) { addEventListener('popstate', () => setTimeout(() => openTarget('معلّم', newNick)), { once: true }); history.go(-2); } else closeScreen();
    } catch (e) { fmsg.textContent = e; toast(e, true); save.disabled = false; }
  };
  const del = t ? delButton('حذف المعلم', async () => {
    await call('teacher_delete', { name: t.name });
    TEACHERS = TEACHERS.filter(x => x !== t);
    RULES = (RULES || []).filter(r => !(r.target_type === 'معلّم' && sameName(r.target, nickT(t))));
    GROUPS.forEach(g => { g.members = membersOf(g.name).filter(m => !sameName(m, nickT(t))).join('،'); });
    toast('حُذف ✓'); history.go(-2);
  }) : null;
  const lbl = x => el('div', { textContent: x, style: 'font-weight:700;color:var(--navy);font-size:14px;margin:10px 0 4px' });
  return onFab(el('div', { className: 'cform' }, ...[lbl('الاسم الكامل'), name, lbl('اسم الشهرة'), nick, lbl('القسم'), dsel, lbl('المادة'), subj, subj2,
    el('div', { className: 'row' }, save, fmsg),
    del ? el('details', { className: 'danger' }, el('summary', { textContent: 'خيارات أخرى' }), el('div', { className: 'row' }, del, el('span', { className: 'meta', textContent: 'حذف المعلم وقيوده الخاصة' }))) : null].filter(Boolean)), save);
}
// A constraint line on a page: its words and binding; «⋯» opens its details (not ticked off here).
function miniRule(r) {
  const more = el('button', { type: 'button', className: 'more', textContent: '⋯', title: 'التفاصيل' });
  more.onclick = () => openScreen('تفاصيل القيد', ruleDetail(r));
  const box = el('div', { className: 'rule ' + ruleColor(r), style: 'cursor:default' });
  const redraw = () => box.querySelector('.appr').replaceWith(approveBtn(r, redraw));
  box.append(el('div', { className: 'top' }, el('span', { className: 'tx' }, phrase(r)),
    stateIcon(r), approveBtn(r, redraw), more));
  return box;
}

// ---- «المنصة القديمة»: the constraints as one long list of free text, and every request, until the two are merged ----
let OLD = null, OLD_TODAY = [], OVIEW = 'rules';
async function loadOld() {
  $('oldBody').replaceChildren(el('div', { className: 'meta', textContent: 'جارٍ التحميل...' }));
  try {
    const [o, l] = await Promise.all([call('old_rules'), call('list')]);
    OLD = o.rows; OLD_TODAY = o.today || []; ROWS = l.rows; renderOld();
  } catch (e) { $('oldBody').replaceChildren(el('div', { className: 'card meta', textContent: e })); }
}
$('ovRules').onclick = () => { OVIEW = 'rules'; renderOld(); };
$('ovReq').onclick = () => { OVIEW = 'req'; renderOld(); };
function renderOld() {
  $('ovRules').classList.toggle('on', OVIEW === 'rules'); $('ovReq').classList.toggle('on', OVIEW === 'req');
  if (!OLD) return;
  if (OVIEW === 'req') return renderOldReq();
  const done = OLD.filter(r => r.checked).length;
  const add = el('button', { textContent: '+ إضافة قيد' });
  add.onclick = () => openScreen('إضافة قيد', oldForm(null));
  const reset = el('button', { className: 'ghost', textContent: 'رفع الشطب عن الكل', style: 'padding:6px 12px;font-size:14px' });
  let armed = 0;
  reset.onclick = async () => {
    if (Date.now() - armed > 4000) { armed = Date.now(); reset.textContent = 'اضغط مرة أخرى للتأكيد'; reset.className = 'warn'; setTimeout(() => { if (Date.now() - armed >= 4000) renderOld(); }, 4100); return; }
    reset.disabled = true;
    try { await call('rules_reset', { old: true }); OLD.forEach(r => { r.checked = false; }); renderOld(); toast('رُفع الشطب ✓'); }
    catch (e) { toast(e, true); reset.disabled = false; }
  };
  $('oldBody').replaceChildren(
    el('div', { className: 'row', style: 'margin:0 0 10px;justify-content:space-between' }, add, el('span', { className: 'meta', textContent: 'مستوفى ' + done + ' من ' + OLD.length }), reset),
    el('div', { className: 'card', style: 'padding:10px' }, ...OLD.map((r, i) => oldLine(r, i + 1))));
}
function oldLine(r, n) {
  const box = el('div', { className: 'oldRule' + (r.checked ? ' done' : '') });
  const edit = el('button', { type: 'button', className: 'ib', textContent: '✏️', title: 'تعديل' });
  edit.onclick = () => openScreen('تعديل قيد', oldForm(r));
  const del = delButton('حذف القيد', async () => { await call('rule_delete', { id: r.id }); OLD = OLD.filter(x => x !== r); renderOld(); toast('حُذف ✓'); });
  box.append(el('span', { className: 'box', textContent: r.checked ? '✓' : '' }), el('span', { className: 'n', textContent: n }),
    el('div', { className: 'tx' }, el('div', { textContent: r.text }),
      el('div', { className: 'meta', textContent: [r.teacher ? nickOf(r.teacher) : '', r.department, r.level, r.reason ? 'السبب: ' + r.reason : ''].filter(Boolean).join(' · ') })),
    edit, del);
  box.onclick = async e => {
    if (e.target.closest('button')) return;
    r.checked = !r.checked; renderOld();
    try { await call('rule_check', { id: r.id, checked: r.checked }); } catch (err) { r.checked = !r.checked; renderOld(); toast(err, true); }
  };
  return box;
}
// The old form: the constraint in free text, the teacher (or «كل القسم»), the department, binding and reason.
function oldForm(r, from) {
  const f = r || from || {};
  const text = el('textarea', { value: f.text || '', placeholder: 'القيد', maxLength: 3000 });
  const dept = select([ALL, ...depts()], f.department || '', 'القسم');
  const who = el('select');
  const fillWho = () => {
    const cur = who.value || f.teacher || '';
    who.replaceChildren(el('option', { value: '', textContent: '— بلا معلم —' }), el('option', { value: 'كل القسم', textContent: 'كل القسم' }),
      ...TEACHERS.filter(t => !dept.value || dept.value === ALL || t.department === dept.value).map(t => el('option', { value: t.name, textContent: nickT(t) })));
    if (cur && ![...who.options].some(o => o.value === cur)) who.append(el('option', { value: cur, textContent: nickOf(cur) }));
    who.value = cur;
  };
  dept.onchange = fillWho; fillWho();
  const level = select(['صلب', 'مرن'], f.level || '', 'الإلزام');
  const reason = el('textarea', { value: f.reason || '', placeholder: 'السبب', maxLength: 3000 });
  const save = el('button', { type: 'button', textContent: 'حفظ' });
  const cancel = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
  const fmsg = el('span', { className: 'meta' });
  cancel.onclick = closeScreen;
  save.onclick = async () => {
    const v = { text: text.value.trim(), teacher: who.value, department: dept.value, level: level.value, reason: reason.value.trim() };
    if (!v.text) return (fmsg.textContent = 'اكتب القيد');
    save.disabled = true;
    try {
      const o = await call('old_rule_save', { ...v, id: r ? r.id : undefined });
      if (r) Object.assign(r, v); else OLD.push({ id: o.id, section: 'المنصة القديمة', checked: false, ...v });
      toast('حُفظ ✓'); closeScreen();
    } catch (e) { fmsg.textContent = e; save.disabled = false; }
  };
  const lbl = t => el('div', { textContent: t, style: 'font-weight:700;color:var(--navy);font-size:14px;margin:10px 0 4px' });
  return onFab(el('div', { className: 'cform' }, lbl('القيد'), text, lbl('القسم'), dept, lbl('المعلم'), who, lbl('الإلزام'), level, lbl('السبب'), reason,
    el('div', { className: 'row' }, save, cancel, fmsg)), save, cancel);
}
// The requests: those recovered from their constraints (the requests themselves were deleted), then the live ones.
function renderOldReq() {
  const card = (title, kids) => el('div', { className: 'card' }, el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' }, el('strong', { textContent: title }), el('span', { className: 'lost', textContent: 'نص الطلب الأصلي مفقود' })), ...kids);
  // Old constraints «من الطلبات»: one card per teacher and reason.
  const groups = new Map();
  for (const r of OLD.filter(x => x.section === 'من الطلبات')) {
    const k = r.teacher + '|' + r.department + '|' + (r.reason || '');
    if (!groups.has(k)) groups.set(k, { r, items: [] });
    groups.get(k).items.push(r.text);
  }
  const recovered = [...groups.values()].map(({ r, items }) => card(nickOf(r.teacher), [
    el('div', { className: 'meta', textContent: [r.department, r.created_at ? new Date(r.created_at).toLocaleDateString('ar-KW') : ''].filter(Boolean).join(' · ') }),
    field('السبب', r.reason), field('القيد', items.join('\n'))]));
  // Converted on 2026-10-12 in the new platform: their constraint stays there; «أضف إلى القيود القديمة» copies it here.
  const today = OLD_TODAY.map(r => {
    const t = teacherOf(r.target);
    const add = el('button', { className: 'ghost', textContent: 'أضف إلى القيود القديمة', style: 'margin-top:8px' });
    add.onclick = () => openScreen('إضافة قيد', oldForm(null, { text: lineOf(r), teacher: t ? t.name : r.target_type === 'معلّم' ? r.target : '', department: t ? t.department : r.department === ALL ? ALL : r.department, level: /مرن/.test(r.level) ? 'مرن' : r.level ? 'صلب' : '', reason: r.reason }));
    return card(r.target_type === 'معلّم' ? r.target : targetText(r), [
      el('div', { className: 'meta', textContent: [t ? t.department : '', new Date(r.created_at).toLocaleString('ar-KW')].filter(Boolean).join(' · ') }),
      field('السبب', r.reason), field('القيد (في المنصة الجديدة)', lineOf(r)), add]);
  });
  // Live requests: answering one adds an old constraint and marks it done; it is not deleted until the merge.
  const live = ROWS.map(r => {
    const c = el('div', { className: 'card' });
    const box = el('textarea', { value: r.note || '', placeholder: 'القيد', maxLength: 3000 });
    const save = el('button', { textContent: r.done ? 'أضف قيداً آخر' : 'حفظ القيد' });
    const fmsg = el('span', { className: 'meta' });
    save.onclick = async () => {
      const text = box.value.trim();
      if (!text) return (fmsg.textContent = 'اكتب القيد');
      const t = TEACHERS.find(x => x.name === r.name);
      save.disabled = true;
      try {
        const o = await call('old_rule_save', { text, teacher: r.name, department: r.department || (t || {}).department || '', level: '', reason: r.reason, request_id: r.id });
        OLD.push({ id: o.id, section: 'من الطلبات', teacher: r.name, department: r.department, text, reason: r.reason, checked: false, created_at: new Date().toISOString() });
        r.done = true; r.note = text; toast('حُفظ ✓'); renderOld();
      } catch (e) { fmsg.textContent = e; save.disabled = false; }
    };
    c.append(el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' }, el('strong', { textContent: nickOf(r.name) }), r.done ? el('span', { className: 'meta', textContent: 'تم ✓' }) : null),
      el('div', { className: 'meta', textContent: [r.department, new Date(r.created_at).toLocaleString('ar-KW')].filter(Boolean).join(' · ') }),
      field('الطلب', r.request), field('السبب', r.reason),
      r.phone ? el('div', { className: 'row', style: 'margin-top:0' }, waBtn(r.phone, r.name, r.request), el('a', { href: 'tel:+965' + r.phone, textContent: r.phone, dir: 'ltr' })) : null,
      el('div', { className: 'lbl', textContent: 'القيد', style: 'font-weight:700;color:var(--navy);font-size:14px;margin:8px 0 4px' }), box, el('div', { className: 'row' }, save, fmsg));
    return c;
  });
  const head = t => el('div', { className: 'grp', textContent: t });
  $('oldBody').replaceChildren(...[
    head('الطلبات الحالية (' + live.length + ')'), ...(live.length ? live : [el('div', { className: 'card meta', textContent: 'لا طلبات جديدة' })]),
    head('حُوّلت اليوم في المنصة الجديدة (' + today.length + ')'), ...today,
    head('مسترجعة من القيود القديمة (' + recovered.length + ')'), ...recovered].filter(Boolean));
}
