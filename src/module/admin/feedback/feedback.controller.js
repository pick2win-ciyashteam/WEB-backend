import db from "../../../config/db.js";
import * as s from "./feedback.service.js"
import { logAdminActivity } from "../../../utils/activity.logger.js";
import { sendPushToUser } from "../../../utils/notification.js";

const FEEDBACK_ACK = {
  bug_report:          { title: "Bug Report Received",     body: "Thank you for reporting the issue." },
  feature_suggestion:  { title: "Feature Request Received", body: "We've received your feature request." },
};

/* ================= USER — SUBMIT FEEDBACK ================= */
 export const submitFeedback = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, importance, subject, description, email, location, email_followup } = req.body;

    await db.execute(
      `INSERT INTO feedbacks
        (user_id, type, subject, importance, message, email, location, email_followup, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'New')`,
      [
        userId,
        category,
        subject.trim(),
        importance,
        description.trim(),
        email?.trim()    || null,
        location?.trim() || null,
        email_followup   ? 1 : 0,
      ]
    );

    res.status(200).json({ success: true, message: "Feedback submitted successfully" });

    const ack = FEEDBACK_ACK[category] || { title: "Feedback Received", body: "Thank you for your feedback." };
    await sendPushToUser({
      userId,
      title: ack.title,
      body: ack.body,
      data: { type: "feedback_received", category },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

 export const createFeedbackPost = async (req, res) => {
  try {
    const { title, message, status } = req.body;

    await db.execute(
      `INSERT INTO feedbacks
       (user_id, type, message, status)
       VALUES (?, ?, ?, ?)`,
      [null, title, message, status || ""]
    );

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "users",
      action:    "Feedback post created",
      details:   `Created feedback post ${title}`,
    });

    res.json({
      success: true,
      message: "Announcement created"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


 export const getFeedbackPosts = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
          id,
          type AS title,
          message,
          status,
          created_at
       FROM feedbacks
       WHERE user_id IS NULL
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


export const updateFeedbackPost = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message } = req.body;

    await db.execute(
      `UPDATE feedback_posts
       SET title = ?, message = ?
       WHERE id = ?`,
      [title, message, id]
    );

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "users",
      action:    "Feedback post updated",
      details:   `Updated feedback post ${id}`,
    });

    res.json({
      success: true,
      message: "Post updated successfully"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const deleteFeedbackPost = async (req, res) => {
  try {
    const { id } = req.params;

    await db.execute(
      `DELETE FROM feedback_posts
       WHERE id = ?`,
      [id]
    );

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "users",
      action:    "Feedback post deleted",
      details:   `Deleted feedback post ${id}`,
    });

    res.json({
      success: true,
      message: "Post deleted successfully"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const getAllFeedbacks = async (req, res) => {
  try {
    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const { type, status } = req.query;

    let where = "WHERE 1=1";
    const params = [];

    if (type) {
      where += " AND f.type = ?";
      params.push(type);
    }

    if (status) {
      where += " AND f.status = ?";
      params.push(status);
    }

    const [rows] = await db.execute(
      `SELECT
         f.id,
         f.type,
         f.message,
         f.status,
         f.admin_reply,
         f.created_at,
         u.id AS user_id,
         u.fullname AS user_name,
         u.email AS user_email
       FROM feedbacks f
       JOIN users u ON u.id = f.user_id
       ${where}
       ORDER BY f.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM feedbacks f
       ${where}`,
      params
    );

    res.json({
      success: true,
      total,
      page,
      data: rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const getAdminFeedbackPosts = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, type AS title, message, created_at
       FROM feedbacks
       WHERE user_id IS NULL
       ORDER BY created_at DESC`
    );

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createQuestion = async (req, res) => {
  try {
    const result = await s.createQuestionService(req.body);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "users",
      action:    "Question created",
      details:   `Created feedback question ${result.id}`,
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }  
};

export const getAdminQuestions = async (req, res) => {
  try {
    const result = await s.getAdminQuestionsService();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateQuestion = async (req, res) => {
  try {
    const result = await s.updateQuestionService(req.params.id, req.body);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "users",
      action:    "Question updated",
      details:   `Updated feedback question ${req.params.id}`,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    const result = await s.deleteQuestionService(req.params.id);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "users",
      action:    "Question deleted",
      details:   `Deleted feedback question ${req.params.id}`,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAdminAnswers = async (req, res) => {
  try {
    const result = await s.getAdminAnswersService();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


export const getUserQuestions = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await s.getUserQuestionsService(userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

 export const submitAnswers = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await s.submitAnswersService(userId, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};   