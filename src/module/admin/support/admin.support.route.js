import { Router } from "express";
import { adminAuth, adminLimiter } from "../../../middlewares/adminAuth.middleware.js"
import { getAllTickets, getTicketById,  replyToTicket,  updateTicketStatus,} from  "./admin.support.controller.js"

const router = Router();

router.get  ("/",              getAllTickets);
router.get  ("/:id",            getTicketById);

//  status   ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
router.patch("/:id/reply",      replyToTicket);
router.patch("/:id/status",     updateTicketStatus);

export default router;