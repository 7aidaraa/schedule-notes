// ---- «مهام سريعة» (spec 2026-10-15): what is left before exporting the timetable. Read and tick only; Claude updates the items by a seed ----
const HOWTO = [
  '«ملف ← سجلّ الإصدارات» يحفظ نسخة ترجع إليها.',
  'افتح ورقة «القيود» وانزل إلى «القسم الثالث: القواعد الفرديّة»، ثم أول صف فارغ تحت آخر قاعدة.',
  'A «نوع الهدف»: اختر من المنسدلة (معلّم أو مادّة).',
  'B «الهدف»: اختر الاسم من المنسدلة، ولا تكتبه بيدك.',
  'C «نوع القيد»: اختر من المنسدلة؛ فتُقفل الخلايا التي لا يقرؤها النوع.',
  'D «النمط»: لـ«عدم تزامن الحصص» وحده: اسم المعلم الثاني من المنسدلة.',
  'E «القيمة»: اكتبها كما هي، بالفاصلة لا بالشرطة.',
  'F «مستوى الإلزام»، وG «الوزن» إن كان مرناً.',
  'H «مفعَّل» تصير «نعم» وحدها؛ تأكد منها. وI «ملاحظة»: اكتب سبب القيد.',
  'بعد الصفوف كلها: «🔍 فحص تعارضات القيود» ← «📋 فحص جدوى الجدول» ← التوليد.',
];
const HOWTO_TIP = 'إن لم يظهر النوع في منسدلة C (مثل «عدم تزامن الحصص» و«لا حصّتين متتابعتين للصفّ نفسه»): «⚙ الإعداد والصيانة ← تحديث القوائم المنسدلة ← 🧩 ترابط ورقة القيود» ثم أعد الاختيار.';
let TASKS = null;
async function loadTasks() {
  $('tasksBody').replaceChildren(el('div', { className: 'meta', textContent: 'جارٍ التحميل...' }));
  try { TASKS = (await call('tasks')).rows; renderTasks(); }
  catch (e) { $('tasksBody').replaceChildren(el('div', { className: 'card meta', textContent: e })); }
}
function renderTasks() {
  if (!TASKS) return;
  const open = new Set([...$('tasksBody').querySelectorAll('details[open]')].map(d => d.dataset.k));
  const ticks = TASKS.filter(t => t.sec !== 'د');
  const reset = el('button', { className: 'ghost', textContent: 'رفع الشطب عن الكل', style: 'padding:6px 12px;font-size:14px' });
  let armed = 0;
  reset.onclick = async () => {
    if (Date.now() - armed > 4000) { armed = Date.now(); reset.textContent = 'اضغط مرة أخرى للتأكيد'; reset.className = 'warn'; setTimeout(() => { if (Date.now() - armed >= 4000) renderTasks(); }, 4100); return; }
    reset.disabled = true;
    try { await call('tasks_reset'); TASKS.forEach(t => { t.done = false; }); renderTasks(); toast('رُفع الشطب ✓'); }
    catch (e) { toast(e, true); reset.disabled = false; }
  };
  const fold = (k, summary, ...kids) => { const f = el('details', { className: 'fold', open: open.has(k) }, el('summary', { textContent: summary }), ...kids); f.dataset.k = k; return f; };
  const list = sec => TASKS.filter(t => t.sec === sec).map(taskLine);
  const d = TASKS.find(t => t.sec === 'د');
  $('tasksBody').replaceChildren(
    el('div', { className: 'row', style: 'margin:0 0 6px;justify-content:space-between' },
      el('span', { className: 'meta', textContent: 'أُنجز ' + ticks.filter(t => t.done).length + ' من ' + ticks.length }), reset),
    el('div', { className: 'meta', textContent: 'كل اقتراح هنا [صياغة كلود].' }),
    el('h3', { className: 'tasksHead', textContent: 'تُكتب قيداً في ورقة «القيود»' }),
    el('div', { className: 'howto' }, fold('howto', 'كيف تُدخل الصف (القيم بالترتيب A · B · C · D · E · F · G)',
      el('ol', {}, ...HOWTO.map(x => el('li', { textContent: x }))), el('div', { className: 'meta', textContent: HOWTO_TIP }))),
    el('div', { className: 'card', style: 'padding:10px' }, ...list('ب')),
    el('h3', { className: 'tasksHead', textContent: 'يدوية — بعد التوليد' }),
    el('div', { className: 'meta', style: 'margin-bottom:6px', textContent: '↔ التبديل اليدويّ في «جدول المعلّمين»، ولا يُعتمد تبديل يُظهر كسراً صلباً.' }),
    el('div', { className: 'card', style: 'padding:10px' }, ...list('ج')),
    d ? el('div', { className: 'card', style: 'padding:6px 12px;margin-top:14px' },
      fold('excl', d.title, ...d.body.split('\n').map(x => el('div', { className: 'meta', style: 'margin:4px 0', textContent: x })))) : null);
}
// A line holding « · » is a row in the sheet's columns (A · B · C · …); any other line is a note under it.
function taskLine(t, i) {
  const box = el('div', { className: 'oldRule task' + (t.done ? ' done' : '') });
  const tx = el('div', { className: 'tx' }, el('div', { textContent: t.title }),
    ...t.body.split('\n').filter(Boolean).map(x => el('div', { className: x.includes(' · ') ? 'row6' : 'note', textContent: x })));
  box.append(el('span', { className: 'box', textContent: t.done ? '✓' : '' }), el('span', { className: 'n', textContent: i + 1 }), tx);
  box.onclick = async () => {
    t.done = !t.done; renderTasks();
    try { await call('task_check', { id: t.id, done: t.done }); } catch (err) { t.done = !t.done; renderTasks(); toast(err, true); }
  };
  return box;
}
$('tabTasks').onclick = () => tab('tasks');
