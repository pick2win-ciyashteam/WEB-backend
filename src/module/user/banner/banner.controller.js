import db from "../../../config/db.js";

export const getActiveBanners = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, name, button,heading, image_url, description, link
       FROM banners
       WHERE is_active = 1
       ORDER BY sort_order ASC, created_at DESC`
    );

    res.status(200).json({
      success: true,
      total:   rows.length,
      data:    rows,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};