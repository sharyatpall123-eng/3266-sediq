import { Router } from "express";
import { changePassword, forgotPassword, login, logout, me, refreshSession } from "../controllers/authController.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/refresh", refreshSession);
router.get("/me", authenticate, me);
router.post("/logout", authenticate, logout);
router.put("/password", authenticate, changePassword);
export default router;
