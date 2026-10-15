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
// «دور» and «ظرف»: groups of teachers named in the platform (constraint_groups.kind); «قسم»: every teacher of a department.
const TARGET_TYPES = ["معلّم", "مادّة", "دور", "بارامتر", "ظرف", "قسم"];
const DURATIONS = ["ثابتة", "مؤقتة"];
const GROUP_KINDS = ["دور", "ظرف"];
// Constraints of the new platform that «المنصة القديمة» shows as converted on 2026-10-12: kept for it, not shown here.
const OLD_TODAY = [1105, 1106, 1107, 1108, 1109];
const STATES = ["مسجّل", "خامل", "غير مسجّل", "نوع مقترح"];
function cleanRule(b: Record<string, any>) {
  const w = Math.floor(Number(b.weight));
  return {
    target_type: TARGET_TYPES.includes(b.target_type) ? b.target_type : "معلّم",
    target: str(b.target, 200), ctype: str(b.ctype, 120), pattern: str(b.pattern, 40), value: str(b.value, 500),
    level: str(b.level, 40), weight: b.weight === null || b.weight === "" || !Number.isFinite(w) || w < 0 ? null : w,
    active: b.active !== false, reason: str(b.reason, 3000), department: str(b.department, 80), text: str(b.text, 3000),
    duration: DURATIONS.includes(b.duration) ? b.duration : "ثابتة",
    sheet_state: STATES.includes(b.sheet_state) ? b.sheet_state : "غير مسجّل",
    link_id: Number.isFinite(Number(b.link_id)) && b.link_id ? Number(b.link_id) : null,
  };
}
const ruleError = (r: ReturnType<typeof cleanRule>) =>
  !r.target ? "الهدف مطلوب" : !r.ctype ? "نوع القيد مطلوب" : !r.text ? "نص القيد مطلوب" : ""; // the reason is optional (2026-10-13)
const RULE_COLS = "id,created_at,department,text,level,reason,request_id,target_type,target,ctype,pattern,value,weight,active,duration,sheet_state,link_id,checked,approved,sheet_text";

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
    // The developer also gets what the sheet «المعلمون» says of each teacher: subjects, category, wing supervisor.
    const cols = role === "admin" ? "name,department,nick,uid,subject,subject2,category,wing_sup" : "name,department,nick";
    const { data } = await db.from("teachers").select(cols).order("department").order("name");
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
    const { data, error } = await db.from("constraints").select(RULE_COLS).neq("target_type", "").not("id", "in", "(" + OLD_TODAY.join(",") + ")").order("id");
    const { data: types, error: e2 } = await db.from("constraint_types").select("name,targets,explain").order("created_at");
    const { data: groups, error: e3 } = await db.from("constraint_groups").select("name,members,note,kind,parent").order("created_at");
    return error || e2 || e3 ? fail("تعذر جلب القيود", 500) : json({ rows: data, types, groups });
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
  if (action === "grid_save") {
    // The week grid of one target: the rows it no longer needs go, the new ones come (the untouched rows are not sent).
    const tt = TARGET_TYPES.includes(body.target_type) ? body.target_type : "", target = str(body.target, 200);
    if (!tt || !target) return fail("الهدف مطلوب");
    const add = (Array.isArray(body.add) ? body.add : []).slice(0, 100).map((b: Record<string, any>) => cleanRule({ ...b, target_type: tt, target }));
    const bad = add.map(ruleError).find(Boolean);
    if (bad) return fail(bad);
    const del = (Array.isArray(body.del) ? body.del : []).map(Number).filter(Number.isFinite).slice(0, 200);
    if (del.length) {
      // Only rows of this target (its grid cells and its stickers).
      const { error } = await db.from("constraints").delete().in("id", del).eq("target_type", tt).eq("target", target);
      if (error) return fail("تعذر الحفظ", 500);
    }
    if (!add.length) return json({ ok: true, ids: [] });
    const { data, error } = await db.from("constraints").insert(add.map((r) => ({ ...r, section: "المنصة" }))).select("id");
    return error ? fail("حُذف ما رُفع حجبه، وتعذر حفظ الجديد", 500) : json({ ok: true, ids: (data ?? []).map((r) => r.id) });
  }
  if (action === "group_save") {
    // A role or a circumstance: a named group of teachers (nicks); `old` renames it, and its constraints and sub-roles follow.
    const name = str(body.name, 120), old = str(body.old, 120);
    const kind = GROUP_KINDS.includes(body.kind) ? body.kind : "ظرف", parent = kind === "دور" ? str(body.parent, 120) : "";
    const members = (Array.isArray(body.members) ? body.members : []).map((m: unknown) => str(m, 120)).filter(Boolean);
    if (!name) return fail("الاسم مطلوب");
    if (name !== old) {
      const { data: taken } = await db.from("constraint_groups").select("name").eq("name", name).maybeSingle();
      if (taken) return fail("الاسم مستعمل");
    }
    const { error } = await db.from("constraint_groups").upsert({ name, kind, parent, members: members.join("،"), note: str(body.note, 2000) });
    if (error) return fail("تعذر الحفظ", 500);
    if (old && old !== name) {
      await db.from("constraints").update({ target: name }).eq("target_type", kind).eq("target", old);
      await db.from("constraint_groups").update({ parent: name }).eq("parent", old);
      await db.from("constraint_groups").delete().eq("name", old);
    }
    return json({ ok: true });
  }
  if (action === "group_delete") {
    const name = str(body.name, 120);
    const { data: g } = await db.from("constraint_groups").select("kind").eq("name", name).maybeSingle();
    const { count } = await db.from("constraints").select("id", { count: "exact", head: true }).eq("target_type", g?.kind ?? "ظرف").eq("target", name);
    if (count) return fail("له " + count + " قيد؛ احذفها أولاً");
    const { count: subs } = await db.from("constraint_groups").select("name", { count: "exact", head: true }).eq("parent", name);
    if (subs) return fail("له أدوار فرعية؛ احذفها أولاً");
    const { error } = await db.from("constraint_groups").delete().eq("name", name);
    return error ? fail("تعذر الحذف", 500) : json({ ok: true });
  }
  // ---- Teachers: added, edited and deleted by hand; a new nick carries its constraints and memberships along ----
  if (action === "teacher_save") {
    const old = str(body.old, 120), name = str(body.name, 120), nick = str(body.nick, 120), department = str(body.department, 80);
    if (!name || !department) return fail("الاسم والقسم مطلوبان");
    const row = { name, nick: nick || null, department, subject: str(body.subject, 80), subject2: str(body.subject2, 80) };
    if (name !== old) {
      const { data: taken } = await db.from("teachers").select("name").eq("name", name).maybeSingle();
      if (taken) return fail("الاسم موجود");
    }
    if (!old) {
      const { error } = await db.from("teachers").insert(row);
      return error ? fail("تعذر الحفظ", 500) : json({ ok: true });
    }
    const { data: prev } = await db.from("teachers").select("name,nick").eq("name", old).maybeSingle();
    if (!prev) return fail("المعلم غير موجود", 404);
    const { error } = await db.from("teachers").update(row).eq("name", old);
    if (error) return fail("تعذر الحفظ", 500);
    const was = prev.nick || prev.name, now = nick || name;
    if (was !== now) {
      await db.from("constraints").update({ target: now }).eq("target_type", "معلّم").eq("target", was);
      const { data: gs } = await db.from("constraint_groups").select("name,members");
      for (const g of gs ?? []) {
        const ms = String(g.members || "").split("،");
        if (ms.includes(was)) await db.from("constraint_groups").update({ members: ms.map((m) => m === was ? now : m).join("،") }).eq("name", g.name);
      }
    }
    return json({ ok: true });
  }
  if (action === "teacher_delete") {
    const name = str(body.name, 120);
    const { data: prev } = await db.from("teachers").select("name,nick").eq("name", name).maybeSingle();
    if (!prev) return fail("المعلم غير موجود", 404);
    const nick = prev.nick || prev.name;
    // The teacher goes with its own constraints and its place in every role and circumstance.
    const { error: e1 } = await db.from("constraints").delete().eq("target_type", "معلّم").eq("target", nick);
    if (e1) return fail("تعذر حذف قيوده", 500);
    const { data: gs } = await db.from("constraint_groups").select("name,members");
    for (const g of gs ?? []) {
      const ms = String(g.members || "").split("،");
      if (ms.includes(nick)) await db.from("constraint_groups").update({ members: ms.filter((m) => m !== nick).join("،") }).eq("name", g.name);
    }
    const { error } = await db.from("teachers").delete().eq("name", name);
    return error ? fail("تعذر الحذف", 500) : json({ ok: true });
  }
  if (action === "teachers_sync") {
    // From the sheet «المعلمون» (a file its owner exports): matched by User ID, then by the nick.
    const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 300);
    const { data: all } = await db.from("teachers").select("name,nick,uid");
    let n = 0;
    const missing: string[] = [];
    for (const b of rows) {
      const uid = str(b.uid, 64), nick = str(b.nick, 120);
      const t = (all ?? []).find((x) => uid && x.uid === uid) ?? (all ?? []).find((x) => nick && x.nick === nick);
      if (!t) { if (nick) missing.push(nick); continue; }
      const { error } = await db.from("teachers").update({
        subject: str(b.subject, 80), subject2: str(b.subject2, 80), category: str(b.category, 80), wing_sup: b.wing_sup === true,
      }).eq("name", t.name);
      if (error) return fail("تعذر التحديث", 500);
      n++;
    }
    return json({ ok: true, n, missing });
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
  if (action === "rule_sheet_text") {
    // The sheet's wording, written by hand under each constraint of the list.
    const { error } = await db.from("constraints").update({ sheet_text: str(body.sheet_text, 3000) }).eq("id", Number(body.id)).neq("target_type", "");
    return error ? fail("تعذر الحفظ", 500) : json({ ok: true });
  }
  if (action === "rule_approve") {
    // Approved by the administration, or not: set by hand, one constraint at a time.
    const { error } = await db.from("constraints").update({ approved: !!body.approved }).eq("id", Number(body.id)).neq("target_type", "");
    return error ? fail("تعذر التحديث", 500) : json({ ok: true });
  }
  if (action === "rules_reset") {
    // Each platform clears its own ticks: the old list (no target type) or the sheet-terms rows.
    const q = db.from("constraints").update({ checked: false }).eq("checked", true);
    const { error } = await (body.old ? q.eq("target_type", "") : q.neq("target_type", ""));
    return error ? fail("تعذر رفع الشطب", 500) : json({ ok: true });
  }
  // ---- «مهام سريعة» (spec 2026-10-15): read and tick only; the items come from a seed ----
  if (action === "tasks") {
    const { data, error } = await db.from("quick_tasks").select("id,sec,pos,title,body,done").order("sec").order("pos");
    return error ? fail("تعذر جلب المهام", 500) : json({ rows: data });
  }
  if (action === "task_check") {
    const { error } = await db.from("quick_tasks").update({ done: !!body.done }).eq("id", Number(body.id));
    return error ? fail("تعذر التحديث", 500) : json({ ok: true });
  }
  if (action === "tasks_reset") {
    const { error } = await db.from("quick_tasks").update({ done: false }).eq("done", true);
    return error ? fail("تعذر رفع الشطب", 500) : json({ ok: true });
  }
  // ---- «المنصة القديمة»: the constraints as one long list of free text (before the sheet terms), until the merge ----
  if (action === "old_rules") {
    const { data, error } = await db.from("constraints").select("id,created_at,section,pos,teacher,department,text,level,reason,checked")
      .eq("target_type", "").order("id");
    // Constraints converted from requests on 2026-10-12 (the requests themselves were deleted): shown as recovered requests.
    const { data: today, error: e2 } = await db.from("constraints").select(RULE_COLS).in("id", [1105, 1106, 1107, 1108, 1109]).order("id");
    return error || e2 ? fail("تعذر جلب القيود", 500) : json({ rows: data, today });
  }
  if (action === "old_rule_save") {
    const r = { text: str(body.text, 3000), teacher: str(body.teacher, 120), department: str(body.department, 80), level: str(body.level, 40), reason: str(body.reason, 3000) };
    if (!r.text) return fail("نص القيد مطلوب");
    if (body.id) {
      const { error } = await db.from("constraints").update(r).eq("id", Number(body.id)).eq("target_type", "");
      return error ? fail("تعذر الحفظ", 500) : json({ ok: true, id: Number(body.id) });
    }
    const { data: last } = await db.from("constraints").select("pos").eq("target_type", "").order("pos", { ascending: false }).limit(1).maybeSingle();
    const section = body.request_id ? "من الطلبات" : "المنصة القديمة";
    const { data, error } = await db.from("constraints").insert({ ...r, section, pos: (last?.pos ?? 0) + 1, target_type: "" }).select("id").single();
    if (error) return fail("تعذر الحفظ", 500);
    // A request answered here stays in the list (marked done) until the two platforms are merged.
    const rid = str(body.request_id, 64);
    if (rid) await db.from("requests").update({ done: true, note: r.text }).eq("id", rid);
    return json({ ok: true, id: data.id });
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
