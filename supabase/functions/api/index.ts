// Teacher requests API (Supabase Edge Function). Auth = shared passwords stored in public.settings.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  heic: "image/heic", heif: "image/heif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
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

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("طلب غير صالح"); }

  const role = await roleOf(body.pass);
  if (!role) return fail("كلمة السر غير صحيحة", 401);
  const action = body.action;

  if (action === "login") {
    if (role !== "teacher") return json({ role });
    // Department → teacher names for the form's dropdowns (only after a valid password).
    const { data } = await db.from("teachers").select("name,department,is_head").order("department").order("name");
    return json({ role, teachers: data ?? [] });
  }

  if (action === "submit") {
    if (role !== "teacher") return fail("غير مصرح", 403);
    const name = str(body.name, 120), request = str(body.request, 3000), reason = str(body.reason, 3000);
    const department = str(body.department, 80);
    const phone = str(body.phone, 20).replace(/[\s-]/g, "").replace(/^(\+|00)965/, "");
    if (!name || !department || !request || !reason || !phone) return fail("جميع الحقول مطلوبة");
    if (!/^[2569]\d{7}$/.test(phone)) return fail("رقم الهاتف يجب أن يكون 8 أرقام");
    // Role comes from the staff directory, never from the form.
    const { data: staff } = await db.from("teachers").select("is_head").eq("name", name).maybeSingle();
    const kind = staff?.is_head ? "head" : "teacher";
    if (body.file && kind !== "head") return fail("ميزانية القسم يرفعها رئيس القسم فقط");

    let file_path = null, file_name = null, file_type = null;
    if (body.file) {
      const fname = str(body.file.name, 150) || "مرفق";
      const ext = (fname.split(".").pop() || "").toLowerCase();
      const type = TYPES[ext];
      if (!type) return fail("الملف يجب أن يكون PDF أو صورة أو Word أو Excel");
      const bytes = b64ToBytes(String(body.file.data || ""));
      if (!bytes.length) return fail("المرفق فارغ");
      if (bytes.length > MAX_BYTES) return fail("حجم المرفق يتجاوز 10 ميغابايت");
      file_path = `${crypto.randomUUID()}.${ext}`;
      const up = await db.storage.from(BUCKET).upload(file_path, bytes, { contentType: type });
      if (up.error) return fail("تعذر رفع المرفق، حاول مجدداً", 500);
      file_name = fname;
      file_type = type;
    }
    const { error } = await db.from("requests").insert({ name, department, role: kind, phone, request, reason, file_path, file_name, file_type });
    if (error) return fail("تعذر حفظ الطلب، حاول مجدداً", 500);
    await db.from("contacts").upsert({ name, department, role: kind, phone, updated_at: new Date().toISOString() });
    return json({ ok: true });
  }

  if (role !== "admin") return fail("غير مصرح", 403);

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
    const { error } = await db.from("requests").update({ note: str(body.note, 3000) }).eq("id", id);
    return error ? fail("تعذر الحفظ", 500) : json({ ok: true });
  }
  if (action === "file") {
    // Only files referenced by a request row; short-lived signed URLs.
    const { data: row } = await db.from("requests").select("file_path,file_name").eq("id", id).single();
    if (!row?.file_path) return fail("لا يوجد مرفق", 404);
    const view = await db.storage.from(BUCKET).createSignedUrl(row.file_path, 600);
    const dl = await db.storage.from(BUCKET).createSignedUrl(row.file_path, 600, { download: row.file_name });
    if (view.error || dl.error) return fail("تعذر جلب المرفق", 500);
    return json({ view: view.data.signedUrl, download: dl.data.signedUrl });
  }
  return fail("إجراء غير معروف");
});
