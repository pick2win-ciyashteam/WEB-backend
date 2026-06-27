import { Router }                  from "express"; 
import * as c                      from "./subscription.controller.js";
import * as v                      from "./subscription.validation.js";

const router = Router();

router.post  ("/",          c.addPlan);
router.get   ("/",                    c.getAllPlans);
router.get   ("/:id",                 c.getPlanById);
router.patch ("/:id",        v.updatePlan, c.updatePlan);
router.delete("/:id",                 c.deletePlan);
router.patch ("/:id/toggle",          c.togglePlan);

export default router;