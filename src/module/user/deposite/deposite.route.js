import { Router }       from "express";

import { createPointsPayment, getMyPoints, getMyTransactions, getStripeConfig } from "./deposite.controller.js";

const router = Router();

router.post("/buy-points",     createPointsPayment);
router.get ("/stripe/config",  getStripeConfig);

router.get("/my-points",        getMyPoints);
router.get("/my-transactions",  getMyTransactions);

export default router;