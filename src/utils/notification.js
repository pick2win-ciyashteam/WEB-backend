import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import admin from "firebase-admin";
import db from "../config/db.js"; 

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Firebase initialize ── */
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    readFileSync(
      join(__dirname, "../module/admin/notification/firebase-service-account.json"),
      "utf8"
    )
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin initialized");
}

/* ── Single token కి ── */
export const sendPushNotification = async ({ token, title, body, data = {} }) => {
  try {
    const message = {
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      token,
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Push sent: ${response}`);
    return { success: true, response };
  } catch (err) {
    console.error(`❌ Push failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/* ── Multiple tokens కి ── */
// export const sendPushToMultiple = async ({ tokens, title, body, data = {} }) => {
//   if (!tokens.length) return { success: false, error: "No tokens" };

//   try {
//     const message = {
//       notification: { title, body },
//       data: Object.fromEntries(
//         Object.entries(data).map(([k, v]) => [k, String(v)])
//       ),
//       tokens,
//     };

//     const response = await admin.messaging().sendEachForMulticast(message);
//     console.log(`✅ Multicast: ${response.successCount} success, ${response.failureCount} failed`);
//     return { success: true, response };
//   } catch (err) {
//     console.error(`❌ Multicast failed: ${err.message}`);
//     return { success: false, error: err.message };
//   }
// };

export const sendPushToMultiple = async ({ tokens, title, body, data = {} }) => {
  if (!tokens.length) return { success: false, error: "No tokens" };

  try {
    const message = {
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    /* ── Failed tokens clean up ── */
    response.responses.forEach(async (resp, idx) => {
      if (!resp.success) {
        const failedToken = tokens[idx];
        const errorCode   = resp.error?.code;

        // Invalid token అయితే DB నుండి delete చేయండి
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          await db.execute(
            `DELETE FROM user_devices WHERE fcm_token = ?`,
            [failedToken]
          );
          console.warn(`🗑️ Removed invalid token: ${failedToken.slice(0, 20)}...`);
        }
      }
    });

    console.log(`✅ Multicast: ${response.successCount} success, ${response.failureCount} failed`);
    return { success: true, response };
  } catch (err) {
    console.error(`❌ Multicast failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/* ── User కి (all devices) ── */
export const sendPushToUser = async ({ userId, title, body, data = {} }) => {
  try {
    const [devices] = await db.execute(
      `SELECT fcm_token FROM user_devices WHERE user_id = ? AND fcm_token IS NOT NULL`,
      [userId]
    );

    if (!devices.length) return { success: false, error: "No devices found" };

    const tokens = devices.map((d) => d.fcm_token);
    return await sendPushToMultiple({ tokens, title, body, data });
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/* ── All users కి ── */
// export const sendPushToAll = async ({ title, body, data = {} }) => {
//   try {
//     const [devices] = await db.execute(
//       `SELECT DISTINCT fcm_token FROM user_devices WHERE fcm_token IS NOT NULL`
//     );

//     if (!devices.length) return { success: false, error: "No devices found" };

//     const tokens     = devices.map((d) => d.fcm_token);
//     const BATCH      = 500;
//     let successCount = 0;
//     let failureCount = 0;

//     for (let i = 0; i < tokens.length; i += BATCH) {
//       const batch   = tokens.slice(i, i + BATCH);
//       const result  = await sendPushToMultiple({ tokens: batch, title, body, data });
//       successCount += result.response?.successCount || 0;
//       failureCount += result.response?.failureCount || 0;
//     }

//     console.log(`✅ Bulk push: ${successCount} success, ${failureCount} failed`);
//     return { success: true, successCount, failureCount };
//   } catch (err) {
//     return { success: false, error: err.message };
//   }
// };


/* ── All users కి — push + DB save ── */
export const sendPushToAll = async ({ title, body, data = {} }) => {
  try {
    /* ── DB లో అన్ని users కి save చేయండి ── */
    const [users] = await db.execute(
      `SELECT DISTINCT user_id FROM user_devices WHERE fcm_token IS NOT NULL`
    );

    for (const u of users) {
      await db.execute(
        `INSERT INTO user_notifications (user_id, title, body, data)
         VALUES (?, ?, ?, ?)`,
        [u.user_id, title, body, JSON.stringify(data)]
      );
    }

    /* ── Push send ── */
    const [devices] = await db.execute(
      `SELECT DISTINCT fcm_token FROM user_devices WHERE fcm_token IS NOT NULL`
    );

    if (!devices.length) return { success: true, message: "Saved to DB, no devices found" };

    const tokens     = devices.map((d) => d.fcm_token);
    const BATCH      = 500;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch   = tokens.slice(i, i + BATCH);
      const result  = await sendPushToMultiple({ tokens: batch, title, body, data });
      successCount += result.response?.successCount || 0;
      failureCount += result.response?.failureCount || 0;
    }

    console.log(`✅ Bulk push: ${successCount} success, ${failureCount} failed`);
    return { success: true, successCount, failureCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
};