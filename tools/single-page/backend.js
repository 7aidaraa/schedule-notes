// ===== Where budgets are read and saved =====
// app.js talks to a server through one function, call(action, data). This file replaces it:
//  • CONFIG.firebase = null  → standalone: the embedded data (#budgetData), changes kept in this browser (localStorage).
//    Role: developer by default; ?head=<full name> opens the page as that head of department.
//  • CONFIG.firebase = { apiKey, authDomain, projectId, ... } → the host platform's Firestore and signed-in user:
//      budgets/{department}  { data, updated_at, updated_by }
//      budget_rows/{auto}    { uid, nick, name, department, class, subject, periods, updated_at }
//                            one row per teacher × class × subject = the rows of the CSV for the timetable sheet;
//                            other parts of the platform read budgets from here.
//    Roles from the user's document in CONFIG.users (field names in CONFIG.fields; check them against the platform).
const CONFIG = {
  firebase: null,
  users: 'users',
  fields: { name: 'name', nick: 'nick', department: 'department', isHead: 'isHead', role: 'role' },
  adminRoles: ['admin'],
  budgets: 'budgets',
  rows: 'budget_rows',
};

const DATA = JSON.parse(document.getElementById('budgetData').textContent);
const LOCAL_KEY = 'school-budgets:' + (DATA.exported || '');
const nowIso = () => new Date().toISOString();

// Same cleaning as the original server: only the saved shape, periods 0..40, known classes, a split only when it adds up.
function cleanBudget(d) {
  const int = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const periods = {};
  GRADES.forEach(g => { periods[g.track] = int(d?.periods?.[g.track], 40); });
  const teachers = (Array.isArray(d?.teachers) ? d.teachers : []).slice(0, 40).map(t => {
    const cells = {}, subj = {}, split = {};
    for (const c of CLASSES) { const n = int(t?.cells?.[c], 40); if (n !== null) cells[c] = n; }
    const subjects = [...new Set((Array.isArray(t?.subjects) ? t.subjects : []).map(x => str(x, 40)).filter(Boolean))].slice(0, 8);
    for (const c of CLASSES) { const x = str(t?.subj?.[c], 40); if (x && c in cells) subj[c] = x; }
    for (const c of CLASSES) {
      const parts = {};
      for (const [k, v] of Object.entries(t?.split?.[c] ?? {})) { const n = int(v, 40); if (str(k, 40) && n) parts[str(k, 40)] = n; }
      const keys = Object.keys(parts);
      if (keys.length > 1 && c in cells && keys.reduce((a, k) => a + parts[k], 0) === cells[c]) split[c] = parts;
    }
    return { name: str(t?.name, 120), cells, note: str(t?.note, 300), subjects, subj, split };
  }).filter(t => t.name);
  return { periods, required: int(d?.required, 99), note: str(d?.note, 1000), teachers };
}

// The contract rows of one department: teacher × class × subject (the CSV rows).
function contractRows(department, data) {
  const rows = [];
  for (const t of data.teachers) {
    const tt = TEACHERS.find(x => x.name === t.name) || {};
    for (const c of CLASSES) {
      if (!(c in t.cells)) continue;
      for (const p of partsOf(department, t, c))
        rows.push({ uid: tt.uid || '', nick: tt.nick || t.name, name: t.name, department, class: sheetClass(c), subject: p.col, periods: p.h });
    }
  }
  return rows;
}

let ME = null; // { name, department, role }
const mayEdit = dp => ME && (ME.role === 'admin' || (ME.role === 'head' && ME.department === dp));
const emptyBudget = dp => ({ department: dp, data: cleanBudget({ teachers: TEACHERS.filter(t => t.department === dp).map(t => ({ name: t.name })) }), updated_at: null, updated_by: null });

// ---- Standalone store: the embedded data, changes in localStorage ----
const Local = {
  budgets: null,
  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch {}
    this.budgets = saved || Object.fromEntries((DATA.budgets || []).map(b => [b.department, { department: b.department, data: b.data, updated_at: b.updated_at, updated_by: b.updated_by }]));
  },
  keep() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.budgets)); } catch {} },
  async call(action, data) {
    if (!this.budgets) this.load();
    if (action === 'login') {
      const teachers = DATA.teachers.map(t => ({ name: t.name, nick: t.nick || t.name, department: t.department, is_head: !!t.is_head, uid: t.uid || '' }));
      const head = new URLSearchParams(location.search).get('head');
      const h = head && teachers.find(t => t.name === head && t.is_head);
      ME = h ? { name: h.name, department: h.department, role: 'head' } : { name: 'المطور', role: 'admin' };
      return { role: ME.role, teachers };
    }
    if (action === 'budget_get') { if (!mayEdit(data.department)) throw 'غير مصرح'; return { budget: this.budgets[data.department] || emptyBudget(data.department) }; }
    if (action === 'budget_save') {
      if (!mayEdit(data.department)) throw 'غير مصرح';
      const updated_at = nowIso(), updated_by = ME.role === 'admin' ? 'المطور' : ME.name;
      this.budgets[data.department] = { department: data.department, data: cleanBudget(data.data), updated_at, updated_by };
      this.keep();
      return { ok: true, updated_at, updated_by };
    }
    if (action === 'budgets') { if (ME.role !== 'admin') throw 'غير مصرح'; return { rows: Object.values(this.budgets).sort((a, b) => a.department.localeCompare(b.department, 'ar')) }; }
    if (action === 'list') return { rows: [] };
    throw 'غير متاح في هذه الصفحة';
  },
  // The data file again, with this browser's changes (same format as the file the page was built from).
  exportData() {
    if (!this.budgets) this.load();
    const out = { ...DATA, exported: nowIso().slice(0, 10), school: SCHOOL_DATA, budgets: Object.values(this.budgets) };
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })), download: 'school-budgets-data_' + out.exported + '.json' });
    document.body.append(a); a.click(); a.remove();
  },
};

// ---- Firebase store: the host platform's Firestore and signed-in user ----
const Fire = {
  db: () => firebase.firestore(),
  async call(action, data) {
    const user = firebase.auth().currentUser;
    if (!user) throw 'سجّل الدخول في المنصة أولاً';
    const f = CONFIG.fields;
    if (action === 'login') {
      const users = await this.db().collection(CONFIG.users).get();
      const teachers = users.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u[f.department])
        .map(u => ({ name: u[f.name], nick: u[f.nick] || u[f.name], department: u[f.department], is_head: !!u[f.isHead], uid: u.id }))
        .sort((a, b) => a.department.localeCompare(b.department, 'ar') || a.name.localeCompare(b.name, 'ar'));
      const me = users.docs.find(d => d.id === user.uid), m = me ? me.data() : {};
      ME = { name: m[f.name], department: m[f.department], role: CONFIG.adminRoles.includes(m[f.role]) ? 'admin' : m[f.isHead] ? 'head' : 'teacher' };
      return { role: ME.role, teachers };
    }
    if (action === 'budget_get') {
      if (!mayEdit(data.department)) throw 'غير مصرح';
      const snap = await this.db().collection(CONFIG.budgets).doc(data.department).get();
      return { budget: snap.exists ? { department: data.department, ...snap.data() } : emptyBudget(data.department) };
    }
    if (action === 'budget_save') {
      if (!mayEdit(data.department)) throw 'غير مصرح';
      const clean = cleanBudget(data.data), updated_at = nowIso(), updated_by = ME.role === 'admin' ? 'المطور' : ME.name;
      const db = this.db(), batch = db.batch();
      batch.set(db.collection(CONFIG.budgets).doc(data.department), { data: clean, updated_at, updated_by });
      // The department's contract rows are replaced in the same write, so readers never see half a budget.
      const old = await db.collection(CONFIG.rows).where('department', '==', data.department).get();
      old.docs.forEach(d => batch.delete(d.ref));
      contractRows(data.department, clean).forEach(r => batch.set(db.collection(CONFIG.rows).doc(), { ...r, updated_at }));
      await batch.commit();
      return { ok: true, updated_at, updated_by };
    }
    if (action === 'budgets') {
      if (ME?.role !== 'admin') throw 'غير مصرح';
      const all = await this.db().collection(CONFIG.budgets).get();
      return { rows: all.docs.map(d => ({ department: d.id, ...d.data() })).sort((a, b) => a.department.localeCompare(b.department, 'ar')) };
    }
    if (action === 'list') return { rows: [] };
    throw 'غير متاح في هذه الصفحة';
  },
};

call = async function (action, data = {}) {
  try { return await (CONFIG.firebase ? Fire : Local).call(action, data); }
  catch (e) { throw typeof e === 'string' ? e : 'تعذر الاتصال، حاول مجدداً'; }
};

// ---- Start: no password screen; the role comes from the platform's account (or the developer, standalone) ----
(async () => {
  if (CONFIG.firebase) {
    const v = '10.12.2', sdk = n => 'https://www.gstatic.com/firebasejs/' + v + '/firebase-' + n + '-compat.js';
    if (!window.firebase) for (const n of ['app', 'auth', 'firestore']) await loadScript(sdk(n));
    if (!firebase.apps.length) firebase.initializeApp(CONFIG.firebase);
    $('loginMsg').textContent = 'سجّل الدخول في المنصة ثم أعد فتح الصفحة.';
    firebase.auth().onAuthStateChanged(u => { if (u && !ROLE) $('loginBtn').click(); });
  } else {
    $('localBar').classList.remove('hidden');
    $('loginBtn').click();
  }
})();
$('localExport').onclick = () => Local.exportData();
$('localReset').onclick = () => {
  const b = $('localReset');
  if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = 'تأكيد: الرجوع إلى البيانات الأصلية؟'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'الرجوع إلى البيانات الأصلية'; }, 4000); return; }
  try { localStorage.removeItem(LOCAL_KEY); } catch {}
  location.reload();
};
// A head lands on their own name, so the budget card shows at once.
(function prefill() {
  if (!ROLE) return setTimeout(prefill, 100);
  if (ROLE !== 'head' || !ME) return;
  $('dept').value = ME.department || ''; $('dept').dispatchEvent(new Event('input'));
  $('name').value = ME.name || ''; $('name').dispatchEvent(new Event('input'));
})();
