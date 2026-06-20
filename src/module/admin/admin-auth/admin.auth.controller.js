import * as s from  "./admin.auth.service.js"

const getIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;

// /* ================= LOGIN ================= */
export const adminLogin = async (req, res) => {
  try {
    const result = await s.adminLoginService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// /* ================= CREATE ADMIN ================= */
export const createAdmin = async (req, res) => {
  try {
    const result = await s.createAdmin(req.body, req.admin, getIp(req));
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


export const setup2FA = async (req, res) => {
  try {
    const result = await s.setup2FAService(req.admin.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

 export const verify2FA = async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: "token is required" });

    const result = await s.verify2FAService(req.admin.id, token);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


/* ================= GET ALL ADMINS ================= */
export const getAdmins = async (req, res) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await s.getAdmins({ page, limit });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= GET ADMIN BY ID ================= */
export const getAdminById = async (req, res) => {
  try {
    const result = await s.getAdminById(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= UPDATE ADMIN ================= */
export const updateAdmin = async (req, res) => {
  try {
    const result = await s.updateAdmin(req.params.id, req.body, req.admin, getIp(req));
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const result = await s.logoutService(token, req.admin);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// /..............................................................................................


export const updateCredentials = async (req, res) => {
  try {
    const result = await s.updateCredentialsService(req.admin.id, req.body, getIp(req));
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const result = await s.updateProfileService(req.admin.id, req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const toggle2FA = async (req, res) => {
  try {
    const result = await s.toggle2FAService(req.admin.id, req.body.enabled);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const removeAdmin = async (req, res) => {
  try {
    const result = await s.removeAdmin(req.params.id, req.admin, getIp(req));
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const exportAdminsCSV = async (req, res) => {
  try {
    const csv = await s.exportAdminsCSV();
    res.header("Content-Type", "text/csv");
    res.attachment("admins.csv");
    res.send(csv);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};