import db from "../../../config/db.js";

/* ================= ADD BANNER ================= */
export const addBannerService = async (data) => {
  const { name, image_url, description, link, is_active, sort_order } = data;

  const [result] = await db.execute(
    `INSERT INTO banners (name, image_url, description, link, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      name,
      image_url,
      description || null,
      link        || null,
      is_active   ?? 1,
      sort_order  ?? 0,
    ]
  );

  return {
    success: true,
    id:      result.insertId,
    message: "Banner added successfully",
  };
};

/* ================= GET ALL BANNERS (admin) ================= */
export const getAllBannersAdminService = async () => {

  const [rows] = await db.execute(
    `SELECT id, name, image_url, description, link,
            is_active, sort_order, created_at
     FROM banners
     ORDER BY sort_order ASC, created_at DESC`
  );

  return {
    success: true,
    total:   rows.length,
    data:    rows,
  };
};

/* ================= GET BANNER BY ID ================= */
export const getBannerByIdService = async (id) => {
  const [[banner]] = await db.execute(
    `SELECT * FROM banners WHERE id = ?`, [id]
  );
  if (!banner) throw new Error("Banner not found");
  return { success: true, data: banner };
};

/* ================= UPDATE BANNER ================= */
export const updateBannerService = async (id, data) => {
  const ALLOWED = ["name", "image_url", "description", "link", "is_active", "sort_order"];
  const sanitized = {};
  for (const key of ALLOWED) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length)
    throw new Error("No valid fields to update");

  const [[existing]] = await db.execute(
    `SELECT id FROM banners WHERE id = ?`, [id]
  );
  if (!existing) throw new Error("Banner not found");

  const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
  const setValues  = Object.values(sanitized);

  await db.execute(
    `UPDATE banners SET ${setClauses} WHERE id = ?`,
    [...setValues, id]
  );

  return { success: true, message: "Banner updated successfully" };
};

/* ================= DELETE BANNER ================= */
export const deleteBannerService = async (id) => {
  const [[existing]] = await db.execute(
    `SELECT id FROM banners WHERE id = ?`, [id]
  );
  if (!existing) throw new Error("Banner not found");

  await db.execute(`DELETE FROM banners WHERE id = ?`, [id]);
  return { success: true, message: "Banner deleted successfully" };
};

/* ================= TOGGLE ACTIVE ================= */
export const toggleBannerService = async (id) => {
  const [[existing]] = await db.execute(
    `SELECT id, is_active FROM banners WHERE id = ?`, [id]
  );
  if (!existing) throw new Error("Banner not found");

  const newStatus = existing.is_active === 1 ? 0 : 1;

  await db.execute(
    `UPDATE banners SET is_active = ? WHERE id = ?`,
    [newStatus, id]
  );

  return {
    success:   true,
    is_active: newStatus,
    message:   `Banner ${newStatus ? "activated" : "deactivated"} successfully`,
  };
};