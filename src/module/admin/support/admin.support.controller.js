import db from "../../../config/db.js"

/* ═══════════════════════════════════════════════════
   ADMIN — GET ALL TICKETS
   GET /admin/support?status=all|open|in_progress|resolved|closed
                      &page=1&limit=20&search=
   ═══════════════════════════════════════════════════ */
export const getAllTickets = async (req, res) => {
  try {
    const { status = "all", page = 1, limit = 20, search = "" } = req.query;
    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;

    const conditions = [];
    const params      = [];

    if (status !== "all") {
      conditions.push(`t.status = ?`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(t.subject LIKE ? OR u.fullname LIKE ? OR u.email LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    /* ── KPI cards ── */
    const [[kpi]] = await db.execute(
      `SELECT
         COUNT(*)                                                AS total,
         SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END) AS open_count,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
         SUM(CASE WHEN status = 'resolved'    THEN 1 ELSE 0 END) AS resolved_count,
         SUM(CASE WHEN status = 'closed'      THEN 1 ELSE 0 END) AS closed_count
       FROM support_tickets`
    );

    /* ── List ── */
    const [rows] = await db.execute(
      `SELECT
         t.id, t.subject, t.message, t.admin_reply,
         t.status, t.created_at, t.replied_at,
         u.id AS user_id, u.fullname, u.email, u.country
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       ${whereClause}`,
      params
    );

    return res.status(200).json({
      success: true,

      kpis: {
        total:        Number(kpi.total),
        open:          Number(kpi.open_count),
        in_progress:    Number(kpi.in_progress_count),
        resolved:        Number(kpi.resolved_count),
        closed:           Number(kpi.closed_count),
      },

      pagination: {
        total:       Number(total),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(total) / limitNum),
      },

      filters: { status, search },

      tickets: rows.map((t) => ({
        id:           t.id,
        ticket_code:  `TKT-${t.id}`,
        subject:       t.subject,
        message:       t.message,
        admin_reply:   t.admin_reply,
        status:        t.status,
        user: {
          id:        t.user_id,
          fullname:   t.fullname,
          email:      t.email,
          country:    t.country,
        },
        created_at:  t.created_at,
        replied_at:  t.replied_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   ADMIN — GET SINGLE TICKET
   GET /admin/support/:id
   ═══════════════════════════════════════════════════ */
export const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    const [[ticket]] = await db.execute(
      `SELECT
         t.id, t.subject, t.message, t.admin_reply,
         t.status, t.created_at, t.replied_at,
         u.id AS user_id, u.fullname, u.email, u.country
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = ?`,
      [id]
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
        user: {
          id:        ticket.user_id,
          fullname:   ticket.fullname,
          email:      ticket.email,
          country:    ticket.country,
        },
        created_at:  ticket.created_at,
        replied_at:  ticket.replied_at,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   ADMIN — REPLY TO TICKET (also updates status)
   PATCH /admin/support/:id/reply
   body: { admin_reply, status }
   ═══════════════════════════════════════════════════ */
export const replyToTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_reply, status = "resolved" } = req.body;

    if (!admin_reply?.trim()) {
      return res.status(400).json({ success: false, message: "admin_reply is required" });
    }

    const validStatuses = ["open", "in_progress", "resolved", "closed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${validStatuses.join(", ")}`,
      });
    }

    const [[ticket]] = await db.execute(
      `SELECT id FROM support_tickets WHERE id = ?`,
      [id]
    );
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    await db.execute(
      `UPDATE support_tickets
       SET admin_reply = ?, status = ?, replied_by = ?, replied_at = NOW()
       WHERE id = ?`,
      [admin_reply.trim(), status, req.admin?.id || null, id]
    );

    return res.status(200).json({ success: true, message: "Reply sent successfully" });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   ADMIN — UPDATE STATUS ONLY (no reply change)
   PATCH /admin/support/:id/status
   body: { status }
   ═══════════════════════════════════════════════════ */
export const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["open", "in_progress", "resolved", "closed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${validStatuses.join(", ")}`,
      });
    }

    const [[ticket]] = await db.execute(
      `SELECT id FROM support_tickets WHERE id = ?`,
      [id]
    );
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    await db.execute(
      `UPDATE support_tickets SET status = ? WHERE id = ?`,
      [status, id]
    );

    return res.status(200).json({ success: true, message: "Status updated successfully" });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};