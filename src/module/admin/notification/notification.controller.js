// src/module/admin/notification/notification.controller.js
import {
  sendPushToUser,
  sendPushToAll,
  sendPushNotification,
} from "../../../utils/notification.js";

/* ── Send to specific user ── */
export const sendToUser = async (req, res) => {
  try {
    const { user_id, title, body, data } = req.body;

    if (!user_id || !title || !body) {
      return res.status(400).json({ success: false, message: "user_id, title, body required" });
    }

    const result = await sendPushToUser({ userId: user_id, title, body, data: data || {} });

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }

    if (result.message) {
      return res.status(200).json({ success: true, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: "Notification sent successfully",
      success_count: result.response.successCount,
      failure_count: result.response.failureCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── Send to all users ── */
export const sendToAll = async (req, res) => {
  try {
    const { title, body, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: "title, body required" });
    }

    const result = await sendPushToAll({ title, body, data: data || {} });

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }

    if (result.message) {
      return res.status(200).json({ success: true, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: "Notification sent to all users",
      success_count: result.successCount,
      failure_count: result.failureCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

