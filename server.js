// import 'dotenv/config';
// import app from './app.js';
// import { connectDB } from './src/config/db.js';

// const PORT = process.env.PORT ;

// connectDB().then(() => {
//   app.listen(PORT, () => {
//     console.log(`🚀 Server running on http://localhost:${PORT}`);
//   });
// });


import "dotenv/config";
import app from "./app.js";
import "./src/config/db.js"; // Ensure DB connection is established

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});