import { Router } from "express";

import { authenticate } from "../../../middlewares/auth.middleware.js"
import {
  submitTicket,
  getMyTickets,
  getMyTicketById,
} from "./user.support.controller.js"

const router = Router();

router.post("/",     authenticate, submitTicket);
router.get ("/",     authenticate, getMyTickets);
router.get ("/:id",  authenticate, getMyTicketById);

export default router;