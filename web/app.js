const API = 'https://zywdedrtcaolsosufoae.supabase.co/functions/v1/api';
const MAX = 10 * 1024 * 1024;
const EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'doc', 'docx'];
let PASS = '';
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
    if (role === 'admin') loadList();
    else setupForm(teachers || []);
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
    const t = TEACHERS.find(t => t.name === $('name').value.trim());
    if (t && t.department !== $('dept').value.trim()) $('name').value = '';
  };
  $('name').oninput = () => {
    const t = TEACHERS.find(t => t.name === $('name').value.trim());
    if (t && !$('dept').value.trim()) { $('dept').value = t.department; fillNames(); }
  };
  document.querySelectorAll('[name=kind]').forEach(r => r.onchange = applyKind);
  if (!$('items').children.length) addItem();
}
const kind = () => document.querySelector('[name=kind]:checked').value;
function applyKind() {
  const head = kind() === 'head';
  $('teacher').classList.toggle('head', head);
  if (!head) $('items').querySelectorAll('input[type=file]').forEach(f => f.value = '');
}

// Each request is its own card with its own reason (and attachment for heads of department).
function addItem() {
  const box = el('div', { className: 'card item' });
  const remove = el('button', { className: 'ghost', type: 'button', textContent: 'حذف' });
  remove.onclick = () => { box.remove(); renumber(); };
  box.append(
    el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' }, el('h2'), remove),
    el('label', { textContent: 'الطلب' }), el('textarea', { className: 'req', maxLength: 3000 }),
    el('label', { textContent: 'سبب الطلب' }), el('textarea', { className: 'why', maxLength: 3000 }),
    el('div', { className: 'file' },
      el('label', { textContent: 'مرفق (اختياري): PDF أو صورة أو Word، حتى 10 ميغابايت' }),
      el('input', { type: 'file', accept: '.pdf,.doc,.docx,image/*' })));
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
  const base = { name: $('name').value.trim(), department: $('dept').value.trim(), kind: kind(),
    phone: digits($('phone').value).replace(/[\s-]/g, '').replace(/^(\+|00)965/, '') };
  const items = [...$('items').children].map(b => ({
    box: b, request: b.querySelector('.req').value.trim(), reason: b.querySelector('.why').value.trim(),
    file: base.kind === 'head' ? b.querySelector('input[type=file]').files[0] : null }));
  if (!base.department || !base.name || !base.phone || items.some(i => !i.request || !i.reason))
    return msg(out, 'جميع الحقول مطلوبة، ولكل طلب سببه', 'err');
  if (!/^[2569]\d{7}$/.test(base.phone)) return msg(out, 'رقم الهاتف يجب أن يكون 8 أرقام', 'err');
  for (const i of items) {
    if (!i.file) continue;
    if (i.file.size > MAX) return msg(out, 'حجم المرفق يتجاوز 10 ميغابايت', 'err');
    if (!EXTS.includes(i.file.name.split('.').pop().toLowerCase())) return msg(out, 'المرفق يجب أن يكون PDF أو صورة أو ملف Word', 'err');
  }
  btn.disabled = true;
  // One request per call: each becomes its own row, and a failure keeps only the unsent ones on screen.
  let sent = 0;
  try {
    for (const i of items) {
      msg(out, 'جارٍ إرسال الطلب ' + (sent + 1) + ' من ' + items.length + '...');
      const data = { ...base, request: i.request, reason: i.reason };
      if (i.file) data.file = { name: i.file.name, data: await readFile(i.file) };
      await call('submit', data);
      i.box.remove(); sent++;
    }
    $('phone').value = '';
    addItem();
    msg(out, sent > 1 ? 'تم إرسال جميع الطلبات (' + sent + ') بنجاح ✓' : 'تم إرسال طلبك بنجاح ✓', 'ok');
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

function card(r) {
  const c = el('div', { className: 'card' + (r.done ? ' done' : '') });
  c.append(
    el('div', { className: 'row', style: 'margin-top:0;justify-content:space-between' },
      el('strong', { textContent: r.name }),
      el('span', { className: 'badge', textContent: r.done ? 'تم ✓' : 'جديد' })),
    el('div', { className: 'meta', textContent: [r.role === 'head' ? 'رئيس قسم' : 'معلم', r.department, new Date(r.created_at).toLocaleString('ar-KW')].filter(Boolean).join(' · ') }),
    field('الطلب', r.request),
    field('السبب', r.reason));
  if (r.phone) c.append(el('div', { className: 'field' }, el('b', { textContent: 'الهاتف' }),
    el('p', {}, el('a', { href: 'tel:+965' + r.phone, textContent: r.phone, dir: 'ltr' }))));

  if (r.file_path) {
    const preview = el('div', { className: 'preview' });
    const fmsg = el('span', { className: 'meta' });
    const isImg = (r.file_type || '').startsWith('image/');
    const getUrls = () => call('file', { id: r.id });
    const viewBtn = el('button', { className: 'ghost', textContent: 'عرض' });
    const dlBtn = el('button', { className: 'ghost', textContent: 'تحميل' });
    viewBtn.onclick = async () => {
      // Open the tab synchronously so mobile popup blockers allow it.
      const tab = isImg ? null : window.open('', '_blank');
      viewBtn.disabled = true; fmsg.textContent = 'جارٍ الجلب...';
      try {
        const u = await getUrls();
        if (isImg) preview.replaceChildren(el('img', { src: u.view, alt: r.file_name }));
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
    c.append(el('div', { className: 'field' }, el('b', { textContent: 'المرفق: ' + r.file_name })),
      el('div', { className: 'row', style: 'margin-top:0' }, viewBtn, dlBtn, fmsg), preview);
  }

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

function render() {
  const rows = $('hideDone').checked ? ROWS.filter(r => !r.done) : ROWS;
  const open = ROWS.filter(r => !r.done).length;
  $('count').textContent = 'الإجمالي: ' + ROWS.length + ' — غير المنجزة: ' + open;
  $('list').replaceChildren(...(rows.length ? rows.map(card) : [el('div', { className: 'card meta', textContent: 'لا توجد طلبات' })]));
}
