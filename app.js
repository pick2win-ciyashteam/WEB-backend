import "dotenv/config";
import express      from "express";
import cors         from "cors";
import morgan       from "morgan";
import helmet       from "helmet";
import routes       from "./src/routes/index.js";

import { razorpayWebhook } from  "./src/module/user/deposite/deposite.webhook.js"

const app = express();

/* Razorpay signs the exact raw request bytes — express.raw() keeps req.body
   as a Buffer here so the webhook handler can HMAC-verify against the
   original payload, instead of a re-serialized JSON.stringify(req.body)
   (which is not guaranteed to reproduce the original bytes). */
app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), razorpayWebhook)

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(helmet());
app.use(morgan("combined"));

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:4200",
  "https://pick2win.uk",
  "https://pick2win.io",
  "www.pick2win.io",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      /* ── ✅ FIX: status:403 తో error throw చేయాలి, లేకపోతే global error
         handler దీన్ని 500గా చూపేది (pentest Finding 6) ── */
      const corsError = new Error("Not allowed by CORS");
      corsError.status = 403;
      callback(corsError);
    }
  },
  methods:              ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders:       ["Content-Type", "Authorization"],
  credentials:          true,
  optionsSuccessStatus: 200,
}));

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  /* ── Known, intentional client-facing rejections (status already set,
     e.g. the CORS check above) keep their real message even in production;
     only unexpected 500s get the generic message. ── */
  const message = status !== 500 || process.env.NODE_ENV !== "production"
    ? err.message
    : "Internal server error";
  res.status(status).json({ success: false, message });
});

export default app;
