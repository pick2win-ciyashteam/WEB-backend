import { Router }       from "express";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import {
  createCoinsPayment,
  verifyCoinsPayment,
  getRazorpayConfig,
  getMyCoins,
  getMyTransactions,
  getWalletStats,
  getFilteredTransactions,
} from "./deposite.controller.js";

const router = Router();

/* ────────────────── COINS PURCHASE ────────────────── */
router.post("/buy-coins",      authenticate, createCoinsPayment);   // create order
router.post("/verify-payment", authenticate, verifyCoinsPayment);   // verify & credit coins (automatic)
router.get ("/razorpay/config", authenticate, getRazorpayConfig);   // key_id for frontend

/* ────────────────── WALLET & TRANSACTIONS (VIEW ONLY) ────────────────── */
router.get ("/my-coins",          authenticate, getMyCoins);        // wallet balance
router.get ("/wallet/stats",      authenticate, getWalletStats);    // detailed stats
router.get ("/my-transactions",   authenticate, getMyTransactions); // all transactions
router.get ("/transactions",      authenticate, getFilteredTransactions); // filtered & paginated

/* ────────────────── NOTE ────────────────── */
/* Coins spending happens automatically when user:
   - Creates a match entry
   - Generates lineups
   - Enters contests
   No manual endpoint needed for users */   

export default router;