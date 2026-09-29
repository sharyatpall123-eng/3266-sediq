import { Router } from "express";

import { authorize } from "../middleware/authenticate.js";

import {
  backupDatabase,
  sendDatabaseBackupEmail,
  createUser,
  currentAccess,
  getSettings,
  listUsers,
  removeUser,
  restoreDatabase,
  updateCompany,
  updateProfile,
  updateUser,
  testWhatsAppMessage,
  getWhatsAppAutomationSettings,
  updateWhatsAppAutomationSettings,
  getWhatsAppConnectionStatus,
} from "../controllers/settingsController.js";

const router = Router();

router.get("/", getSettings);

router.get("/access", currentAccess);

router.put("/company", authorize("administrator", "manager"), updateCompany);

router.put("/profile", updateProfile);

router.get("/backup", authorize("administrator"), backupDatabase);

router.post("/backup-email", authorize("administrator"), sendDatabaseBackupEmail);

router.post("/whatsapp-test", authorize("administrator", "manager"), testWhatsAppMessage);

router.get("/whatsapp-status", authorize("administrator"), getWhatsAppConnectionStatus);

router.get("/whatsapp-automation", authorize("administrator", "manager"), getWhatsAppAutomationSettings);

router.put("/whatsapp-automation", authorize("administrator", "manager"), updateWhatsAppAutomationSettings);

router.post("/restore", authorize("administrator"), restoreDatabase);

router.get("/users", authorize("administrator"), listUsers);

router.post("/users", authorize("administrator"), createUser);

router.put("/users/:id", authorize("administrator"), updateUser);

router.delete("/users/:id", authorize("administrator"), removeUser);

export default router;
