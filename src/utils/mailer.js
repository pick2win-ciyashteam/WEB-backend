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

export const coinPurchaseEmailHtml = (data) => `
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
              <span style="font-size:32px;font-weight:900;">
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
              <p style="margin:0 0 8px;color:#888;font-size:13px;">Payment receipt</p>
              <h1 style="margin:0 0 24px;color:#1a1a1a;font-size:26px;font-weight:700;">Your coin purchase is confirmed.</h1>

              <p style="margin:0 0 24px;color:#333;font-size:15px;">Hello <strong>${data.fullname}</strong>,</p>
              <p style="margin:0 0 24px;color:#333;font-size:15px;">Your coin purchase has been completed successfully.</p>

              <!-- Purchase Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background:#f8f8f8;border-bottom:1px solid #e0e0e0;">
                    <strong style="color:#333;font-size:14px;">💳 Purchase Details</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#666;font-size:13px;padding:6px 0;">🎁 Package</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:6px 0;">${data.planName}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:6px 0;">🪙 Coins Purchased</td>
                        <td style="color:#22c55e;font-size:13px;font-weight:700;text-align:right;padding:6px 0;">${data.coins}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:6px 0;">🪙 Available Coin Balance</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:6px 0;">${data.currentBalance}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:6px 0;">💰 Amount Paid</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:6px 0;">${data.currency}${data.amount}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:6px 0;">💳 Transaction ID</td>
                        <td style="color:#333;font-size:12px;text-align:right;padding:6px 0;">${data.transactionId}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:6px 0;">📅 Purchase Date</td>
                        <td style="color:#333;font-size:13px;text-align:right;padding:6px 0;">${data.purchaseDate}</td>
                      </tr>
                      <tr>
                        <td style="color:#666;font-size:13px;padding:6px 0;">⏳ Coin Validity</td>
                        <td style="color:#22c55e;font-size:13px;font-weight:700;text-align:right;padding:6px 0;">365 Days</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Important Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#fff8f0;border:1px solid #ffe0c0;border-radius:8px;padding:20px 24px;">
                    <p style="margin:0 0 12px;color:#cc5500;font-size:14px;font-weight:700;">📌 Important Information</p>
                    <ul style="margin:0;padding-left:18px;color:#555;font-size:13px;line-height:2;">
                      <li>Coins can be used for UCT generation.</li>
                      <li><strong>1 Coin = 1 Match UCT Generation.</strong></li>
                      <li>New coin purchases refresh the validity of all active coin balances.</li>
                      <li>Please review the Subscription &amp; Refund Policy available within the platform.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px;color:#333;font-size:14px;">Thank you for choosing PICK2WIN.</p>
              <br/>
              <p style="margin:0 0 4px;color:#333;font-size:14px;font-weight:700;">PICK2WIN Team</p>
              <p style="margin:0 0 28px;color:#888;font-size:13px;">Where SKILL Matters More.</p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;"/>

              <p style="margin:0 0 4px;color:#333;font-size:13px;font-weight:700;">PICK2WIN Technologies Private Limited</p>
              <p style="margin:0 0 4px;color:#888;font-size:12px;">Bengaluru, India</p>
              <p style="margin:0 0 20px;color:#888;font-size:12px;">Support: <a href="mailto:support@pick2win.io" style="color:#FF6B00;">support@pick2win.io</a></p>

              <p style="margin:0 0 4px;color:#bbb;font-size:11px;">You're receiving this email because you have a verified PICK2WIN account.</p>
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


export const paymentFailedEmailHtml = ({
  fullname,
  packageName,
  amount,
  transactionDateTime,
  transactionReference,
}) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Payment Failed</title>
</head>

<body style="margin:0;padding:0;background:#ece7df;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr>
<td align="center">

<table width="700" cellpadding="0" cellspacing="0"
style="background:#ffffff;border-radius:12px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:#082b4c;padding:45px;text-align:center;">
      <div style="font-size:58px;font-weight:900;">
        <span style="color:#ff6b35;">PICK</span>
        <span style="color:#f4b400;">2</span>
        <span style="color:#ff6b35;">WIN</span>
      </div>

      <div style="
        color:#f4b400;
        font-size:14px;
        font-weight:700;
        letter-spacing:2px;
        margin-top:10px;">
        WHERE SKILL MATTERS MORE
      </div>
    </td>
  </tr>

  <tr>
    <td style="height:6px;background:#f4b400;"></td>
  </tr>

  <!-- Content -->
  <tr>
    <td style="padding:50px;">

      <div style="font-size:14px;color:#555;">
        ⚠ Payment unsuccessful
      </div>

      <h1 style="
        margin:20px 0;
        font-size:54px;
        line-height:72px;
        color:#0d2741;">
        Your payment could not be completed.
      </h1>

      <p style="font-size:18px;color:#222;">
        Hello <strong>${fullname}</strong>,
      </p>

      <p style="
        font-size:18px;
        line-height:32px;
        color:#444;">
        Unfortunately, your recent payment could not be completed.
      </p>

      <!-- Payment Details -->
      <table width="100%"
      style="
        margin-top:40px;
        border:1px solid #ececec;
        border-radius:12px;
        background:#faf8f7;
        padding:30px;">
        <tr>
          <td colspan="2"
          style="
            font-size:28px;
            font-weight:700;
            color:#243447;
            padding-bottom:25px;">
            💳 Payment Details
          </td>
        </tr>

        <tr>
          <td style="padding:15px 0;color:#666;">
            📦 Package
          </td>
          <td align="right">
            ${packageName}
          </td>
        </tr>

        <tr>
          <td style="padding:15px 0;color:#666;">
            💰 Amount
          </td>
          <td align="right">
            ₹${amount}
          </td>
        </tr>

        <tr>
          <td style="padding:15px 0;color:#666;">
            📅 Attempted On
          </td>
          <td align="right">
            ${transactionDateTime}
          </td>
        </tr>

        <tr>
          <td style="padding:15px 0;color:#666;">
            🆔 Reference ID
          </td>
          <td align="right">
            ${transactionReference}
          </td>
        </tr>
      </table>

      <!-- What This Means -->
      <table width="100%"
      style="
        margin-top:35px;
        border:1px solid #ececec;
        border-radius:12px;
        background:#faf8f7;
        padding:30px;">
        <tr>
          <td>
            <h3 style="
              margin-top:0;
              color:#243447;">
              📌 What This Means
            </h3>

            <ul style="
              color:#444;
              line-height:35px;
              padding-left:22px;">
              <li>No payment has been successfully processed.</li>
              <li>No coins have been added to your account.</li>
              <li>Your existing coin balance remains unchanged.</li>
            </ul>
          </td>
        </tr>
      </table>

      <!-- Next Steps -->
      <table width="100%"
      style="
        margin-top:35px;
        border:1px solid #f4d27c;
        border-radius:12px;
        background:#fffdf6;
        padding:30px;">
        <tr>
          <td>
            <h3 style="
              margin-top:0;
              color:#243447;">
              🔄 What You Can Do Next
            </h3>

            <ul style="
              color:#444;
              line-height:35px;
              padding-left:22px;">
              <li>Verify your payment information.</li>
              <li>Ensure sufficient funds are available.</li>
              <li>Try again using the same or another payment method.</li>
              <li>Contact your payment provider if the issue persists.</li>
            </ul>
          </td>
        </tr>
      </table>

      <p style="
        margin-top:40px;
        font-size:17px;
        line-height:32px;
        color:#444;">
        If you believe the payment was successfully charged but coins were not added,
        please contact support and provide your payment reference details.
      </p>

      <div style="margin-top:40px;">
        <strong style="font-size:20px;">
          PICK2WIN Team
        </strong>

        <p style="margin:12px 0;color:#444;">
          Where SKILL Matters More.
        </p>
      </div>

      <hr style="
        border:none;
        border-top:1px solid #eee;
        margin:45px 0;">

      <div style="color:#444;line-height:35px;">
        <strong style="font-size:22px;">
          PICK2WIN Technologies Private Limited
        </strong>

        <div>Bengaluru, India</div>

        <div>
          Support:
          <a href="mailto:support@pick2win.io"
             style="color:#082b4c;text-decoration:none;">
            support@pick2win.io
          </a>
        </div>

        <p style="
          margin-top:25px;
          color:#999;
          font-size:13px;">
          © 2026 PICK2WIN Technologies Pvt Ltd.
          All rights reserved.
        </p>
      </div>

    </td>
  </tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;



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
  attachmentFileName = "PICK2WIN_UCT.txt",
}) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UCT Teams Generated</title>
</head>

<body style="margin:0;padding:40px 0;background:#ece8e0;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center">

<table width="700" cellpadding="0" cellspacing="0"
style="background:#ffffff;border-radius:14px;overflow:hidden;">

  <tr>
    <td style="background:#082b4c;padding:40px;text-align:center;">
      <div style="font-size:58px;font-weight:900;">
        <span style="color:#ff6b35;">PICK</span>
        <span style="color:#f5b301;">2</span>
        <span style="color:#ff6b35;">WIN</span>
      </div>

      <div
        style="
          color:#f5b301;
          font-size:13px;
          font-weight:700;
          letter-spacing:2px;
          margin-top:10px;
        "
      >
        WHERE SKILL MATTERS MORE
      </div>
    </td>
  </tr>

  <tr>
    <td style="height:6px;background:#f5b301;"></td>
  </tr>

  <tr>
    <td style="padding:50px;">

      <p style="margin:0;color:#666;font-size:14px;">
        UCT generation complete
      </p>

      <h1
        style="
          margin:20px 0 35px;
          font-size:54px;
          line-height:65px;
          color:#0d2741;
        "
      >
        ${teamsGenerated} teams generated successfully.
      </h1>

      <p style="font-size:18px;color:#222;">
        Hello <strong>${fullname}</strong>,
      </p>

      <p
        style="
          font-size:18px;
          color:#444;
          line-height:32px;
        "
      >
        Your UCT generation has been completed successfully.
      </p>

      <table
        width="100%"
        style="
          margin-top:40px;
          background:#faf8f7;
          border:1px solid #ece7e2;
          border-radius:12px;
          padding:30px;
        "
      >
        <tr>
          <td colspan="2"
            style="
              font-size:28px;
              font-weight:700;
              color:#243447;
              padding-bottom:25px;
            "
          >
            ⚽ Match Details
          </td>
        </tr>

        <tr>
          <td style="padding:14px 0;color:#666;">🏆 League</td>
          <td align="right">${leagueName}</td>
        </tr>

        <tr>
          <td style="padding:14px 0;color:#666;">🆚 Match</td>
          <td align="right">${homeTeam} vs ${awayTeam}</td>
        </tr>

        <tr>
          <td style="padding:14px 0;color:#666;">📅 Match Date</td>
          <td align="right">${matchDate}</td>
        </tr>

        <tr>
          <td style="padding:14px 0;color:#666;">⏰ Kickoff Time</td>
          <td align="right">${kickoffTime}</td>
        </tr>
      </table>

      <table
        width="100%"
        style="
          margin-top:35px;
          background:#faf8f7;
          border:1px solid #ece7e2;
          border-radius:12px;
          padding:30px;
        "
      >
        <tr>
          <td colspan="2"
            style="
              font-size:28px;
              font-weight:700;
              color:#243447;
              padding-bottom:25px;
            "
          >
            ⚙ Generation Summary
          </td>
        </tr>

        <tr>
          <td style="padding:14px 0;color:#666;">⚡ Teams Generated</td>
          <td align="right"><strong>${teamsGenerated}</strong></td>
        </tr>

        <tr>
          <td style="padding:14px 0;color:#666;">🪙 Coins Consumed</td>
          <td align="right"><strong>${coinsConsumed}</strong></td>
        </tr>

        <tr>
          <td style="padding:14px 0;color:#666;">📅 Generated On</td>
          <td align="right">${generatedOn}</td>
        </tr>
      </table>

      <table
        width="100%"
        style="
          margin-top:35px;
          background:#f2faf4;
          border:1px solid #cfe7d4;
          border-radius:12px;
          padding:30px;
        "
      >
        <tr>
          <td>
            <h3 style="margin-top:0;color:#243447;">
              📎 ATTACHMENT INCLUDED
            </h3>

            <p
              style="
                color:#444;
                font-size:16px;
                line-height:30px;
              "
            >
              The generated UCT file containing all
              ${teamsGenerated} structured football virtual teams
              has been attached to this email.
            </p>

            <div
              style="
                background:#ffffff;
                border:1px solid #e8e8e8;
                border-radius:8px;
                padding:18px;
                margin-top:20px;
              "
            >
              📄 ${attachmentFileName}
            </div>
          </td>
        </tr>
      </table>

      <div style="margin-top:40px;">
        <h3 style="color:#243447;">📁 My Teams</h3>

        <p
          style="
            color:#444;
            line-height:32px;
            font-size:17px;
          "
        >
          The same generated teams are also available under
          <strong>My Teams</strong> within your PICK2WIN account.
        </p>
      </div>

      <p
        style="
          margin-top:45px;
          font-size:18px;
          color:#444;
        "
      >
        Thank you for using PICK2WIN.
      </p>

      <div style="margin-top:35px;">
        <strong style="font-size:22px;">
          PICK2WIN Team
        </strong>

        <p style="margin:12px 0;color:#444;">
          Where SKILL Matters More.
        </p>
      </div>

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