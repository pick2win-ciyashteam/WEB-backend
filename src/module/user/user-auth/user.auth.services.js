

// user.auth.service.js

import crypto    from "crypto";
import bcrypt    from "bcryptjs";
import jwt       from "jsonwebtoken";
import db        from "../../../config/db.js";
 
import { sendSms } from "../../../utils/sms.js";

import { sendNoreplyMail, otpEmailHtml, passwordResetEmailHtml, welcomeEmailHtml, profileUpdatedEmailHtml, accountDeletedEmailHtml, } from "../../../utils/mailer.js";



/* ══════════════════════════════════════════
   SIGNUP
══════════════════════════════════════════ */

//  export const signupService = async (data) => {
//   const {
//     fullName,
//     fullname,
//     email,
//     mobile,
//     country,
//     date_of_birth,
//     password,
//   } = data;

//   const userFullName = (fullname || fullName || "").trim();
//   const normalizedEmail = email.trim().toLowerCase();
//   const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

//   /* ── Age Check ── */
//   const age =
//     new Date(Date.now() - new Date(date_of_birth)).getUTCFullYear() - 1970;

//   if (age < 18) {
//     throw new Error("You must be at least 18 years old");
//   }

//   /* ── Already Registered Check ── */
//   const [[[emailUser]], [[mobileUser]]] = await Promise.all([
//     db.execute(
//       `SELECT id, account_status
//        FROM users
//        WHERE email = ?`,
//       [normalizedEmail]
//     ),
//     db.execute(
//       `SELECT id, account_status
//        FROM users
//        WHERE mobile = ?`,
//       [normalizedMobile]
//     ),
//   ]);

//   if (emailUser) {
//     throw new Error(
//       emailUser.account_status === "deleted"
//         ? "This email was previously deleted. Contact support."
//         : "Email already registered"
//     );
//   }

//   if (mobileUser) {
//     throw new Error(
//       mobileUser.account_status === "deleted"
//         ? "This mobile was previously deleted. Contact support."
//         : "Mobile already registered"
//     );
//   }

//   /* ── Hash Password ── */
//   const hashedPassword = await bcrypt.hash(password, 10);

//   /* ── Generate OTPs ── */
//   const mobileOtp = crypto.randomInt(100000, 999999).toString();
//   const emailOtp = crypto.randomInt(100000, 999999).toString();

//   const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
//   const sessionExpiry = new Date(Date.now() + 15 * 60 * 1000);

//   /* ── Create or Update Signup Session ── */
//   await db.execute(
//     `
//     INSERT INTO signup_sessions
//     (
//       fullname,
//       email,
//       mobile,
//       country,
//       date_of_birth,
//       password,
//       mobile_otp,
//       mobile_otp_expiry,
//       email_otp,
//       email_otp_expiry,
//       mobile_verified,
//       email_verified,
//       expires_at
//     )
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)

//     ON DUPLICATE KEY UPDATE
//       fullname            = VALUES(fullname),
//       email               = VALUES(email),
//       country             = VALUES(country),
//       date_of_birth       = VALUES(date_of_birth),
//       password            = VALUES(password),
//       mobile_otp          = VALUES(mobile_otp),
//       mobile_otp_expiry   = VALUES(mobile_otp_expiry),
//       email_otp           = VALUES(email_otp),
//       email_otp_expiry    = VALUES(email_otp_expiry),
//       mobile_verified     = 0,
//       email_verified      = 0,
//       expires_at          = VALUES(expires_at)
//     `,
//     [
//       userFullName,
//       normalizedEmail,
//       normalizedMobile,
//       country,
//       date_of_birth,
//       hashedPassword,
//       mobileOtp,
//       otpExpiry,
//       emailOtp,
//       otpExpiry,
//       sessionExpiry,
//     ]
//   );

//   /* ── Send Email OTP ── */
//   await sendNoreplyMail({
//     to: normalizedEmail,
//     subject: "Pick2Win — Email Verification OTP",
//     html: otpEmailHtml(emailOtp, userFullName, 5),
//   });

//   /* ── Send SMS OTP ── */
//   await sendSms(
//     normalizedMobile,
//     `Your Pick2Win OTP is ${mobileOtp}. Valid for 5 minutes.`
//   );

//   return {
//     success: true,
//     message:
//       "OTP sent to your mobile and email. Please verify both.",
//     ...(process.env.NODE_ENV !== "production" && {
//       mobileOtp,
//       emailOtp,
//     }),
//   };
// };

export const signupService = async (data) => {
  const {
    fullName,
    fullname,
    email,
    mobile,
    country,
    date_of_birth,
    password,
  } = data;

  const userFullName = (fullname || fullName || "").trim();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* ── Age Check ── */
  const age =
    new Date(Date.now() - new Date(date_of_birth)).getUTCFullYear() - 1970;

  if (age < 18) {
    throw new Error("You must be at least 18 years old");
  }

  /* ── Already Registered Check ── */
  const [[[emailUser]], [[mobileUser]]] = await Promise.all([
    db.execute(
      `SELECT id, account_status
       FROM users
       WHERE LOWER(email) = LOWER(?)`,
      [normalizedEmail]
    ),
    db.execute(
      `SELECT id, account_status
       FROM users
       WHERE mobile = ?`,
      [normalizedMobile]
    ),
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

  /* ── Hash Password ── */
  const hashedPassword = await bcrypt.hash(password, 10);

  /* ── Generate OTPs ── */
  const mobileOtp = crypto.randomInt(100000, 999999).toString();
  const emailOtp = crypto.randomInt(100000, 999999).toString();

  const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
  const sessionExpiry = new Date(Date.now() + 15 * 60 * 1000);

  /* ── Create or Update Signup Session ── */
  await db.execute(
    `
    INSERT INTO signup_sessions
    (
      fullname,
      email,
      mobile,
      country,
      date_of_birth,
      password,
      mobile_otp,
      mobile_otp_expiry,
      email_otp,
      email_otp_expiry,
      mobile_verified,
      email_verified,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)

    ON DUPLICATE KEY UPDATE
      fullname          = VALUES(fullname),
      email             = VALUES(email),
      country           = VALUES(country),
      date_of_birth     = VALUES(date_of_birth),
      password          = VALUES(password),
      mobile_otp        = VALUES(mobile_otp),
      mobile_otp_expiry = VALUES(mobile_otp_expiry),
      email_otp         = VALUES(email_otp),
      email_otp_expiry  = VALUES(email_otp_expiry),
      mobile_verified   = 0,
      email_verified    = 0,
      expires_at        = VALUES(expires_at)
    `,
    [
      userFullName,
      normalizedEmail,
      normalizedMobile,
      country,
      date_of_birth,
      hashedPassword,
      mobileOtp,
      otpExpiry,
      emailOtp,
      otpExpiry,
      sessionExpiry,
    ]
  );

  /* ── Send Email OTP ── */
  await sendNoreplyMail({
    to: normalizedEmail,
    subject: "Pick2Win — Email Verification OTP",
    html: otpEmailHtml(emailOtp, userFullName, 5, new Date()),
  });

  /* ── SMS SKIPPED FOR TESTING ── */
  console.log(
    `⚠️ SMS skipped for testing. Mobile OTP: ${mobileOtp}`
  );

  return {
    success: true,
    message:
      "Email OTP sent successfully. Mobile SMS skipped for testing.",
    ...(process.env.NODE_ENV !== "production" && {
      mobileOtp,
      emailOtp,
    }),
  };
};

  
/* ══════════════════════════════════════════
   VERIFY MOBILE OTP
══════════════════════════════════════════ */
export const verifyMobileOtpService = async ({ mobile, otp }) => {
  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  const [[session]] = await db.execute(
    `SELECT id, mobile_otp, mobile_otp_expiry,
            mobile_verified, email_verified, expires_at
     FROM signup_sessions WHERE mobile = ?`,
    [normalizedMobile]
  );

  if (!session)                                          throw new Error("Session not found. Please signup again.");
  if (new Date(session.expires_at) < new Date())         throw new Error("Session expired. Please signup again.");
  if (session.mobile_verified === 1)                     throw new Error("Mobile already verified.");
  if (!session.mobile_otp)                               throw new Error("OTP expired. Please request again.");
  if (String(session.mobile_otp) !== String(otp))        throw new Error("Invalid OTP");
  if (new Date(session.mobile_otp_expiry) < new Date())  throw new Error("OTP expired. Please request again.");

  await db.execute(
    `UPDATE signup_sessions
     SET mobile_verified = 1, mobile_otp = NULL, mobile_otp_expiry = NULL
     WHERE id = ?`,
    [session.id]
  );

  if (session.email_verified === 1) {
    await completeRegistration(session.id);
    return { success: true, message: "Mobile verified. Registration complete! You can now login.", registered: true };
  }

  return { success: true, message: "Mobile verified. Please verify your email OTP too.", registered: false };
};

/* ══════════════════════════════════════════
   VERIFY EMAIL OTP
══════════════════════════════════════════ */
export const verifyEmailOtpService = async ({ email, otp }) => {
  const [[session]] = await db.execute(
  `SELECT id, email_otp, email_otp_expiry,
          mobile_verified, email_verified, expires_at
   FROM signup_sessions 
   WHERE LOWER(email) = LOWER(?)
   ORDER BY id DESC LIMIT 1`,  // ← latest session తీసుకో
  [email.trim().toLowerCase()]
);

  if (!session)                                         throw new Error("Session not found. Please signup again.");
  // if (new Date(session.expires_at) < new Date())        throw new Error("Session expired. Please signup again.");

  if (new Date(session.expires_at).getTime() < Date.now())
  throw new Error("Session expired. Please signup again.");

  if (session.email_verified === 1)                     throw new Error("Email already verified.");
  if (!session.email_otp)                               throw new Error("OTP expired. Please request again.");
  if (String(session.email_otp) !== String(otp))        throw new Error("Invalid OTP");
  if (new Date(session.email_otp_expiry) < new Date())  throw new Error("OTP expired. Please request again.");

  await db.execute(
    `UPDATE signup_sessions
     SET email_verified = 1, email_otp = NULL, email_otp_expiry = NULL
     WHERE id = ?`,
    [session.id]
  );

  if (session.mobile_verified === 1) {
    await completeRegistration(session.id);
    return { success: true, message: "Email verified. Registration complete! You can now login.", registered: true };
  }

  return { success: true, message: "Email verified. Please verify your mobile OTP too.", registered: false };
};

/* ══════════════════════════════════════════   
   RESEND OTP
══════════════════════════════════════════ */

export const resendOtpService = async ({ mobile, email, type }) => {
  let session = null;

  if (mobile) {
    const normalizedMobile = String(mobile).replace(/\D/g, "").trim();
    const [[row]] = await db.execute(
      `SELECT id, email, mobile, fullname, mobile_verified, email_verified, expires_at
       FROM signup_sessions WHERE mobile = ?`,
      [normalizedMobile]
    );
    session = row;
  } else if (email) {
    const [[row]] = await db.execute(
      `SELECT id, email, mobile, fullname, mobile_verified, email_verified, expires_at
       FROM signup_sessions WHERE email = ?`,
      [email.trim().toLowerCase()]
    );
    session = row;
  }

  if (!session)                                  throw new Error("Session not found. Please signup again.");
  if (new Date(session.expires_at) < new Date()) throw new Error("Session expired. Please signup again.");

  const newOtp    = crypto.randomInt(100000, 999999).toString();
  const newExpiry = new Date(Date.now() + 5 * 60 * 1000);

  if (type === "mobile") {
    if (session.mobile_verified === 1)
      throw new Error("Mobile already verified. No need to resend.");

    /* ── 1. DB update ── */
    await db.execute(
      `UPDATE signup_sessions SET mobile_otp = ?, mobile_otp_expiry = ? WHERE id = ?`,
      [newOtp, newExpiry, session.id]
    );

    /* ── 2. Send SMS ── */
    await sendSms(
      session.mobile,
      `Your Pick2Win OTP is ${newOtp}. Valid for 5 minutes.`
    );

  } else if (type === "email") {
    if (session.email_verified === 1)
      throw new Error("Email already verified. No need to resend.");

    /* ── 1. DB update ── */
    await db.execute(
      `UPDATE signup_sessions SET email_otp = ?, email_otp_expiry = ? WHERE id = ?`,
      [newOtp, newExpiry, session.id]
    );

    /* ── 2. Send Email ── */
    await sendNoreplyMail({
      to:      session.email,
      subject: "Verify Your Email Address · PICK2WIN OTP",
      html:    otpEmailHtml(newOtp, session.fullname, 5, new Date()),
    });

  } else {
    throw new Error("type must be 'mobile' or 'email'");
  }

  return {
    success: true,
    message: `OTP resent to your ${type}`,
    ...(process.env.NODE_ENV !== "production" && { otp: newOtp }),
  };
};

 
/* ══════════════════════════════════════════
   COMPLETE REGISTRATION
══════════════════════════════════════════ */ 
const completeRegistration = async (sessionId) => {
  const [[session]] = await db.execute(
    `SELECT fullname, email, mobile, country, date_of_birth, password
     FROM signup_sessions WHERE id = ?`,
    [sessionId]
  );

  const [result] = await db.execute(
    `INSERT INTO users
       (fullname, email, mobile, country, date_of_birth, password,
        account_status, email_verify, mobile_verify)
     VALUES (?, ?, ?, ?, ?, ?, 'active', 1, 1)`,
    [session.fullname, session.email, session.mobile,
     session.country, session.date_of_birth, session.password]
  );

  const newUserId = result.insertId;

  /* ── Send welcome email ── */
  await sendNoreplyMail({
    to:      session.email,
    subject: "Welcome to Pick2Win! 🎉",
    html:    welcomeEmailHtml({
      fullname: session.fullname,
      email: session.email,
      mobile: session.mobile,
      country: session.country,
      activationDate: new Date(),
    }),
  }).catch(err => console.error("Welcome email failed:", err.message));

  await db.execute(`DELETE FROM signup_sessions WHERE id = ?`, [sessionId]);

  return newUserId;
};

/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
export const loginService = async ({ email, password }) => {
  const [[user]] = await db.execute(
    `SELECT id, fullname, email, mobile, password,
            account_status, email_verify, mobile_verify
     FROM users WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  if (!user) throw new Error("Invalid email or password");

  if (user.account_status === "deleted")
    throw new Error("This account has been deleted. Contact support.");
  if (user.account_status === "blocked")
    throw new Error("Your account has been blocked. Contact support.");

  if (user.mobile_verify !== 1) throw new Error("Please verify your mobile number first.");
  if (user.email_verify  !== 1) throw new Error("Please verify your email first.");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Invalid email or password");

  await db.execute(`UPDATE users SET updated_at = NOW() WHERE id = ?`, [user.id]);

  const token = jwt.sign(
    { id: user.id, email: user.email, type: "user" },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
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

export const updateProfileService = async (updatedUser) => {
  const { email, fullname, mobile, country } = updatedUser;

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
      updatedOn: new Date(),
    }),
  });

  return { success: true, message: "Profile update email sent." };
};

/* ══════════════════════════════════════════
   LOGOUT  
══════════════════════════════════════════ */
export const logoutService = async (userId) => {
  await db.execute(`UPDATE users SET updated_at = NOW() WHERE id = ?`, [userId]);
  return { success: true, message: "Logged out successfully" };
};

/* ══════════════════════════════════════════  
   REQUEST MOBILE CHANGE
══════════════════════════════════════════ */
export const requestMobileChangeService = async (userId, { new_mobile }) => {
  const normalizedMobile = String(new_mobile).replace(/\D/g, "").trim();

  const [[existing]] = await db.execute(
    `SELECT id FROM users WHERE mobile = ? AND id != ?`,
    [normalizedMobile, userId]
  );
  if (existing) throw new Error("This mobile is already registered");

  const otp    = crypto.randomInt(100000, 999999).toString();
  const expiry = new Date(Date.now() + 5 * 60 * 1000);

  await db.execute(
    `UPDATE users
     SET pending_mobile = ?, new_contact_otp = ?,
         new_contact_otp_expiry = ?, contact_change_type = 'mobile'
     WHERE id = ?`,
    [normalizedMobile, otp, expiry, userId]
  );

  return {  
    success: true,
    message: "OTP sent to your new mobile number",
    ...(process.env.NODE_ENV !== "production" && { otp }),
  };
};

/* ══════════════════════════════════════════
   VERIFY MOBILE CHANGE
══════════════════════════════════════════ */
export const verifyMobileChangeService = async (userId, { otp }) => {
  const [[user]] = await db.execute(
    `SELECT new_contact_otp, new_contact_otp_expiry, pending_mobile FROM users WHERE id = ?`,
    [userId]
  );

  if (!user)                                               throw new Error("User not found");
  if (!user.new_contact_otp)                               throw new Error("OTP expired. Request again.");
  if (String(user.new_contact_otp) !== String(otp))        throw new Error("Invalid OTP");
  if (new Date(user.new_contact_otp_expiry) < new Date())  throw new Error("OTP expired. Request again.");

  await db.execute(
    `UPDATE users
     SET mobile = pending_mobile, mobile_verify = 1,
         pending_mobile = NULL, new_contact_otp = NULL,
         new_contact_otp_expiry = NULL, contact_change_type = NULL
     WHERE id = ?`,
    [userId]
  );

  return { success: true, message: "Mobile number updated successfully" };
};

/* ══════════════════════════════════════════
   REQUEST EMAIL CHANGE
══════════════════════════════════════════ */
export const requestEmailChangeService = async (userId, newEmail) => {
  const [[existing]] = await db.execute(
    `SELECT id FROM users WHERE email = ? AND id != ?`,
    [newEmail, userId]
  );
  if (existing) throw new Error("Email already in use");

  const otp    = crypto.randomInt(100000, 999999).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000);

  await db.execute(
    `UPDATE users
     SET pending_email = ?, new_contact_otp = ?,
         new_contact_otp_expiry = ?, contact_change_type = 'email'
     WHERE id = ?`,
    [newEmail, otp, expiry, userId]
  );

  /* ── Send OTP to new email ── */
  await sendNoreplyMail({
    to:      newEmail,
    subject: "Pick2Win — Email Change OTP",
    html:    otpEmailHtml(otp, "Verify Your New Email", 5, new Date()),
  });

  return {
    success: true,
    message: "OTP sent to your new email address",
    ...(process.env.NODE_ENV !== "production" && { otp }),
  };
};

/* ══════════════════════════════════════════
   VERIFY EMAIL CHANGE
══════════════════════════════════════════ */
export const verifyEmailChangeService = async (userId, otp) => {
  const [[user]] = await db.execute(
    `SELECT new_contact_otp, new_contact_otp_expiry, pending_email FROM users WHERE id = ?`,
    [userId]
  );

  if (!user)                                               throw new Error("User not found");
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

  return { success: true, message: "Email updated successfully" };
};  

/* ══════════════════════════════════════════
   FORGOT PASSWORD
══════════════════════════════════════════ */
// export const forgotPasswordService = async (email) => {
//   const [[user]] = await db.execute(
//     `SELECT id, email FROM users WHERE email = ? AND account_status != 'deleted'`,
//     [email]
//   );
//   if (!user) throw new Error("No account found with this email");

//   const otp    = crypto.randomInt(100000, 999999).toString();
//   const expiry = new Date(Date.now() + 10 * 60 * 1000);

//   await db.execute(
//     `UPDATE users SET loginotp = ?, loginotpexpires = ? WHERE id = ?`,
//     [otp, expiry, user.id]
//   );

//   /* ── Send OTP email ── */
//   await sendNoreplyMail({
//     to:      email,
//     subject: "Pick2Win — Password Reset OTP",
//     html:    otpEmailHtml(otp, "Reset Your Password"),
//   });

//   return {
//     success: true,
//     message: "OTP sent to your email",
//     ...(process.env.NODE_ENV !== "production" && { otp }),
//   };
// };

 export const forgotPasswordService = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();

  const [[user]] = await db.execute(
    `SELECT id, fullname, email
     FROM users
     WHERE LOWER(email) = LOWER(?)
       AND account_status != 'deleted'
     LIMIT 1`,
    [normalizedEmail]
  );

  if (!user) {
    throw new Error("No account found with this email");
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000);

  console.log("Generated OTP:", otp);

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
    new Date()
  );

  await sendNoreplyMail({
    to: user.email,
    subject: `Reset your PICK2WIN password · OTP`,
    html,
  });

  return {
    success: true,
    message: "OTP sent to your email",
    ...(process.env.NODE_ENV !== "production" && { otp }),
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

  const hashed = await bcrypt.hash(newPassword, 10);

  await db.execute(
    `UPDATE users SET password = ?, loginotp = NULL, loginotpexpires = NULL WHERE id = ?`,
    [hashed, user.id]
  );

  return { success: true, message: "Password reset successfully", user_id: user.id };
};

/* ══════════════════════════════════════════
   DELETE ACCOUNT
══════════════════════════════════════════ */
export const deleteAccountService = async (userId) => {
  const [[user]] = await db.execute(
    `SELECT id, email, fullname FROM users WHERE id = ? AND account_status != 'deleted'`,
    [userId]
  );
  if (!user) throw new Error("User not found");

  const otp       = crypto.randomInt(100000, 999999).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await db.execute(
    `UPDATE users SET loginotp = ?, loginotpexpires = ? WHERE id = ?`,
    [otp, otpExpiry, userId]
  );

  /* ── Send OTP email ── */
  await sendNoreplyMail({
    to:      user.email,
    subject: "Pick2Win — Account Deletion OTP",
    html:    otpEmailHtml(otp, "Confirm Account Deletion", 5, new Date()),
  });

  return {
    success: true,
    message: "OTP sent to your email. Please verify to delete your account.",
    ...(process.env.NODE_ENV !== "production" && { otp }),
  };
};

/* ══════════════════════════════════════════
   CONFIRM DELETE ACCOUNT
══════════════════════════════════════════ */
// export const confirmDeleteAccountService = async (userId, otp) => {
//   const [[user]] = await db.execute(
//     `SELECT id, loginotp, loginotpexpires FROM users
//      WHERE id = ? AND account_status != 'deleted'`,
//     [userId]
//   );

//   if (!user)          throw new Error("User not found");
//   if (!user.loginotp) throw new Error("OTP not requested. Please request again.");
//   if (String(user.loginotp) !== String(otp))           throw new Error("Invalid OTP");
//   if (new Date(user.loginotpexpires) < new Date())     throw new Error("OTP expired. Please request again.");

//   const conn = await db.getConnection();
//   try {
//     await conn.beginTransaction();

//     await conn.query(
//       `DELETE utp FROM user_team_players utp
//        INNER JOIN user_teams ut ON ut.id = utp.user_team_id
//        WHERE ut.user_id = ?`,
//       [userId]
//     );
//     await conn.query(`DELETE FROM user_teams            WHERE user_id = ?`, [userId]);
//     await conn.query(`DELETE FROM match_generation_log  WHERE user_id = ?`, [userId]);
//     await conn.query(
//       `DELETE FROM signup_sessions WHERE email = (SELECT email FROM users WHERE id = ?)`,
//       [userId]
//     );
//     await conn.query(`DELETE FROM user_subscriptions    WHERE user_id = ?`, [userId]);
//     await conn.query(`DELETE FROM user_coins            WHERE user_id = ?`, [userId]);
//     await conn.query(`DELETE FROM users                 WHERE id = ?`,      [userId]);

//     await conn.commit();
//     return { success: true, message: "Account deleted successfully" };

//   } catch (err) {
//     await conn.rollback().catch(() => {});
//     throw err;
//   } finally {
//     conn.release();
//   }
// };       

 export const confirmDeleteAccountService = async (userId, otp) => {
  const [[user]] = await db.execute(
    `SELECT id, email, fullname, loginotp, loginotpexpires
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

  const email = user.email;
  const fullname = user.fullname;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    await conn.query(
      `DELETE utp
       FROM user_team_players utp
       INNER JOIN user_teams ut
         ON ut.id = utp.user_team_id
       WHERE ut.user_id = ?`,
      [userId]
    );

    await conn.query(
      `DELETE FROM user_teams WHERE user_id = ?`,
      [userId]
    );

    await conn.query(
      `DELETE FROM match_generation_log WHERE user_id = ?`,
      [userId]
    );

    await conn.query(
      `DELETE FROM signup_sessions
       WHERE email = ?`,
      [email]
    );

    await conn.query(
      `DELETE FROM user_subscriptions
       WHERE user_id = ?`,
      [userId]
    );

    await conn.query(
      `DELETE FROM user_coins
       WHERE user_id = ?`,
      [userId]
    );

    await conn.query(
      `DELETE FROM users
       WHERE id = ?`,
      [userId]
    );

    await conn.commit();

    /* ── Send Account Deleted Email ── */
    try {
      await sendNoreplyMail({
        to: email,
        subject: "Account Deleted Successfully - PICK2WIN",
        html: accountDeletedEmailHtml({
          fullname,
          email,
          deletionDateTime:
            new Date().toLocaleString("en-IN"),
        }),
      });

      console.log(
        `✅ Account deletion email sent to ${email}`
      );
    } catch (mailErr) {
      console.error(
        "❌ Account deletion email failed:",
        mailErr.message
      );
    }

    return {
      success: true,
      message:
        "Account deleted successfully",
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};
