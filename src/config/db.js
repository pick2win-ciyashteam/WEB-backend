import mysql from "mysql2/promise";
import "dotenv/config";

const createPool = () => mysql.createPool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  /* Sportmonks sends match times in UTC and they're stored as-is. Without
     this, mysql2 defaults to 'local' and reinterprets those UTC strings
     using the OS timezone (IST here) when converting to JS Date objects —
     silently shifting every start_time read/write by 5.5 hours. */
  timezone: "Z",

  waitForConnections:    true,
  connectionLimit:       20,
  queueLimit:            0,
  enableKeepAlive:       true,
  keepAliveInitialDelay: 0,
  connectTimeout:        30000,
});

let pool = createPool();

const verifyConnection = async (retries = 20, delay = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await pool.getConnection();
      await connection.ping();
      console.log(`✅ Database connected → ${process.env.DB_NAME}`);
      connection.release();
      return;
    } catch (err) {
      console.error(`❌ DB connection failed (attempt ${i + 1}/${retries}): ${err.message}`);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error("❌ Max retries reached - check DB connection!");
        process.exit(1);
      }
    }
  }
};

verifyConnection();

/* mysql2 pools already replace a dropped connection with a fresh one
   internally on the next getConnection() — no manual pool rebuild needed
   here. (Previously this reassigned the local `pool` variable on error,
   but `export default pool` below only ever captures the value at import
   time, not a live binding — so the reassignment never reached existing
   importers and just leaked an orphaned, unmonitored pool on every
   transient error.) */
pool.on("connection", (connection) => {
  connection.on("error", (err) => {
    if (err.code === "ECONNRESET" || err.code === "PROTOCOL_CONNECTION_LOST") {
      console.warn("⚠️ MySQL connection lost, pool will reconnect automatically.");
    } else {
      console.error("❌ Unexpected MySQL error:", err);
    }
  });
});

export default pool;