// user.auth.service.js     

import crypto    from "crypto";
import { hash as bcryptHash, compare as bcryptCompare } from "@node-rs/bcrypt";
import jwt       from "jsonwebtoken";
import db        from "../../../config/db.js";
 
import { validatePasswordStrength } from "../../../utils/passwordValidator.js";
import { sendPushToUser } from "../../../utils/notification.js";

import { sendNoreplyMail, otpEmailHtml, passwordResetEmailHtml, welcomeEmailHtml, profileUpdatedEmailHtml, accountDeletedEmailHtml, resolveTimezone, isValidTimezone, } from "../../../utils/mailer.js";
import { sendVerificationOtp, checkVerificationOtp } from "../../../utils/twilioVerify.js";

/* ── Shared constants — values unchanged from before, just centralized
   so a future OTP/expiry policy change doesn't require hunting through
   every service function for the same magic number. ── */
const BCRYPT_SALT_ROUNDS       = 10;
const OTP_MIN                  = 100000;
const OTP_MAX                  = 999999;
const EMAIL_OTP_EXPIRY_MS      = 5 * 60 * 1000;  // signup + resend email OTP
const SIGNUP_SESSION_EXPIRY_MS = 15 * 60 * 1000; // signup_sessions row TTL
const SECURITY_OTP_EXPIRY_MS   = 10 * 60 * 1000; // forgot-password / email-change / delete-account OTPs
const DELETION_GRACE_PERIOD_DAYS = 30;           // account stays soft-deleted this long before permanent purge

const generateOtp = () => crypto.randomInt(OTP_MIN, OTP_MAX).toString();

const issueLoginResponse = (user, message = "Login successful") => {
  const token = jwt.sign(
    { id: user.id, email: user.email, type: "user" },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );    

  return {
    success: true,
    message,
    token,
    user: {
      id:             user.id,
      fullname:       user.fullname,
      email:          user.email,
      mobile:         user.mobile,
      email_verify:   user.email_verify,
      account_status: "active",
    },
  };
};

/* ══════════════════════════════════════════
   SIGNUP
══════════════════════════════════════════ */

  
export const signupService = async (data) => {
  const {
    fullName,
    fullname,
    email,
    mobile,
    country,
    timezone,
    password,
  } = data;

  const validTimezone = isValidTimezone(timezone) ? timezone : null;

  const userFullName = (fullname || fullName || "").trim() || null;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedMobile = mobile ? String(mobile).replace(/\D/g, "").trim() || null : null;
  const normalizedCountry = country ? String(country).trim() : null;

  /* ── Already Registered Check ── */
  const [emailResult, mobileResult] = await Promise.all([
    db.execute(
      `SELECT id, account_status
       FROM users
       WHERE LOWER(email) = LOWER(?)`,
      [normalizedEmail]
    ),
    normalizedMobile
      ? db.execute(
          `SELECT id, account_status
           FROM users
           WHERE mobile = ?`,
          [normalizedMobile]
        )
      : Promise.resolve([[]]),
  ]);

  const emailUser  = emailResult[0][0];
  const mobileUser = mobileResult[0][0];

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

  /* ── Password Strength Check ── */
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.valid) {
    throw new Error(passwordCheck.message);
  }

  /* ── Hash Password ── */
  const hashedPassword = await bcryptHash(password, BCRYPT_SALT_ROUNDS);

  /* ── Generate OTP (email only — mobile is stored but not OTP-verified) ── */
  const emailOtp = generateOtp();

  const otpExpiry = new Date(Date.now() + EMAIL_OTP_EXPIRY_MS);
  const sessionExpiry = new Date(Date.now() + SIGNUP_SESSION_EXPIRY_MS);

  /* ── Create or Update Signup Session ── */
  await db.execute(
    `
    INSERT INTO signup_sessions
    (
      fullname,
      email,
      mobile,
      country,
      timezone,
      password,
      email_otp,
      email_otp_expiry,
      email_verified,
      expires_at,
      otp_attempts
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)

    ON DUPLICATE KEY UPDATE
      fullname          = VALUES(fullname),
      email             = VALUES(email),
      country           = VALUES(country),
      timezone          = VALUES(timezone),
      password          = VALUES(password),
      email_otp         = VALUES(email_otp),
      email_otp_expiry  = VALUES(email_otp_expiry),
      email_verified    = 0,
      expires_at        = VALUES(expires_at),
      otp_attempts      = 0
    `,
    [
      userFullName,
      normalizedEmail,
      normalizedMobile,
      normalizedCountry,
      validTimezone,
      hashedPassword,
      emailOtp,
      otpExpiry,
      sessionExpiry,
    ]
  );

  /* ── Send email OTP in the background — doesn't need to block the
     response: in non-production the OTP is returned directly below, and
     in production the client only needs to know it was dispatched, not
     wait for the SMTP round-trip to complete. ── */
  sendNoreplyMail({
    to: normalizedEmail,
    subject: "Pick2Win — Email Verification OTP",
    html: otpEmailHtml(emailOtp, userFullName || "there", 5, new Date(), { timeZone: resolveTimezone({ timezone: validTimezone, country: normalizedCountry }) }),
  }).catch((err) => console.error("OTP email failed:", err.message));

  return {
    success: true,
    message: "OTP sent to your email. Please verify to complete registration.",
    ...(process.env.EXPOSE_OTP === "true" && { emailOtp }),
  };
};

/* ══════════════════════════════════════════
   VERIFY EMAIL OTP
══════════════════════════════════════════ */
export const verifyEmailOtpService = async ({ email, otp }) => {
  const [[session]] = await db.execute(
  `SELECT id, email_otp, email_otp_expiry, email_verified, expires_at
   FROM signup_sessions
   WHERE LOWER(email) = LOWER(?)
   ORDER BY id DESC LIMIT 1`,
  [email.trim().toLowerCase()]
);

  if (!session) throw new Error("Session not found. Please signup again.");

  if (new Date(session.expires_at).getTime() < Date.now())
  throw new Error("Session expired. Please signup again.");

  if (session.email_verified === 1)                     throw new Error("Email already verified.");
  if (!session.email_otp)                               throw new Error("OTP expired. Please request again.");

  if (String(session.email_otp) !== String(otp)) {
    await db.execute(
      `UPDATE signup_sessions
          SET otp_attempts = otp_attempts + 1,
              email_otp    = IF(otp_attempts + 1 >= 5, NULL, email_otp)
        WHERE id = ?`,
      [session.id]
    );
    throw new Error("Invalid OTP");
  }

  if (new Date(session.email_otp_expiry) < new Date())  throw new Error("OTP expired. Please request again.");

  await db.execute(
    `UPDATE signup_sessions
     SET email_verified = 1, email_otp = NULL, email_otp_expiry = NULL
     WHERE id = ?`,
    [session.id]
  );

  await completeRegistration(session.id);
  return { success: true, message: "Email verified. Registration complete! You can now login.", registered: true };
};

/* ══════════════════════════════════════════
   RESEND OTP (email only)
══════════════════════════════════════════ */

export const resendOtpService = async ({ email }) => {
  const [[session]] = await db.execute(
    `SELECT id, email, fullname, country, timezone, email_verified, expires_at
     FROM signup_sessions WHERE email = ?
     ORDER BY id DESC LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  if (!session)                                  throw new Error("Session not found. Please signup again.");
  if (new Date(session.expires_at) < new Date()) throw new Error("Session expired. Please signup again.");
  if (session.email_verified === 1)              throw new Error("Email already verified.");

  const newEmailOtp = generateOtp();
  const newExpiry   = new Date(Date.now() + EMAIL_OTP_EXPIRY_MS);

  await db.execute(
    `UPDATE signup_sessions SET email_otp = ?, email_otp_expiry = ?, otp_attempts = 0 WHERE id = ?`,
    [newEmailOtp, newExpiry, session.id]
  );

  await sendNoreplyMail({
    to:      session.email,
    subject: "Verify Your Email Address · PICK2WIN OTP",
    html:    otpEmailHtml(newEmailOtp, session.fullname, 5, new Date(), { timeZone: resolveTimezone({ timezone: session.timezone, country: session.country }) }),
  });

  return {
    success: true,
    message: "OTP resent to your email",
    ...(process.env.EXPOSE_OTP === "true" && { otp: newEmailOtp }),
  };
};

 
/* ══════════════════════════════════════════
   COMPLETE REGISTRATION
══════════════════════════════════════════ */ 
const completeRegistration = async (sessionId) => {
  const [[session]] = await db.execute(
    `SELECT fullname, email, mobile, country, timezone, password
     FROM signup_sessions WHERE id = ?`,
    [sessionId]
  );

  const [result] = await db.execute(
    `INSERT INTO users
       (fullname, email, mobile, country, timezone, password,
        account_status, email_verify)
     VALUES (?, ?, ?, ?, ?, ?, 'active', 1)`,
    [session.fullname, session.email, session.mobile,
     session.country, session.timezone, session.password]
  );

  const newUserId = result.insertId;

  /* ── Create the wallet row up front — user_coins previously only got a
     row on first coin purchase, so a brand-new user hitting any
     coins-gated feature (e.g. generate-teams) before ever buying coins
     would see a misleading "Insufficient coins" from a missing row rather
     than an actual zero balance. Every new signup also gets 1 free coin
     to try the product. ── */
  const SIGNUP_BONUS_COINS = 1;

  await db.execute(
    `INSERT INTO user_coins (user_id, coins, total_coins, used_coins, available_coins)
     VALUES (?, ?, ?, 0, ?)`,
    [newUserId, SIGNUP_BONUS_COINS, SIGNUP_BONUS_COINS, SIGNUP_BONUS_COINS]
  );

  await db.execute(
    `INSERT INTO coins_transactions
       (user_id, coins, amount, transaction_type, opening_points, closing_points,
        description, status, user_name, user_email, user_mobile)
     VALUES (?, ?, 0, 'purchase', 0, ?, 'Signup bonus', 'success', ?, ?, ?)`,
    [newUserId, SIGNUP_BONUS_COINS, SIGNUP_BONUS_COINS,
     session.fullname, session.email, session.mobile]
  );

  /* ── Welcome email, welcome push, and signup-session cleanup are all
     best-effort follow-ups that don't need to block the OTP-verification
     response — they run in the background instead. ── */
  (async () => {
    try {
      await sendNoreplyMail({
        to:      session.email,
        subject: "Welcome to Pick2Win! 🎉",
        html:    welcomeEmailHtml({
          fullname: session.fullname || "User",
          email: session.email,
          mobile: session.mobile || "-",
          country: session.country || "-",
          timezone: session.timezone,
          activationDate: new Date(),
        }),
      });
    } catch (err) {
      console.error("Welcome email failed:", err.message);
    }

    // Disabled — "account_welcome" not in the approved notification list.
    // try {
    //   await sendPushToUser({
    //     userId: newUserId,
    //     title: "Welcome to PICK2WIN!",
    //     body: "Your account has been created successfully.",
    //     data: { type: "account_welcome" },
    //   });
    // } catch (err) {
    //   console.error("Welcome push failed:", err.message);
    // }

    try {
      await db.execute(`DELETE FROM signup_sessions WHERE id = ?`, [sessionId]);
    } catch (err) {
      console.error("Failed to delete signup session:", err.message);
    }
  })();

  return newUserId;
};

/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
export const loginService = async ({ email, password }) => {
  const [[user]] = await db.execute(
    `SELECT id, fullname, email, mobile, password,
            account_status, deleted_at, email_verify
     FROM users WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  if (!user) throw new Error("User not found. Please signup");

  if (user.account_status === "deleted") {
    /* ── Account is within its 30-day soft-delete grace period — the
       frontend uses accountDeleted/deletionDate to show a "Restore
       Account?" prompt instead of a dead-end error. ── */
    const deletionDate = new Date(
      new Date(user.deleted_at).getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
    );
    const err = new Error("Your account is scheduled for deletion. Restore it to continue.");
    err.accountDeleted = true;
    err.deletionDate = deletionDate.toISOString();
    throw err;
  }
  if (user.account_status === "blocked")
    throw new Error("Your account has been blocked. Contact support.");

  if (user.email_verify !== 1) throw new Error("Please verify your email first.");

  const isMatch = await bcryptCompare(password, user.password);
  if (!isMatch) throw new Error("Invalid password or wrong password. Please try again.");

  // Best-effort last-seen timestamp — not needed to answer the client, so
  // it runs in the background instead of holding a DB connection on the
  // critical path (each held connection matters under high login concurrency).
  db.execute(`UPDATE users SET updated_at = NOW() WHERE id = ?`, [user.id])
    .catch((err) => console.error("Failed to update last-login timestamp:", err.message));

  return issueLoginResponse({ ...user, account_status: user.account_status });
};

/* ══════════════════════════════════════════
   RESTORE ACCOUNT  (undo a pending soft-delete within the grace period)
══════════════════════════════════════════ */
export const restoreAccountService = async ({ email, password }) => {
  const [[user]] = await db.execute(
    `SELECT id, fullname, email, mobile, password,
            account_status, deleted_at, email_verify
     FROM users WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  if (!user) throw new Error("User not found. Please signup");
  if (user.account_status !== "deleted") throw new Error("This account is not scheduled for deletion.");

  const isMatch = await bcryptCompare(password, user.password);
  if (!isMatch) throw new Error("Invalid password or wrong password. Please try again.");

  const deletionDate = new Date(user.deleted_at).getTime() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > deletionDate) {
    throw new Error("The restore window for this account has expired. Please contact support.");
  }

  await db.execute(
    `UPDATE users SET account_status = 'active', deleted_at = NULL WHERE id = ?`,
    [user.id]
  );

  return issueLoginResponse(user, "Account restored successfully. Welcome back!");
};

/* ══════════════════════════════════════════
   DECLINE RESTORE  (user explicitly keeps the pending deletion —
   no DB state change, just an audit trail of the choice)
══════════════════════════════════════════ */
export const declineRestoreService = async ({ email, password }) => {
  const [[user]] = await db.execute(
    `SELECT id, password, account_status FROM users WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  if (!user) throw new Error("User not found. Please signup");
  if (user.account_status !== "deleted") throw new Error("This account is not scheduled for deletion.");

  const isMatch = await bcryptCompare(password, user.password);
  if (!isMatch) throw new Error("Invalid password or wrong password. Please try again.");

  return { success: true, message: "Account deletion remains scheduled.", userId: user.id };
};

export const updateProfileService = async (updatedUser) => {
  const { id: userId, email, fullname, mobile, country, timezone } = updatedUser;

  if (!email) {
    throw new Error("User email missing for profile update notification.");
  }

  await sendNoreplyMail({
    to:      email,
    subject: "Profile Updated Successfully · PICK2WIN",
    html:    profileUpdatedEmailHtml({
      fullname: fullname || "User",
      email:    email,
      mobile:   mobile || "-",
      country:  country || "-",
      timezone,
      updatedOn: new Date(),
    }),
  });

  // Disabled — "account_updated" not in the approved notification list.
  // if (userId) {
  //   await sendPushToUser({
  //     userId,
  //     title: "Account Updated",
  //     body: "Your profile has been updated successfully.",
  //     data: { type: "account_updated" },
  //   });
  // }

  return { success: true, message: "Profile update email sent." };
};

/* ══════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════ */
export const logoutService = async (userId, token) => {
  await db.execute(`UPDATE users SET updated_at = NOW() WHERE id = ?`, [userId]);

  if (token) {
    const decoded = jwt.decode(token);
    if (decoded?.exp) {
      // Pass an explicit UTC string, not a JS Date object — mysql2 converts
      // Date objects using the Node process's local timezone (IST here),
      // which would drift ~5.5h from MySQL's own NOW() (true UTC) and delay cleanup.
      const expiresAtUTC = new Date(decoded.exp * 1000).toISOString().slice(0, 19).replace("T", " ");
      await db.execute(
        `INSERT INTO user_token_blacklist (token, user_id, expires_at)
         VALUES (?, ?, ?)`,
        [token, userId, expiresAtUTC]
      );
    }
  }

  return { success: true, message: "Logged out successfully" };
};

/* ══════════════════════════════════════════
   CLEAN EXPIRED BLACKLIST TOKENS (CRON)
══════════════════════════════════════════ */
export const cleanExpiredUserBlacklistTokens = async () => {
  try {
    const [result] = await db.query(
      `DELETE FROM user_token_blacklist WHERE expires_at < NOW()`
    );
    if (result.affectedRows > 0) {
      console.log(`[Cron] Cleaned ${result.affectedRows} expired user blacklist tokens`);
    }
  } catch (err) {
    console.error("[Cron] User blacklist cleanup error:", err.message);
  }
};

/* ══════════════════════════════════════════
   LOGOUT ALL DEVICES
   Stateless JWTs mean we can't revoke every issued token
   individually — instead, stamp tokens_invalidated_at (SQL-side
   UTC_TIMESTAMP(), never a JS Date — see the timezone note above)
   and reject any token whose iat predates it, in authenticate middleware.
══════════════════════════════════════════ */
export const logoutAllDevicesService = async (userId) => {
  await db.execute(
    `UPDATE users SET tokens_invalidated_at = UTC_TIMESTAMP() WHERE id = ?`,
    [userId]
  );
  return { success: true, message: "Logged out from all devices successfully" };
};

/* ══════════════════════════════════════════
   STAGE PROFILE UPDATE  (step 1 — OTP to the NEW mobile via Twilio Verify)
   fullname/country ride along with the mobile instead of being written
   straight away, so a profile can't end up half-updated when the user
   never completes the OTP step — verifyProfileUpdateService commits all
   three together.
══════════════════════════════════════════ */
export const stageProfileUpdateService = async (userId, { new_mobile, fullname, country }) => {
  const normalizedMobile = String(new_mobile).replace(/\D/g, "").trim();

  const [[existing]] = await db.execute(
    `SELECT id FROM users WHERE mobile = ? AND id != ?`,
    [normalizedMobile, userId]
  );
  if (existing) throw new Error("This mobile is already registered");

  await sendVerificationOtp(`+${normalizedMobile}`);

  await db.execute(
    `UPDATE users
     SET pending_mobile = ?, pending_fullname = ?, pending_country = ?,
         contact_change_type = 'mobile'
     WHERE id = ?`,
    [
      normalizedMobile,
      fullname !== undefined ? String(fullname).trim() : null,
      country  !== undefined ? String(country).trim()  : null,
      userId,
    ]
  );

  return { success: true, message: "OTP sent to your new mobile number" };
};

/* ══════════════════════════════════════════
   VERIFY PROFILE UPDATE  (step 2 — confirm OTP, commit every pending field)
══════════════════════════════════════════ */
export const verifyProfileUpdateService = async (userId, otp) => {
  const [[user]] = await db.execute(
    `SELECT pending_mobile, pending_fullname, pending_country, contact_change_type
     FROM users WHERE id = ?`,
    [userId]
  );

  if (!user)                                                     throw new Error("User not found");
  if (user.contact_change_type !== "mobile" || !user.pending_mobile)
                                                                  throw new Error("No pending mobile change request");

  const { approved } = await checkVerificationOtp(`+${user.pending_mobile}`, otp);
  if (!approved) throw new Error("Invalid or expired OTP");

  const [[existing]] = await db.execute(
    `SELECT id FROM users WHERE mobile = ? AND id != ?`,
    [user.pending_mobile, userId]
  );
  if (existing) throw new Error("This mobile is already registered");

  /* ── COALESCE keeps whatever is already stored when a staged field was
     left out, so this never blanks an existing fullname/country. ── */
  await db.execute(
    `UPDATE users
     SET mobile   = ?,
         fullname = COALESCE(?, fullname),
         country  = COALESCE(?, country),
         pending_mobile = NULL, pending_fullname = NULL, pending_country = NULL,
         contact_change_type = NULL
     WHERE id = ?`,
    [user.pending_mobile, user.pending_fullname, user.pending_country, userId]
  );

  return { success: true, message: "Profile updated successfully" };
};

/* ══════════════════════════════════════════
   REQUEST EMAIL CHANGE  (step 1 — OTP to CURRENT email)
   Sending the confirmation OTP to the user's existing address first
   (rather than straight to the new one) means a stolen session token
   alone can't silently redirect the account's email.
══════════════════════════════════════════ */
export const requestEmailChangeService = async (userId, newEmail) => {
  const normalizedEmail = String(newEmail).trim().toLowerCase();

  const [[user]] = await db.execute(
    `SELECT fullname, email, country, timezone FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) throw new Error("User not found");
  if (String(user.email).toLowerCase() === normalizedEmail) {
    throw new Error("New email must be different from current email");
  }

  const [[existing]] = await db.execute(
    `SELECT id FROM users WHERE email = ? AND id != ?`,
    [normalizedEmail, userId]
  );
  if (existing) throw new Error("Email already in use");

  const otp    = generateOtp();
  const expiry = new Date(Date.now() + SECURITY_OTP_EXPIRY_MS);

  await db.execute(
    `UPDATE users
     SET pending_email = ?, old_contact_otp = ?, old_contact_otp_expiry = ?,
         new_contact_otp = NULL, new_contact_otp_expiry = NULL,
         contact_change_type = 'email'
     WHERE id = ?`,
    [normalizedEmail, otp, expiry, userId]
  );

  /* ── Send OTP to current (old) email to authorize the change ── */
  await sendNoreplyMail({
    to:      user.email,
    subject: "Pick2Win — Confirm Email Change Request",
    html:    otpEmailHtml(otp, user.fullname || "User", 10, new Date(), {
      heading: "Confirm your email change request.",
      intro: [
        "We received a request to change the email address linked to your PICK2WIN account.",
        "Enter the OTP below to confirm this request is authorized by you.",
      ],
      instructions: [
        "Enter this OTP to confirm your email change request.",
        "This OTP can be used only once.",
        "The OTP will expire automatically after the validity period.",
        "Once confirmed, we'll send a second OTP to your new email address.",
      ],
      ignoreNote: "If you did not request an email change, please ignore this email and your account will remain unchanged.",
      timeZone: resolveTimezone({ timezone: user.timezone, country: user.country }),
    }),
  });

  return {
    success: true,
    message: "OTP sent to your current email address",
    ...(process.env.EXPOSE_OTP === "true" && { otp }),
  };
};

/* ══════════════════════════════════════════
   VERIFY OLD EMAIL OTP  (step 2 — OTP to NEW email)
══════════════════════════════════════════ */
export const verifyOldEmailChangeService = async (userId, otp) => {
  const [[user]] = await db.execute(
    `SELECT old_contact_otp, old_contact_otp_expiry, pending_email, contact_change_type, fullname, country, timezone
     FROM users WHERE id = ?`,
    [userId]
  );

  if (!user)                                                   throw new Error("User not found");
  if (user.contact_change_type !== "email" || !user.pending_email)
                                                                throw new Error("No pending email change request");
  if (!user.old_contact_otp)                                   throw new Error("OTP expired. Request again.");
  if (String(user.old_contact_otp) !== String(otp))            throw new Error("Invalid OTP");
  if (new Date(user.old_contact_otp_expiry) < new Date())      throw new Error("OTP expired. Request again.");

  const newOtp    = generateOtp();
  const newExpiry = new Date(Date.now() + SECURITY_OTP_EXPIRY_MS);

  await db.execute(
    `UPDATE users
     SET old_contact_otp = NULL, old_contact_otp_expiry = NULL,
         new_contact_otp = ?, new_contact_otp_expiry = ?
     WHERE id = ?`,
    [newOtp, newExpiry, userId]
  );

  /* ── Send OTP to new email to confirm the change ── */
  await sendNoreplyMail({
    to:      user.pending_email,
    subject: "Pick2Win — Verify Your New Email",
    html:    otpEmailHtml(newOtp, user.fullname || "User", 10, new Date(), {
      heading: "Verify your new email address.",
      intro: [
        "You're changing the email address linked to your PICK2WIN account.",
        "Enter the OTP below to verify this new email address and complete the change.",
      ],
      instructions: [
        "Enter this OTP to verify your new email address.",
        "This OTP can be used only once.",
        "The OTP will expire automatically after the validity period.",
        "Your account email will be updated only after this OTP is verified.",
      ],
      ignoreNote: "If you did not request this email change, please ignore this email.",
      timeZone: resolveTimezone({ timezone: user.timezone, country: user.country }),
    }),
  });

  return {
    success: true,
    message: "OTP sent to your new email address",
    ...(process.env.EXPOSE_OTP === "true" && { otp: newOtp }),
  };
};

/* ══════════════════════════════════════════
   VERIFY EMAIL CHANGE  (step 3 — apply the change)
══════════════════════════════════════════ */
export const verifyEmailChangeService = async (userId, otp) => {
  const [[user]] = await db.execute(
    `SELECT new_contact_otp, new_contact_otp_expiry, pending_email, contact_change_type FROM users WHERE id = ?`,
    [userId]
  );

  if (!user)                                               throw new Error("User not found");
  if (user.contact_change_type !== "email" || !user.pending_email)
                                                            throw new Error("No pending email change request");
  if (!user.new_contact_otp)                               throw new Error("OTP expired. Request again.");
  if (String(user.new_contact_otp) !== String(otp))        throw new Error("Invalid OTP");
  if (new Date(user.new_contact_otp_expiry) < new Date())  throw new Error("OTP expired. Request again.");

  await db.execute(
    `UPDATE users
     SET email = pending_email, email_verify = 1,
         pending_email = NULL, new_contact_otp = NULL,
         new_contact_otp_expiry = NULL, contact_change_type = NULL
     WHERE id = ?`,
    [userId]
  );

  // Disabled — "email_changed" not in the approved notification list.
  // await sendPushToUser({
  //   userId,
  //   title: "Email Changed",
  //   body: "Your email address has been updated.",
  //   data: { type: "email_changed" },
  // });

  return { success: true, message: "Email updated successfully" };
};

/* ══════════════════════════════════════════
   FORGOT PASSWORD
══════════════════════════════════════════ */
 
 export const forgotPasswordService = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();

  const [[user]] = await db.execute(
    `SELECT id, fullname, email, country, timezone
     FROM users
     WHERE LOWER(email) = LOWER(?)
       AND account_status != 'deleted'
     LIMIT 1`,
    [normalizedEmail]
  );

  if (!user) {
    throw new Error("No account found with this email");
  }

  const otp = generateOtp();
  const expiry = new Date(Date.now() + SECURITY_OTP_EXPIRY_MS);

  await db.execute(
    `UPDATE users
     SET loginotp = ?, loginotpexpires = ?
     WHERE id = ?`,
    [otp, expiry, user.id]
  );

  const html = passwordResetEmailHtml(
    otp,
    user.fullname || "User",
    10,
    new Date(),
    resolveTimezone({ timezone: user.timezone, country: user.country })
  );

  await sendNoreplyMail({
    to: user.email,
    subject: `Reset your PICK2WIN password · OTP`,
    html,
  });

  // Disabled — "password_reset_requested" not in the approved notification list.
  // await sendPushToUser({
  //   userId: user.id,
  //   title: "Password Reset Requested",
  //   body: "We've sent password reset instructions to your email.",
  //   data: { type: "password_reset_requested" },
  // });

  return {
    success: true,
    message: "OTP sent to your email",
    ...(process.env.EXPOSE_OTP === "true" && { otp }),
  };
};

 
/* ══════════════════════════════════════════
   RESET PASSWORD
══════════════════════════════════════════ */
export const resetPasswordService = async (email, otp, newPassword) => {
  const [[user]] = await db.execute(
    `SELECT id, loginotp, loginotpexpires FROM users
     WHERE email = ? AND account_status != 'deleted'`,
    [email]
  );

  if (!user)                                             throw new Error("User not found");
  if (!user.loginotp)                                    throw new Error("OTP expired. Request again.");
  if (String(user.loginotp) !== String(otp))             throw new Error("Invalid OTP");
  if (new Date(user.loginotpexpires) < new Date())       throw new Error("OTP expired. Request again.");

  const passwordCheck = validatePasswordStrength(newPassword);
  if (!passwordCheck.valid) {
    throw new Error(passwordCheck.message);
  }

  const hashed = await bcryptHash(newPassword, BCRYPT_SALT_ROUNDS);

  await db.execute(
    `UPDATE users SET password = ?, loginotp = NULL, loginotpexpires = NULL WHERE id = ?`,
    [hashed, user.id]
  );

  await sendPushToUser({
    userId: user.id,
    title: "Password Changed",
    body: "Your password has been updated successfully.",
    data: { type: "password_changed" },
  });

  return { success: true, message: "Password reset successfully", user_id: user.id };
};

/* ══════════════════════════════════════════
   DELETE ACCOUNT
══════════════════════════════════════════ */
export const deleteAccountService = async (userId) => {
  const [[user]] = await db.execute(
    `SELECT id, email, fullname, country, timezone FROM users WHERE id = ? AND account_status != 'deleted'`,
    [userId]
  );
  if (!user) throw new Error("User not found");

  const otp       = generateOtp();
  const otpExpiry = new Date(Date.now() + SECURITY_OTP_EXPIRY_MS);

  await db.execute(
    `UPDATE users SET loginotp = ?, loginotpexpires = ? WHERE id = ?`,
    [otp, otpExpiry, userId]
  );

  /* ── Send OTP email ── */
  await sendNoreplyMail({
    to:      user.email,
    subject: "Pick2Win — Account Deletion OTP",
    html:    otpEmailHtml(otp, user.fullname || "User", 5, new Date(), {
      heading: "Confirm your account deletion request.",
      intro: [
        "We received a request to delete your PICK2WIN account.",
        `Enter the OTP below to confirm. Your account will be scheduled for deletion and permanently removed after ${DELETION_GRACE_PERIOD_DAYS} days.`,
      ],
      instructions: [
        "Enter this OTP to confirm your account deletion request.",
        "This OTP can be used only once.",
        "The OTP will expire automatically after the validity period.",
        `You can restore your account by logging in within ${DELETION_GRACE_PERIOD_DAYS} days — after that it will be permanently deleted.`,
      ],
      ignoreNote: "If you did not request account deletion, please ignore this email and your account will remain unchanged.",
      timeZone: resolveTimezone({ timezone: user.timezone, country: user.country }),
    }),
  });

  return {
    success: true,
    message: "OTP sent to your email. Please verify to delete your account.",
    ...(process.env.EXPOSE_OTP === "true" && { otp }),
  };
};

/* ══════════════════════════════════════════
   CONFIRM DELETE ACCOUNT
══════════════════════════════════════════ */
 
 export const confirmDeleteAccountService = async (userId, otp) => {
  const [[user]] = await db.execute(
    `SELECT id, email, fullname, country, timezone, loginotp, loginotpexpires
     FROM users
     WHERE id = ? AND account_status != 'deleted'`,
    [userId]
  );

  if (!user)
    throw new Error("User not found");

  if (!user.loginotp)
    throw new Error("OTP not requested. Please request again.");

  if (String(user.loginotp) !== String(otp))
    throw new Error("Invalid OTP");

  if (new Date(user.loginotpexpires) < new Date())
    throw new Error("OTP expired. Please request again.");

  /* ── Soft-delete only — the account (and its coins/teams/transactions/
     logs) stays intact for DELETION_GRACE_PERIOD_DAYS so a login attempt
     in that window can offer "Restore Account?" instead of a dead end.
     purgeDeletedAccountsService (daily cron) does the actual permanent
     removal once the grace period elapses. ── */
  await db.execute(
    `UPDATE users
     SET account_status = 'deleted',
         deleted_at = NOW(),
         tokens_invalidated_at = UTC_TIMESTAMP(),
         loginotp = NULL, loginotpexpires = NULL
     WHERE id = ?`,
    [userId]
  );

  const deletionDate = new Date(Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  /* ── Notify — best-effort, doesn't need to block the response ── */
  sendNoreplyMail({
    to: user.email,
    subject: "Your PICK2WIN account is scheduled for deletion",
    html: `
      <p>Hello ${user.fullname || "User"},</p>
      <p>Your PICK2WIN account has been scheduled for deletion.</p>
      <p>You can restore it anytime within <strong>${DELETION_GRACE_PERIOD_DAYS} days</strong> by simply logging in again.</p>
      <p>If you don't log in before <strong>${deletionDate.toDateString()}</strong>, your account and all associated data will be permanently deleted.</p>
      <p>If you didn't request this, log in now to restore your account immediately.</p>
    `,
  }).catch((err) => console.error("Account deletion-scheduled email failed:", err.message));

  return {
    success: true,
    message: `Account scheduled for deletion. You can restore it by logging in within ${DELETION_GRACE_PERIOD_DAYS} days.`,
    deletionDate: deletionDate.toISOString(),
  };
};

/* ══════════════════════════════════════════
   PURGE DELETED ACCOUNTS (CRON)
   Permanently removes accounts whose soft-delete grace period has
   elapsed — mirrors the cascade the old immediate-delete flow used to
   run inline at confirm-delete time.
══════════════════════════════════════════ */
export const purgeDeletedAccountsService = async () => {
  let rows;
  try {
    [rows] = await db.query(
      `SELECT id, email, fullname, country, timezone FROM users
       WHERE account_status = 'deleted'
         AND deleted_at IS NOT NULL
         AND deleted_at <= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [DELETION_GRACE_PERIOD_DAYS]
    );
  } catch (err) {
    console.error("❌ [Cron] Failed to fetch accounts due for purge:", err.message);
    return 0;
  }

  for (const { id: userId, email, fullname, country, timezone } of rows) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `DELETE utp
         FROM user_team_players utp
         INNER JOIN user_teams ut ON ut.id = utp.user_team_id
         WHERE ut.user_id = ?`,
        [userId]
      );
      await conn.query(`DELETE FROM user_teams WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM match_generation_log WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM signup_sessions WHERE email = ?`, [email]);
      await conn.query(`DELETE FROM user_subscriptions WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM user_coins WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM coins_transactions WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM user_activity_logs WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM support_tickets WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM uct_answers WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM user_token_blacklist WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM user_devices WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM user_notifications WHERE user_id = ?`, [userId]);
      await conn.query(`DELETE FROM users WHERE id = ?`, [userId]);

      await conn.commit();
      console.log(`✅ [Cron] Permanently purged deleted account — userId:${userId}`);

      sendNoreplyMail({
        to: email,
        subject: "Account Deleted Successfully - PICK2WIN",
        html: accountDeletedEmailHtml({ fullname, email, country, timezone, deletionDateTime: new Date() }),
      }).catch((err) => console.error("Final deletion email failed:", err.message));
    } catch (err) {
      await conn.rollback().catch(() => {});
      console.error(`❌ [Cron] Failed to purge deleted account userId:${userId}:`, err.message);
    } finally {
      conn.release();
    }
  }

  return rows.length;
};
    