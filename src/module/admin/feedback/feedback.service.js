import db from "../../../config/db.js";

// ── ADMIN services ─────────────────────────────────────────────

export const createQuestionService = async (data) => {
  const { question, hint, is_mandatory, sort_order, options } = data;

  const [q] = await db.execute(
    `INSERT INTO uct_questions (question, hint, is_mandatory, sort_order)
     VALUES (?, ?, ?, ?)`,
    [question, hint || null, is_mandatory ?? 1, sort_order ?? 0]
  );

  const questionId = q.insertId;

  for (const opt of options) {
    await db.execute(
      `INSERT INTO uct_options (question_id, emoji, label, description, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [questionId, opt.emoji || null, opt.label, opt.description || null, opt.sort_order ?? 0]
    );
  }

  return { success: true, message: "Question created", id: questionId };
};

export const getAdminQuestionsService = async () => {
  const [questions] = await db.execute(
    `SELECT * FROM uct_questions ORDER BY sort_order ASC`
  );

  for (const q of questions) {
    const [options] = await db.execute(
      `SELECT * FROM uct_options WHERE question_id = ? ORDER BY sort_order ASC`,
      [q.id]
    );
    q.options = options;
  }

  return { success: true, data: questions };
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

export const getUserQuestionsService = async () => {
  const [questions] = await db.execute(
    `SELECT id, question, hint, is_mandatory, sort_order
     FROM uct_questions ORDER BY sort_order ASC`
  );

  for (const q of questions) {
    const [options] = await db.execute(
      `SELECT id, emoji, label, description, sort_order
       FROM uct_options WHERE question_id = ? ORDER BY sort_order ASC`,
      [q.id]
    );
    q.options = options;
  }

  return { success: true, data: questions };
};

export const submitAnswersService = async (userId, data) => {
  const { answers, comment } = data;

  if (!answers || !Array.isArray(answers) || answers.length === 0)
    throw new Error("answers required");

  for (const ans of answers) {
    if (!ans.question_id || !ans.option_id)
      throw new Error("question_id and option_id required");

    await db.execute(
      `INSERT INTO uct_answers (user_id, question_id, option_id, comment)
       VALUES (?, ?, ?, ?)`,
      [userId, ans.question_id, ans.option_id, comment || null]
    );
  }

  return { success: true, message: "Answers submitted successfully" };
};   