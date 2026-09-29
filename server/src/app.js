import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";

import { databaseConfigured, env } from "./config/env.js";
import { authenticate } from "./middleware/authenticate.js";
import {
  errorHandler,
  notFound,
} from "./middleware/errorHandler.js";

import authRoutes from "./routes/authRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import stockRoutes from "./routes/stockRoutes.js";
import debtorRoutes from "./routes/debtorRoutes.js";
import representativeRoutes from "./routes/representativeRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import warehouseRoutes from "./routes/warehouseRoutes.js";
import recycleBinRoutes from "./routes/recycleBinRoutes.js";

// WhatsApp Test Message
import whatsappTestRoutes from "./routes/whatsappTestRoutes.js";

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
);

app.use(compression());

app.use(
  express.json({
    limit: "10mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  }),
);

app.use(
  morgan(
    env.nodeEnv === "production"
      ? "combined"
      : "dev",
  ),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: "draft-8",
  }),
);

// ==============================
// HEALTH
// ==============================

app.get("/api/health", (request, response) =>
  response.json({
    success: true,
    data: {
      status: "ok",
      databaseConfigured,
      environment: env.nodeEnv,
    },
  }),
);

// ==============================
// AUTH
// ==============================

app.use("/api/auth", authRoutes);

// ==============================
// PROTECTED ROUTES
// ==============================

app.use(
  "/api/dashboard",
  authenticate,
  dashboardRoutes,
);

app.use(
  "/api/products",
  authenticate,
  productRoutes,
);

app.use(
  "/api/stock",
  authenticate,
  stockRoutes,
);

app.use(
  "/api/debtors",
  authenticate,
  debtorRoutes,
);

app.use(
  "/api/representatives",
  authenticate,
  representativeRoutes,
);

app.use(
  "/api/reports",
  authenticate,
  reportRoutes,
);

app.use(
  "/api/notifications",
  authenticate,
  notificationRoutes,
);

app.use(
  "/api/settings",
  authenticate,
  settingsRoutes,
);

app.use(
  "/api/uploads",
  authenticate,
  uploadRoutes,
);

app.use(
  "/api/warehouses",
  authenticate,
  warehouseRoutes,
);

app.use(
  "/api/recycle-bin",
  authenticate,
  recycleBinRoutes,
);

// ==============================
// WHATSAPP TEST MESSAGE
// ==============================

app.use(
  "/api/whatsapp-test",
  authenticate,
  whatsappTestRoutes,
);

// ==============================
// ERROR HANDLERS
// ==============================

app.use(notFound);
app.use(errorHandler);

export default app;