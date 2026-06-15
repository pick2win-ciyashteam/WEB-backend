import db from "../../../config/db.js";

// ── ADMIN services ─────────────────────────────────────────────

// export const createQuestionService = async (data) => {
//   const { question, hint, is_mandatory, sort_order, options } = data;

//   const [q] = await db.execute(
//     `INSERT INTO uct_questions (question, hint, is_mandatory, sort_order)
//      VALUES (?, ?, ?, ?)`,
//     [question, hint || null, is_mandatory ?? 1, sort_order ?? 0]
//   );

//   const questionId = q.insertId;

//   for (const opt of options) {
//     await db.execute(
//       `INSERT INTO uct_options (question_id, emoji, label, description, sort_order)
//        VALUES (?, ?, ?, ?, ?)`,
//       [questionId, opt.emoji || null, opt.label, opt.description || null, opt.sort_order ?? 0]
//     );
//   }

//   return { success: true, message: "Question created", id: questionId };
// };

export const createQuestionService = async (data) => {
  const { question, hint, question_type, is_mandatory, sort_order } = data;

  const [result] = await db.execute(
    `INSERT INTO uct_questions (question, hint, question_type, is_mandatory, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    [question, hint || null, question_type || 'radio', is_mandatory ?? 1, sort_order ?? 0]
  );

  return { success: true, message: "Question created", id: result.insertId };
};



 export const getAdminAnswersService = async () => {
  const [answers] = await db.execute(
    `SELECT a.id, a.user_id, a.answers, a.created_at,
            u.fullname, u.mobile, u.email
     FROM uct_answers a
     JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC`
  );

  const parsed = answers.map(row => ({
    id: row.id,
    user_id: row.user_id,
    fullname: row.fullname,
    mobile: row.mobile,
    email: row.email,
    answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
    created_at: row.created_at
  }));

  return { success: true, data: parsed };
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

// export const getAdminAnswersService = async () => {
//   const [rows] = await db.execute(
//     `SELECT
//        a.id,
//        a.comment,
//        a.created_at,
//        u.id       AS user_id,
//        u.fullname AS user_name,
//        q.question,
//        o.emoji,
//        o.label    AS selected_option
//      FROM uct_answers a
//      LEFT JOIN users         u ON u.id = a.user_id
//      JOIN      uct_questions q ON q.id = a.question_id
//      JOIN      uct_options   o ON o.id = a.option_id
//      ORDER BY a.created_at DESC`
//   );

//   return { success: true, data: rows };
// };

// ── USER services ──────────────────────────────────────────────

export const getUserQuestionsService = async () => {
  const [questions] = await db.execute(
    `SELECT id, question, hint, question_type, is_mandatory, sort_order
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
  const { answers } = data;

  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    throw new Error("answers required");

  if (Object.keys(answers).length === 0)
    throw new Error("answers cannot be empty");

  // one submission per user check
  const [existing] = await db.execute(
    `SELECT id FROM uct_answers WHERE user_id = ?`,
    [userId]
  );

  if (existing.length > 0)
    throw new Error("You have already submitted feedback");

  await db.execute(
    `INSERT INTO uct_answers (user_id, answers) VALUES (?, ?)`,
    [userId, JSON.stringify(answers)]
  );

  return { success: true, message: "Feedback submitted successfully" };
};  