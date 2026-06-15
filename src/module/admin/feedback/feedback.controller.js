import db from "../../../config/db.js";
import * as s from "./feedback.service.js"

/* ================= USER — SUBMIT FEEDBACK ================= */
 export const submitFeedback = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, importance, subject, description, email, location, email_followup } = req.body;

    await db.execute(
      `INSERT INTO feedbacks 
        (user_id, type, subject, importance, message, email, location, email_followup) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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


//uct 




export const createQuestion = async (req, res) => {
  try {
    const result = await s.createQuestionService(req.body);
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
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    const result = await s.deleteQuestionService(req.params.id);
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

// ── USER controllers ───────────────────────────────────────────

export const getUserQuestions = async (req, res) => {
  try {
    const result = await s.getUserQuestionsService();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

 
export const submitAnswers = async (req, res) => {
  const userId = req.user.id; // JWT token నుండి
  const data = req.body;
  const result = await s.submitAnswersService(userId, data);
  res.json(result);
};    