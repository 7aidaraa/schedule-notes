#!/usr/bin/env node
// Checks of the Edge Function (supabase/functions/api/index.ts) without Deno, the network or the database:
// `node tools/api_test.js` (exit 1 = a check failed, 2 = typescript not found).
// 1. it still parses; 2. the password checks are constant-time; 3. a teacher reaches only `login` and `submit`;
// 4. nothing but POST is served (the old `?feed=` stays out); 5. CORS allows only the platform's own origin.
const fs = require('fs');
const path = require('path');
let ts;
for (const t of ['typescript', '/opt/node-tools/node_modules/typescript', '/opt/node22/lib/node_modules/typescript']) { try { ts = require(t); break; } catch (e) { /* next */ } }
if (!ts) { console.log('api_test: skipped (typescript not found)'); process.exit(2); }

const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'api', 'index.ts'), 'utf8');
const fails = [];
const check = (ok, why) => { if (!ok) fails.push(why); };

// 1. Parses
const out = ts.transpileModule(src, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
check(!(out.diagnostics || []).length, 'index.ts does not parse: ' + (out.diagnostics || []).map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '));

// 2. Constant-time password checks
check(!/===\s*s\.(admin_pass_sha256|teacher_pass)|s\.(admin_pass_sha256|teacher_pass)\s*===/.test(src), 'a password is compared with === (not constant-time): use sameText()');
check(/sameText\(await sha256\(pass\), s\.admin_pass_sha256\)/.test(src) && /sameText\(pass, s\.teacher_pass\)/.test(src), 'roleOf no longer checks both passwords with sameText()');
const fn = /function sameText[\s\S]*?\n}\n/.exec(src);
check(!!fn, 'sameText() is gone');
if (fn) {
  const sameText = new Function(ts.transpile(fn[0]) + '; return sameText;')();
  check(sameText('abc', 'abc') === true, 'sameText: equal strings');
  check(sameText('abc', 'abd') === false && sameText('abc', 'ab') === false && sameText('ab', 'abc') === false, 'sameText: different strings');
  check(sameText('كلمة', 'كلمة') === true && sameText('كلمة', 'كلمه') === false, 'sameText: Arabic');
  check(sameText('x', '') === false && sameText('x', undefined) === false && sameText('x', null) === false && sameText('undefined', undefined) === false, 'sameText: an unset password never matches');
}

// 3. Role check: before `role !== "admin"` only login and submit are answered.
const gate = src.indexOf('if (role !== "admin") return fail(');
check(gate > 0, 'the admin gate (if (role !== "admin") return fail(...)) is gone');
const before = [...src.slice(0, gate).matchAll(/action === "([a-z_]+)"/g)].map(m => m[1]);
check(before.every(a => a === 'login' || a === 'submit'), 'actions answered before the admin gate: ' + before.join(', ') + ' (only login, submit)');
check(src.indexOf('const role = await roleOf(') < src.indexOf('const action = body.action'), 'the password is no longer checked before any action');

// 4. POST only; no feed
check(/if \(req\.method !== "POST"\) return fail\(/.test(src) && src.indexOf('req.method !== "POST"') < src.indexOf('roleOf(body.pass)'), 'a method other than POST may reach the actions');
check(!/feed/i.test(src.replace(/\/\/.*$/gm, '')), 'a feed endpoint is in index.ts: it stays disabled unless the principal asks (CLAUDE.md)');
check(!/searchParams|new URL\(req\.url/.test(src), 'index.ts reads the query string (a GET-style entry point)');

// 5. CORS: only https://teacher-requests.onrender.com, never "*"; the preflight still answers with the CORS headers
const cors = /const CORS = \{[\s\S]*?\n\};/.exec(src);
check(!!cors, 'the CORS headers object is gone');
if (cors) {
  const origins = [...cors[0].matchAll(/"Access-Control-Allow-Origin":\s*"([^"]*)"/g)].map(m => m[1]);
  check(origins.length === 1 && origins[0] === 'https://teacher-requests.onrender.com', 'Access-Control-Allow-Origin is ' + JSON.stringify(origins) + ' (only https://teacher-requests.onrender.com)');
  check(/"Access-Control-Allow-Methods":\s*"[^"]*OPTIONS/.test(cors[0]), 'OPTIONS is no longer an allowed method');
}
check(!/Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/.test(src), 'a wildcard Access-Control-Allow-Origin is in index.ts');
check(/if \(req\.method === "OPTIONS"\) return new Response\([^)]*\{ headers: CORS \}\)/.test(src) && src.indexOf('req.method === "OPTIONS"') < src.indexOf('req.method !== "POST"'), 'the OPTIONS preflight no longer answers with CORS before the POST-only check');

console.log(fails.length ? fails.map(f => 'FAIL ' + f).join('\n') : 'api_test: all pass');
process.exit(fails.length ? 1 : 0);
