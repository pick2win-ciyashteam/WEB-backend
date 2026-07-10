import {
  signupService,
  verifyMobileOtpService,
  verifyEmailOtpService,
  resendOtpService,
  loginService,
  logoutService,
  requestMobileChangeService,
  verifyMobileChangeService,
  requestEmailChangeService,
  verifyEmailChangeService,
  forgotPasswordService,
  resetPasswordService,
  deleteAccountService,
  confirmDeleteAccountService,
  updateProfileService,
} from "./user.auth.services.js"
  
import db from "../../../config/db.js";  
import { logUserActivity } from "../../../utils/activity.logger.js";

const parseMetadata = (metadata) => {
  if (!metadata) return null;
  if (typeof metadata !== "string") return metadata;

  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
};

const addDaysToDateString = (dateString, days) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const todayDateString = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

/* ================= SIGNUP ================= */
export const signup = async (req, res) => {
  try {
    const result = await signupService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= VERIFY MOBILE OTP ================= */
export const verifyMobileOtp = async (req, res) => {
  try {
    const result = await verifyMobileOtpService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
  
/* ================= VERIFY EMAIL OTP ================= */
export const verifyEmailOtp = async (req, res) => {    
  try {
    const result = await verifyEmailOtpService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};    

/* ================= RESEND OTP ================= */
export const resendOtp = async (req, res) => {
  try {
    const result = await resendOtpService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};  

/* ================= LOGIN ================= */
export const login = async (req, res) => {
  try {
    const result = await loginService(req.body);
    await logUserActivity({
      userId: result.user?.id,
      category: "auth",
      action: "login",
      details: "User logged in successfully",
      req,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= LOGOUT ================= */
export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const result = await logoutService(req.user.id, token);
    await logUserActivity({
      userId: req.user.id,
      category: "auth",
      action: "logout",
      details: "User logged out successfully",
      req,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};    
  
 
/* ================= GET PROFILE ================= */
export const getProfile = async (req, res) => {
  try {
    /* ── 1. User + Subscription ── */
     const [[user]] = await db.execute(
  `SELECT
     u.id,
     u.fullname,
     u.email,
     u.mobile,
     u.country,
     u.date_of_birth,
     u.email_verify,
     u.mobile_verify,
     u.account_status,
     u.created_at,
     u.free_trial_used,

     us.plan_id,
     us.plan_name,
     us.matches_allowed,
     us.matches_used,
     (us.matches_allowed - us.matches_used) AS matches_remaining,
     us.amount                               AS subscription_amount,
     us.start_date                           AS subscription_start,
     us.expiry_date                          AS subscription_expiry,
     us.status                               AS subscription_status

   FROM users u
   LEFT JOIN user_subscriptions us
     ON us.user_id = u.id
    AND us.status = 'active'
   WHERE u.id = ?
     AND u.account_status != 'deleted'
   ORDER BY us.id DESC
   LIMIT 1`,
  [req.user.id]
);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

   /* ── 2. Coins Wallet ── */
const [[wallet]] = await db.execute(
  `SELECT available_coins, used_coins, total_coins
   FROM user_coins WHERE user_id = ?`,
  [req.user.id]
);

    /* ── 3. Total purchased coins ── */
    const [[purchased]] = await db.execute(
      `SELECT COALESCE(SUM(coins), 0) AS total
       FROM coins_transactions
       WHERE user_id = ? AND coins > 0 AND status = 'success'`,
      [req.user.id]
    );

    /* ── 4. Total spent coins ── */
    const [[spent]] = await db.execute(
      `SELECT COALESCE(SUM(ABS(coins)), 0) AS total
       FROM coins_transactions
       WHERE user_id = ? AND coins < 0 AND status = 'success'`,
      [req.user.id]
    );

    /* ── 5. Logged-in devices — distinct ip_address + user_agent combos
       from login/logout activity logs (no separate device/session table
       exists, so this reuses what's already captured on every login/logout).
       A device counts as "active" (still logged in) if its most recent
       auth event is a login with no later logout — this is a best-effort
       signal only: user JWTs aren't server-side revoked on logout, so the
       token itself would still work even after this flips to inactive. ── */
    const [[deviceCount]] = await db.execute(
      `SELECT COUNT(DISTINCT CONCAT(COALESCE(ip_address, ''), '|', COALESCE(user_agent, ''))) AS total
       FROM user_activity_logs
       WHERE user_id = ? AND category = 'auth' AND action = 'login'`,
      [req.user.id]
    );

    const [deviceStatuses] = await db.execute(
      `SELECT
         ual.ip_address,
         ual.user_agent,
         latest.last_seen,
         (ual.action = 'login') AS is_active
       FROM user_activity_logs ual
       INNER JOIN (
         SELECT ip_address, user_agent, MAX(created_at) AS last_seen
         FROM user_activity_logs
         WHERE user_id = ? AND category = 'auth' AND action IN ('login', 'logout')
         GROUP BY ip_address, user_agent
       ) latest
         ON latest.ip_address = ual.ip_address
        AND latest.user_agent = ual.user_agent
        AND latest.last_seen  = ual.created_at
       WHERE ual.user_id = ? AND ual.category = 'auth' AND ual.action IN ('login', 'logout')
       GROUP BY ual.ip_address, ual.user_agent, latest.last_seen, ual.action
       ORDER BY latest.last_seen DESC`,
      [req.user.id, req.user.id]
    );

    const activeDeviceCount = deviceStatuses.filter((d) => d.is_active).length;
    const recentDevices = deviceStatuses.slice(0, 5);

  const availableCoins = wallet ? Number(wallet.available_coins) : 0;
  const totalCoins     = wallet ? Number(wallet.total_coins)     : 0;
  const usedCoins      = wallet ? Number(wallet.used_coins)      : 0;

    res.status(200).json({
      success: true,
      data: {
        /* ── Personal Info ── */
        id:             user.id,
        fullname:       user.fullname,
        email:          user.email,
        mobile:         user.mobile,
        country:        user.country,
        date_of_birth:  user.date_of_birth,
        email_verify:   user.email_verify,
        mobile_verify:  user.mobile_verify,
        account_status: user.account_status,
        created_at:     user.created_at,
        free_trial_used:   user.free_trial_used,          
        free_trial_status: user.free_trial_used === 1 ? "used" : "available",   

        /* ── Coins Wallet ── */
        coins: {
          total_coins:     totalCoins,
          used_coins:      usedCoins,
          coins: availableCoins,
        },

        /* ── Subscription ── */
        subscription: user.plan_id ? {
          plan_id:           user.plan_id,
          plan_name:         user.plan_name,
          matches_allowed:   user.matches_allowed,
          matches_used:      user.matches_used,
          matches_remaining: user.matches_remaining,
          amount:            user.subscription_amount,
          start_date:        user.subscription_start,
          expiry_date:       user.subscription_expiry,
          status:            user.subscription_status,
        } : null,

        /* ── Security — logged-in devices ── */
        security: {
          device_count:        Number(deviceCount.total),
          active_device_count: activeDeviceCount,
          recent_devices: recentDevices.map((d) => ({
            ip_address: d.ip_address,
            user_agent: d.user_agent,
            last_seen:  d.last_seen,
            is_active:  Boolean(d.is_active),
          })),
        },
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= UPDATE PROFILE ================= */
export const updateProfile = async (req, res) => {
  try {
    const ALLOWED = ["fullname", "country", "date_of_birth"];
    const sanitized = {};

    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) sanitized[key] = req.body[key];
    }

    if (!Object.keys(sanitized).length) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    /* ── Age check ── */
    if (sanitized.date_of_birth) {
      const age =
        new Date(Date.now() - new Date(sanitized.date_of_birth)).getUTCFullYear() - 1970;
      if (age < 18) {
        return res.status(400).json({
          success: false,
          message: "You must be at least 18 years old",
        });
      }
    }

    const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(sanitized);

    await db.execute(
      `UPDATE users SET ${setClauses} WHERE id = ?`,
      [...setValues, req.user.id]
    );

    await logUserActivity({
      userId: req.user.id,
      category: "profile",
      action: "profile_updated",
      details: `Updated fields: ${Object.keys(sanitized).join(", ")}`,
      req,
      metadata: { updated_fields: Object.keys(sanitized) },
    });

    /* ── Return updated profile ── */
    const [[updated]] = await db.execute(
      `SELECT
         id, fullname, email, mobile,
         country, date_of_birth,
         email_verify, mobile_verify,
         account_status, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data:    updated,
    });

    /* ── Send profile updated notification email ── */
    await updateProfileService(updated).catch((err) => {
      console.error("Profile update email failed:", err.message);
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}; 

/* ================= DELETE ACCOUNT ================= */

  


/* ================= REQUEST MOBILE CHANGE ================= */
export const requestMobileChange = async (req, res) => {
  try {
    // ✅ object గా pass చేయి
    const result = await requestMobileChangeService(req.user.id, { new_mobile: req.body.new_mobile });
    await logUserActivity({
      userId: req.user.id,
      category: "profile",
      action: "mobile_change_requested",
      details: "User requested mobile number change",
      req,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= VERIFY MOBILE CHANGE ================= */
export const verifyMobileChange = async (req, res) => {
  try {
    // ✅ object గా pass చేయి
    const result = await verifyMobileChangeService(req.user.id, { otp: req.body.otp });
    await logUserActivity({
      userId: req.user.id,
      category: "profile",
      action: "mobile_changed",
      details: "User mobile number changed successfully",
      req,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= REQUEST EMAIL CHANGE ================= */
export const requestEmailChange = async (req, res) => {
  try {
    const result = await requestEmailChangeService(req.user.id, req.body.new_email);
    await logUserActivity({
      userId: req.user.id,
      category: "profile",
      action: "email_change_requested",
      details: "User requested email change",
      req,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= VERIFY EMAIL CHANGE ================= */
export const verifyEmailChange = async (req, res) => {
  try {
    const result = await verifyEmailChangeService(req.user.id, req.body.otp);
    await logUserActivity({
      userId: req.user.id,
      category: "profile",
      action: "email_changed",
      details: "User email changed successfully",
      req,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= FORGOT PASSWORD ================= */
export const forgotPassword = async (req, res) => {
  try {
    const result = await forgotPasswordService(req.body.email);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};  

/* ================= RESET PASSWORD ================= */
export const resetPassword = async (req, res) => {
  try {
    const result = await resetPasswordService(
      req.body.email,
      req.body.otp,
      req.body.password
    );
    if (result.user_id) {
      await logUserActivity({
        userId: result.user_id,
        category: "security",
        action: "password_reset",
        details: "User password reset successfully",
        req,
      });
      delete result.user_id;
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


/* ================= DELETE ACCOUNT ================= */
export const deleteAccount = async (req, res) => {
  try {
    const result = await deleteAccountService(req.user.id);
    await logUserActivity({
      userId: req.user.id,
      category: "security",
      action: "account_delete_requested",
      details: "User requested account deletion",
      req,
    });
    return res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= CONFIRM DELETE ACCOUNT ================= */
export const confirmDeleteAccount = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, message: "OTP required" });
    }
    await logUserActivity({
      userId: req.user.id,
      category: "security",
      action: "account_delete_confirm_requested",
      details: "User submitted account deletion confirmation",
      req,
    });
    const result = await confirmDeleteAccountService(req.user.id, otp);
    return res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};  

export const getMyActivityLogs = async (req, res) => {
  try {
    let { page = 1, limit = 20, category, date, from_date, to_date } = req.query;

    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (page - 1) * limit;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    const filters = ["user_id = ?"];
    const values = [req.user.id];

    if (category) {
      filters.push("category = ?");
      values.push(String(category).trim());
    }

    if (date && !datePattern.test(String(date))) {
      return res.status(400).json({
        success: false,
        message: "date must be in YYYY-MM-DD format",
      });
    }

    if (from_date && !datePattern.test(String(from_date))) {
      return res.status(400).json({
        success: false,
        message: "from_date must be in YYYY-MM-DD format",
      });
    }

    if (to_date && !datePattern.test(String(to_date))) {
      return res.status(400).json({
        success: false,
        message: "to_date must be in YYYY-MM-DD format",
      });
    }

    if (date) {
      const startDate = String(date);
      const endDate = addDaysToDateString(startDate, 1);
      filters.push("created_at >= ? AND created_at < ?");
      values.push(`${startDate} 00:00:00`, `${endDate} 00:00:00`);
    } else if (from_date || to_date) {
      if (from_date) {
        filters.push("created_at >= ?");
        values.push(`${String(from_date)} 00:00:00`);
      }

      if (to_date) {
        filters.push("created_at < ?");
        values.push(`${addDaysToDateString(String(to_date), 1)} 00:00:00`);
      }
    } else {
      const today = todayDateString();
      const tomorrow = addDaysToDateString(today, 1);
      filters.push("created_at >= ? AND created_at < ?");
      values.push(`${today} 00:00:00`, `${tomorrow} 00:00:00`);
    }

    const whereClause = filters.join(" AND ");

    const [logs] = await db.execute(
      `SELECT
         id, category, action, details, ip_address, user_agent, metadata, created_at
       FROM user_activity_logs
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      values
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM user_activity_logs
       WHERE ${whereClause}`,
      values
    );

    return res.status(200).json({
      success: true,
      pagination: {
        total: Number(total),
        page,
        limit,
        total_pages: Math.ceil(Number(total) / limit),
      },
      filters: {
        category: category || null,
        date: date || null,
        from_date: date ? null : from_date || null,
        to_date: date ? null : to_date || null,
        default_today: !date && !from_date && !to_date,
      },
      data: logs.map((log) => ({
        ...log,
        metadata: parseMetadata(log.metadata),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
  

 
export const registerDevice = async (req, res) => {
  try {
    const { registration_token, device_type } = req.body;
    const userId = req.user.id;

    if (!registration_token) {
      return res.status(400).json({
        success: false,
        message: "registration_token is required",
      });
    }

    await db.execute(
      `INSERT INTO user_devices (user_id, fcm_token, device_type)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         fcm_token   = VALUES(fcm_token),
         device_type = VALUES(device_type),
         updated_at  = NOW()`,
      [
        userId,
        registration_token,
        device_type || "web",
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Device registered successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
/* ── Get My Notifications ── */  
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    let { page = 1, limit = 20 } = req.query;
    page  = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (page - 1) * limit;

    const [notifications] = await db.query(
      `SELECT id, title, body, data, is_read, created_at
       FROM user_notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM user_notifications WHERE user_id = ?`,
      [userId]
    );

    const [[{ unread }]] = await db.execute(
      `SELECT COUNT(*) AS unread FROM user_notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      unread_count: Number(unread),
      pagination: {
        total:       Number(total),
        page,
        limit,
        total_pages: Math.ceil(Number(total) / limit),
      },
      data: notifications.map((n) => ({
        id:         n.id,
        title:      n.title,
        body:       n.body,
        data:       typeof n.data === "string" ? JSON.parse(n.data) : n.data,
        is_read:    Boolean(n.is_read),
        created_at: n.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── Mark as Read ── */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (id === "all") {
      await db.execute(
        `UPDATE user_notifications SET is_read = 1 WHERE user_id = ?`,
        [userId]
      );
      return res.status(200).json({ success: true, message: "All notifications marked as read" });
    }

    await db.execute(
      `UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    return res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
  
/* ── Delete Notification ── */
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await db.execute(
      `DELETE FROM user_notifications WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    return res.status(200).json({ success: true, message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
   