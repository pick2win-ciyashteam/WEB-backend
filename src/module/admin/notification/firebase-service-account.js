/* ════════════════════════════════════════════════════════════════
   🔐 FIREBASE SERVICE ACCOUNT CREDENTIALS
   ⚠️  Loaded from .env file - DO NOT HARDCODE
════════════════════════════════════════════════════════════════ */

const parsePrivateKey = () => {
  let key = process.env.FIREBASE_PRIVATE_KEY || "";
  
  // Remove surrounding quotes if present
  key = key.replace(/^["']|["']$/g, "");
  
  // Replace escaped newlines with actual newlines
  key = key.replace(/\\n/g, "\n");
  
  // Ensure key has proper format
  if (!key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Invalid FIREBASE_PRIVATE_KEY: Missing 'BEGIN PRIVATE KEY'");
  }
  
  return key;
};

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID || "pick2win-9c092",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: parsePrivateKey(),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
  universe_domain: "googleapis.com",
};

// Validate credentials
if (!serviceAccount.private_key || !serviceAccount.client_email) {
  console.warn("⚠️  Firebase credentials incomplete. Check .env file.");
}

export default serviceAccount;
