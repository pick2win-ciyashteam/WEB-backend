import db from "../../../config/db.js";

/* ================= ADD COUNTRY ================= */
export const addCountryService = async (data) => {

  const { name, code, dial_code, flag, is_active } = data;

  /* ── Duplicate Check ── */
  const [[existing]] = await db.execute(
    `SELECT id FROM countries WHERE code = ?`,
    [code.toUpperCase()]
  );
  if (existing) throw new Error("Country code already exists");

  const [result] = await db.execute(
    `INSERT INTO countries (name, code, dial_code, flag, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [name, code.toUpperCase(), dial_code, flag || null, is_active ?? 1]
  );

  return {
    success: true,
    id:      result.insertId,
    message: "Country added successfully",
  };
};


export const getAllCountriesAdminService = async () => {
  const [rows] = await db.execute(
    `SELECT id, name, code, dial_code, flag, is_active, created_at
     FROM countries
     ORDER BY name ASC`
  );

  return { success: true, data: rows };
};

/* ================= UPDATE COUNTRY ================= */
export const updateCountryService = async (id, data) => {
  const ALLOWED = ["name", "code", "dial_code", "flag", "is_active"];
  const sanitized = {};
  for (const key of ALLOWED) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length)
    throw new Error("No valid fields to update");

  const [[existing]] = await db.execute(
    `SELECT id FROM countries WHERE id = ?`, [id]
  );
  if (!existing) throw new Error("Country not found");

  const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
  const setValues  = Object.values(sanitized);

  await db.execute(
    `UPDATE countries SET ${setClauses} WHERE id = ?`,
    [...setValues, id]
  );

  return { success: true, message: "Country updated successfully" };
};

/* ================= DELETE COUNTRY ================= */
export const deleteCountryService = async (id) => {
  const [[existing]] = await db.execute(
    `SELECT id FROM countries WHERE id = ?`, [id]
  );
  if (!existing) throw new Error("Country not found");

  await db.execute(`DELETE FROM countries WHERE id = ?`, [id]);

  return { success: true, message: "Country deleted successfully" };
};

/* ================= TOGGLE ACTIVE ================= */
export const toggleCountryService = async (id) => {
  const [[existing]] = await db.execute(
    `SELECT id, is_active FROM countries WHERE id = ?`, [id]
  );
  if (!existing) throw new Error("Country not found");

  const newStatus = existing.is_active === 1 ? 0 : 1;

  await db.execute(
    `UPDATE countries SET is_active = ? WHERE id = ?`,
    [newStatus, id]
  );

  return {
    success:   true,
    is_active: newStatus,
    message:   `Country ${newStatus ? "activated" : "deactivated"} successfully`,
  };
};