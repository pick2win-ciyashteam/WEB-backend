import { Router } from "express";

import  {getActiveCountries,getCountryByName} from  "./countries.controller.js";

const router = Router();


router.get("/get-all",           getActiveCountries);
router.get("/:name",     getCountryByName);

export default router;  