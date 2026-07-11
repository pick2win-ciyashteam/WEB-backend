// Plain Node.js load test for full registration (k6 CLI not installed on
// this machine). Registers TOTAL new users end-to-end: signup -> parse
// emailOtp from the signup response (only returned when NODE_ENV !=
// production, see user.auth.services.js) -> verify-email-otp. Mobile is
// stored but no longer OTP-verified. No real SMS/email is sent and no
// coins/payment are involved anywhere in this flow.
// Run: TOTAL=500 CONCURRENCY=20 node full-registration-test.js
import { writeFileSync } from "fs";

const BASE_URL    = process.env.BASE_URL || "http://localhost:3000/api/user/user-auth";
const TOTAL       = Number(process.env.TOTAL || 500);
const CONCURRENCY = Number(process.env.CONCURRENCY || 20);
const RUN_ID      = process.env.RUN_ID || `${Date.now()}`;
const PASSWORD    = "Test@123";

function buildUser(i) {
  const batch = String(Math.floor(i / 100)).padStart(2, "0");
  const idx = String(i % 100).padStart(3, "0");
  const uid = `${RUN_ID}_${batch}_${idx}`;
  const mobile = "9" + String(RUN_ID).slice(-5) + batch + idx;
  const email = `k6user_${uid}@p2wtest.com`;
  return { uid, mobile, email };
}

async function registerOne(i) {
  const { uid, mobile, email } = buildUser(i);
  const start = Date.now();
  const result = { email, mobile, ok: false, stage: null, error: null, durationMs: null };

  try {
    const signupRes = await fetch(`${BASE_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullname: `K6 Test User ${uid}`,
        email,
        mobile,
        country: "India",
        date_of_birth: "1995-05-15",
        password: PASSWORD,
      }),
    });
    const signupBody = await signupRes.json();

    if (signupRes.status !== 200 || signupBody.success !== true) {
      result.stage = "signup";
      result.error = `status=${signupRes.status} body=${JSON.stringify(signupBody)}`;
      return result;
    }

    const { emailOtp } = signupBody;

    const verifyEmailRes = await fetch(`${BASE_URL}/verify-email-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp: emailOtp }),
    });
    const verifyEmailBody = await verifyEmailRes.json();

    if (verifyEmailRes.status !== 200 || verifyEmailBody.success !== true) {
      result.stage = "verify-email-otp";
      result.error = `status=${verifyEmailRes.status} body=${JSON.stringify(verifyEmailBody)}`;
      return result;
    }

    if (verifyEmailBody.registered !== true) {
      result.stage = "registration-not-confirmed";
      result.error = `verifyEmailBody.registered=${verifyEmailBody.registered}`;
      return result;
    }

    result.ok = true;
    return result;
  } catch (err) {
    result.stage = result.stage || "exception";
    result.error = err.message;
    return result;
  } finally {
    result.durationMs = Date.now() - start;
  }
}

async function runPool(count, concurrency, worker) {
  const results = new Array(count);
  let next = 0;
  async function runner() {
    while (next < count) {
      const i = next++;
      results[i] = await worker(i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

(async () => {
  console.log(`Running full-registration test: ${TOTAL} users, concurrency=${CONCURRENCY}, RUN_ID=${RUN_ID}`);
  const startedAt = Date.now();
  const results = await runPool(TOTAL, CONCURRENCY, registerOne);
  const totalMs = Date.now() - startedAt;

  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total: ${results.length}  Passed: ${passed.length}  Failed: ${failed.length}`);
  console.log(`Total wall time: ${(totalMs / 1000).toFixed(1)}s`);
  const avgMs = results.reduce((s, r) => s + (r.durationMs || 0), 0) / results.length;
  console.log(`Avg per-user time: ${avgMs.toFixed(0)}ms`);

  if (failed.length) {
    console.log(`\n=== FAILURES (first 20) ===`);
    for (const f of failed.slice(0, 20)) {
      console.log(`[${f.email}] stage=${f.stage} error=${f.error}`);
    }
  }

  const loginUsers = passed.map((r) => ({ email: r.email, password: PASSWORD }));
  const loginUsersFile = new URL(`./results/login_users_${RUN_ID}.json`, import.meta.url);
  writeFileSync(loginUsersFile, JSON.stringify(loginUsers, null, 2));
  console.log(`\n${loginUsers.length} registered users written to ${loginUsersFile.pathname.replace(/^\/([A-Za-z]):/, "$1:")}`);

  const outFile = new URL(`./results/full_registration_${RUN_ID}.json`, import.meta.url);
  writeFileSync(outFile, JSON.stringify({ TOTAL, CONCURRENCY, RUN_ID, totalMs, results }, null, 2));
  console.log(`Full results written to ${outFile.pathname.replace(/^\/([A-Za-z]):/, "$1:")}`);
})();
