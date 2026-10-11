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
  ['rules', 'req', 'book'].forEach(k => $('tab' + k[0].toUpperCase() + k.slice(1)).classList.toggle('on', which === k));
  $('rules').classList.toggle('hidden', which !== 'rules');
  $('reqView').classList.toggle('hidden', which !== 'req');
  $('book').classList.toggle('hidden', which !== 'book');
  return refresh();
}
function refresh() { return TAB === 'rules' ? loadRules() : TAB === 'req' ? loadList() : loadBook(); }
$('tabRules').onclick = () => tab('rules');
$('tabReq').onclick = () => tab('req');
$('tabBook').onclick = () => tab('book');

// ---- Screens: whatever opens gets the whole page, with «رجوع» (and the phone's back button) to return ----
let SCREEN_Y = 0;
const screenOpen = () => !$('screen').classList.contains('hidden');
function openScreen(title, body) {
  if (!screenOpen()) { SCREEN_Y = scrollY; history.pushState({ screen: 1 }, ''); }
  $('admin').classList.add('hidden'); $('screen').classList.remove('hidden');
  $('scrTitle').textContent = title; $('scrBody').replaceChildren(body);
  scrollTo(0, 0);
}
function closeScreen() { if (screenOpen()) history.back(); }
addEventListener('popstate', () => {
  if (!screenOpen()) return;
  $('screen').classList.add('hidden'); $('scrBody').replaceChildren(); $('admin').classList.remove('hidden');
  if (TAB === 'rules') renderRules(); else if (TAB === 'req') render(); else renderBook();
  scrollTo(0, SCREEN_Y);
});
$('scrBack').onclick = closeScreen;
$('helpBtn').onclick = () => openScreen('تعليمات', el('div', { className: 'helpText', textContent: HELP }));

const HELP = `سير المنصة
١. المعلم يرسل ملاحظته على الجدول.
٢. المطور يحوّلها إلى قيد بـ«حفظ القيد»، فيُحذف الطلب.
٣. القيود ثلاث صفحات: دائمة، شبه دائمة، مؤقتة.
٤. ضغطة على القيد تشطبه، و«رفع الشطب عن الكل» يعيدها. «⋯» يفتح تفاصيله.
٥. «تصدير CSV» يُستورد إلى ورقة «القيود بلغة عرفية (حيدر)» فقط.
٦. ورقة «القيود» في الشيت لا تكتب فيها المنصة.
٧. «استيراد CSV القيود» يحدّث الوسوم: ✅ مسجّل · ⏸️ خامل · ⏳ غير مسجّل · 🆕 نوع مقترح.
٨. التحديث: اسحب الشاشة للأسفل.

ملف الشيت إلى المنصة (لمطور الشيت)
- صفوف القسم الثالث من ورقة «القيود» بترتيبها.
- الأعمدة: نوع الهدف، الهدف، نوع القيد، النمط، القيمة، مستوى الإلزام، الوزن، مفعَّل، ملاحظة.
- UTF-8، والصف الأول عناوين.`;

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
  return el('div', { className: 'cform', style: 'width:100%' }, name, el('div', { className: 'row', style: 'margin-top:6px' }, dept), el('div', { className: 'row', style: 'margin-top:6px' }, phone),
    el('div', { className: 'row' }, save, cancel, fmsg));
}
$('bookAdd').onclick = () => openScreen('رقم جديد', contactForm(null));

// ---- Constraints, in the terms of the timetable sheet «القيود» (section three, columns A–I) ----
const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const ROLES = ['رؤساء الأقسام', 'مشرفو الأجنحة', 'إداريّون'];
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
const DURS = ['دائمة', 'شبه دائمة', 'مؤقتة'];
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
const deptOf = (tt, target) => tt === 'معلّم' ? (teacherOf(target) || {}).department || '' : tt === 'مادّة' ? (SUBJECTS.find(x => x.s === target) || {}).d || '' : ALL;
const lineOf = r => r.ctype + ': ' + r.target + (r.value ? ' — ' + (r.pattern ? r.pattern + ' · ' : '') + r.value : '');

let RULES = null, DUR = 'شبه دائمة';
async function loadRules() {
  $('rulesMsg').textContent = 'جارٍ التحميل...';
  try { const o = await call('rules'); RULES = o.rows; TYPES = o.types || []; renderRules(); $('rulesMsg').textContent = ''; }
  catch (e) { $('rulesMsg').textContent = e; }
}
const strength = r => r.active === false ? 'off' : /صلب/.test(r.level) ? 'hard' : /مرن/.test(r.level) ? 'soft' : 'none';
const ruleColor = r => { const s = strength(r); return s === 'off' ? 'off' : s === 'soft' ? 'soft' : s === 'hard' ? (r.target_type === 'معلّم' ? 'hardOne' : 'hardAll') : ''; };
const deptRank = d => d === ALL ? -1 : (i => i < 0 ? 99 : i)(DEPT_ORDER.indexOf(d));
const typeRank = n => (i => i < 0 ? 50 : i)(SHEET_TYPES.findIndex(t => t.n === n));
function ordered(rows) {
  const k = r => [deptRank(r.department), r.department || '', { 'بارامتر': 0, 'دور': 1, 'مادّة': 2, 'معلّم': 3 }[r.target_type] ?? 4, r.target || '', typeRank(r.ctype), r.id];
  return [...rows].sort((a, b) => { const p = k(a), q = k(b); for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return typeof p[i] === 'string' ? p[i].localeCompare(q[i], 'ar') : p[i] - q[i]; return 0; });
}
function renderRules() {
  const all = RULES || [];
  $('durTabs').replaceChildren(...DURS.map(d => {
    const b = el('button', { className: 'ghost' + (d === DUR ? ' on' : '') }, d + ' ', el('small', { textContent: '(' + all.filter(r => r.duration === d).length + ')' }));
    b.onclick = () => { DUR = d; renderRules(); };
    return b;
  }));
  const rows = ordered(all.filter(r => r.duration === DUR));
  const done = rows.filter(r => r.checked).length;
  $('rulesMsg').textContent = rows.length ? 'مستوفى ' + done + ' من ' + rows.length + (done === rows.length ? ' — اكتملت ✓' : '') : '';
  const out = [];
  let dept = null;
  for (const r of rows) {
    if (r.department !== dept) { dept = r.department; out.push(el('div', { className: 'grp', textContent: dept || '—' })); }
    out.push(ruleItem(r));
  }
  $('rulesList').replaceChildren(el('div', { className: 'card', style: 'padding:12px' }, ...(out.length ? out : [el('div', { className: 'meta', textContent: 'لا قيود في هذه الصفحة' })])));
}
const levelText = r => r.level === 'مرن موزون' ? 'مرن' + (r.weight !== null && r.weight !== undefined ? ' ' + r.weight : '') : r.level;
const targetText = r => r.target_type === 'معلّم' || r.target_type === 'بارامتر' ? r.target : r.target_type + ': ' + r.target;
// One line per constraint: a tap ticks it off (saved on the server); «⋯» opens its details.
function ruleItem(r) {
  const box = el('div', { className: 'rule ' + ruleColor(r) + (r.checked ? ' done' : '') });
  const more = el('button', { type: 'button', className: 'more', textContent: '⋯', title: 'التفاصيل', ariaLabel: 'التفاصيل' });
  more.onclick = () => openScreen('تفاصيل القيد', ruleDetail(r));
  const lvl = levelText(r);
  // Badges on the first line, the constraint itself on a full-width line under them.
  box.append(el('div', { className: 'top' },
    el('span', { className: 'box', textContent: r.checked ? '✓' : '' }),
    el('span', { className: 'ct', textContent: (isProposed(r.ctype) ? '🆕 ' : '') + r.ctype }),
    el('span', { style: 'flex:1' }),
    lvl ? el('span', { className: 'lv ' + strength(r), textContent: lvl }) : null,
    el('span', { className: 'st', textContent: STATE_ICON[r.sheet_state] || '', title: r.sheet_state }), more),
    el('div', { className: 'tx line' }, el('b', { textContent: targetText(r) }),
      r.value ? ' — ' : '', r.pattern ? r.pattern + ' · ' : '', r.value ? el('span', { className: 'v', textContent: r.value }) : null));
  if (r.active === false) box.append(el('div', { className: 'sub', textContent: 'غير مفعَّل' }));
  box.onclick = async e => {
    if (e.target.closest('button')) return;
    r.checked = !r.checked; renderRules();
    try { await call('rule_check', { id: r.id, checked: r.checked }); }
    catch (err) { r.checked = !r.checked; renderRules(); toast(err, true); }
  };
  return box;
}
// The details screen: note, the sheet row, moving between pages, editing and deleting.
function ruleDetail(r) {
  const link = r.link_id && (RULES || []).find(x => x.id === r.link_id);
  const sec = (title, ...kids) => el('div', { className: 'dsec' }, el('b', { textContent: title }), ...kids);
  const move = el('div', { className: 'chips' }, ...DURS.map(d => {
    const b = el('button', { type: 'button', className: 'chip' + (d === r.duration ? ' on' : ''), textContent: d });
    b.onclick = async () => {
      if (d === r.duration) return;
      try { await call('rule_move', { id: r.id, duration: d }); r.duration = d; toast('نُقل إلى «' + d + '» ✓'); openScreen('تفاصيل القيد', ruleDetail(r)); }
      catch (e) { toast(e, true); }
    };
    return b;
  }));
  const edit = el('button', { type: 'button', textContent: '✏️ تعديل' });
  edit.onclick = () => openScreen('تعديل قيد', builder({ rule: r }));
  const del = delButton('حذف القيد', async () => { await call('rule_delete', { id: r.id }); RULES = RULES.filter(x => x !== r); toast('حُذف ✓'); closeScreen(); });
  del.textContent = '🗑️ حذف';
  return el('div', {},
    el('div', { className: 'detailLine' }, el('span', { className: 'ct', textContent: (isProposed(r.ctype) ? '🆕 ' : '') + r.ctype, style: 'font-size:13px;font-weight:700;border:1px solid var(--line);border-radius:8px;padding:1px 7px;margin-inline-end:6px' }),
      el('b', { textContent: targetText(r) }), r.value ? ' — ' + (r.pattern ? r.pattern + ' · ' : '') + r.value : ''),
    el('div', { className: 'meta' }, [levelText(r), r.active === false ? 'غير مفعَّل' : '', (STATE_ICON[r.sheet_state] || '') + ' ' + r.sheet_state, r.department].filter(Boolean).join(' · ')),
    link ? el('div', { className: 'meta', textContent: '🔗 مرتبط بـ: ' + lineOf(link) }) : null,
    sec('⁉️ الملاحظة', el('div', { className: 'panel', style: 'margin-top:0', textContent: r.reason || 'لا أعلم' })),
    sec('⛓️‍💥 صف الشيت', el('div', { className: 'panel', style: 'margin-top:0' }, sheetRow(r))),
    sec('↪️ نقل إلى', move),
    el('div', { className: 'row', style: 'margin-top:18px' }, edit, del));
}
// The constraint as a row of the sheet «القيود» (section three).
const SHEET_COLS = ['نوع الهدف', 'الهدف', 'نوع القيد', 'النمط', 'القيمة', 'مستوى الإلزام', 'الوزن', 'مفعَّل', 'ملاحظة'];
const rowOf = r => [r.target_type, r.target, r.ctype, r.pattern, r.value, r.level, r.weight ?? '', r.active === false ? 'لا' : 'نعم', r.reason];
function sheetRow(r) {
  if (r.target_type === 'بارامتر') return el('div', {}, 'بارامتر في القسم الأول/الثاني من ورقة «القيود»: ', el('b', { textContent: r.target }), r.value ? ' = ' + r.value : '');
  const v = rowOf(r);
  return el('table', { className: 'sr' }, ...SHEET_COLS.map((h, i) => el('tr', {}, el('th', { textContent: 'ABCDEFGHI'[i] + ' · ' + h }), el('td', { textContent: v[i] === '' ? '—' : v[i] }))));
}
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
function builder({ rule, request, link, onSaved }) {
  const r = rule || {};
  const reqTeacher = request && TEACHERS.find(t => t.name === request.name);
  const st = {
    tt: r.target_type || (link ? link.target_type : 'معلّم'),
    target: r.target ?? (reqTeacher ? reqTeacher.nick || reqTeacher.name : ''),
    ctype: r.ctype || '', per: parsePer(r.ctype === 'خانات محجوبة' ? (r.value || '').split(':')[1] : r.value), days: parseDays(r.ctype === 'خانات محجوبة' ? (r.value || '').split(':')[0] : r.value),
    num: /^\d+$/.test(digits(r.value || '')) ? digits(r.value) : '', other: r.ctype === 'ربط السابعات' ? r.value : '', free: r.value || '',
    level: r.level || 'صلب', weight: r.weight ?? '', active: r.active !== false, duration: r.duration || (link ? link.duration : DUR),
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
    parts.push(lbl('نوع الهدف'), chips(['معلّم', 'مادّة', 'دور', 'بارامتر'], st.tt, v => { if (st.tt !== v) { st.tt = v; st.target = ''; st.ctype = ''; } }));
    parts.push(lbl('الهدف'));
    if (st.tt === 'معلّم') {
      const s = el('select', {}, el('option', { value: '', textContent: 'اختر المعلّم' }), ...depts().map(d => el('optgroup', { label: d },
        ...TEACHERS.filter(t => t.department === d).map(t => el('option', { value: t.nick || t.name, textContent: t.nick || t.name })))));
      if (st.target && ![...s.options].some(o => o.value === st.target)) s.append(el('option', { value: st.target, textContent: st.target }));
      s.value = st.target; s.onchange = () => { st.target = s.value; preview(); };
      parts.push(s);
    } else if (st.tt === 'مادّة') {
      const s = select(SUBJECTS.map(x => x.s), st.target, 'اختر المادّة'); s.onchange = () => { st.target = s.value; preview(); };
      parts.push(s);
    } else if (st.tt === 'دور') parts.push(chips(ROLES, st.target, v => { st.target = v; }));
    else { const i = el('input', { value: st.target, placeholder: 'اسم البارامتر كما في ورقة «القيود»', maxLength: 200 }); i.oninput = () => { st.target = i.value.trim(); preview(); }; parts.push(i); }

    parts.push(lbl('نوع القيد'));
    if (st.tt === 'بارامتر') st.ctype = 'بارامتر';
    else {
      const list = [...SHEET_TYPES.filter(t => t.for.includes(st.tt)), ...TYPES.filter(t => t.targets.split('،').includes(st.tt)).map(t => ({ g: 'مقترحة', n: t.name }))];
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
            await call('type_save', { name: n, targets: [st.tt], explain: explain.value.trim() });
            TYPES = TYPES.filter(t => t.name !== n).concat({ name: n, targets: st.tt, explain: explain.value.trim() });
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
    const why = el('textarea', { value: st.reason, placeholder: 'ملاحظة: سبب القيد (إلزامية)', maxLength: 3000 });
    why.oninput = () => { st.reason = why.value; };
    parts.push(lbl('ملاحظة'), why, pv);
    const save = el('button', { type: 'button', textContent: 'حفظ القيد' });
    const saveLink = el('button', { type: 'button', className: 'ghost', textContent: 'حفظ وإضافة قيد مرتبط' });
    const cancel = el('button', { type: 'button', className: 'ghost', textContent: 'إلغاء' });
    save.onclick = () => submit(false); saveLink.onclick = () => submit(true); cancel.onclick = closeScreen;
    parts.push(el('div', { className: 'row' }, save, rule ? null : saveLink, cancel, fmsg));
    box.replaceChildren(...parts);
    preview();
  }
  async function submit(another) {
    const t = typeOf(st.ctype);
    const need = !st.target ? 'اختر الهدف' : !t ? 'اختر نوع القيد' : '';
    if (need) return (fmsg.textContent = need);
    const v = valueOf(st), lv = levelOf(st, t);
    const missing = (t.f.includes('day') || t.f.includes('day1')) && !st.days.length ? 'اختر الأيام'
      : (t.f.includes('per') || t.f.includes('per1')) && !st.per.length ? 'اختر الحصص'
      : t.f.includes('num') && st.num === '' ? 'اختر العدد' : t.f.includes('other') && !st.other ? 'اختر المعلّم الآخر'
      : lv === 'مرن موزون' && (st.weight === '' || Number(st.weight) < 0) ? 'اكتب الوزن'
      : !st.reason.trim() ? 'الملاحظة (السبب) إلزامية' : '';
    if (missing) return (fmsg.textContent = missing);
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
      if (another) openScreen('قيد مرتبط', builder({ link: (RULES || []).find(x => x.id === o.id) || { id: o.id, ...f } }));
      else closeScreen();
    } catch (e) { fmsg.textContent = e; box.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }
  draw();
  return box;
}

// ---- Proposed types: named in the sheet's style, until the sheet's developer adds them ----
function typesView(editing) {
  const box = el('div');
  const renderTypes = e => openScreen('الأنواع المقترحة', typesView(e));
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
    return el('div', { className: 'cform', style: 'margin-top:8px' }, name, el('div', { className: 'lbl', textContent: 'نوع الهدف', style: 'font-weight:700;color:var(--navy);font-size:14px;margin:8px 0 4px' }), tchips, explain, el('div', { className: 'row' }, save, cancel, fmsg));
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
      const k = keyOf(r.target, r.ctype, r.value), hit = byKey.get(k);
      const next = hit ? (fold(hit['مفعَّل']) === fold('نعم') ? 'مسجّل' : 'خامل') : isProposed(r.ctype) && !sheetTypes.has(fold(r.ctype)) ? 'نوع مقترح' : 'غير مسجّل';
      if (hit) used.add(k);
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
