// Twilio Verify wrapper — replaces manual OTP generation + raw SMS
// (utils/sms.js sendSms) for any flow that needs mobile OTP verification.
// A2P 10DLC registration issues (Error 30034) don't apply to Verify —
// it uses Twilio's own verification infrastructure, not your Messaging Service.
//
// .env additions required:
//   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   (already set)
//   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx      (already set)
//   TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  (new — create in Console → Verify → Services)

import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

/**
 * Sends an OTP to a mobile number via Twilio Verify.
 * @param {string} mobile - E.164 format, e.g. "+14155552671"
 * @returns {Promise<{sid: string, status: string}>}
 */
export const sendVerificationOtp = async (mobile) => {
  const verification = await client.verify.v2
    .services(verifyServiceSid)
    .verifications.create({ to: mobile, channel: "sms" });

  return { sid: verification.sid, status: verification.status };
};

/**
 * Checks an OTP entered by the user against Twilio Verify.
 * @param {string} mobile
 * @param {string} otp
 * @returns {Promise<{approved: boolean, status: string}>}
 */
export const checkVerificationOtp = async (mobile, otp) => {
  try {
    const check = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: mobile, code: otp });

    return { approved: check.status === "approved", status: check.status };
  } catch (err) {
    // Twilio throws (not just returns pending) when there's no matching
    // verification at all — e.g. code 20404: expired, already checked,
    // or never sent for this number. Treat that as "not approved" rather
    // than letting it bubble up as a 500.
    if (err.code === 20404) {
      return { approved: false, status: "not_found" };
    }
    throw err;
  }
};
