import dotenv from "dotenv";

// NODE_ENV=development (set by `npm run dev`) loads .env.development instead
// of the default .env — keeps local testing pointed at the local dev DB
// without touching the production .env used by the live server.
const envFile = process.env.NODE_ENV === "development" ? ".env.development" : ".env";

dotenv.config({ path: envFile });
