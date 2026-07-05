import { Router }       from "express";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import {
  createCoinsPayment,
  verifyCoinsPayment,
  getRazorpayConfig,
  getMyCoins,
  getMyTransactions,
} from "./deposite.controller.js";

const router = Router();

router.post("/buy-coins",      authenticate, createCoinsPayment);   // create order
router.post("/verify-payment", authenticate, verifyCoinsPayment);   // verify & credit coins
router.get ("/razorpay/config", authenticate, getRazorpayConfig);   // key_id for frontend

router.get ("/my-coins",        authenticate, getMyCoins);
router.get ("/my-transactions", authenticate, getMyTransactions);

export default router;












// import { Router }       from "express";
// import { authenticate } from "../../../middlewares/auth.middleware.js";
// import {
//   createCoinsPayment,
//   getMyCoins,
//   getMyTransactions,
//   getStripeConfig,  
// } from "./deposite.controller.js";

// const router = Router();    

// router.post("/buy-coins",      authenticate, createCoinsPayment);

// router.get ("/stripe/config",   authenticate, getStripeConfig);
  
// router.get ("/my-coins",       authenticate, getMyCoins);

// router.get ("/my-transactions", authenticate, getMyTransactions);

// export default router;