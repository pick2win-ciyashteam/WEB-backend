import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendSms = async (to, message) => {
  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   `+${String(to).replace(/\D/g, "")}`,
    });
    console.log(`✅ SMS sent — SID: ${result.sid}`);
    return result;
  } catch (err) {
    console.error(`❌ SMS failed: ${err.message}`);
    throw err;
  }
};