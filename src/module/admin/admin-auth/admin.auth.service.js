import bcrypt    from "bcryptjs";
import jwt       from "jsonwebtoken";
import speakeasy from "speakeasy";
import db        from "../../../config/db.js";

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

  const [[admin]] = await db.query(
    `SELECT id, name, email, password_hash, role, status, twofa_secret, twofa_enabled
     FROM admin
     WHERE email = ?
     LIMIT 1`,
    [email.toLowerCase()]
  );

  if (!admin) throw new Error("Invalid email or password");

  if (admin.status === "inactive")
    throw new Error("Your account is inactive. Contact super admin.");

  const isMatch = await bcrypt.compare(password, admin.password_hash);
  if (!isMatch) throw new Error("Invalid email or password");

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


/* ================= CREATE ADMIN ================= */
export const createAdmin = async (data, admin, ip) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT id FROM admin WHERE email = ?`,
      [data.email.toLowerCase()]
    );
    if (existing) throw new Error("Admin with this email already exists");

    /* ── Sub-admin limit check (max 3, excluding super_admin) ── */
    const [[{ count }]] = await conn.query(
      `SELECT COUNT(*) AS count FROM admin WHERE role != 'super_admin'`
    );
    if (count >= 3) throw new Error("Sub-admin limit reached (max 3)");

    const hash = await bcrypt.hash(data.password, 12);

    const [result] = await conn.query(
      `INSERT INTO admin
         (name, email, mobile, password_hash, role, access_level, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [data.name, data.email.toLowerCase(), data.mobile || null, hash, data.role, data.access_level || "read_only"]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create admin");

    await logAdmin(conn, admin, "CREATE_ADMIN", "admin", result.insertId, ip);
    await conn.commit();

    return {
      success: true,
      id: result.insertId,
      message: "Admin created successfully",
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ================= GET PROFILE ================= */
export const getProfileService = async (adminId) => {
  const [[admin]] = await db.query(
    `SELECT
        id,
        name,
        email,
        mobile,
        role,
        access_level,
        status,
        twofa_enabled,
        created_at
     FROM admin
     WHERE id = ?
     LIMIT 1`,
    [adminId]
  );

  if (!admin) {
    throw new Error("Admin not found");
  }

  return {
    success: true,
    data: admin,
  };
};

/* ================= GET ALL ADMINS ================= */
export const getAdmins = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT id, name,mobile, email, role, status, created_at
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

/* ================= SETUP 2FA ================= */
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


/* ================= LOGOUT ================= */
export const logoutService = async (token, admin) => {
  if (!token) throw new Error("Token is required");

  const decoded = jwt.decode(token);
  if (!decoded?.exp) throw new Error("Invalid token");

  const expiresAt = new Date(decoded.exp * 1000);

  await db.query(
    `INSERT INTO admin_token_blacklist (token, admin_id, expires_at)
     VALUES (?, ?, ?)`,
    [token, admin.id, expiresAt]
  );

  return { success: true, message: "Logged out successfully" };
};


/* ================= CLEAN EXPIRED BLACKLIST TOKENS (CRON) ================= */
export const cleanExpiredBlacklistTokens = async () => {
  try {
    const [result] = await db.query(
      `DELETE FROM admin_token_blacklist WHERE expires_at < NOW()`
    );
    if (result.affectedRows > 0) {
      console.log(`[Cron] Cleaned ${result.affectedRows} expired blacklist tokens`);
    }
  } catch (err) {
    console.error("[Cron] Blacklist cleanup error:", err.message);
  }
};

//.........................................................................................................


/* ================= UPDATE OWN PASSWORD + 2FA (SUPER ADMIN) ================= */
export const updateCredentialsService = async (adminId, data, ip) => {
  const { currentPassword, newPassword, confirmPassword, new2FACode } = data;

  const [[admin]] = await db.query(
    `SELECT id, email, password_hash, twofa_secret, twofa_enabled FROM admin WHERE id = ?`,
    [adminId]
  );
  if (!admin) throw new Error("Admin not found");

  const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!isMatch) throw new Error("Current password is incorrect");

  const updates = {};
  const values = [];

  if (newPassword) {
    if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");
    if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
    updates.password_hash = await bcrypt.hash(newPassword, 12);
  }

  if (new2FACode) {
    if (!admin.twofa_enabled) throw new Error("2FA is not enabled for this account");
    const verified = speakeasy.totp.verify({
      secret: admin.twofa_secret,
      encoding: "base32",
      token: new2FACode,
      window: 1,
    });
    if (!verified) throw new Error("Invalid 2FA code");
  }

  if (!Object.keys(updates).length && !new2FACode) {
    throw new Error("Nothing to update");
  }

  if (Object.keys(updates).length) {
    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
    await db.query(`UPDATE admin SET ${setClauses} WHERE id = ?`, [...Object.values(updates), adminId]);
  }

  return { success: true, message: "Credentials updated successfully" };
};

/* ================= UPDATE OWN PROFILE (PRIMARY ADMIN) ================= */
export const updateProfileService = async (adminId, data) => {
  const ALLOWED = ["name", "mobile"];
  const sanitized = {};
  for (const key of ALLOWED) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }
  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");

  const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
  await db.query(`UPDATE admin SET ${setClauses} WHERE id = ?`, [...Object.values(sanitized), adminId]);

  return { success: true, message: "Profile updated successfully" };
};

/* ================= TOGGLE 2FA REQUIREMENT (SUPER ADMIN) ================= */
export const toggle2FAService = async (adminId, enabled) => {
  if (!enabled) {
    await db.query(`UPDATE admin SET twofa_enabled = 0 WHERE id = ?`, [adminId]);
    return { success: true, message: "2FA disabled" };
  }
  const [[admin]] = await db.query(`SELECT twofa_secret FROM admin WHERE id = ?`, [adminId]);
  if (!admin?.twofa_secret) throw new Error("Set up 2FA first using /setup-2fa");
  await db.query(`UPDATE admin SET twofa_enabled = 1 WHERE id = ?`, [adminId]);
  return { success: true, message: "2FA enabled" };
};

/* ================= REMOVE ADMIN ================= */
export const removeAdmin = async (id, admin, ip) => {
  if (Number(id) === Number(admin.id)) throw new Error("Cannot remove your own account");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query(`SELECT id, role FROM admin WHERE id = ?`, [id]);
    if (!existing) throw new Error("Admin not found");
    if (existing.role === "super_admin") throw new Error("Cannot remove a super admin");

    await conn.query(`DELETE FROM admin WHERE id = ?`, [id]);
    await logAdmin(conn, admin, "REMOVE_ADMIN", "admin", id, ip);
    await conn.commit();

    return { success: true, message: "Admin removed successfully" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ================= EXPORT ADMINS CSV ================= */
export const exportAdminsCSV = async () => {
  const [rows] = await db.query(
    `SELECT id, name, email, mobile, role, access_level, status, created_at FROM admin ORDER BY id DESC`
  );

  const headers = ["ID", "Name", "Email", "Mobile", "Role", "Access Level", "Status", "Created At"];
  const csvRows = rows.map(r =>
    [r.id, r.name, r.email, r.mobile || "", r.role, r.access_level, r.status, r.created_at].join(",")
  );

  return [headers.join(","), ...csvRows].join("\n");
};