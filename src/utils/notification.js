import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import admin from "firebase-admin";
import db from "../config/db.js"; 
import serviceAccount from "../module/admin/notification/firebase-service-account.js"

  
const __dirname = dirname(fileURLToPath(import.meta.url));

if (!admin.apps.length) {
  try {
    console.log("🔧 Initializing Firebase with credentials...");
    console.log("   Project:", serviceAccount.project_id);
    console.log("   Email:", serviceAccount.client_email);
    console.log("   Key ID:", serviceAccount.private_key_id);
    
    // Debug: Log key format
    if (serviceAccount.private_key) {
      const keyStart = serviceAccount.private_key.substring(0, 50);
      const keyEnd = serviceAccount.private_key.substring(serviceAccount.private_key.length - 50);
      console.log("   Key starts with:", keyStart);
      console.log("   Key ends with:", keyEnd);
      console.log("   Key has newlines:", serviceAccount.private_key.includes("\n"));
    }
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase Admin initialized successfully");
  } catch (err) {
    console.error("❌ Firebase initialization failed:");
    console.error("   Error:", err.message);
    console.error("   Details:", err.errorInfo || err);
    
    // Debug private key
    if (serviceAccount.private_key) {
      console.error("   Private key (first 100 chars):", serviceAccount.private_key.substring(0, 100));
    }
    throw err;
  }
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


export const sendPushToMultiple = async ({ tokens, title, body, data = {} }) => {
  const validTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!validTokens.length) return { success: false, error: "No tokens" };

  try {
    const message = {
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      tokens: validTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    /* ── Failed tokens clean up ── */
    await Promise.all(response.responses.map(async (resp, idx) => {
      if (!resp.success) {
        const failedToken = validTokens[idx];
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
    }));

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
    await db.execute(
      `INSERT INTO user_notifications (user_id, title, body, data)
       VALUES (?, ?, ?, ?)`,
      [userId, title, body, JSON.stringify(data || {})]
    );

    const [devices] = await db.execute(
      `SELECT fcm_token FROM user_devices WHERE user_id = ? AND fcm_token IS NOT NULL`,
      [userId]
    );

    if (!devices.length) return { success: true, message: "Saved to DB, no devices found" };

    const tokens = devices.map((d) => d.fcm_token);
    return await sendPushToMultiple({ tokens, title, body, data });
  } catch (err) {
    return { success: false, error: err.message };
  }
};



/* ── All users కి — push + DB save ── */
export const sendPushToAll = async ({ title, body, data = {} }) => {
  try {
    /* ── DB లో అన్ని users కి save చేయండి ── */
    const [users] = await db.execute(
      `SELECT id AS user_id
       FROM users
       WHERE account_status IS NULL OR CAST(account_status AS CHAR) != 'deleted'`
    );

    for (const u of users) {
      await db.execute(
        `INSERT INTO user_notifications (user_id, title, body, data)
         VALUES (?, ?, ?, ?)`,
        [u.user_id, title, body, JSON.stringify(data || {})]
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
