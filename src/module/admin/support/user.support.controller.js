import db from "../../../config/db.js"

/* ═══════════════════════════════════════════════════
   USER — SUBMIT SUPPORT TICKET
   POST /support
   body: { subject, message }
   ═══════════════════════════════════════════════════ */
export const submitTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, message } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "subject and message are required",
      });
    }

    const [result] = await db.execute(
      `INSERT INTO support_tickets (user_id, subject, message)
       VALUES (?, ?, ?)`,
      [userId, subject.trim(), message.trim()]
    );

    return res.status(201).json({
      success: true,
      message: "Support ticket submitted successfully",
      ticket_id: result.insertId,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   USER — GET MY TICKETS
   GET /support?page=1&limit=20
   ═══════════════════════════════════════════════════ */
export const getMyTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;

    const [rows] = await db.execute(
      `SELECT id, subject, message, admin_reply, status,
              created_at, replied_at
       FROM support_tickets
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      [userId]
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM support_tickets WHERE user_id = ?`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      pagination: {
        total:       Number(total),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(total) / limitNum),
      },
      tickets: rows.map((t) => ({
        id:           t.id,
        ticket_code:  `TKT-${t.id}`,
        subject:       t.subject,
        message:       t.message,
        admin_reply:   t.admin_reply,
        status:        t.status,
        created_at:    t.created_at,
        replied_at:    t.replied_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   USER — GET SINGLE TICKET
   GET /support/:id
   ═══════════════════════════════════════════════════ */
export const getMyTicketById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [[ticket]] = await db.execute(
      `SELECT id, subject, message, admin_reply, status,
              created_at, replied_at
       FROM support_tickets
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    return res.status(200).json({
      success: true,
      ticket: {
        id:           ticket.id,
        ticket_code:  `TKT-${ticket.id}`,
        subject:       ticket.subject,
        message:       ticket.message,
        admin_reply:   ticket.admin_reply,
        status:        ticket.status,
        created_at:    ticket.created_at,
        replied_at:    ticket.replied_at,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};