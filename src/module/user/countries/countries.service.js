import db from "../../../config/db.js";

/* ================= GET ACTIVE COUNTRIES ================= */
export const getActiveCountriesService = async () => {
  const [rows] = await db.execute(
    `SELECT name, code, dial_code, flag
     FROM countries
     WHERE is_active = 1
     ORDER BY name ASC`
  );

  return {
    success: true,
    data:    rows,
  };
};

/* ================= GET COUNTRY BY NAME ================= */

export const getCountryByNameService = async (name) => {
  const [[country]] = await db.execute(
    `SELECT name, code, dial_code, flag
     FROM countries
     WHERE LOWER(name) = LOWER(?) AND is_active = 1`,
    [name]
  );

  if (!country) throw new Error("Country not found");

  return { success: true, data: country };
};