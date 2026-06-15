import mysql from "mysql2/promise";
import "dotenv/config";

const createPool = () => mysql.createPool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  waitForConnections:    true,
  connectionLimit:       20,
  queueLimit:            0,
  enableKeepAlive:       true,
  keepAliveInitialDelay: 0,
  connectTimeout:        30000,
});

let pool = createPool();

const verifyConnection = async (retries = 10, delay = 5000) => {
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
        pool = createPool();
      } else {
        console.error("❌ Max retries reached - check DB connection!");
        process.exit(1);
      }
    }
  }
};

verifyConnection();

pool.on("connection", (connection) => {
  connection.on("error", (err) => {
    if (err.code === "ECONNRESET" || err.code === "PROTOCOL_CONNECTION_LOST") {
      console.warn("⚠️ MySQL connection lost, reconnecting...");
      pool = createPool();
    } else {
      console.error("❌ Unexpected MySQL error:", err);
    }
  });
});

export default pool;