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
    rejectUnauthorized: false, // self-signed certificate fix
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
    rejectUnauthorized: false, // self-signed certificate fix
  },
});

/* ══════════════════════════════════════════
   SEND MAIL HELPERS
══════════════════════════════════════════ */

// General user mail (OTP, registration, etc)
export const sendNoreplyMail = async ({ to, subject, html }) => {
  return noreplyTransporter.sendMail({
    from:    `"Pick2Win" <${process.env.NOREPLY_EMAIL}>`,
    to,
    subject,
    html,
  });
};

// Billing mail (payments, coin purchase)
export const sendBillingMail = async ({ to, subject, html }) => {
  return billingTransporter.sendMail({
    from:    `"Pick2Win Billing" <${process.env.BILLING_EMAIL}>`,
    to,
    subject,
    html,
  });
};

/* ══════════════════════════════════════════
   DEFAULT EXPORT (backward compatibility)
   existing code లో transporter use 
══════════════════════════════════════════ */
export default noreplyTransporter;   