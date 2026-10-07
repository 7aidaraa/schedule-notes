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
    const { role } = await call('login');
    $('login').classList.add('hidden');
    $(role).classList.remove('hidden');
    if (role === 'admin') loadList();
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

$('sendBtn').onclick = async () => {
  const out = $('sendMsg'), btn = $('sendBtn');
  const data = { name: $('name').value.trim(), request: $('request').value.trim(), reason: $('reason').value.trim() };
  if (!data.name || !data.request || !data.reason) return msg(out, 'جميع الحقول مطلوبة', 'err');
  const f = $('file').files[0];
  if (f) {
    if (f.size > MAX) return msg(out, 'حجم المرفق يتجاوز 10 ميغابايت', 'err');
    if (!EXTS.includes(f.name.split('.').pop().toLowerCase())) return msg(out, 'المرفق يجب أن يكون PDF أو صورة أو ملف Word', 'err');
  }
  btn.disabled = true; msg(out, 'جارٍ الإرسال...');
  try {
    if (f) data.file = { name: f.name, data: await readFile(f) };
    await call('submit', data);
    ['name', 'request', 'reason', 'file'].forEach(id => $(id).value = '');
    msg(out, 'تم إرسال طلبك بنجاح ✓', 'ok');
  } catch (e) { msg(out, e, 'err'); }
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
    el('div', { className: 'meta', textContent: new Date(r.created_at).toLocaleString('ar-KW') }),
    field('الطلب', r.request),
    field('السبب', r.reason));

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
