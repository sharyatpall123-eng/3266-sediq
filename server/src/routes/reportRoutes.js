import { Router } from "express";
import { getReports } from "../controllers/reportController.js";
import { authorize, permit } from "../middleware/authenticate.js";
const router = Router();
router.get("/", permit("reports.view", "administrator", "manager"), getReports);
export default router;
