import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt    from "jsonwebtoken";
import db     from "../../../config/db.js";

/* ================= SIGNUP — store temp + send both OTPs ================= */
export const signupService = async (data) => {
  const { fullname, email, mobile, country, date_of_birth, password } = data;
  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* ── 1. Age Check ── */
  const age = new Date(Date.now() - new Date(date_of_birth)).getUTCFullYear() - 1970;
  if (age < 18) throw new Error("You must be at least 18 years old");

  /* ── 2. Duplicate Check in users table ── */
  const [[[emailUser]], [[mobileUser]]] = await Promise.all([
    db.execute(`SELECT id, account_status FROM users WHERE email = ?`,  [email]),
    db.execute(`SELECT id, account_status FROM users WHERE mobile = ?`, [normalizedMobile]),
  ]);

  if (emailUser) {
    throw new Error(
      emailUser.account_status === "deleted"
        ? "This email was previously deleted. Contact support."
        : "Email already registered"
    );
  }

  if (mobileUser) {
    throw new Error(
      mobileUser.account_status === "deleted"
        ? "This mobile was previously deleted. Contact support."
        : "Mobile already registered"
    );
  }

  /* ── 3. Hash Password ── */
  const hashedPassword = await bcrypt.hash(password, 10);

  /* ── 4. Generate both OTPs ── */
  const mobileOtp      = crypto.randomInt(100000, 999999).toString();
  const emailOtp       = crypto.randomInt(100000, 999999).toString();
  const otpExpiry      = new Date(Date.now() + 5 * 60 * 1000);  // 5 mins
  const sessionExpiry  = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  /* ── 5. Save to signup_sessions (NOT users table) ── */
  await db.execute(
    `INSERT INTO signup_sessions
       (fullname, email, mobile, country, date_of_birth, password,
        mobile_otp, mobile_otp_expiry,
        email_otp,  email_otp_expiry,
        mobile_verified, email_verified, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
     ON DUPLICATE KEY UPDATE
       mobile_otp         = VALUES(mobile_otp),
       mobile_otp_expiry  = VALUES(mobile_otp_expiry),
       email_otp          = VALUES(email_otp),
       email_otp_expiry   = VALUES(email_otp_expiry),
       mobile_verified    = 0,
       email_verified     = 0,
       expires_at         = VALUES(expires_at)`,
    [
      fullname, email, normalizedMobile, country, date_of_birth, hashedPassword,
      mobileOtp, otpExpiry,
      emailOtp,  otpExpiry,
      sessionExpiry,
    ]
  );

  /* ── 6. Send both OTPs ── */
  // await sendSms(normalizedMobile, `Your OTP is ${mobileOtp}`);
  // await sendEmail(email, `Your OTP is ${emailOtp}`);

  return {
    success: true,
    message: "OTP sent to your mobile and email. Please verify both.",
    ...(process.env.NODE_ENV !== "production" && { mobileOtp, emailOtp }),
  };
};

/* ================= VERIFY MOBILE OTP ================= */
export const verifyMobileOtpService = async ({ mobile, otp }) => {
  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* ── 1. Fetch session by MOBILE ── */
  const [[session]] = await db.execute(
    `SELECT id, mobile_otp, mobile_otp_expiry,
            mobile_verified, email_verified, expires_at
     FROM signup_sessions
     WHERE mobile = ?`,
    [normalizedMobile]
  );

  if (!session)                                          throw new Error("Session not found. Please signup again.");
  if (new Date(session.expires_at) < new Date())         throw new Error("Session expired. Please signup again.");
  if (session.mobile_verified === 1)                     throw new Error("Mobile already verified.");
  if (!session.mobile_otp)                               throw new Error("OTP expired. Please request again.");
  if (String(session.mobile_otp) !== String(otp))        throw new Error("Invalid OTP");
  if (new Date(session.mobile_otp_expiry) < new Date())  throw new Error("OTP expired. Please request again.");

  /* ── 2. Mark mobile verified ── */
  await db.execute(
    `UPDATE signup_sessions
     SET mobile_verified   = 1,
         mobile_otp        = NULL,
         mobile_otp_expiry = NULL
     WHERE id = ?`,
    [session.id]
  );

  /* ── 3. Check if email also verified ── */
  if (session.email_verified === 1) {
    await completeRegistration(session.id);
    return {
      success:    true,
      message:    "Mobile verified. Registration complete! You can now login.",
      registered: true,
    };
  }

  return {
    success:    true,
    message:    "Mobile verified. Please verify your email OTP too.",
    registered: false,
  };
};

/* ================= VERIFY EMAIL OTP ================= */
export const verifyEmailOtpService = async ({ email, otp }) => {  // ✅ email not mobile

  /* ── 1. Fetch session by EMAIL ── */
  const [[session]] = await db.execute(
    `SELECT id, email_otp, email_otp_expiry,
            mobile_verified, email_verified, expires_at
     FROM signup_sessions
     WHERE email = ?`,                                   // ✅ email not mobile
    [email.trim().toLowerCase()]
  );

  if (!session)                                         throw new Error("Session not found. Please signup again.");
  if (new Date(session.expires_at) < new Date())        throw new Error("Session expired. Please signup again.");
  if (session.email_verified === 1)                     throw new Error("Email already verified.");
  if (!session.email_otp)                               throw new Error("OTP expired. Please request again.");
  if (String(session.email_otp) !== String(otp))        throw new Error("Invalid OTP");
  if (new Date(session.email_otp_expiry) < new Date())  throw new Error("OTP expired. Please request again.");

  /* ── 2. Mark email verified ── */
  await db.execute(
    `UPDATE signup_sessions
     SET email_verified   = 1,
         email_otp        = NULL,
         email_otp_expiry = NULL
     WHERE id = ?`,
    [session.id]
  );

  /* ── 3. Check if mobile also verified ── */
  if (session.mobile_verified === 1) {
    await completeRegistration(session.id);
    return {
      success:    true,
      message:    "Email verified. Registration complete! You can now login.",
      registered: true,
    };
  }

  return {
    success:    true,
    message:    "Email verified. Please verify your mobile OTP too.",
    registered: false,
  };
};


/* ================= RESEND OTP ================= */
export const resendOtpService = async ({ mobile, email, type }) => {

  /* ── 1. Find session by mobile OR email ── */
  let session = null;

  if (mobile) {
    const normalizedMobile = String(mobile).replace(/\D/g, "").trim();
    const [[row]] = await db.execute(
      `SELECT id, email, mobile, mobile_verified, email_verified, expires_at
       FROM signup_sessions WHERE mobile = ?`,
      [normalizedMobile]
    );
    session = row;
  } else if (email) {
    const [[row]] = await db.execute(
      `SELECT id, email, mobile, mobile_verified, email_verified, expires_at
       FROM signup_sessions WHERE email = ?`,
      [email.trim().toLowerCase()]
    );
    session = row;
  }

  if (!session)                                  throw new Error("Session not found. Please signup again.");
  if (new Date(session.expires_at) < new Date()) throw new Error("Session expired. Please signup again.");

  /* ── 2. Generate new OTP ── */
  const newOtp    = crypto.randomInt(100000, 999999).toString();
  const newExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

  /* ── 3. Update correct OTP ── */
  if (type === "mobile") {
    if (session.mobile_verified === 1)
      throw new Error("Mobile already verified. No need to resend.");

    await db.execute(
      `UPDATE signup_sessions
       SET mobile_otp = ?, mobile_otp_expiry = ?
       WHERE id = ?`,
      [newOtp, newExpiry, session.id]
    );
    // await sendSms(session.mobile, `Your OTP is ${newOtp}`);

  } else if (type === "email") {
    if (session.email_verified === 1)
      throw new Error("Email already verified. No need to resend.");

    await db.execute(
      `UPDATE signup_sessions
       SET email_otp = ?, email_otp_expiry = ?
       WHERE id = ?`,
      [newOtp, newExpiry, session.id]
    );
    // await sendEmail(session.email, `Your OTP is ${newOtp}`);

  } else {
    throw new Error("type must be 'mobile' or 'email'");
  }

  return {
    success: true,
    message: `OTP resent to your ${type}`,
    ...(process.env.NODE_ENV !== "production" && { otp: newOtp }),
  };
};
/* ================= COMPLETE REGISTRATION — only when BOTH verified ================= */
const completeRegistration = async (sessionId) => {

  /* ── 1. Fetch full session data ── */
  const [[session]] = await db.execute(
    `SELECT * FROM signup_sessions WHERE id = ?`,
    [sessionId]
  );

  if (!session) throw new Error("Session not found");

  /* ── 2. Insert into users table ── */
  await db.execute(
    `INSERT INTO users
       (fullname, country, date_of_birth, mobile, email, password,
        email_verify, mobile_verify, account_status)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'active')`,
    [
      session.fullname,
      session.country,
      session.date_of_birth,
      session.mobile,
      session.email,
      session.password,
    ]
  );

  /* ── 3. Delete session — cleanup ── */
  await db.execute(
    `DELETE FROM signup_sessions WHERE id = ?`,
    [sessionId]
  );
};

/* ================= LOGIN ================= */
export const loginService = async ({ email, password }) => {

  /* ── 1. Fetch User ── */
  const [[user]] = await db.execute(
    `SELECT id, fullname, email, mobile, password,
            account_status, email_verify, mobile_verify
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  if (!user) throw new Error("Invalid email or password");

  /* ── 2. Account Status Check ── */
  if (user.account_status === "deleted")
    throw new Error("This account has been deleted. Contact support.");
  if (user.account_status === "blocked")
    throw new Error("Your account has been blocked. Contact support.");

  /* ── 3. Verification Check ── */
  if (user.mobile_verify !== 1)
    throw new Error("Please verify your mobile number first.");
  if (user.email_verify !== 1)
    throw new Error("Please verify your email first.");

  /* ── 4. Password Check ── */
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Invalid email or password");

  /* ── 5. Update Last Login ── */
  await db.execute(
    `UPDATE users SET updated_at = NOW() WHERE id = ?`,
    [user.id]
  );

  /* ── 6. Generate JWT ── */
  const token = jwt.sign(
    {
      id:    user.id,
      email: user.email,
      type:  "user",
    },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  return {
    success: true,
    message: "Login successful",
    token,
    user: {
      id:             user.id,
      fullname:       user.fullname,
      email:          user.email,
      mobile:         user.mobile,
      email_verify:   user.email_verify,
      mobile_verify:  user.mobile_verify,
      account_status: user.account_status,
    },
  };
};

/* ================= LOGOUT ================= */
export const logoutService = async (userId) => {
  await db.execute(
    `UPDATE users SET updated_at = NOW() WHERE id = ?`,
    [userId]
  );
  return { success: true, message: "Logged out successfully" };
};