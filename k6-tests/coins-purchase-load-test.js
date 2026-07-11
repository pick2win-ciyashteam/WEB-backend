import http from 'k6/http';
import crypto from 'k6/crypto';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/user';
const SECRET   = __ENV.RAZORPAY_KEY_SECRET;
if (!SECRET) {
  throw new Error('RAZORPAY_KEY_SECRET env var is required (pass via --env)');
}

const users = new SharedArray('purchase users', function () {
  return JSON.parse(open('./results/login_users.json'));
});

/* coins = pack coins + bonus_coins, matching what verifyCoinsPayment credits */
const PLANS = [
  { id: 1, coins: 55,  price: 4.99 },  // Starter Pack (50 + 5 bonus)
  { id: 2, coins: 230, price: 14.99 }, // Pro Pack (200 + 30 bonus)
];

export const options = {
  scenarios: {
    coins_purchase: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 20),
      iterations: users.length,
      maxDuration: '5m',
    },
  },
  thresholds: {
    purchase_success_rate: ['rate>0.95'],
  },
};

const loginDuration       = new Trend('login_duration', true);
const purchaseDuration    = new Trend('purchase_duration', true);
const purchaseSuccessRate = new Rate('purchase_success_rate');
const purchaseFailures    = new Counter('purchase_failures');

const jsonParams = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  // __ITER is per-VU (not globally unique) — use the scenario-wide
  // iteration counter so each of the 100 iterations maps to a distinct user.
  const globalIter = exec.scenario.iterationInTest;
  const user = users[globalIter % users.length];
  const plan = PLANS[globalIter % PLANS.length];

  /* ── Login (need a fresh token) ── */
  const loginRes = http.post(
    `${BASE_URL}/user-auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    jsonParams
  );
  loginDuration.add(loginRes.timings.duration);

  let loginBody = {};
  try { loginBody = JSON.parse(loginRes.body); } catch (e) {}

  if (loginRes.status !== 200 || !loginBody.token) {
    purchaseFailures.add(1);
    purchaseSuccessRate.add(false);
    console.error(`LOGIN FAILED [${user.email}] status=${loginRes.status} body=${loginRes.body}`);
    return;
  }

  const authParams = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.token}`,
    },
  };

  /* ── Simulate a verified Razorpay payment — self-signed with the same
     secret verifyCoinsPayment checks against, so no real Razorpay API is
     ever called and no money moves. ── */
  const orderId     = `order_k6test_${__VU}_${__ITER}_${Date.now()}`;
  const paymentId   = `pay_k6test_${__VU}_${__ITER}_${Date.now()}`;
  const signature   = crypto.hmac('sha256', SECRET, `${orderId}|${paymentId}`, 'hex');
  const amountPaise = Math.round(plan.price * 100);

  const verifyRes = http.post(
    `${BASE_URL}/deposite/verify-payment`,
    JSON.stringify({
      razorpay_order_id:   orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature:  signature,
      plan_id:             plan.id,
      coins:                plan.coins,
      amount:               amountPaise,
    }),
    authParams
  );
  purchaseDuration.add(verifyRes.timings.duration);

  let verifyBody = {};
  try { verifyBody = JSON.parse(verifyRes.body); } catch (e) {}

  const ok = check(verifyRes, {
    'purchase status 200': (r) => r.status === 200,
    'purchase success true': () => verifyBody.success === true,
  });

  purchaseSuccessRate.add(ok);
  if (!ok) {
    purchaseFailures.add(1);
    console.error(`PURCHASE FAILED [${user.email}] status=${verifyRes.status} body=${verifyRes.body}`);
  }

  sleep(0.2);
}
