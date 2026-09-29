import { supabaseAdmin } from "../config/supabase.js";

import "../config/env.js";

import fs from "node:fs";

import path from "node:path";



import pkg from "whatsapp-web.js";



import {

  createPaymentReceiptPng,

  createWeeklyDebtReportPng,

  createFullAccountReportPdf,
  setSharedPuppeteerBrowserProvider,

} from "./reportImageService.js";



const {

  Client,

  LocalAuth,

  MessageMedia,

} = pkg;



/* =========================================

   WHATSAPP WEB CLIENT

========================================= */



let whatsappReady = false;

let whatsappInitializing = false;

let authenticatedAt = null;

let connectionCheckTimer = null;
let detachedFrameRecoveryPromise = null;



// Latest WhatsApp pairing QR is kept only in server memory.

// It is never written to Supabase, disk, or Git.

const WHATSAPP_QR_TTL_MS = 60_000;

let latestQrDataUrl = null;

let latestQrGeneratedAt = null;

let whatsappConnectionState = "STARTING";

let qrGenerationVersion = 0;



function clearWhatsAppQr() {

  qrGenerationVersion += 1;

  latestQrDataUrl = null;

  latestQrGeneratedAt = null;

}



function setWhatsAppConnectionState(state) {

  whatsappConnectionState = String(state || "UNKNOWN");

}



function findInstalledChrome() {
  const candidates = [
    process.env.WHATSAPP_CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env["PROGRAMFILES(X86)"] && `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || undefined;
}

const installedChromePath = findInstalledChrome();

function resolveWhatsAppAuthPath() {
  const fromEnv =
    String(process.env.WHATSAPP_AUTH_PATH || "").trim();

  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  const cwd = process.cwd();

  // Hostinger deploy folders live under:
  // .../domains/<domain>/hbuilds/versions/<version>/nodejs
  // Store WhatsApp auth outside hbuilds so it survives deploys/restarts.
  const hbuildMarker = `${path.sep}hbuilds${path.sep}`;
  const hbuildIndex = cwd.indexOf(hbuildMarker);

  if (hbuildIndex >= 0) {
    const domainRoot = cwd.slice(0, hbuildIndex);
    return path.join(
      domainRoot,
      ".azi-wms-whatsapp-auth"
    );
  }

  return path.resolve(
    cwd,
    ".wwebjs_auth_azi"
  );
}

const WHATSAPP_AUTH_PATH =
  resolveWhatsAppAuthPath();

fs.mkdirSync(
  WHATSAPP_AUTH_PATH,
  { recursive: true }
);

const IS_LINUX_SERVER = process.platform === "linux";

console.log("🔐 WhatsApp auth storage:", WHATSAPP_AUTH_PATH);

if (installedChromePath) {
  console.log("✅ WhatsApp will use Chrome:", installedChromePath);
} else {
  console.log("ℹ️ Installed Google Chrome was not found; Puppeteer browser will be used.");
}

const puppeteerArgs = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-sync",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-service-autorun",
  "--disable-crash-reporter",
  "--disable-breakpad",
  "--disable-features=Crashpad",
];

// Hostinger shared hosting can have a very small process/thread allowance.
// These Linux-only flags reduce Chromium child processes and fork/thread usage.
if (IS_LINUX_SERVER) {
  puppeteerArgs.push(
    "--no-zygote",
    "--single-process",
    "--renderer-process-limit=1"
  );
}

console.log("🟢 WhatsApp Hostinger low-resource mode: V1");
console.log("💾 WhatsApp persistent auth path fix: V2");
console.log("🛠️ WhatsApp detached-frame recovery: V1");

const whatsappClient = new Client({

  // Match the real Windows Chrome environment that already works with WhatsApp Web.

  userAgent:

    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",



  authStrategy: new LocalAuth({

    clientId: "azi-wms",

    dataPath: WHATSAPP_AUTH_PATH,

    rmMaxRetries: 8,

  }),



  puppeteer: {

    headless: true,

    ...(installedChromePath ? { executablePath: installedChromePath } : {}),

    protocolTimeout: 180000,

    timeout: 180000,

    defaultViewport: null,

    args: puppeteerArgs,

  },

});

// Reuse the Chromium instance already opened by whatsapp-web.js when
// reportImageService creates receipt/weekly-report images or PDFs.
// This prevents a second Chrome launch on low-resource Hostinger hosting.
setSharedPuppeteerBrowserProvider(
  () => whatsappClient.pupBrowser || null
);

console.log("♻️ Report renderer will reuse the WhatsApp Chromium browser.");



/* =========================================

   CONNECTION HELPERS

========================================= */



function stopConnectionChecker() {

  if (connectionCheckTimer) {

    clearInterval(connectionCheckTimer);

    connectionCheckTimer = null;

  }

}



function markWhatsAppReady(source = "ready") {

  setWhatsAppConnectionState("CONNECTED");

  clearWhatsAppQr();



  if (whatsappReady) return;



  whatsappReady = true;

  whatsappInitializing = false;



  stopConnectionChecker();



  console.log("");

  console.log("=========================================");

  console.log("✅ AZI WMS WhatsApp Web connected");

  console.log(`Connection confirmed by: ${source}`);

  console.log("=========================================");

  console.log("");

}



async function verifyWhatsAppConnection() {

  try {

    const state = await whatsappClient.getState();



    setWhatsAppConnectionState(state || "UNKNOWN");



    console.log(

      "🔎 WhatsApp connection state:",

      state || "UNKNOWN"

    );



    if (state === "CONNECTED") {

      markWhatsAppReady(

        "getState CONNECTED"

      );



      return true;

    }



    return false;

  } catch (error) {

    console.log(

      "⏳ WhatsApp state not ready yet:",

      error?.message || error

    );



    return false;

  }

}



function startConnectionChecker() {

  if (connectionCheckTimer) return;



  let attempts = 0;



  connectionCheckTimer =

    setInterval(async () => {

      attempts += 1;



      const connected =

        await verifyWhatsAppConnection();



      if (connected) {

        return;

      }



      if (attempts >= 36) {

        stopConnectionChecker();



        whatsappInitializing = false;



        console.error(

          "❌ WhatsApp did not reach CONNECTED state after 3 minutes."

        );

      }

    }, 5000);

}



/* =========================================

   WHATSAPP EVENTS

========================================= */



whatsappClient.on("qr", async (qr) => {

  const generationVersion = ++qrGenerationVersion;

  const generatedAt = new Date();



  whatsappReady = false;

  setWhatsAppConnectionState("UNPAIRED");



  console.log("");

  console.log("=========================================");

  console.log("📱 WhatsApp QR generated");

  console.log("Open WMS Settings → WhatsApp and scan the QR there.");

  console.log("=========================================");



  try {

    const qrcode = await import("qrcode");



    const dataUrl = await qrcode.default.toDataURL(qr, {

      width: 320,

      margin: 2,

      errorCorrectionLevel: "M",

    });



    // Ignore an older async conversion if a newer QR was already generated

    // or if the client became connected while this QR was being rendered.

    if (generationVersion !== qrGenerationVersion || whatsappReady) {

      return;

    }



    latestQrDataUrl = dataUrl;

    latestQrGeneratedAt = generatedAt;

  } catch (error) {

    console.error(

      "❌ Could not create WhatsApp QR image:",

      error?.message || error

    );

  }

});



whatsappClient.on(

  "authenticated",

  () => {

    authenticatedAt = new Date();

    setWhatsAppConnectionState("AUTHENTICATED");

    clearWhatsAppQr();



    console.log(

      "✅ WhatsApp authenticated"

    );



    startConnectionChecker();

  }

);



whatsappClient.on(

  "ready",

  () => {

    markWhatsAppReady(

      "ready event"

    );

  }

);



whatsappClient.on(

  "change_state",

  (state) => {

    setWhatsAppConnectionState(state);



    console.log(

      "📡 WhatsApp state changed:",

      state

    );



    if (state === "CONNECTED") {

      markWhatsAppReady(

        "change_state CONNECTED"

      );

    }

  }

);



whatsappClient.on(

  "auth_failure",

  (message) => {

    whatsappReady = false;

    whatsappInitializing = false;

    authenticatedAt = null;

    setWhatsAppConnectionState("AUTH_FAILURE");

    clearWhatsAppQr();



    stopConnectionChecker();



    console.error(

      "❌ WhatsApp authentication failed:",

      message

    );

  }

);



whatsappClient.on(

  "disconnected",

  (reason) => {

    whatsappReady = false;

    whatsappInitializing = false;

    authenticatedAt = null;

    setWhatsAppConnectionState("DISCONNECTED");

    clearWhatsAppQr();



    stopConnectionChecker();



    console.error(

      "❌ WhatsApp disconnected:",

      reason

    );

  }

);



whatsappClient.on(

  "loading_screen",

  (percent, message) => {

    console.log(

      `WhatsApp loading: ${percent}% ${message || ""}`

    );

  }

);



/* =========================================

   INITIALIZE WHATSAPP

========================================= */



async function initializeWhatsApp() {

  if (whatsappInitializing || whatsappReady) {

    return;

  }



  whatsappInitializing = true;

  setWhatsAppConnectionState("STARTING");



  try {

    console.log("Starting WhatsApp Web...");



    // IMPORTANT:

    // initialize only once. Retrying initialize() on the same LocalAuth

    // session can start a second Chromium instance and cause:

    // "The browser is already running for ... session-fresh-test".

    await whatsappClient.initialize();



    // The ready/authenticated events will update whatsappReady.

    // If authentication already exists, the connection checker can verify

    // the state without launching another browser.

    if (authenticatedAt && !whatsappReady) {

      startConnectionChecker();

    }

  } catch (error) {

    const message = String(error?.message || error || "");



    console.warn(

      "⚠️ WhatsApp initialize warning:",

      message

    );



    // Never call initialize() again here.

    // If the page navigated during injection, keep the single browser alive

    // and let the connection checker verify it when authentication exists.

    if (authenticatedAt) {

      console.log(

        "🔄 Authentication exists. Checking the existing WhatsApp session..."

      );

      startConnectionChecker();

    } else {

      whatsappReady = false;

      setWhatsAppConnectionState("ERROR");

    }

  } finally {

    whatsappInitializing = false;

  }

}



const WHATSAPP_START_DELAY_MS = Math.max(0, Number(process.env.WHATSAPP_START_DELAY_MS || 1000));

console.log(`⏳ WhatsApp startup scheduled in ${WHATSAPP_START_DELAY_MS}ms`);

setTimeout(() => {
  initializeWhatsApp().catch((error) => {
    whatsappReady = false;
    whatsappInitializing = false;
    setWhatsAppConnectionState("ERROR");
    console.error(
      "❌ Delayed WhatsApp initialization failed:",
      error?.message || error
    );
  });
}, WHATSAPP_START_DELAY_MS);



/* =========================================

   CONFIGURATION

========================================= */



export function whatsappConfigured() {

  return whatsappReady;

}



export async function getWhatsAppWebStatus() {

  let liveState = whatsappConnectionState;



  try {

    const state = await whatsappClient.getState();



    if (state) {

      liveState = state;

      setWhatsAppConnectionState(state);

    }



    if (state === "CONNECTED") {

      markWhatsAppReady("settings status check");

    }

  } catch {

    // During startup or QR pairing getState() can temporarily fail.

    // In that case we safely return the last event-driven state.

  }



  const connected =

    whatsappReady ||

    liveState === "CONNECTED";



  if (connected) {

    clearWhatsAppQr();

  }



  if (

    latestQrGeneratedAt &&

    Date.now() - latestQrGeneratedAt.getTime() > WHATSAPP_QR_TTL_MS

  ) {

    clearWhatsAppQr();

  }



  return {

    connected,

    state: connected ? "CONNECTED" : whatsappConnectionState,

    qrDataUrl: connected ? null : latestQrDataUrl,

    qrGeneratedAt: latestQrGeneratedAt

      ? latestQrGeneratedAt.toISOString()

      : null,

    authenticatedAt: authenticatedAt

      ? authenticatedAt.toISOString()

      : null,

  };

}



/* =========================================

   PHONE NORMALIZATION

========================================= */



export function normalizeWhatsAppPhone(

  phone

) {

  const digits =

    String(phone || "")

      .replace(/\D/g, "");



  if (!digits) {

    return "";

  }



  // Already Afghanistan international format

  if (digits.startsWith("93")) {

    return digits;

  }



  // Example:

  // 0789635780 -> 93789635780

  if (digits.startsWith("0")) {

    return `93${digits.slice(1)}`;

  }



  return digits;

}



function whatsappChatId(phone) {

  const normalized =

    normalizeWhatsAppPhone(phone);



  if (!normalized) {

    throw new Error(

      "WhatsApp phone number is missing."

    );

  }



  return `${normalized}@c.us`;

}



/* =========================================

   DETACHED FRAME RECOVERY

   WhatsApp Web can navigate/reload its main frame while a send is
   starting. In that race whatsapp-web.js can throw:
   "Attempted to use detached Frame ...".

   Do NOT create a second Client/Chromium here. We keep the existing
   LocalAuth session, wait for/recover the active WhatsApp page, verify
   CONNECTED again, and retry the send exactly once.

========================================= */

function sleep(ms) {

  return new Promise((resolve) => setTimeout(resolve, ms));

}



function isWhatsAppFrameNavigationError(error) {

  const message = String(error?.message || error || "").toLowerCase();



  return (

    message.includes("detached frame") ||

    message.includes("execution context was destroyed") ||

    message.includes("cannot find context with specified id") ||

    message.includes("inspected target navigated or closed") ||

    message.includes("navigating frame was detached")

  );

}



async function findUsableWhatsAppPage() {

  let page = whatsappClient.pupPage || null;



  if (page && !page.isClosed()) {

    try {

      page.mainFrame();

      return page;

    } catch {

      // Fall through and find the live WhatsApp tab from the browser.

    }

  }



  const browser = whatsappClient.pupBrowser;



  if (!browser || !browser.connected) {

    return null;

  }



  const pages = await browser.pages();



  page =

    pages.find((candidate) => {

      if (!candidate || candidate.isClosed()) return false;



      try {

        return candidate.url().includes("web.whatsapp.com");

      } catch {

        return false;

      }

    }) ||

    pages.find((candidate) => candidate && !candidate.isClosed()) ||

    null;



  if (page) {

    whatsappClient.pupPage = page;

  }



  return page;

}



async function waitForWhatsAppPageReady(page, timeoutMs = 20_000) {

  const startedAt = Date.now();

  let lastError = null;



  while (Date.now() - startedAt < timeoutMs) {

    if (!page || page.isClosed()) {

      return false;

    }



    try {

      const ready = await page.evaluate(() => {

        return (

          document.readyState !== "loading" &&

          Boolean(window.Store) &&

          Boolean(window.WWebJS)

        );

      });



      if (ready) {

        return true;

      }

    } catch (error) {

      lastError = error;

    }



    await sleep(750);

  }



  if (lastError) {

    console.warn(

      "⚠️ WhatsApp page was not ready after frame recovery:",

      lastError?.message || lastError

    );

  }



  return false;

}



async function recoverWhatsAppDetachedFrame() {

  if (detachedFrameRecoveryPromise) {

    console.log(

      "⏳ WhatsApp detached-frame recovery is already running; waiting for it..."

    );



    return detachedFrameRecoveryPromise;

  }



  detachedFrameRecoveryPromise = (async () => {


      whatsappReady = false;

      setWhatsAppConnectionState("RECOVERING");



      console.warn(

        "♻️ WhatsApp frame changed during send. Recovering the existing session..."

      );



      stopConnectionChecker();



      let page = await findUsableWhatsAppPage();



      if (!page) {

        setWhatsAppConnectionState("ERROR");

        throw new Error(

          "WhatsApp browser page is unavailable after detached-frame error."

        );

      }



      // A navigation race often settles by itself. Give the new main frame a

      // short chance before forcing a reload.

      await sleep(1200);



      let pageReady = await waitForWhatsAppPageReady(page, 8_000);



      if (!pageReady) {

        console.warn(

          "🔄 WhatsApp page is still stale. Reloading the existing WhatsApp tab once..."

        );



        try {

          await page.reload({

            waitUntil: "domcontentloaded",

            timeout: 60_000,

          });

        } catch (error) {

          if (!isWhatsAppFrameNavigationError(error)) {

            throw error;

          }

        }



        await sleep(1500);



        // whatsapp-web.js normally reinjects on main-frame navigation. If the

        // helper objects are still missing, request one explicit injection on

        // the same page. The postinstall page-binding patch makes duplicate

        // exposed bindings safe during this recovery path.

        pageReady = await waitForWhatsAppPageReady(page, 5_000);



        if (!pageReady && typeof whatsappClient.inject === "function") {

          try {

            await whatsappClient.inject();

          } catch (error) {

            const message = String(error?.message || error || "");



            if (

              !isWhatsAppFrameNavigationError(error) &&

              !/already exists/i.test(message)

            ) {

              throw error;

            }

          }



          page = await findUsableWhatsAppPage();

          pageReady = await waitForWhatsAppPageReady(page, 10_000);

        }

      }



      if (!pageReady) {

        startConnectionChecker();

        throw new Error(

          "WhatsApp page did not become ready after detached-frame recovery."

        );

      }



      // getState can lag slightly behind the page becoming usable. Poll briefly

      // without creating a new WhatsApp client/browser.

      for (let attempt = 1; attempt <= 12; attempt += 1) {

        const connected = await verifyWhatsAppConnection();



        if (connected) {

          console.log(

            "✅ WhatsApp detached-frame recovery completed."

          );



          return true;

        }



        await sleep(1000);

      }



      startConnectionChecker();



      throw new Error(

        "WhatsApp did not reconnect after detached-frame recovery."

      );

  })();



  try {

    return await detachedFrameRecoveryPromise;

  } finally {

    detachedFrameRecoveryPromise = null;

  }

}


async function sendWithDetachedFrameRetry({

  label,

  send,

}) {

  try {

    return await send();

  } catch (error) {

    if (!isWhatsAppFrameNavigationError(error)) {

      throw error;

    }



    console.warn(

      `⚠️ ${label} hit a detached WhatsApp frame. Recovering and retrying once...`

    );



    await recoverWhatsAppDetachedFrame();



    return await send();

  }

}



/* =========================================

   SEND TEXT MESSAGE

========================================= */



async function sendWhatsAppText({

  to,

  text,

}) {

  if (!whatsappReady) {

    await verifyWhatsAppConnection();

  }



  if (!whatsappReady) {

    throw new Error(

      "WhatsApp Web is not connected yet."

    );

  }



  const phone =

    normalizeWhatsAppPhone(to);



  if (!phone) {

    throw new Error(

      "WhatsApp phone number is missing or invalid."

    );

  }



  const chatId =

    whatsappChatId(phone);



  const messageText =

    String(text || "").trim();



  if (!messageText) {

    throw new Error(

      "WhatsApp message text is empty."

    );

  }



  console.log(

    `📤 Sending WhatsApp TEXT to ${phone}...`

  );



  const message =

    await whatsappClient.sendMessage(

      chatId,

      messageText

    );



  console.log(

    `✅ WhatsApp TEXT sent successfully to ${phone}`

  );



  return message;

}



/* =========================================

   SEND PNG IMAGE

========================================= */



async function sendWhatsAppPng({

  to,

  buffer,

  filename = "report.png",

  caption = "",

}) {

  if (!whatsappReady) {

    await verifyWhatsAppConnection();

  }



  if (!whatsappReady) {

    throw new Error(

      "WhatsApp Web is not connected yet."

    );

  }



  const phone =

    normalizeWhatsAppPhone(to);



  if (!phone) {

    throw new Error(

      "WhatsApp phone number is missing or invalid."

    );

  }



  if (

    !Buffer.isBuffer(buffer) ||

    buffer.length === 0

  ) {

    throw new Error(

      "PNG buffer is empty."

    );

  }



  const chatId =

    whatsappChatId(phone);



  console.log(

    `📤 Sending WhatsApp PNG to ${phone}...`

  );



  const message =

    await sendWithDetachedFrameRetry({

      label: `WhatsApp PNG send to ${phone}`,

      send: () => {

        // Create fresh MessageMedia for each attempt because whatsapp-web.js

        // can mutate prepared media data during send preparation.

        const attemptMedia =

          new MessageMedia(

            "image/png",

            buffer.toString("base64"),

            filename

          );



        return whatsappClient.sendMessage(

          chatId,

          attemptMedia,

          {

            caption:

              String(caption || ""),

          }

        );

      },

    });



  console.log(

    `✅ WhatsApp PNG sent successfully to ${phone}`

  );



  return message;

}





/* =========================================

   SEND PDF DOCUMENT

========================================= */



async function sendWhatsAppPdf({

  to,

  buffer,

  filename = "account-report.pdf",

  caption = "",

}) {

  if (!whatsappReady) {

    await verifyWhatsAppConnection();

  }



  if (!whatsappReady) {

    throw new Error("WhatsApp Web is not connected yet.");

  }



  const phone = normalizeWhatsAppPhone(to);

  if (!phone) {

    throw new Error("WhatsApp phone number is missing or invalid.");

  }



  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {

    throw new Error("PDF buffer is empty.");

  }



  const chatId = whatsappChatId(phone);

  const media = new MessageMedia(

    "application/pdf",

    buffer.toString("base64"),

    filename

  );



  console.log(`📤 Sending WhatsApp PDF to ${phone}...`);



  const message = await whatsappClient.sendMessage(

    chatId,

    media,

    { caption: String(caption || "") }

  );



  console.log(`✅ WhatsApp PDF sent successfully to ${phone}`);

  return message;

}





/* =========================================

   RECEIPT / SHOP SETTINGS

========================================= */



async function getReceiptShopSettings() {

  const defaults = {

    company_name: "نیازی پلورنځی",

    shop_name: "نیازی پلورنځی",

    shop_address: "",

    logo_url: "",

    receipt_title: "د وصولۍ رسید",

    weekly_report_title: "د حساب راپور",

  };



  try {

    /*

      IMPORTANT:

      Company logo/name/address must always come from company_settings,

      because this is the same Settings page used by the WMS.

      WhatsApp automation settings are used only for WhatsApp-specific

      titles/branding fields when they exist.

    */

    const [

      companyResult,

      whatsappResult,

    ] = await Promise.all([

      supabaseAdmin

        .from("company_settings")

        .select("*")

        .eq("id", 1)

        .maybeSingle(),



      supabaseAdmin

        .from("whatsapp_automation_settings")

        .select("*")

        .eq("id", 1)

        .maybeSingle(),

    ]);



    if (companyResult.error) {

      console.warn(

        "⚠️ Could not load company settings:",

        companyResult.error.message

      );

    }



    if (whatsappResult.error) {

      console.warn(

        "⚠️ Could not load WhatsApp branding settings:",

        whatsappResult.error.message

      );

    }



    const company = companyResult.data || {};

    const whatsapp = whatsappResult.data || {};



    return {

      ...defaults,



      // MAIN WMS SETTINGS

      company_name:

        company.company_name ||

        defaults.company_name,



      shop_name:

        company.company_name ||

        defaults.shop_name,



      shop_address:

        company.address ||

        "",



      logo_url:

        company.logo_url ||

        "",



      // WHATSAPP-SPECIFIC TITLES

      receipt_title:

        whatsapp.receipt_title ||

        defaults.receipt_title,



      weekly_report_title:

        whatsapp.weekly_report_title ||

        whatsapp.report_title ||

        defaults.weekly_report_title,



      // Keep useful company fields available to report templates.

      address: company.address || "",

      phone: company.phone || "",

      email: company.email || "",

      currency: company.currency || "AFN",

      date_format: company.date_format || "",

    };

  } catch (error) {

    console.warn(

      "⚠️ Receipt/settings fallback:",

      error?.message || error

    );



    return defaults;

  }

}



/* =========================================

   CUSTOMER TOTALS

========================================= */



async function getCustomerTotals(

  customerId

) {

  const [

    customerResult,

    paymentResult,

  ] = await Promise.all([

    supabaseAdmin

      .from("customers")

      .select("*")

      .eq(

        "id",

        customerId

      )

      .single(),



    supabaseAdmin

      .from("payments")

      .select("amount")

      .eq(

        "customer_id",

        customerId

      ),

  ]);



  const customer =

    customerResult.data;



  const payments =

    paymentResult.data || [];



  if (

    customerResult.error ||

    !customer

  ) {

    throw new Error(

      customerResult.error?.message ||

      "Customer not found."

    );

  }



  if (paymentResult.error) {

    throw new Error(

      paymentResult.error.message

    );

  }



  const totalPaid =

    payments.reduce(

      (sum, payment) =>

        sum +

        Number(

          payment.amount || 0

        ),

      0

    );



  const remainingBalance =

    Number(

      customer.current_balance || 0

    );



  const totalDebt =

    remainingBalance +

    totalPaid;



  return {

    customer,

    totalPaid,

    remainingBalance,

    totalDebt,

  };

}



/* =========================================

   PAYMENT RECEIPT

   AUTOMATIC PNG

========================================= */



export async function sendPaymentReceipt(

  job

) {

  if (!whatsappConfigured()) {

    await verifyWhatsAppConnection();

  }



  if (!whatsappConfigured()) {

    throw new Error(

      "WhatsApp Web is not connected."

    );

  }



  /* -------------------------

     CUSTOMER

  ------------------------- */



  const {

    data: customer,

    error: customerError,

  } =

    await supabaseAdmin

      .from("customers")

      .select("*")

      .eq(

        "id",

        job.customer_id

      )

      .single();



  if (

    customerError ||

    !customer

  ) {

    throw new Error(

      customerError?.message ||

      "Customer not found."

    );

  }



  /* -------------------------

     PAYMENT

  ------------------------- */



  const paymentId =

    job.payment_id ||

    job.payload?.payment_id;



  let payment = null;



  if (paymentId) {

    const {

      data,

      error,

    } =

      await supabaseAdmin

        .from("payments")

        .select("*")

        .eq(

          "id",

          paymentId

        )

        .maybeSingle();



    if (error) {

      throw new Error(

        error.message

      );

    }



    payment = data;

  }



  payment =

    payment ||

    job.payload?.payment ||

    {};



  /* -------------------------

     AMOUNT

  ------------------------- */



  const amount =

    Number(

      payment.amount ||

      job.payload?.amount ||

      0

    );



  if (amount <= 0) {

    throw new Error(

      "Receipt payment amount is missing."

    );

  }



  /* -------------------------

     PHONE

  ------------------------- */



  const phone =

    normalizeWhatsAppPhone(

      customer.phone ||

      job.phone

    );



  if (!phone) {

    return {

      skipped: true,

      reason: "missing_phone",

    };

  }



  /* -------------------------

     BALANCE

  ------------------------- */



  const remainingBalance =

    Number(

      job.payload

        ?.remaining_balance ??

      customer.current_balance ??

      0

    );



  /* -------------------------

     CURRENCY

  ------------------------- */



  const currency =

    customer.currency ||

    job.payload?.currency ||

    "AFN";



  /* -------------------------

     CREATE PNG

  ------------------------- */



  const shopSettings =

    await getReceiptShopSettings();



  console.log(

    `🧾 Creating payment receipt PNG for ${customer.name || "customer"}...`

  );



  const pngBuffer =

    await createPaymentReceiptPng({

      company: shopSettings,



      customer,



      payment,



      remainingBalance,



      currency,

    });



  console.log(

    `✅ Payment receipt PNG created for ${customer.name || "customer"}`

  );



  /* -------------------------

     SEND AUTOMATICALLY

     NO OK BUTTON

  ------------------------- */



  const result =

    await sendWhatsAppPng({

      to: phone,



      buffer: pngBuffer,



      filename:

        `payment-receipt-${payment.id || Date.now()}.png`,



      caption:

        `محترم *${customer.name || "مشتري"} صاحب* 🌿\n` +

        `ستاسو د وصولۍ رسید په بریالیتوب سره درولېږل شو.\n` +

        `له باور او همکارۍ مو مننه.\n` +

        `*K266*`,

    });



  return {

    skipped: false,



    messageId:

      result?.id?._serialized ||

      result?.id?.id ||

      null,



    mediaPath: null,

  };

}



/* =========================================

   WEEKLY DEBT REPORT

   AUTOMATIC PNG

========================================= */



export async function sendWeeklyDebtReport(

  job

) {

  if (!whatsappConfigured()) {

    await verifyWhatsAppConnection();

  }



  if (!whatsappConfigured()) {

    throw new Error(

      "WhatsApp Web is not connected."

    );

  }



  const {

    customer,

    totalPaid,

    totalDebt,

    remainingBalance,

  } =

    await getCustomerTotals(

      job.customer_id

    );



  /*

    Weekly report:

    Only customers who still owe money.

  */



  if (remainingBalance <= 0) {

    console.log(

      `[WhatsApp] Weekly report skipped for ${customer.name}: balance is 0`

    );



    return {

      skipped: true,

      reason: "balance_zero",

    };

  }



  const phone =

    normalizeWhatsAppPhone(

      customer.phone ||

      job.phone

    );



  if (!phone) {

    return {

      skipped: true,

      reason: "missing_phone",

    };

  }



  const currency =

    customer.currency ||

    "AFN";



  const shopSettings =

    await getReceiptShopSettings();



  console.log(

    `📊 Creating weekly debt PNG for ${customer.name || "customer"}...`

  );



  const pngBuffer =

    await createWeeklyDebtReportPng({

      company: shopSettings,



      customer,



      totalDebt,



      totalPaid,



      remainingBalance,



      currency,



      generatedAt:

        new Date(),

    });



  console.log(

    `✅ Weekly debt PNG created for ${customer.name || "customer"}`

  );



  const result =

    await sendWhatsAppPng({

      to: phone,



      buffer: pngBuffer,



      filename:

        `weekly-account-${customer.id}-${Date.now()}.png`,



      caption:

        `ښاغلی *${customer.name || "مشتري"} صاحب* 🌟\n` +

        `ستاسو اوونیز راپور د AZI SYSTEM له لارې په بریالیتوب سره درولېږل شو 📊\n` +

        `مننه چې مونږ سره یاست 🤝\n` +

        `*K266*`,

    });



  return {

    skipped: false,



    messageId:

      result?.id?._serialized ||

      result?.id?.id ||

      null,



    mediaPath: null,

  };

}



/* =========================================

   FULL ACCOUNT REPORT

   EVERY 3 WEEKS



   IMPORTANT:

   This remains TEXT temporarily.



   We will connect the complete PDF

   after verifying sales_invoices +

   payments + balance records logic.

========================================= */





async function getFullAccountTransactions(customerId) {

  const [salesResult, paymentsResult, balanceResult] = await Promise.all([

    supabaseAdmin

      .from("sales_invoices")

      .select("*")

      .eq("customer_id", customerId)

      .order("created_at", { ascending: true }),



    supabaseAdmin

      .from("payments")

      .select("*")

      .eq("customer_id", customerId)

      .order("created_at", { ascending: true }),



    supabaseAdmin

      .from("debtor_balance_records")

      .select("*")

      .eq("customer_id", customerId)

      .order("created_at", { ascending: true }),

  ]);



  if (salesResult.error) throw new Error(salesResult.error.message);

  if (paymentsResult.error) throw new Error(paymentsResult.error.message);



  // Older databases may not yet have debtor_balance_records.

  if (balanceResult.error) {

    console.warn(

      "⚠️ debtor_balance_records could not be loaded:",

      balanceResult.error.message

    );

  }



  const raw = [];



  for (const invoice of salesResult.data || []) {

    raw.push({

            ...invoice,

date:

        invoice.invoice_date ||

        invoice.date ||

        invoice.created_at,

      sortDate: new Date(

        invoice.invoice_date ||

        invoice.date ||

        invoice.created_at ||

        0

      ).getTime(),

      description:

        `د خرڅلاو بل${invoice.invoice_number ? ` #${invoice.invoice_number}` : ""}`,

      debit: Number(

        invoice.total_amount ??

        invoice.grand_total ??

        invoice.total ??

        invoice.amount ??

        0

      ),

      credit: 0,

    });

  }



  for (const payment of paymentsResult.data || []) {

    raw.push({

            ...payment,

date:

        payment.payment_date ||

        payment.date ||

        payment.created_at,

      sortDate: new Date(

        payment.payment_date ||

        payment.date ||

        payment.created_at ||

        0

      ).getTime(),

      description:

        payment.note ||

        payment.description ||

        "وصولي",

      debit: 0,

      credit: Number(payment.amount || 0),

    });

  }



  for (const record of balanceResult.data || []) {

    const amount = Number(

      record.amount ??

      record.balance_amount ??

      record.value ??

      0

    );



    raw.push({

            ...record,

date:

        record.record_date ||

        record.date ||

        record.created_at,

      sortDate: new Date(

        record.record_date ||

        record.date ||

        record.created_at ||

        0

      ).getTime(),

      description:

        record.note ||

        record.description ||

        "د حساب ثبت",

      debit: amount > 0 ? amount : 0,

      credit: amount < 0 ? Math.abs(amount) : 0,

    });

  }



  raw.sort((a, b) => a.sortDate - b.sortDate);



  let runningBalance = 0;



  return raw.map((item) => {

    runningBalance += Number(item.debit || 0);

    runningBalance -= Number(item.credit || 0);



    return {

      ...item,

      date: item.date

        ? String(item.date).slice(0, 10).replace(/-/g, "/")

        : "—",

      description: item.description,

      debit: item.debit,

      credit: item.credit,

      balance: runningBalance,

    };

  });

}





export async function sendFullAccountReport(

  job

) {

  if (!whatsappConfigured()) {

    await verifyWhatsAppConnection();

  }



  if (!whatsappConfigured()) {

    throw new Error("WhatsApp Web is not connected.");

  }



  const {

    customer,

    totalPaid,

    totalDebt,

    remainingBalance,

  } = await getCustomerTotals(job.customer_id);



  const phone = normalizeWhatsAppPhone(

    customer.phone || job.phone

  );



  if (!phone) {

    return {

      skipped: true,

      reason: "missing_phone",

    };

  }



  const currency = customer.currency || "AFN";

  const shopSettings = await getReceiptShopSettings();

  const transactions = await getFullAccountTransactions(

    job.customer_id

  );



  console.log(

    `📄 Creating 3-week full account PDF for ${customer.name || "customer"}...`

  );



  const pdfBuffer = await createFullAccountReportPdf({

    company: shopSettings,

    customer,

    transactions,

    totalDebt,

    totalPaid,

    remainingBalance,

    currency,

    generatedAt: new Date(),

  });



  const result = await sendWhatsAppPdf({

    to: phone,

    buffer: pdfBuffer,

    filename:

      `full-account-${customer.id}-${Date.now()}.pdf`,

    caption:

      `محترم *${customer.name || "مشتري"} صاحب* 📋\n` +

      `ستاسو بشپړ حساب راپور د AZI SYSTEM له لارې په بریالیتوب سره درولېږل شو ✅\n` +

      `ستاسو له باور او همکارۍ څخه مننه 🤝\n` +

      `*K266*`,

  });



  return {

    skipped: false,

    messageId:

      result?.id?._serialized ||

      result?.id?.id ||

      null,

    mediaPath: null,

    format: "pdf",

  };

}





/* =========================================

   GENERIC ACCOUNT REPORT

========================================= */



export async function sendAccountReport(

  job

) {

  if (

    job?.job_type ===

    "full_debt_report"

  ) {

    return sendFullAccountReport(

      job

    );

  }



  return sendWeeklyDebtReport(

    job

  );

}



/* =========================================

   SIMPLE TEST MESSAGE

========================================= */



export async function sendTestWhatsAppMessage(

  phone,

  text = "AZI WMS WhatsApp Test ✅"

) {

  return sendWhatsAppText({

    to: phone,

    text,

  });

}



/* =========================================

   EXPORT CLIENT

========================================= */



export {

  whatsappClient,

  verifyWhatsAppConnection,

};



/* =========================================

   SETTINGS TEST MESSAGE COMPATIBILITY

========================================= */

export async function sendWhatsAppTestMessage({ to, text }) {

  const phone = normalizeWhatsAppPhone(to);



  if (!phone) {

    throw new Error(

      "د Test Message لپاره صحیح WhatsApp نمبر ولیکئ."

    );

  }



  const body =

    String(text || "").trim() ||

    "السلام علیکم، دا د AZI System د WhatsApp اتومات سیستم ازمایښتي پیغام دی.";



  await sendWhatsAppText({

    to: phone,

    text: body,

  });



  return {

    success: true,

    phone,

    message: "WhatsApp Test Message په بریالیتوب ولېږل شو.",

    provider: "whatsapp-web",

  };

}
