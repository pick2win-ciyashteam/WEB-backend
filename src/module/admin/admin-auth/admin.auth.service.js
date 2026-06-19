import bcrypt from "bcryptjs";
import jwt    from "jsonwebtoken";
import db     from "../../../config/db.js";
 import speakeasy from "speakeasy";

/* ================= ADMIN LOG ================= */
const logAdmin = async (conn, admin, action, entity, entityId, ip) => {
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");
  if (!action)   throw new Error("action is required");
  if (!entity)   throw new Error("entity is required");
  if (!entityId) throw new Error("entityId is required");

  const [result] = await conn.query(
    `INSERT INTO admin_logs
       (admin_id, email, action, entity, entity_id, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [admin.id, admin.email, action, entity, entityId, ip || null]
  );

  if (result.affectedRows === 0) throw new Error("Failed to write admin log");
};



/* ================= LOGIN ================= */
export const adminLoginService = async ({ email, password, twoFaCode }) => {

  /* ── 1. Fetch Admin ── */
  const [[admin]] = await db.query(
    `SELECT id, name, email, password_hash, role, status, twofa_secret, twofa_enabled
     FROM admin
     WHERE email = ?
     LIMIT 1`,
    [email.toLowerCase()]
  );

  if (!admin) throw new Error("Invalid email or password");

  /* ── 2. Status Check ── */
  if (admin.status === "inactive")
    throw new Error("Your account is inactive. Contact super admin.");

  /* ── 3. Password Check ── */
  const isMatch = await bcrypt.compare(password, admin.password_hash);
  if (!isMatch) throw new Error("Invalid email or password");

  /* ── 4. 2FA Check ── */
  if (admin.twofa_enabled) {
    if (!twoFaCode) {
      return {
        success: true,
        twoFaRequired: true,
        message: "2FA code required",
      };
    }

    const verified = speakeasy.totp.verify({
      secret: admin.twofa_secret,
      encoding: "base32",
      token: twoFaCode,
      window: 1,
    });

    if (!verified) throw new Error("Invalid 2FA code");
  }

  /* ── 5. Generate JWT ── */
  const token = jwt.sign(
    {
      id:    admin.id,
      email: admin.email,
      role:  admin.role,
      type:  "admin",
    },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  return {
    success: true,
    message: "Login successful",
    token,
    admin: {
      id:    admin.id,
      name:  admin.name,
      email: admin.email,
      role:  admin.role,
    },
  };
};

/* ================= SETUP 2FA ===================*/
export const setup2FAService = async (adminId) => {
  const secret = speakeasy.generateSecret({
    name: `Pick2Win Admin`,
    length: 20,
  });

  await db.query(
    `UPDATE admin SET twofa_secret = ? WHERE id = ?`,
    [secret.base32, adminId]
  );

  return {
    success: true,
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url,
  };
};

/* ================= VERIFY & ENABLE 2FA ================= */
 export const verify2FAService = async (adminId, token) => {
  const [[admin]] = await db.query(
    `SELECT twofa_secret FROM admin WHERE id = ?`,
    [adminId]
  );

  if (!admin?.twofa_secret) throw new Error("2FA not set up");

  const expectedToken = speakeasy.totp({
    secret: admin.twofa_secret,
    encoding: "base32",
  });
  console.log("SERVER EXPECTED TOKEN:", expectedToken);
  console.log("USER ENTERED TOKEN:", token);
  console.log("SERVER TIME:", new Date());

  const verified = speakeasy.totp.verify({
    secret: admin.twofa_secret,
    encoding: "base32",
    token,
    window: 1,
  });

  if (!verified) throw new Error("Invalid code");

  await db.query(
    `UPDATE admin SET twofa_enabled = 1 WHERE id = ?`,
    [adminId]
  );

  return { success: true, message: "2FA enabled successfully" };
};

/* ================= GET ALL ADMINS ================= */
export const getAdmins = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT id, name, email, role, status, created_at
     FROM admin
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM admin`
  );

  return {
    success: true,
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/* ================= GET ADMIN BY ID ================= */
export const getAdminById = async (id) => {
  if (!id || isNaN(Number(id))) throw new Error("Valid admin ID is required");

  const [[row]] = await db.query(
    `SELECT id, name, email, role, status, created_at
     FROM admin
     WHERE id = ?`,
    [Number(id)]
  );

  if (!row) throw new Error("Admin not found");

  return { success: true, data: row };
};

/* ================= UPDATE ADMIN ================= */
export const updateAdmin = async (id, data, admin, ip) => {
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const ALLOWED_FIELDS = ["role", "status"];
  const sanitized = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");

  if (Number(id) === Number(admin.id)) {
    throw new Error("Admins cannot update their own role or status");
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT id FROM admin WHERE id = ?`, [id]
    );
    if (!existing) throw new Error("Admin not found");

    const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(sanitized);

    await conn.query(
      `UPDATE admin SET ${setClauses} WHERE id = ?`,
      [...setValues, id]
    );

    await logAdmin(conn, admin, "UPDATE_ADMIN", "admin", id, ip);
    await conn.commit();

    return {
      success: true,
      id:      Number(id),
      message: "Admin updated successfully",
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};