// Plain Node.js load test for login (k6 CLI not installed on this machine).
// Fires ALL users' login requests at the same time (true concurrency, not a
// throttled worker pool) and records each user's individual login time.
// Run: USERS_FILE=./results/login_users_<RUN_ID>.json node login-test.js
import { readFileSync, writeFileSync } from "fs";

const BASE_URL   = process.env.BASE_URL || "http://localhost:3000/api/user/user-auth";
const USERS_FILE = process.env.USERS_FILE || "./results/login_users.json";

const users = JSON.parse(readFileSync(new URL(USERS_FILE, import.meta.url)));

async function loginOne(user) {
  const start = Date.now();
  const result = { email: user.email, ok: false, error: null, durationMs: null };
  try {
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    const body = await res.json();
    if (res.status !== 200 || body.success !== true || !body.token) {
      result.error = `status=${res.status} body=${JSON.stringify(body)}`;
      return result;
    }
    result.ok = true;
    return result;
  } catch (err) {
    result.error = err.message;
    return result;
  } finally {
    result.durationMs = Date.now() - start;
  }
}

(async () => {
  console.log(`Running login test: ${users.length} users, ALL AT ONCE (full concurrency), users file=${USERS_FILE}`);
  const startedAt = Date.now();

  // Fire every login request simultaneously — no queueing, no throttling.
  const results = await Promise.all(users.map((u) => loginOne(u)));

  const totalMs = Date.now() - startedAt;

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total: ${results.length}  Passed: ${passed.length}  Failed: ${failed.length}`);
  console.log(`Total wall time (all ${users.length} fired simultaneously): ${(totalMs / 1000).toFixed(1)}s`);
  const avgMs = results.reduce((s, r) => s + (r.durationMs || 0), 0) / results.length;
  const minMs = Math.min(...results.map((r) => r.durationMs));
  const maxMs = Math.max(...results.map((r) => r.durationMs));
  console.log(`Per-user login time — avg: ${avgMs.toFixed(0)}ms  min: ${minMs}ms  max: ${maxMs}ms`);

  if (failed.length) {
    console.log(`\n=== FAILURES (first 20) ===`);
    for (const f of failed.slice(0, 20)) {
      console.log(`[${f.email}] error=${f.error}`);
    }
  }

  const runId = Date.now();
  const outFile = new URL(`./results/login_test_${runId}.json`, import.meta.url);
  writeFileSync(outFile, JSON.stringify({ USERS_FILE, totalMs, results }, null, 2));
  console.log(`\nFull results written to ${outFile.pathname.replace(/^\/([A-Za-z]):/, "$1:")}`);
})();
