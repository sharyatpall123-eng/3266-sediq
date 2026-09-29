import { Router } from "express";
import { authorize } from "../middleware/authenticate.js";
import { listRecycleBin, permanentlyDelete, restoreRecycleItem } from "../controllers/recycleBinController.js";
const router = Router();
router.get("/", authorize("administrator"), listRecycleBin);
router.post("/:id/restore", authorize("administrator"), restoreRecycleItem);
router.delete("/:id", authorize("administrator"), permanentlyDelete);
export default router;
