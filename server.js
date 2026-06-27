import "dotenv/config";
import app from "./app.js";
import "./src/config/db.js";
import { startCronJobs } from "./src/module/admin/sportmonks/sportmonks.cron.js";
import { verifyMailer } from "./src/utils/mailer.js";

const PORT = process.env.PORT || 3000;
4

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await verifyMailer();
  startCronJobs();
}); 

  