import express from 'express';
import routes from "./src/routes/index.js";
  
const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
  app.use("/api",routes)
// Error handler


export default app;