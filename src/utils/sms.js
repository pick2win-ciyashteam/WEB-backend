import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendSms = async (to, message) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`📵 [SMS SKIPPED — non-production] To: +${String(to).replace(/\D/g, "")} | ${message}`);
    return { sid: "SKIPPED_NON_PRODUCTION" };
  }

  try {
    const params = {
      body: message,
      to:   `+${String(to).replace(/\D/g, "")}`,
    };

    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      params.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    } else {
      params.from = process.env.TWILIO_PHONE_NUMBER;
    }

    const result = await client.messages.create(params);
    console.log(`✅ SMS sent — SID: ${result.sid}`);
    return result;
  } catch (err) {
    console.error(`❌ SMS failed: ${err.message}`);
    throw err;
  }
};