import db from "../../../config/db.js";
import { sendPushToUser } from "../../../utils/notification.js";

// ── ADMIN services ─────────────────────────────────────────────

 export const createQuestionService = async (data) => {
  const { question, hint, question_type, is_mandatory, sort_order } = data;

  const [result] = await db.execute(
    `INSERT INTO uct_questions (question, hint, question_type, is_mandatory, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    [question, hint || null, question_type || 'radio', is_mandatory ?? 1, sort_order ?? 0]
  );

  return { success: true, message: "Question created", id: result.insertId };
};

 export const getAdminQuestionsService = async () => {
  const [questions] = await db.execute(
    `SELECT id, question, hint, question_type, is_mandatory, sort_order, created_at
     FROM uct_questions ORDER BY sort_order ASC`
  );

  return { success: true, data: questions };
};

export const getUserQuestionsService = async (userId) => {
  const [questions] = await db.execute(
    `SELECT id, question, hint, question_type, is_mandatory, sort_order
     FROM uct_questions ORDER BY sort_order ASC`
  );

  const [existing] = await db.execute(
    `SELECT id FROM uct_answers WHERE user_id = ?`,
    [userId]
  );

  return { 
    success: true, 
    already_submitted: existing.length > 0,
    data: questions 
  };
};

export const updateQuestionService = async (id, data) => {
  const { question, hint, is_mandatory, sort_order } = data;

  await db.execute(
    `UPDATE uct_questions SET question=?, hint=?, is_mandatory=?, sort_order=? WHERE id=?`,
    [question, hint || null, is_mandatory ?? 1, sort_order ?? 0, id]
  );

  return { success: true, message: "Question updated" };
};

export const deleteQuestionService = async (id) => {
  await db.execute(`DELETE FROM uct_questions WHERE id = ?`, [id]);
  return { success: true, message: "Question deleted" };
};

export const getAdminAnswersService = async () => {
  const [rows] = await db.execute(
    `SELECT
       a.id,
       a.comment,
       a.created_at,
       u.id       AS user_id,
       u.fullname AS user_name,
       q.question,
       o.emoji,
       o.label    AS selected_option
     FROM uct_answers a
     LEFT JOIN users         u ON u.id = a.user_id
     JOIN      uct_questions q ON q.id = a.question_id
     JOIN      uct_options   o ON o.id = a.option_id
     ORDER BY a.created_at DESC`
  );

  return { success: true, data: rows };
};  

// ── USER services ──────────────────────────────────────────────

export const submitAnswersService = async (userId, data) => {
  const { answers } = data;

  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    throw new Error("answers required");

  if (Object.keys(answers).length === 0)
    throw new Error("answers cannot be empty");

  const [existing] = await db.execute(
    `SELECT id FROM uct_answers WHERE user_id = ?`,
    [userId]
  );

  if (existing.length > 0) {
    return { success: false, already_submitted: true, message: "You have already submitted feedback" };
  }

  await db.execute(
    `INSERT INTO uct_answers (user_id, answers) VALUES (?, ?)`,
    [userId, JSON.stringify(answers)]
  );

  await sendPushToUser({
    userId,
    title: "Survey Completed",
    body: "Thanks for completing the PICK2WIN survey.",
    data: { type: "survey_completed" },
  });

  return { success: true, already_submitted: false, message: "Feedback submitted successfully" };
};
