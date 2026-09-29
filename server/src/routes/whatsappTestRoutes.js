import express from "express";
import QRCode from "qrcode";
import { supabaseAdmin } from "../config/supabase.js";
import {
  sendWhatsAppTestMessage,
  sendWeeklyDebtReport,
  sendFullAccountReport,
  whatsappConfigured,
  whatsappClient,
} from "../services/whatsappService.js";

const router = express.Router();

let latestQr = null;
let latestQrAt = null;

/* =========================================
   CAPTURE WHATSAPP QR
========================================= */

whatsappClient.on("qr", (qr) => {
  latestQr = qr;
  latestQrAt = new Date();

  console.log("📱 WhatsApp QR is available through API.");
});

whatsappClient.on("authenticated", () => {
  latestQr = null;
  latestQrAt = null;
});

whatsappClient.on("ready", () => {
  latestQr = null;
  latestQrAt = null;
});

/* =========================================
   GET WHATSAPP STATUS
========================================= */

router.get("/status", async (req, res) => {
  try {
    let state = null;

    try {
      state = await whatsappClient.getState();
    } catch {
      state = null;
    }

    return res.json({
      success: true,
      connected: whatsappConfigured(),
      state: state || "UNKNOWN",
      qrAvailable: Boolean(latestQr),
      qrGeneratedAt: latestQrAt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      connected: false,
      state: "UNKNOWN",
      qrAvailable: Boolean(latestQr),
      message: error?.message || "Could not read WhatsApp status.",
    });
  }
});

/* =========================================
   GET WHATSAPP QR
========================================= */

router.get("/qr", async (req, res) => {
  try {
    if (whatsappConfigured()) {
      return res.json({
        success: true,
        connected: true,
        qr: null,
        message: "WhatsApp is already connected.",
      });
    }

    if (!latestQr) {
      return res.status(404).json({
        success: false,
        connected: false,
        qr: null,
        message: "QR is not available yet. Please wait a few seconds and try again.",
      });
    }

    const qrDataUrl = await QRCode.toDataURL(latestQr, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
    });

    return res.json({
      success: true,
      connected: false,
      qr: qrDataUrl,
      generatedAt: latestQrAt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      connected: false,
      qr: null,
      message: error?.message || "Could not generate WhatsApp QR.",
    });
  }
});

/* =========================================
   CUSTOMER
========================================= */

async function getCustomer(customerId) {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Customer not found.");
  }

  return data;
}

/* =========================================
   TEST MESSAGE
========================================= */

router.post("/send", async (req, res) => {
  try {
    if (!whatsappConfigured()) {
      return res.status(503).json({
        success: false,
        message: "WhatsApp Web is not connected.",
      });
    }

    const result = await sendWhatsAppTestMessage({
      to: req.body?.to,
      text: req.body?.text,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Test Message failed.",
    });
  }
});

/* =========================================
   WEEKLY TEST
========================================= */

router.post("/weekly/:customerId", async (req, res) => {
  try {
    const customer = await getCustomer(req.params.customerId);

    const result = await sendWeeklyDebtReport({
      id: `manual-weekly-${Date.now()}`,
      customer_id: customer.id,
      phone: customer.phone,
      isTest: true,
    });

    return res.json({
      success: true,
      ...result,
      result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Weekly Test failed.",
    });
  }
});

/* =========================================
   3-WEEK FULL ACCOUNT PDF TEST
========================================= */

router.post("/full/:customerId", async (req, res) => {
  try {
    const customer = await getCustomer(req.params.customerId);

    const result = await sendFullAccountReport({
      id: `manual-full-${Date.now()}`,
      customer_id: customer.id,
      phone: customer.phone,
      isTest: true,
    });

    return res.json({
      success: true,
      ...result,
      result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || "3-week PDF Test failed.",
    });
  }
});

export default router;