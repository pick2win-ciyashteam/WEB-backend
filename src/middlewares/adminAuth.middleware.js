import jwt       from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import db        from "../config/db.js";

const TOKEN_ERRORS = {
  TokenExpiredError: "Session expired, please login again",
  JsonWebTokenError: "Invalid token",
  NotBeforeError:    "Token not yet active",
};

/* ================= RATE LIMITER ================= */
export const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: "Too many requests" },
});

/* ================= ADMIN AUTH ================= */
export const adminAuth = (roles = []) => {
  return async (req, res, next) => {
    try {

      /* ── 1. Extract Token ── */
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          message: "Authorization header missing or malformed",
        });
      }

      const token = authHeader.split(" ")[1];

      /* ── 2. Blacklist Check ── */
      const [[blacklisted]] = await db.query(
        `SELECT id FROM admin_token_blacklist WHERE token = ? LIMIT 1`,
        [token]
      );
      if (blacklisted) {
        return res.status(401).json({
          success: false,
          message: "Session expired, please login again",
        });
      }

      /* ── 3. Verify Token ── */
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, {
          algorithms: ["HS256"],
        });
      } catch (err) {
        const message = TOKEN_ERRORS[err.name] || "Token verification failed";
        return res.status(401).json({ success: false, message });
      }

      /* ── 4. Validate Payload ── */
      if (!decoded?.id || !decoded?.role || !decoded?.email) {
        return res.status(401).json({
          success: false,
          message: "Invalid token payload",
        });
      }

      /* ── 5. Admin Type Check ── */
      if (decoded.type !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Access denied: not an admin account",
        });
      }

      /* ── 6. Role Check ── */
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied: requires role → [${roles.join(", ")}]`,
        });
      }

      /* ── 7. Attach Admin ── */
      req.admin = decoded;
      next();

    } catch (err) {
      if (process.env.NODE_ENV !== "production")
        console.error("AdminAuth error:", err);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
};