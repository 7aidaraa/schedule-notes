// Timetable notes API (Supabase Edge Function). Auth = shared passwords stored in public.settings.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "attachments"; // files of old requests only: teachers no longer attach anything
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const cleanPhone = (v: unknown) => str(v, 20).replace(/[\s-]/g, "").replace(/^(\+|00)965/, "");
const PHONE = /^[2569]\d{7}$/;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Two passwords: the developer (admin) and the teachers.
async function roleOf(pass: string): Promise<"admin" | "teacher" | null> {
  const { data } = await db.from("settings").select("key,value");
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  pass = str(pass, 200);
  if (!pass) return null;
  if (await sha256(pass) === s.admin_pass_sha256) return "admin";
  if (pass === s.teacher_pass) return "teacher";
  return null;
}

// Attachments of a row: the `files` list, or the single file of rows saved before it existed.
type Att = { path: string; name: string; type: string };
function filesOf(r: Record<string, any>): Att[] {
  if (Array.isArray(r.files) && r.files.length) return r.files;
  return r.file_path ? [{ path: r.file_path, name: r.file_name, type: r.file_type }] : [];
}
async function deleteRequest(id: string) {
  const { data: row } = await db.from("requests").select("file_path,files").eq("id", id).maybeSingle();
  if (!row) return "الطلب غير موجود";
  const paths = filesOf(row).map((f) => f.path);
  if (paths.length) await db.storage.from(BUCKET).remove(paths);
  const { error } = await db.from("requests").delete().eq("id", id);
  return error ? "تعذر حذف الطلب" : "";
}

// A constraint in the sheet's terms (sheet «القيود», section three, columns A–I) plus the platform's own fields.
const TARGET_TYPES = ["معلّم", "مادّة", "دور", "بارامتر"];
const DURATIONS = ["دائمة", "شبه دائمة", "مؤقتة"];
const STATES = ["مسجّل", "خامل", "غير مسجّل", "نوع مقترح"];
function cleanRule(b: Record<string, any>) {
  const w = Math.floor(Number(b.weight));
  return {
    target_type: TARGET_TYPES.includes(b.target_type) ? b.target_type : "معلّم",
    target: str(b.target, 200), ctype: str(b.ctype, 120), pattern: str(b.pattern, 40), value: str(b.value, 500),
    level: str(b.level, 40), weight: b.weight === null || b.weight === "" || !Number.isFinite(w) || w < 0 ? null : w,
    active: b.active !== false, reason: str(b.reason, 3000), department: str(b.department, 80), text: str(b.text, 3000),
    duration: DURATIONS.includes(b.duration) ? b.duration : "شبه دائمة",
    sheet_state: STATES.includes(b.sheet_state) ? b.sheet_state : "غير مسجّل",
    link_id: Number.isFinite(Number(b.link_id)) && b.link_id ? Number(b.link_id) : null,
  };
}
const ruleError = (r: ReturnType<typeof cleanRule>) =>
  !r.target ? "الهدف مطلوب" : !r.ctype ? "نوع القيد مطلوب" : !r.reason ? "الملاحظة (السبب) مطلوبة" : !r.text ? "نص القيد مطلوب" : "";
const RULE_COLS = "id,created_at,department,text,level,reason,request_id,target_type,target,ctype,pattern,value,weight,active,duration,sheet_state,link_id,checked";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("طلب غير صالح"); }

  const role = await roleOf(body.pass);
  if (!role) return fail("كلمة السر غير صحيحة", 401);
  const action = body.action;

  if (action === "login") {
    // Department → teacher names for the form's lists, and which names already have a number in the phone book
    // (its last four digits only: the teachers share one password).
    const { data } = await db.from("teachers").select("name,department,nick").order("department").order("name");
    const { data: book } = await db.from("contacts").select("name,phone");
    const phones = Object.fromEntries((book ?? []).filter((c) => c.phone).map((c) => [c.name, String(c.phone).slice(-4)]));
    return json({ role, teachers: data ?? [], phones });
  }

  if (action === "submit") {
    const name = str(body.name, 120), request = str(body.request, 3000), reason = str(body.reason, 3000);
    const department = str(body.department, 80);
    let phone = cleanPhone(body.phone);
    // «•••• 1234»: the number already in the phone book, kept on the server.
    if (!phone && body.keep_phone) {
      const { data: c } = await db.from("contacts").select("phone").eq("name", name).maybeSingle();
      phone = c?.phone ?? "";
    }
    if (!name || !department || !request || !reason || !phone) return fail("جميع الحقول مطلوبة");
    if (!PHONE.test(phone)) return fail("رقم الهاتف يجب أن يكون 8 أرقام");
    const { error } = await db.from("requests").insert({ name, department, role: "teacher", phone, request, reason, files: [], by_admin: false });
    if (error) return fail("تعذر حفظ الطلب، حاول مجدداً", 500);
    await db.from("contacts").upsert({ name, department, role: "teacher", phone, updated_at: new Date().toISOString() });
    return json({ ok: true });
  }

  if (role !== "admin") return fail("غير مصرح", 403);

  if (action === "list") {
    const { data, error } = await db.from("requests").select("*").order("created_at", { ascending: false });
    return error ? fail("تعذر جلب الطلبات", 500) : json({ rows: data });
  }

  // ---- Phone book ----
  if (action === "contacts") {
    const { data, error } = await db.from("contacts").select("*").order("department").order("name");
    return error ? fail("تعذر جلب الأرقام", 500) : json({ rows: data });
  }
  if (action === "contact_save") {
    // `old` = the name before editing (the name is the key); empty for a new entry.
    const old = str(body.old, 120), name = str(body.name, 120), department = str(body.department, 80), phone = cleanPhone(body.phone);
    if (!name || !phone) return fail("الاسم والرقم مطلوبان");
    if (!PHONE.test(phone)) return fail("رقم الهاتف يجب أن يكون 8 أرقام");
    if (name !== old) {
      const { data: taken } = await db.from("contacts").select("name").eq("name", name).maybeSingle();
      if (taken) return fail("الاسم موجود في الدفتر");
    }
    const { error } = await db.from("contacts").upsert({ name, department, role: "teacher", phone, updated_at: new Date().toISOString() });
    if (error) return fail("تعذر الحفظ", 500);
    if (old && old !== name) await db.from("contacts").delete().eq("name", old);
    return json({ ok: true });
  }
  if (action === "contact_delete") {
    const { error } = await db.from("contacts").delete().eq("name", str(body.name, 120));
    return error ? fail("تعذر الحذف", 500) : json({ ok: true });
  }

  // ---- Constraints ----
  if (action === "rules") {
    // Rows from before the sheet-terms template (no target type) stay in the table, unshown.
    const { data, error } = await db.from("constraints").select(RULE_COLS).neq("target_type", "").order("id");
    const { data: types, error: e2 } = await db.from("constraint_types").select("name,targets,explain").order("created_at");
    return error || e2 ? fail("تعذر جلب القيود", 500) : json({ rows: data, types });
  }
  if (action === "rule_save") {
    // Edit (id) or add. `request_id`: the request it comes from, deleted (with its files) once the constraint is saved.
    const r = cleanRule(body);
    const err = ruleError(r);
    if (err) return fail(err);
    if (body.id) {
      const { error } = await db.from("constraints").update(r).eq("id", Number(body.id));
      return error ? fail("تعذر الحفظ", 500) : json({ ok: true, id: Number(body.id) });
    }
    const { data, error } = await db.from("constraints").insert({ ...r, section: "المنصة" }).select("id").single();
    if (error) return fail("تعذر الحفظ", 500);
    const rid = str(body.request_id, 64);
    if (rid) {
      const e = await deleteRequest(rid);
      if (e) return json({ ok: true, id: data.id, warning: "حُفظ القيد، و" + e });
    }
    return json({ ok: true, id: data.id });
  }
  if (action === "rule_move") {
    const duration = DURATIONS.includes(body.duration) ? body.duration : "";
    if (!duration) return fail("المدة غير معروفة");
    const { error } = await db.from("constraints").update({ duration }).eq("id", Number(body.id));
    return error ? fail("تعذر النقل", 500) : json({ ok: true });
  }
  if (action === "rule_check") {
    // The checklist: a constraint ticked off after checking the exported timetable.
    const { error } = await db.from("constraints").update({ checked: !!body.checked }).eq("id", Number(body.id));
    return error ? fail("تعذر التحديث", 500) : json({ ok: true });
  }
  if (action === "rules_reset") {
    const { error } = await db.from("constraints").update({ checked: false }).eq("checked", true);
    return error ? fail("تعذر رفع الشطب", 500) : json({ ok: true });
  }
  if (action === "rule_delete") {
    const { error } = await db.from("constraints").delete().eq("id", Number(body.id));
    return error ? fail("تعذر الحذف", 500) : json({ ok: true });
  }
  if (action === "rules_state") {
    // After importing the sheet's file: { id: state } for every constraint whose label changed.
    const pairs = Object.entries(body.states ?? {}).slice(0, 1000).filter(([, s]) => STATES.includes(s as string));
    const res = await Promise.all(pairs.map(([id, s]) => db.from("constraints").update({ sheet_state: s }).eq("id", Number(id))));
    return res.some((x) => x.error) ? fail("تعذر تحديث بعض الوسوم", 500) : json({ ok: true, n: pairs.length });
  }
  if (action === "type_save") {
    const name = str(body.name, 120), old = str(body.old, 120);
    const targets = (Array.isArray(body.targets) ? body.targets : []).filter((t: string) => TARGET_TYPES.includes(t) && t !== "بارامتر");
    if (!name) return fail("اسم النوع مطلوب");
    if (!targets.length) return fail("اختر نوع الهدف");
    const row = { name, targets: targets.join("،"), explain: str(body.explain, 2000) };
    const { error } = await db.from("constraint_types").upsert(row);
    if (error) return fail("تعذر الحفظ", 500);
    if (old && old !== name) {
      await db.from("constraints").update({ ctype: name }).eq("ctype", old);
      await db.from("constraint_types").delete().eq("name", old);
    }
    return json({ ok: true });
  }
  if (action === "type_delete") {
    const name = str(body.name, 120);
    const { count } = await db.from("constraints").select("id", { count: "exact", head: true }).eq("ctype", name);
    if (count) return fail("النوع مستعمل في " + count + " قيد");
    const { error } = await db.from("constraint_types").delete().eq("name", name);
    return error ? fail("تعذر الحذف", 500) : json({ ok: true });
  }

  // ---- Requests ----
  const id = str(body.id, 64);
  if (action === "delete") {
    const e = await deleteRequest(id);
    return e ? fail(e, e === "الطلب غير موجود" ? 404 : 500) : json({ ok: true });
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
