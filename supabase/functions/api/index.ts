// Teacher requests API (Supabase Edge Function). Auth = shared passwords stored in public.settings.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "attachments";
const MAX_BYTES = 10 * 1024 * 1024; // total per request, all files together
const MAX_FILES = 10;
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", heif: "image/heif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
};
// Department budget: which classes each teacher takes. Class ids are shared with the page.
const CLASSES = ["10-1","10-2","10-3","10-4","10-5","10-6","10-7","11a-1","11a-2","11s-1","11s-2","11s-3","11s-4","11s-5","12a-1","12s-1","12s-2","12s-3","12s-4","12s-5"];
const TRACKS = ["g10", "g11a", "g11s", "g12a", "g12s"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function roleOf(pass: string): Promise<"admin" | "teacher" | null> {
  const { data } = await db.from("settings").select("key,value");
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  pass = str(pass, 200);
  if (!pass) return null;
  if ((await sha256(pass)) === s.admin_pass_sha256) return "admin";
  if (pass === s.teacher_pass) return "teacher";
  return null;
}

// Attachments of a row: the `files` list, or the single file of rows saved before it existed.
type Att = { path: string; name: string; type: string };
function filesOf(r: Record<string, any>): Att[] {
  if (Array.isArray(r.files) && r.files.length) return r.files;
  return r.file_path ? [{ path: r.file_path, name: r.file_name, type: r.file_type }] : [];
}

const int = (v: unknown, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
};
// Keeps only the shape the page saves: periods per track, required count, note, teachers with their classes.
function cleanBudget(d: Record<string, any>) {
  const periods: Record<string, number | null> = {};
  for (const t of TRACKS) periods[t] = int(d?.periods?.[t], 40);
  const teachers = (Array.isArray(d?.teachers) ? d.teachers : []).slice(0, 40).map((t: any) => {
    const cells: Record<string, number> = {};
    for (const c of CLASSES) { const n = int(t?.cells?.[c], 40); if (n !== null) cells[c] = n; }
    // Subjects (multi-subject departments) and, per class, which subject the teacher gives there.
    const subjects = [...new Set((Array.isArray(t?.subjects) ? t.subjects : []).map((x: unknown) => str(x, 40)).filter(Boolean))].slice(0, 8);
    const subj: Record<string, string> = {};
    for (const c of CLASSES) { const x = str(t?.subj?.[c], 40); if (x && c in cells) subj[c] = x; }
    return { name: str(t?.name, 120), cells, note: str(t?.note, 300), subjects, subj };
  }).filter((t: any) => t.name);
  return { periods, required: int(d?.required, 99), note: str(d?.note, 1000), teachers };
}
// The admin edits any department; a head of department edits their own (the directory decides who is head).
async function canEditBudget(role: string, name: string, department: string) {
  if (role === "admin") return true;
  const { data } = await db.from("teachers").select("is_head").eq("name", name).eq("department", department).maybeSingle();
  return !!data?.is_head;
}

// CSV feeds the timetable sheet pulls with IMPORTDATA: ?feed=<token>&what=budgets|teachers.
// Class and subject names are spelled as that sheet spells them.
const SHEET_SUBJECT: Record<string, string> = { "تاريخ الكويت": "الاجتماعيات", "اختيار حر": "اللغة الفرنسية (اختيار حرّ)" };
const MULTI = new Set(["الاجتماعيات", "الفيزياء والكيمياء", "الأحياء والجيولوجيا", "الرياضيات", "اللغة الفرنسية"]);
const sheetClass = (c: string) => { const [g, n] = c.split("-"); return g === "10" ? "10/" + n : g.slice(0, 2) + (g.endsWith("a") ? "د" : "ع") + n; };
const csvOf = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
async function feed(what: string) {
  const { data: staff } = await db.from("teachers").select("name,department,is_head,nick,uid").order("department").order("name");
  const teachers = staff ?? [];
  if (what === "teachers") {
    return csvOf([["المعرف", "اسم الشهرة", "الاسم الثلاثي", "القسم", "رئيس قسم"], ...teachers.map((t) => [t.uid, t.nick, t.name, t.department, t.is_head ? "نعم" : ""])]);
  }
  const depts = new Set(teachers.map((t) => t.department));
  const { data: budgets } = await db.from("budgets").select("department,data").order("department");
  const rows: unknown[][] = [["المعرف", "اسم الشهرة", "الاسم الثلاثي", "القسم", "الصف", "المادة", "الحصص"]];
  for (const b of budgets ?? []) {
    if (!depts.has(b.department)) continue;
    for (const t of b.data?.teachers ?? []) {
      const tt = teachers.find((x) => x.name === t.name) ?? {} as Record<string, string>;
      const subjects: string[] = t.subjects ?? [];
      for (const c of CLASSES) {
        if (!(c in (t.cells ?? {}))) continue;
        let sj = MULTI.has(b.department) ? (t.subj?.[c] || (subjects.length === 1 ? subjects[0] : subjects[0] || "")) : b.department;
        sj = SHEET_SUBJECT[sj] || sj;
        rows.push([tt.uid, tt.nick || t.name, t.name, b.department, sheetClass(c), sj, t.cells[c]]);
      }
    }
  }
  return csvOf(rows);
}

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method === "GET") {
    const u = new URL(req.url), token = str(u.searchParams.get("feed"), 100);
    const { data: s } = await db.from("settings").select("value").eq("key", "feed_token").maybeSingle();
    if (!token || !s?.value || token !== s.value) return fail("غير مصرح", 401);
    const body = await feed(u.searchParams.get("what") === "teachers" ? "teachers" : "budgets");
    return new Response(body, { headers: { ...CORS, "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (req.method !== "POST") return fail("Method not allowed", 405);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("طلب غير صالح"); }

  const role = await roleOf(body.pass);
  if (!role) return fail("كلمة السر غير صحيحة", 401);
  const action = body.action;

  if (action === "login") {
    // Department → teacher names for the form's dropdowns (only after a valid password).
    const { data } = await db.from("teachers").select("name,department,is_head,nick,uid").order("department").order("name");
    return json({ role, teachers: data ?? [] });
  }

  if (action === "submit") {
    // The admin may also add a request on a teacher's behalf.
    const byAdmin = role === "admin";
    const name = str(body.name, 120), request = str(body.request, 3000), reason = str(body.reason, 3000);
    const department = str(body.department, 80);
    const phone = str(body.phone, 20).replace(/[\s-]/g, "").replace(/^(\+|00)965/, "");
    if (!name || !department || !request || !reason || !phone) return fail("جميع الحقول مطلوبة");
    if (!/^[2569]\d{7}$/.test(phone)) return fail("رقم الهاتف يجب أن يكون 8 أرقام");
    // Role comes from the staff directory, never from the form.
    const { data: staff } = await db.from("teachers").select("is_head").eq("name", name).maybeSingle();
    const kind = staff?.is_head ? "head" : "teacher";
    // `file` is the single-file shape the previous page sent.
    const incoming: any[] = Array.isArray(body.files) ? body.files : body.file ? [body.file] : [];
    if (incoming.length && kind !== "head") return fail("ميزانية القسم يرفعها رئيس القسم فقط");
    if (incoming.length > MAX_FILES) return fail(`الحد ${MAX_FILES} ملفات للطلب`);

    const ready: { ext: string; name: string; type: string; bytes: Uint8Array }[] = [];
    let total = 0;
    for (const f of incoming) {
      const fname = str(f?.name, 150) || "مرفق";
      const ext = (fname.split(".").pop() || "").toLowerCase();
      const type = TYPES[ext];
      if (!type) return fail("الملف يجب أن يكون PDF أو صورة أو Word أو Excel أو ملفاً مضغوطاً");
      const bytes = b64ToBytes(String(f?.data || ""));
      if (!bytes.length) return fail("المرفق فارغ: " + fname);
      total += bytes.length;
      if (total > MAX_BYTES) return fail("مجموع حجم المرفقات يتجاوز 10 ميغابايت");
      ready.push({ ext, name: fname, type, bytes });
    }
    const files: Att[] = [];
    for (const f of ready) {
      const path = `${crypto.randomUUID()}.${f.ext}`;
      const up = await db.storage.from(BUCKET).upload(path, f.bytes, { contentType: f.type });
      if (up.error) {
        if (files.length) await db.storage.from(BUCKET).remove(files.map((x) => x.path));
        return fail("تعذر رفع المرفق، حاول مجدداً", 500);
      }
      files.push({ path, name: f.name, type: f.type });
    }
    const { error } = await db.from("requests").insert({ name, department, role: kind, phone, request, reason, files, by_admin: byAdmin });
    if (error && files.length) await db.storage.from(BUCKET).remove(files.map((x) => x.path));
    if (error) return fail("تعذر حفظ الطلب، حاول مجدداً", 500);
    await db.from("contacts").upsert({ name, department, role: kind, phone, updated_at: new Date().toISOString() });
    return json({ ok: true });
  }

  if (action === "budget_get") {
    const department = str(body.department, 80), name = str(body.name, 120);
    if (!department || !(await canEditBudget(role, name, department))) return fail("غير مصرح", 403);
    const { data: row } = await db.from("budgets").select("*").eq("department", department).maybeSingle();
    if (row) return json({ budget: row });
    // First visit: pre-filled with the department's teachers, nothing saved yet.
    const { data: staff } = await db.from("teachers").select("name").eq("department", department).order("name");
    const data = cleanBudget({ teachers: (staff ?? []).map((t) => ({ name: t.name })) });
    return json({ budget: { department, data, updated_at: null, updated_by: null } });
  }

  if (action === "budget_save") {
    const department = str(body.department, 80), name = str(body.name, 120);
    if (!department || !(await canEditBudget(role, name, department))) return fail("غير مصرح", 403);
    const data = cleanBudget(body.data ?? {});
    const updated_at = new Date().toISOString(), updated_by = role === "admin" ? "المدير" : name;
    const { error } = await db.from("budgets").upsert({ department, data, updated_at, updated_by });
    return error ? fail("تعذر حفظ الميزانية، حاول مجدداً", 500) : json({ ok: true, updated_at, updated_by });
  }

  if (role !== "admin") return fail("غير مصرح", 403);

  if (action === "budgets") {
    const { data, error } = await db.from("budgets").select("*").order("department");
    if (error) return fail("تعذر جلب الميزانيات", 500);
    return json({ rows: data });
  }

  if (action === "list") {
    const { data, error } = await db.from("requests").select("*").order("created_at", { ascending: false });
    if (error) return fail("تعذر جلب الطلبات", 500);
    return json({ rows: data });
  }

  if (action === "contacts") {
    const { data, error } = await db.from("contacts").select("*").order("department").order("name");
    if (error) return fail("تعذر جلب الأرقام", 500);
    return json({ rows: data });
  }

  const id = str(body.id, 64);
  if (action === "done") {
    const { error } = await db.from("requests").update({ done: !!body.done }).eq("id", id);
    return error ? fail("تعذر التحديث", 500) : json({ ok: true });
  }
  if (action === "note") {
    // The admin's note is the request's constraint: saving it files it under «قيود الجدول» and marks the request done.
    const note = str(body.note, 3000);
    const { data: r } = await db.from("requests").select("name,department").eq("id", id).maybeSingle();
    if (!r) return fail("الطلب غير موجود", 404);
    const { error } = await db.from("requests").update(note ? { note, done: true } : { note }).eq("id", id);
    if (error) return fail("تعذر الحفظ", 500);
    const { data: old } = await db.from("constraints").select("id,text").eq("request_id", id).maybeSingle();
    let e2;
    if (!note) ({ error: e2 } = await db.from("constraints").delete().eq("request_id", id));
    else if (old) {
      // Edited text needs checking again.
      if (old.text !== note) ({ error: e2 } = await db.from("constraints").update({ text: note, checked: false }).eq("id", old.id));
    } else {
      ({ error: e2 } = await db.from("constraints").insert({ section: "من الطلبات", department: r.department, teacher: r.name, text: note, request_id: id }));
    }
    return e2 ? fail("حُفظ في الطلب وتعذر نقله إلى القيود", 500) : json({ ok: true, done: !!note });
  }
  if (action === "rules") {
    const { data, error } = await db.from("constraints").select("id,section,department,teacher,text,level,checked,request_id").order("pos").order("id");
    return error ? fail("تعذر جلب القيود", 500) : json({ rows: data });
  }
  if (action === "rule_check") {
    const { error } = await db.from("constraints").update({ checked: !!body.checked }).eq("id", Number(body.id));
    return error ? fail("تعذر التحديث", 500) : json({ ok: true });
  }
  if (action === "rule_save") {
    // Edit (id) or add (section) a constraint. A request's constraint keeps that request's field in step.
    const f = { department: str(body.department, 80), teacher: str(body.teacher, 200), text: str(body.text, 3000), level: str(body.level, 40) };
    if (!f.text) return fail("نص القيد مطلوب");
    if (body.id) {
      const { data: old } = await db.from("constraints").select("text,request_id").eq("id", Number(body.id)).maybeSingle();
      if (!old) return fail("القيد غير موجود", 404);
      const { error } = await db.from("constraints").update(old.text !== f.text ? { ...f, checked: false } : f).eq("id", Number(body.id));
      if (error) return fail("تعذر الحفظ", 500);
      if (old.request_id) await db.from("requests").update({ note: f.text }).eq("id", old.request_id);
      return json({ ok: true, id: Number(body.id) });
    }
    const section = str(body.section, 40);
    if (!section) return fail("المجموعة مطلوبة");
    const { data: last } = await db.from("constraints").select("pos").eq("section", section).order("pos", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await db.from("constraints").insert({ ...f, section, pos: (last?.pos ?? 0) + 1 }).select("id,pos").single();
    return error ? fail("تعذر الحفظ", 500) : json({ ok: true, id: data.id });
  }
  if (action === "rule_delete") {
    const { data: old } = await db.from("constraints").select("request_id").eq("id", Number(body.id)).maybeSingle();
    if (!old) return fail("القيد غير موجود", 404);
    const { error } = await db.from("constraints").delete().eq("id", Number(body.id));
    if (error) return fail("تعذر الحذف", 500);
    if (old.request_id) await db.from("requests").update({ note: "" }).eq("id", old.request_id);
    return json({ ok: true });
  }
  if (action === "rules_order") {
    // The ids of one group in their new order.
    const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 300).map(Number).filter(Number.isFinite);
    const res = await Promise.all(ids.map((id: number, i: number) => db.from("constraints").update({ pos: i + 1 }).eq("id", id)));
    return res.some((r) => r.error) ? fail("تعذر حفظ الترتيب", 500) : json({ ok: true });
  }
  if (action === "rules_reset") {
    const { error } = await db.from("constraints").update({ checked: false }).eq("checked", true);
    return error ? fail("تعذر رفع الشطب", 500) : json({ ok: true });
  }
  if (action === "delete") {
    // Removes the request and its attached files; the phone book keeps the sender's number.
    const { data: row } = await db.from("requests").select("file_path,files").eq("id", id).maybeSingle();
    if (!row) return fail("الطلب غير موجود", 404);
    const paths = filesOf(row).map((f) => f.path);
    if (paths.length) await db.storage.from(BUCKET).remove(paths);
    const { error } = await db.from("requests").delete().eq("id", id);
    return error ? fail("تعذر الحذف", 500) : json({ ok: true });
  }
  if (action === "file") {
    // Only files referenced by a request row (`n` = position in its list); short-lived signed URLs.
    const { data: row } = await db.from("requests").select("file_path,file_name,file_type,files").eq("id", id).maybeSingle();
    const f = row ? filesOf(row)[Number(body.n) || 0] : undefined;
    if (!f) return fail("لا يوجد مرفق", 404);
    const view = await db.storage.from(BUCKET).createSignedUrl(f.path, 600);
    const dl = await db.storage.from(BUCKET).createSignedUrl(f.path, 600, { download: f.name });
    if (view.error || dl.error) return fail("تعذر جلب المرفق", 500);
    return json({ view: view.data.signedUrl, download: dl.data.signedUrl });
  }
  return fail("إجراء غير معروف");
});
