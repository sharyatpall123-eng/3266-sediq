import { Router } from "express";
import { deleteNotification, listNotifications, markAllRead, markRead } from "../controllers/notificationController.js";

const router = Router();

router.get("/", listNotifications);

// PATCH is the canonical method. PUT is kept for compatibility with older frontend builds.
router.patch("/read-all", markAllRead);
router.put("/read-all", markAllRead);
router.patch("/:id/read", markRead);
router.put("/:id/read", markRead);

router.delete("/:id", deleteNotification);

export default router;
