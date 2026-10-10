// Budgets on Firebase: replaces app.js's call(action, data) — the page's only door to a server — with Firestore.
// Load order: firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js (the host's initialized app),
// then school-data.js, app.js, this file, form.js, table.js. The editor, grid, form and preview stay as they are.
//
// Firestore:
//   budgets/{department}        { data, updated_at, updated_by }        — same «data» as references/data-format.md
//   budget_rows/{auto}          { uid, nick, name, department, class, subject, periods, updated_at }
//                               one row per teacher × class × subject: the same rows as the CSV for the timetable sheet;
//                               other parts of the platform read budgets from here.
//   {FB.users}/{uid}            the host's own users; FB.fields says which fields hold name, department, head and role.

// ---- Settings: match the host platform's users collection (unknown here, so these are defaults to check) ----
const FB = {
  users: 'users',
  fields: { name: 'name', nick: 'nick', department: 'department', isHead: 'isHead', role: 'role' },
  adminRoles: ['admin'],          // values of fields.role that open every department (the developer / principal)
  budgets: 'budgets',
  rows: 'budget_rows',
};

const fbDb = () => firebase.firestore();
const fbNow = () => new Date().toISOString();
const fbFail = m => { throw m; };

// Same cleaning as the Supabase function (cleanBudget): only the saved shape, periods 0..40, known classes,
// a split kept only when it adds up to its cell.
function fbClean(d) {
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

// The department's rows of the shared contract (and of the CSV): teacher × class × subject.
function fbRows(department, data) {
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

let FB_ME = null; // { uid, name, department, role: 'admin' | 'head' | 'teacher' }
const fbMayEdit = department => FB_ME && (FB_ME.role === 'admin' || (FB_ME.role === 'head' && FB_ME.department === department));

call = async function (action, data = {}) {
  const user = firebase.auth().currentUser;
  if (!user) fbFail('سجّل الدخول في المنصة أولاً');
  const f = FB.fields;
  try {
    if (action === 'login') {
      const users = await fbDb().collection(FB.users).get();
      const teachers = users.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u[f.department])
        .map(u => ({ name: u[f.name], nick: u[f.nick] || u[f.name], department: u[f.department], is_head: !!u[f.isHead], uid: u.id }))
        .sort((a, b) => a.department.localeCompare(b.department, 'ar') || a.name.localeCompare(b.name, 'ar'));
      const me = users.docs.find(d => d.id === user.uid);
      const m = me ? me.data() : {};
      const role = FB.adminRoles.includes(m[f.role]) ? 'admin' : m[f.isHead] ? 'head' : 'teacher';
      FB_ME = { uid: user.uid, name: m[f.name], department: m[f.department], role };
      return { role, teachers };
    }
    if (action === 'budget_get') {
      if (!fbMayEdit(data.department)) fbFail('غير مصرح');
      const snap = await fbDb().collection(FB.budgets).doc(data.department).get();
      if (snap.exists) return { budget: { department: data.department, ...snap.data() } };
      // First visit: the department's teachers, nothing saved yet.
      const names = TEACHERS.filter(t => t.department === data.department).map(t => ({ name: t.name }));
      return { budget: { department: data.department, data: fbClean({ teachers: names }), updated_at: null, updated_by: null } };
    }
    if (action === 'budget_save') {
      if (!fbMayEdit(data.department)) fbFail('غير مصرح');
      const clean = fbClean(data.data), updated_at = fbNow(), updated_by = FB_ME.role === 'admin' ? 'المطور' : FB_ME.name;
      const db = fbDb(), batch = db.batch();
      batch.set(db.collection(FB.budgets).doc(data.department), { data: clean, updated_at, updated_by });
      // Replace the department's contract rows in the same write, so readers never see half a budget.
      const old = await db.collection(FB.rows).where('department', '==', data.department).get();
      old.docs.forEach(d => batch.delete(d.ref));
      fbRows(data.department, clean).forEach(r => batch.set(db.collection(FB.rows).doc(), { ...r, updated_at }));
      await batch.commit();
      return { ok: true, updated_at, updated_by };
    }
    if (action === 'budgets') {
      if (FB_ME?.role !== 'admin') fbFail('غير مصرح');
      const all = await fbDb().collection(FB.budgets).get();
      return { rows: all.docs.map(d => ({ department: d.id, ...d.data() })).sort((a, b) => a.department.localeCompare(b.department, 'ar')) };
    }
    // Requests and their attachments belong to the notes platform, not to this section.
    if (action === 'list') return { rows: [] };
  } catch (e) {
    throw typeof e === 'string' ? e : 'تعذر الاتصال بالخادم، حاول مجدداً';
  }
  fbFail('غير متاح في هذه المنصة');
};

// Signed in to the host platform = signed in here: no shared passwords.
firebase.auth().onAuthStateChanged(u => { if (u && !ROLE) $('loginBtn').click(); });
