import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/user/user-auth';
const RUN_ID   = __ENV.RUN_ID || `${Date.now()}`;
const TOTAL    = Number(__ENV.TOTAL || 100);
const VUS      = Number(__ENV.VUS || 20);

export const options = {
  scenarios: {
    full_registration: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: TOTAL,
      maxDuration: '5m',
    },
  },
  thresholds: {
    signup_success_rate:        ['rate>0.95'],
    verify_mobile_success_rate: ['rate>0.95'],
    verify_email_success_rate:  ['rate>0.95'],
    registration_complete_rate: ['rate>0.95'],
  },
};

const signupDuration       = new Trend('signup_duration', true);
const verifyMobileDuration = new Trend('verify_mobile_duration', true);
const verifyEmailDuration  = new Trend('verify_email_duration', true);

const signupSuccessRate        = new Rate('signup_success_rate');
const verifyMobileSuccessRate  = new Rate('verify_mobile_success_rate');
const verifyEmailSuccessRate   = new Rate('verify_email_success_rate');
const registrationCompleteRate = new Rate('registration_complete_rate');

const signupFailures       = new Counter('signup_failures');
const verifyMobileFailures = new Counter('verify_mobile_failures');
const verifyEmailFailures  = new Counter('verify_email_failures');

const params = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  const uid = `${RUN_ID}_${__VU}_${__ITER}`;
  const mobile =
    '9' +
    String(RUN_ID).slice(-5) +
    String(__VU).padStart(2, '0') +
    String(__ITER).padStart(3, '0');
  const email = `k6user_${uid}@p2wtest.com`;

  /* ── 1. SIGNUP ── */
  const signupPayload = JSON.stringify({
    fullname:      `K6 Test User ${uid}`,
    email,
    mobile,
    country:       'India',
    date_of_birth: '1995-05-15',
    password:      'Test@123',
  });

  const signupRes = http.post(`${BASE_URL}/signup`, signupPayload, params);
  signupDuration.add(signupRes.timings.duration);

  let signupBody = {};
  try { signupBody = JSON.parse(signupRes.body); } catch (e) {}

  const signupOk = check(signupRes, {
    'signup status 200': (r) => r.status === 200,
    'signup success true': () => signupBody.success === true,
  });
  signupSuccessRate.add(signupOk);
  if (!signupOk) {
    signupFailures.add(1);
    console.error(`SIGNUP FAILED [VU:${__VU} ITER:${__ITER}] status=${signupRes.status} body=${signupRes.body}`);
    return; // can't continue without OTPs
  }

  const mobileOtp = signupBody.mobileOtp;
  const emailOtp  = signupBody.emailOtp;

  sleep(0.2);

  /* ── 2. VERIFY MOBILE OTP ── */
  const verifyMobileRes = http.post(
    `${BASE_URL}/verify-mobile-otp`,
    JSON.stringify({ mobile, otp: mobileOtp }),
    params
  );
  verifyMobileDuration.add(verifyMobileRes.timings.duration);

  let verifyMobileBody = {};
  try { verifyMobileBody = JSON.parse(verifyMobileRes.body); } catch (e) {}

  const verifyMobileOk = check(verifyMobileRes, {
    'verify-mobile status 200': (r) => r.status === 200,
    'verify-mobile success true': () => verifyMobileBody.success === true,
  });
  verifyMobileSuccessRate.add(verifyMobileOk);
  if (!verifyMobileOk) {
    verifyMobileFailures.add(1);
    console.error(`VERIFY-MOBILE FAILED [VU:${__VU} ITER:${__ITER}] status=${verifyMobileRes.status} body=${verifyMobileRes.body}`);
  }

  sleep(0.2);

  /* ── 3. VERIFY EMAIL OTP ── */
  const verifyEmailRes = http.post(
    `${BASE_URL}/verify-email-otp`,
    JSON.stringify({ email, otp: emailOtp }),
    params
  );
  verifyEmailDuration.add(verifyEmailRes.timings.duration);

  let verifyEmailBody = {};
  try { verifyEmailBody = JSON.parse(verifyEmailRes.body); } catch (e) {}

  const verifyEmailOk = check(verifyEmailRes, {
    'verify-email status 200': (r) => r.status === 200,
    'verify-email success true': () => verifyEmailBody.success === true,
  });
  verifyEmailSuccessRate.add(verifyEmailOk);
  if (!verifyEmailOk) {
    verifyEmailFailures.add(1);
    console.error(`VERIFY-EMAIL FAILED [VU:${__VU} ITER:${__ITER}] status=${verifyEmailRes.status} body=${verifyEmailRes.body}`);
  }

  /* ── Registration complete only when the 2nd verification reports registered:true ── */
  const completed = verifyMobileBody.registered === true || verifyEmailBody.registered === true;
  registrationCompleteRate.add(completed);

  sleep(0.3);
}
