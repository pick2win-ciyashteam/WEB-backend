// utils/mailer.js

import nodemailer from "nodemailer";

/* ══════════════════════════════════════════
   DATE FORMATTING UTILITY
══════════════════════════════════════════ */
const formatDateINDIA = (date = new Date()) => {
  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  };
  return new Date(date).toLocaleDateString("en-IN", options);
};

const formatDateDMY = (date = new Date()) => {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  };
  return new Date(date).toLocaleDateString("en-IN", options);
};

/* ══════════════════════════════════════════
   NOREPLY TRANSPORTER
   Use for: OTP, registration, general user mails  
══════════════════════════════════════════ */
export const noreplyTransporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST,
  port:   Number(process.env.MAIL_PORT),
  secure: process.env.MAIL_SECURE === "true",
  auth: {
    user: process.env.NOREPLY_EMAIL,
    pass: process.env.NOREPLY_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

/* ══════════════════════════════════════════
   BILLING TRANSPORTER
   Use for: coin purchase, payment confirmation
══════════════════════════════════════════ */
export const billingTransporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST,
  port:   Number(process.env.MAIL_PORT),
  secure: process.env.MAIL_SECURE === "true",
  auth: {
    user: process.env.BILLING_EMAIL,
    pass: process.env.BILLING_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

/* ══════════════════════════════════════════
   VERIFY SMTP ON STARTUP
══════════════════════════════════════════ */
export const verifyMailer = async () => {
  try {
    await noreplyTransporter.verify();
    console.log("✅ SMTP server connected — ready to send emails");
  } catch (err) {
    console.error("❌ SMTP connection failed:", err.message);
  }
};

/* ══════════════════════════════════════════
   SEND MAIL HELPERS
══════════════════════════════════════════ */
export const sendNoreplyMail = async ({ to, subject, html, text, attachments }) => {
  return noreplyTransporter.sendMail({
    from:    `"Pick2Win" <${process.env.NOREPLY_EMAIL}>`,
    to,
    subject,
    html,
    text,
    attachments,
  });
};

export const sendBillingMail = async ({ to, subject, html }) => {
  return billingTransporter.sendMail({
    from:    `"Pick2Win Billing" <${process.env.BILLING_EMAIL}>`,
    to,
    subject,
    html,
  });
};

/* ══════════════════════════════════════════
   EMAIL TEMPLATES
══════════════════════════════════════════ */
export const otpEmailHtml = (otp, fullname = "User", expiryMinutes = 5, sentDateTime = null) => {
  const sentDate = sentDateTime ? formatDateINDIA(sentDateTime) : formatDateINDIA();
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                      <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
                    </span>
                    <br/>
                    <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Orange line -->
          <tr>
            <td style="background:#FF6B00;height:4px;"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <p style="margin:0 0 8px;color:#888;font-size:13px;">Email verification · OTP</p>
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:26px;font-weight:700;">Verify your email address.</h1>

              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${fullname}</strong>,</p>
              <p style="margin:0 0 12px;color:#333;font-size:15px;">Thank you for registering with PICK2WIN.</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">To continue with account creation, please verify your email address using the One-Time Password (OTP) below.</p>

              <!-- OTP Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:8px;padding:28px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:36px;font-weight:900;letter-spacing:12px;color:#1a1a1a;">${otp}</p>
                    <p style="margin:0;color:#888;font-size:14px;">⏳ Valid for ${expiryMinutes} Minutes</p>
                  </td>
                </tr>
              </table>

              <!-- Important Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td style="background:#fff8f0;border:1px solid #ffe0c0;border-radius:8px;padding:20px 24px;">
                    <p style="margin:0 0 12px;color:#cc5500;font-size:14px;font-weight:700;">📌 Important Information</p>
                    <ul style="margin:0;padding-left:18px;color:#555;font-size:13px;line-height:2;">
                      <li>Enter this OTP on the PICK2WIN registration screen to verify your email address.</li>
                      <li>This OTP can be used only once.</li>
                      <li>The OTP will expire automatically after the validity period.</li>
                      <li>Your account will be activated only after successful email and mobile verification.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Security -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#fff5f5;border:1px solid #ffd0d0;border-radius:8px;padding:20px 24px;">
                    <p style="margin:0 0 12px;color:#cc0000;font-size:14px;font-weight:700;">🔒 Security Reminder</p>
                    <ul style="margin:0;padding-left:18px;color:#555;font-size:13px;line-height:2;">
                      <li>Never share this OTP with anyone.</li>
                      <li>PICK2WIN will never ask for your OTP through email, phone calls, messages, or social media.</li>
                      <li>If you did not initiate this registration request, please ignore this email.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:13px;">Where SKILL Matters More.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;">support@pick2win.io</a></p>

              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">📅 Sent on: ${sentDate}</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #eee;padding:16px;text-align:center;">
              <p style="margin:0;color:#888;font-size:12px;">PICK2WIN · Where SKILL Matters More.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const passwordResetEmailHtml = (otp, fullname = "User", expiryMinutes = 10, sentDateTime = null) => {
  const sentDate = sentDateTime ? formatDateINDIA(sentDateTime) : formatDateINDIA();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
              </span>
              <br/>
              <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
            </td>
          </tr>

          <tr>
            <td style="background:#FF6B00;height:4px;"></td>
          </tr>

          <tr>
            <td style="padding:40px 40px 24px;">
              <p style="margin:0 0 16px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">PASSWORD RESET</p>
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:28px;font-weight:700;">Reset your PICK2WIN password.</h1>
              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">We received a request to reset your PICK2WIN password.</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">Use the One-Time Password (OTP) below to continue and set a new password. For your security, this OTP can be used only once and expires shortly.</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:8px;padding:28px;text-align:center;">
                    <p style="margin:0 0 8px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">🔐 PASSWORD RESET OTP</p>
                    <p style="margin:16px 0 8px;font-size:42px;font-weight:900;letter-spacing:14px;color:#1a1a1a;">${otp}</p>
                    <p style="margin:0;color:#888;font-size:14px;">⏳ Valid for ${expiryMinutes} minutes</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd3d3;border-radius:12px;background:#fff5f5;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#cc0000;font-size:14px;font-weight:700;">🔒 SECURITY REMINDER</p>
                    <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;line-height:1.8;">
                      <li>Never share this OTP with anyone.</li>
                      <li>PICK2WIN will never ask for your OTP or password through email, phone, messages, or social media.</li>
                      <li>If you did not request a password reset, please ignore this email — your password will remain unchanged.</li>
                      <li>For your safety, this OTP expires automatically and can be used only once.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd700;border-left:4px solid #FF6B00;border-radius:12px;background:#fff9e8;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#FF6B00;font-size:14px;font-weight:700;">⭐ WHY PICK2WIN</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">Your configuration. Your decisions. Always first. PICK2WIN saves you time, delivers better coverage, and backs you with reliable support.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:12px;">Your configuration. Your teams. In seconds.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">support@pick2win.io</a></p>

              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">📅 Sent on: ${sentDate}</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #eee;padding:16px;text-align:center;">
              <p style="margin:0;color:#888;font-size:12px;">PICK2WIN · Where SKILL Matters More.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const welcomeEmailHtml = (data = {}) => {
  const {
    fullname = "User",
    email = "-",
    mobile = "-",
    country = "-",
    activationDate = "-",
  } = typeof data === "string" ? { fullname: data } : data;

  const formattedActivationDate = activationDate && activationDate !== "-" 
    ? formatDateINDIA(activationDate) 
    : formatDateINDIA();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
              </span>
              <br/>
              <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
            </td>
          </tr>

          <!-- Orange line -->
          <tr>
            <td style="background:#FF6B00;height:4px;"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              
              <!-- Account Activated Label -->
              <p style="margin:0 0 16px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">🎯 ACCOUNT ACTIVATED</p>
              
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:28px;font-weight:700;">Welcome to PICK2WIN.</h1>
              
              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">Your account has been successfully activated and is now ready to use.</p>

              <!-- Account Information -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background:#f8f8f8;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#333;font-size:14px;font-weight:700;">👤 ACCOUNT INFORMATION</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;padding:8px 0;">Name</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:8px 0;">${fullname}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:8px 0;">📧 Email</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:8px 0;">${email}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:8px 0;">📱 Mobile</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:8px 0;">${mobile}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:8px 0;">🌍 Country</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:8px 0;">${country}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:8px 0;">📅 Activation Date</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:8px 0;">${formattedActivationDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Getting Started -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background:#fff8f0;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#FF6B00;font-size:14px;font-weight:700;">⚡ GETTING STARTED - YOU CAN NOW</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <ul style="margin:0;padding-left:20px;color:#333;font-size:13px;line-height:2;">
                      <li>Access User Configuration Teams (UCT)</li>
                      <li>View supported football matches</li>
                      <li>Purchase coin packs</li>
                      <li>Generate structured football virtual teams</li>
                      <li>Access and manage generated teams under <strong>My Teams</strong></li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- How to Use UCT -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background:#fff8f0;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#FF6B00;font-size:14px;font-weight:700;">🔧 HOW TO USE UCT</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="color:#333;font-size:13px;">
                      <tr>
                        <td style="color:#FF6B00;font-weight:700;padding:8px 0;width:30px;">1️⃣</td>
                        <td style="padding:8px 0;">Open the <strong>Lineouts</strong> tab</td>
                      </tr>
                      <tr>
                        <td style="color:#FF6B00;font-weight:700;padding:8px 0;">2️⃣</td>
                        <td style="padding:8px 0;">Wait for official lineups to be released</td>
                      </tr>
                      <tr>
                        <td style="color:#FF6B00;font-weight:700;padding:8px 0;">3️⃣</td>
                        <td style="padding:8px 0;">Select a supported match</td>
                      </tr>
                      <tr>
                        <td style="color:#FF6B00;font-weight:700;padding:8px 0;">4️⃣</td>
                        <td style="padding:8px 0;">Click <strong>Run UCT</strong></td>
                      </tr>
                      <tr>
                        <td style="color:#FF6B00;font-weight:700;padding:8px 0;">5️⃣</td>
                        <td style="padding:8px 0;">Complete the configuration workflow</td>
                      </tr>
                      <tr>
                        <td style="color:#FF6B00;font-weight:700;padding:8px 0;">6️⃣</td>
                        <td style="padding:8px 0;">Generate 20 structured football virtual teams</td>
                      </tr>
                      <tr>
                        <td style="color:#FF6B00;font-weight:700;padding:8px 0;">7️⃣</td>
                        <td style="padding:8px 0;">Review generated teams under <strong>My Teams</strong></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Account Security Reminder -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffcccc;border-radius:8px;overflow:hidden;background:#fff5f5;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #ffcccc;">
                    <p style="margin:0;color:#cc0000;font-size:14px;font-weight:700;">🔒 ACCOUNT SECURITY REMINDER</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <ul style="margin:0;padding-left:20px;color:#333;font-size:13px;line-height:2;">
                      <li>Keep your password confidential</li>
                      <li>Never share your login credentials with anyone</li>
                      <li>Use a strong and unique password</li>
                      <li>Update your password immediately if you suspect unauthorized access</li>
                    </ul>
                    <p style="margin:12px 0 0;color:#666;font-size:12px;line-height:1.6;">
                      Users are responsible for maintaining the confidentiality of their account credentials and activities performed through their account. PICK2WIN cannot be held responsible for unauthorized access, credential sharing, or account misuse resulting from failure to safeguard login information.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Why PICK2WIN -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd700;border-left:4px solid #FF6B00;border-radius:8px;overflow:hidden;background:#fffaf0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#FF6B00;font-size:14px;font-weight:700;">⭐ WHY PICK2WIN</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">
                      Your configuration. Your decisions. Always first. PICK2WIN saves you time, delivers better coverage, and backs you with reliable support.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:13px;">Your configuration. Your teams. In seconds.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">support@pick2win.io</a></p>

              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #eee;padding:16px;text-align:center;">
              <p style="margin:0;color:#888;font-size:12px;">PICK2WIN · Where SKILL Matters More.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const coinPurchaseEmailHtml = (data) => {
  // Format purchase date if provided
  const formattedPurchaseDate = data.purchaseDate 
    ? formatDateINDIA(data.purchaseDate) 
    : formatDateINDIA();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
              </span>
              <br/>
              <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
            </td>
          </tr>

          <!-- Orange line -->
          <tr><td style="background:#FF6B00;height:4px;"></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              
              <!-- Payment Receipt Label -->
              <p style="margin:0 0 16px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">💳 PAYMENT RECEIPT</p>
              
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:26px;font-weight:700;">Your coin purchase is confirmed.</h1>

              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${data.fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">Your coin purchase has been completed successfully.</p>

              <!-- Purchase Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background:#f8f8f8;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#333;font-size:14px;font-weight:700;">💳 PURCHASE DETAILS</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🎁 Package</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${data.planName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🪙 Coins Purchased</td>
                        <td style="color:#22c55e;font-size:13px;text-align:right;padding:10px 0;font-weight:700;">${data.coins}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🪙 Available Coin Balance</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${data.currentBalance}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">💰 Amount Paid</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${data.currency}${data.amount}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">💳 Transaction ID</td>
                        <td style="color:#333;font-size:12px;text-align:right;padding:10px 0;font-weight:500;">${data.transactionId}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">📅 Purchase Date</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${formattedPurchaseDate}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">⏳ Coin Validity</td>
                        <td style="color:#22c55e;font-size:13px;text-align:right;padding:10px 0;font-weight:700;">365 Days</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Important Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffe0c0;border-radius:8px;overflow:hidden;background:#fff8f0;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #ffe0c0;">
                    <p style="margin:0;color:#cc5500;font-size:14px;font-weight:700;">🔴 IMPORTANT INFORMATION</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <ul style="margin:0;padding-left:18px;color:#555;font-size:13px;line-height:2.2;">
                      <li>Coins can be used for UCT generation.</li>
                      <li><strong>1 Coin = 1 Match UCT Generation.</strong></li>
                      <li>New coin purchases refresh the validity of all active coin balances.</li>
                      <li>Please review the Subscription &amp; Refund Policy available within the platform.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;color:#333;font-size:15px;line-height:1.6;">Thank you for choosing PICK2WIN.</p>

              <!-- Why PICK2WIN -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd700;border-left:4px solid #FF6B00;border-radius:8px;overflow:hidden;background:#fffaf0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#FF6B00;font-size:14px;font-weight:700;">⭐ WHY PICK2WIN</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">
                      Your configuration. Your decisions. Always first. PICK2WIN saves you time, delivers better coverage, and backs you with reliable support.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:13px;">Your configuration. Your teams. In seconds.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">support@pick2win.io</a></p>

              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #eee;padding:16px;text-align:center;">
              <p style="margin:0;color:#888;font-size:12px;">PICK2WIN · Where SKILL Matters More.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};


export const paymentFailedEmailHtml = ({
  fullname = "User",
  packageName = "-",
  amount = "-",
  transactionDateTime = null,
  transactionReference = "-",
}) => {
  // Format transaction date if provided
  const formattedTransactionDate = transactionDateTime 
    ? formatDateINDIA(transactionDateTime) 
    : "-";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
              </span>
              <br/>
              <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
            </td>
          </tr>

          <!-- Orange line -->
          <tr><td style="background:#FF6B00;height:4px;"></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              
              <!-- Payment Unsuccessful Label -->
              <p style="margin:0 0 16px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">⚠️ PAYMENT UNSUCCESSFUL</p>
              
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:28px;font-weight:700;">Your payment could not be completed.</h1>
              
              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">Unfortunately, your recent payment could not be completed.</p>

              <!-- Payment Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background:#f8f8f8;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#0066FF;font-size:14px;font-weight:700;">💳 PAYMENT DETAILS</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🎁 Package</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${packageName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">💰 Amount</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${amount}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">📅 Attempted On</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${formattedTransactionDate}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🆔 Reference ID</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${transactionReference}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What This Means -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffcccc;border-radius:8px;overflow:hidden;background:#fff5f5;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #ffcccc;">
                    <p style="margin:0;color:#cc0000;font-size:14px;font-weight:700;">🔴 WHAT THIS MEANS</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;line-height:2.2;">
                      <li>No payment has been successfully processed.</li>
                      <li>No coins have been added to your account.</li>
                      <li>Your existing coin balance remains unchanged.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- What You Can Do Next -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #cce5ff;border-radius:8px;overflow:hidden;background:#f0f8ff;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #cce5ff;">
                    <p style="margin:0;color:#0066FF;font-size:14px;font-weight:700;">📘 WHAT YOU CAN DO NEXT</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;line-height:2.2;">
                      <li>Verify your payment information.</li>
                      <li>Ensure sufficient funds are available.</li>
                      <li>Try again using the same or another supported payment method.</li>
                      <li>Contact your payment provider if the issue persists.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Try Payment Again Button -->
              <div style="margin:0 0 28px;text-align:center;">
                <a href="#" style="display:inline-block;background:#FFD700;color:#000;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:6px;letter-spacing:0.5px;">
                  Try Payment Again →
                </a>
              </div>

              <p style="margin:0 0 24px;color:#333;font-size:13px;line-height:1.8;text-align:center;">
                If you believe the payment was successfully charged but coins were not added to your account, please <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:underline;font-weight:600;">contact support</a> and provide your payment reference details.
              </p>

              <!-- Why PICK2WIN -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd700;border-left:4px solid #FF6B00;border-radius:8px;overflow:hidden;background:#fffaf0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#FF6B00;font-size:14px;font-weight:700;">⭐ WHY PICK2WIN</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">
                      Your configuration. Your decisions. Always first. PICK2WIN saves you time, delivers better coverage, and backs you with reliable support.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:13px;">Your configuration. Your teams. In seconds.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">support@pick2win.io</a></p>

              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #eee;padding:16px;text-align:center;">
              <p style="margin:0;color:#888;font-size:12px;">PICK2WIN · Where SKILL Matters More.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};


export const uctTeamsGeneratedEmailHtml = ({
  fullname = "User",
  leagueName = "-",
  homeTeam = "-",
  awayTeam = "-",
  matchDate = "-",
  kickoffTime = "-",
  teamsGenerated = 20,
  coinsConsumed = 1,
  generatedOn = "-",
}) => {
  // Format generatedOn date if provided
  const formattedGeneratedOn = generatedOn && generatedOn !== "-" 
    ? formatDateINDIA(generatedOn) 
    : generatedOn;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
              </span>
              <br/>
              <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
            </td>
          </tr>

          <!-- Orange line -->
          <tr>
            <td style="background:#FF6B00;height:4px;"></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              
              <!-- UCT Generation Complete Label -->
              <p style="margin:0 0 16px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">⚽ UCT GENERATION COMPLETE</p>
              
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:28px;font-weight:700;">${teamsGenerated} teams generated successfully.</h1>
              
              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">Your UCT generation has been completed successfully.</p>

              <!-- Match Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;background:#f8f8f8;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#FF6B00;font-size:14px;font-weight:700;">⚽ MATCH DETAILS</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🏆 League</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${leagueName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🆚 Match</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${homeTeam} vs ${awayTeam}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">📅 Match Date</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${matchDate}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">⏰ Kickoff Time</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${kickoffTime}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Generation Summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;background:#f8f8f8;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#FF6B00;font-size:14px;font-weight:700;">⚙️ GENERATION SUMMARY</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">⚡ Teams Generated</td>
                        <td style="color:#22c55e;font-size:13px;text-align:right;padding:10px 0;font-weight:700;">${teamsGenerated}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🪙 Coins Consumed</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${coinsConsumed}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">📅 Generated On</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${formattedGeneratedOn}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- My Teams -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffe0c0;border-radius:8px;overflow:hidden;background:#fffaf0;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #ffe0c0;">
                    <p style="margin:0;color:#FF6B00;font-size:14px;font-weight:700;">📊 MY TEAMS</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">
                      The same generated teams are also available under <strong>My Teams</strong> within your PICK2WIN account.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Important Information -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffe0c0;border-radius:8px;overflow:hidden;background:#fff8f0;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #ffe0c0;">
                    <p style="margin:0;color:#cc5500;font-size:14px;font-weight:700;">🔴 IMPORTANT INFORMATION</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;line-height:2.2;">
                      <li>Teams are generated strictly based on your selected configuration.</li>
                      <li>UCT generation for this match has been completed successfully.</li>
                      <li>One coin has been consumed for this generation.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;color:#333;font-size:15px;">Thank you for using PICK2WIN.</p>

              <!-- Why PICK2WIN -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd700;border-left:4px solid #FF6B00;border-radius:8px;overflow:hidden;background:#fffaf0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#FF6B00;font-size:14px;font-weight:700;">⭐ WHY PICK2WIN</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">
                      Your configuration. Your decisions. Always first. PICK2WIN saves you time, delivers better coverage, and backs you with reliable support.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:13px;">Your configuration. Your teams. In seconds.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">support@pick2win.io</a></p>

              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #eee;padding:16px;text-align:center;">
              <p style="margin:0;color:#888;font-size:12px;">PICK2WIN · Where SKILL Matters More.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const profileUpdatedEmailHtml = ({
  fullname = "User",
  email = "-",
  mobile = "-",
  country = "-",
  updatedOn = new Date(),
}) => {
  const formattedUpdatedOn = updatedOn ? formatDateINDIA(updatedOn) : "-";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
              </span>
              <br />
              <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
            </td>
          </tr>

          <tr>
            <td style="background:#FF6B00;height:4px;"></td>
          </tr>

          <tr>
            <td style="padding:40px 40px 24px;">
              <p style="margin:0 0 16px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">PROFILE UPDATED</p>
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:28px;font-weight:700;">Your profile changes are live.</h1>
              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">Your PICK2WIN profile has been updated successfully.</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ece7e2;border-radius:12px;background:#faf8f7;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 18px;color:#FF6B00;font-size:14px;font-weight:700;letter-spacing:1px;">🔒 UPDATED PROFILE INFORMATION</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">👤 Name</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${fullname}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">📧 Email</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${email}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">📱 Mobile</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${mobile}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🌍 Country</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${country}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:10px 0;">🕒 Updated On</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:10px 0;font-weight:500;">${formattedUpdatedOn}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd3d3;border-radius:12px;background:#fff5f5;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#cc0000;font-size:14px;font-weight:700;">🔒 SECURITY REMINDER</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">
                      If you did not make these changes, please secure your account immediately by updating your password and <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">contacting support</a>.
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffe0c0;border-radius:12px;background:#fff8f0;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#cc5500;font-size:14px;font-weight:700;">✴️ IMPORTANT INFORMATION</p>
                    <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;line-height:1.8;">
                      <li>Your updated information is now active.</li>
                      <li>Future communications will be sent using the latest profile details.</li>
                      <li>Please ensure your contact information remains accurate and up to date.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd700;border-left:4px solid #FF6B00;border-radius:12px;background:#fff9e8;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#FF6B00;font-size:14px;font-weight:700;">⭐ WHY PICK2WIN</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">
                      Your configuration. Your decisions. Always first. PICK2WIN saves you time, delivers better coverage, and backs you with reliable support.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:12px;">Your configuration. Your teams. In seconds.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;" />

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">support@pick2win.io</a></p>

              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #eee;padding:16px;text-align:center;">
              <p style="margin:0;color:#888;font-size:12px;">PICK2WIN · Where SKILL Matters More.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const securityAlertEmailHtml = ({
  fullname = "User",
  activityType = "Security activity",
  activityDateTime = new Date(),
  deviceInfo = "Unknown device",
  location = "Unknown location",
  ipAddress = "Unknown IP",
  actionUrl = "#",
}) => {
  const formattedActivityDate = activityDateTime ? formatDateINDIA(activityDateTime) : "-";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
              </span>
              <br />
              <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
            </td>
          </tr>
          <tr>
            <td style="background:#FF6B00;height:4px;"></td>
          </tr>
          <tr>
            <td style="padding:40px 40px 24px;">
              <p style="margin:0 0 16px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">SECURITY ALERT</p>
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:28px;font-weight:700;">Activity detected on your account.</h1>
              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">We detected a security-related activity on your PICK2WIN account.</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:12px;background:#faf8f7;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e0e0e0;">
                    <p style="margin:0;color:#FF6B00;font-size:14px;font-weight:700;letter-spacing:1px;">🔐 ACTIVITY DETAILS</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="color:#333;font-size:13px;">
                      <tr>
                        <td style="color:#666;padding:10px 0;">Activity</td>
                        <td style="text-align:right;padding:10px 0;font-weight:600;">${activityType}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;padding:10px 0;">Date & Time</td>
                        <td style="text-align:right;padding:10px 0;font-weight:600;">${formattedActivityDate}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;padding:10px 0;">Device</td>
                        <td style="text-align:right;padding:10px 0;font-weight:600;">${deviceInfo}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;padding:10px 0;">Location</td>
                        <td style="text-align:right;padding:10px 0;font-weight:600;">${location}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;padding:10px 0;">IP Address</td>
                        <td style="text-align:right;padding:10px 0;font-weight:600;">${ipAddress}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;color:#333;font-size:14px;">If this activity was performed by you, no action is required.</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd0d0;border-radius:12px;background:#fff5f5;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#cc0000;font-size:14px;font-weight:700;">⚠️ IF YOU DO NOT RECOGNIZE THIS ACTIVITY, WE RECOMMEND</p>
                    <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;line-height:1.8;">
                      <li>Change your password immediately</li>
                      <li>Review your account information</li>
                      <li><a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">Contact support</a> if required</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${actionUrl}" style="display:inline-block;background:#FFBC00;color:#0a1628;text-decoration:none;font-weight:700;padding:16px 26px;border-radius:8px;">This Wasn’t Me — Secure My Account</a>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd700;border-left:4px solid #FF6B00;border-radius:12px;background:#fff9e8;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#FF6B00;font-size:14px;font-weight:700;">⭐ WHY PICK2WIN</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">Your configuration. Your decisions. Always first. PICK2WIN saves you time, delivers better coverage, and backs you with reliable support.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:12px;">Your configuration. Your teams. In seconds.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">support@pick2win.io</a></p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const accountDeletedEmailHtml = ({
  fullname = "User",
  email = "",
  deletionDateTime = new Date(),
}) => {
  const formattedDeletionDate = deletionDateTime ? formatDateINDIA(deletionDateTime) : "-";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
          <tr>
            <td style="background:#0a1628;padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;letter-spacing:1px;">
                <span style="color:#FF6B00;">PICK</span><span style="color:#FFD700;">2</span><span style="color:#FF6B00;">WIN</span>
              </span>
              <br />
              <span style="color:#FFD700;font-size:11px;letter-spacing:3px;font-weight:600;">WHERE SKILL MATTERS MORE</span>
            </td>
          </tr>
          <tr>
            <td style="background:#FF6B00;height:4px;"></td>
          </tr>
          <tr>
            <td style="padding:40px 40px 24px;">
              <p style="margin:0 0 16px;color:#FF6B00;font-size:12px;font-weight:700;letter-spacing:1px;">ACCOUNT DELETED</p>
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:28px;font-weight:700;">Your account has been removed.</h1>
              <p style="margin:0 0 12px;color:#333;font-size:15px;">Hello <strong>${fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">Your PICK2WIN account deletion request has been completed successfully.</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ece7e2;border-radius:12px;background:#faf8f7;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #ece7e2;">
                    <p style="margin:0;color:#FF6B00;font-size:14px;font-weight:700;letter-spacing:1px;">🗑️ ACCOUNT DELETION SUMMARY</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#333;">
                      <tr>
                        <td style="color:#666;padding:10px 0;">👤 Name</td>
                        <td style="text-align:right;padding:10px 0;font-weight:600;">${fullname}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;padding:10px 0;">📧 Email</td>
                        <td style="text-align:right;padding:10px 0;font-weight:600;">${email}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;padding:10px 0;">📅 Deletion Date</td>
                        <td style="text-align:right;padding:10px 0;font-weight:600;">${formattedDeletionDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd3d3;border-radius:12px;background:#fff5f5;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#cc0000;font-size:14px;font-weight:700;">✴️ IMPORTANT INFORMATION</p>
                    <ul style="margin:0;padding-left:20px;color:#555;font-size:13px;line-height:1.8;">
                      <li>Your PICK2WIN account has been permanently deleted.</li>
                      <li>Access to the account has been removed.</li>
                      <li>Remaining coin balances, if any, have been permanently removed.</li>
                      <li>Coin purchases remain non-refundable as per PICK2WIN policies.</li>
                      <li>Deleted accounts cannot recover previous balances, generated teams, account history, or profile information.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ffd700;border-left:4px solid #FF6B00;border-radius:12px;background:#fff9e8;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#FF6B00;font-size:14px;font-weight:700;">⭐ WHY PICK2WIN</p>
                    <p style="margin:0;color:#333;font-size:13px;line-height:1.8;">Your configuration. Your decisions. Always first. PICK2WIN saves you time, delivers better coverage, and backs you with reliable support.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:12px;">Your configuration. Your teams. In seconds.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;text-decoration:none;">support@pick2win.io</a></p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">Never share your verification codes or OTP with anyone. PICK2WIN staff will never ask for them.</p>
              <p style="margin:0;color:#bbb;font-size:11px;">© 2026 PICK2WIN Technologies Pvt Ltd. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export default noreplyTransporter;
