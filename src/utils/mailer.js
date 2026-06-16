// utils/mailer.js

import nodemailer from "nodemailer";

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
export const sendNoreplyMail = async ({ to, subject, html }) => {
  return noreplyTransporter.sendMail({
    from:    `"Pick2Win" <${process.env.NOREPLY_EMAIL}>`,
    to,
    subject,
    html,
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
export const otpEmailHtml = (otp, fullname = "User", expiryMinutes = 5) => `
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

export const welcomeEmailHtml = (fullname) => `
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
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:26px;font-weight:700;">Welcome to Pick2Win, ${fullname}! 🎉</h1>

              <p style="margin:0 0 12px;color:#333;font-size:15px;">Your account has been created successfully.</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">You've received <strong>1 free coin</strong> to get started!</p>

              <!-- Coin Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#fff8f0;border:1px solid #ffe0c0;border-radius:8px;padding:28px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:48px;">🪙</p>
                    <p style="margin:0 0 4px;font-size:24px;font-weight:900;color:#FF6B00;">1 Free Coin</p>
                    <p style="margin:0;color:#888;font-size:13px;">Use it to generate your first team!</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:13px;">Where SKILL Matters More.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;">support@pick2win.io</a></p>

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

export default noreplyTransporter;  