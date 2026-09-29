import app from "./app.js";
import { databaseConfigured, env } from "./config/env.js";
import { startWhatsAppAutomation } from "./services/whatsappAutomationService.js";
import { startBackupEmailAutomation } from "./services/backupEmailService.js";

const server = app.listen(env.port, () => {
  console.log(`WMS API running on http://localhost:${env.port}`);

  if (!databaseConfigured) {
    console.warn(
      "WARNING: Supabase is not configured. Copy server/.env.example to server/.env and add real keys."
    );
  }
});

const stopWhatsAppAutomation = startWhatsAppAutomation();
const stopBackupEmailAutomation = startBackupEmailAutomation();

const shutdown = (signal) => {
  console.log(`${signal} received. Closing server...`);

  stopWhatsAppAutomation?.();
  stopBackupEmailAutomation?.();

  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));