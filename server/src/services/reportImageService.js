import puppeteer from "puppeteer";

/* =========================================================
   AZI WMS - WHATSAPP REPORT IMAGE SERVICE
   HTML/CSS -> PNG
========================================================= */

let browserInstance = null;

// On constrained hosts (like Hostinger shared Node.js hosting), starting a
// second Chromium process for PNG/PDF rendering can fail with EAGAIN.
// WhatsApp Web already owns one Puppeteer browser, so reports can reuse it.
let sharedBrowserProvider = null;

export function setSharedPuppeteerBrowserProvider(provider) {
  sharedBrowserProvider =
    typeof provider === "function"
      ? provider
      : null;
}



/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// Keep every number in reports as normal Latin/English digits: 0-9.
// This also converts Persian/Arabic-Indic digits coming from the database
// back to ASCII so Hostinger/Chromium never receives special digit glyphs.
function toLatinDigits(value = "") {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}


function formatNumber(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return toLatinDigits(
    number.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })
  );
}


function getCurrency(currency = "AFN") {
  const value = String(currency || "AFN")
    .trim()
    .toUpperCase();

  if (
    value === "USD" ||
    value === "$" ||
    value === "DOLLAR"
  ) {
    return {
      code: "USD",
      symbol: "$",
    };
  }

  if (
    value === "AFN" ||
    value === "؋" ||
    value === "AFGHANI"
  ) {
    return {
      code: "AFN",
      symbol: "AFN",
    };
  }

  return {
    code: value,
    symbol: value,
  };
}


function getCustomerName(customer = {}) {
  return (
    customer.name ||
    customer.full_name ||
    customer.customer_name ||
    "مشتري"
  );
}


function getCustomerPhone(customer = {}) {
  const phone =
    customer.phone ||
    customer.mobile ||
    customer.phone_number ||
    "—";

  return toLatinDigits(phone);
}


function getPaymentMethod(payment = {}) {
  const raw =
    payment.payment_method ||
    payment.method ||
    payment.payment_type ||
    "cash";

  const value = String(raw)
    .trim()
    .toLowerCase();

  if (
    value === "cash" ||
    value === "نقد" ||
    value === "نقده"
  ) {
    return "نقده";
  }

  if (
    value === "hawala" ||
    value === "حواله"
  ) {
    return "حواله";
  }

  if (
    value === "bank" ||
    value === "bank transfer"
  ) {
    return "بانکي انتقال";
  }

  return String(raw);
}


/* =========================================================
   DATE
========================================================= */

function getReceiptDate(payment = {}) {
  const directDate =
    payment.display_date ||
    payment.solar_date ||
    payment.shamsi_date ||
    payment.jalali_date;

  if (directDate) {
    return toLatinDigits(directDate);
  }

  const raw =
    payment.payment_date ||
    payment.date ||
    payment.created_at;

  if (!raw) {
    return "—";
  }

  const rawString = String(raw);

  if (
    /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(
      rawString
    )
  ) {
    return toLatinDigits(rawString.replace(/-/g, "/"));
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return rawString;
  }

  try {
    return toLatinDigits(
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: "Asia/Kabul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }
      )
        .format(parsed)
        .replace(/-/g, "/")
    );
  } catch {
    return rawString;
  }
}


/* =========================================================
   JALALI / HIJRI SHAMSI DATE
========================================================= */

function formatJalaliDate(value) {
  if (!value) return "—";

  const raw = String(value).trim();

  // If the database already contains a Jalali/Shamsi date, keep it.
  if (/^(13|14)\d{2}[/-]\d{1,2}[/-]\d{1,2}$/.test(raw)) {
    return toLatinDigits(raw.replace(/-/g, "/"));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  try {
    // fa-AF-u-ca-persian gives the Persian/Jalali calendar.
    const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
      timeZone: "Asia/Kabul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsed);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (year && month && day) {
      return toLatinDigits(`${year}/${month}/${day}`);
    }
  } catch (error) {
    console.warn("Jalali date conversion fallback:", error?.message || error);
  }

  return toLatinDigits(raw.replace(/-/g, "/"));
}


/* =========================================================
   TIME
========================================================= */

function getReceiptTime(payment = {}) {
  if (payment.display_time) {
    return toLatinDigits(payment.display_time);
  }

  if (payment.payment_time) {
    return toLatinDigits(payment.payment_time);
  }

  const raw =
    payment.created_at ||
    payment.payment_date ||
    payment.date;

  if (!raw) {
    return "—";
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  try {
    return toLatinDigits(
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: "Asia/Kabul",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }
      ).format(parsed)
    );
  } catch {
    return "—";
  }
}


/* =========================================================
   BROWSER
========================================================= */

async function getBrowser() {
  // Prefer the already-running WhatsApp Web Chromium instance.
  // This avoids launching a second browser process on Hostinger.
  if (sharedBrowserProvider) {
    try {
      const sharedBrowser =
        await sharedBrowserProvider();

      if (
        sharedBrowser &&
        sharedBrowser.connected
      ) {
        return sharedBrowser;
      }
    } catch (error) {
      console.warn(
        "⚠️ Shared WhatsApp browser unavailable for report rendering:",
        error?.message || error
      );
    }
  }

  // Local/dev fallback: use the report renderer's own browser only when
  // no connected shared WhatsApp browser is available.
  if (
    browserInstance &&
    browserInstance.connected
  ) {
    return browserInstance;
  }

  browserInstance =
    await puppeteer.launch({
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-crash-reporter",
        "--disable-breakpad",
        ...(process.platform === "linux"
          ? [
              "--no-zygote",
              "--single-process",
              "--renderer-process-limit=1",
            ]
          : []),
      ],
    });

  browserInstance.on(
    "disconnected",
    () => {
      browserInstance = null;
    }
  );

  return browserInstance;
}


/* =========================================================
   HTML -> PNG
========================================================= */

async function htmlToPng(
  html,
  width = 900,
  height = 1250
) {
  const browser =
    await getBrowser();

  const page =
    await browser.newPage();

  try {
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 2,
    });

    await page.setContent(
      html,
      {
        waitUntil: "networkidle0",
      }
    );

    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });

    const receipt =
      await page.$("#receipt");

    if (!receipt) {
      throw new Error(
        "Receipt element was not found."
      );
    }

    const png =
      await receipt.screenshot({
        type: "png",
        omitBackground: false,
      });

    return Buffer.from(png);

  } finally {
    await page.close();
  }
}


/* =========================================================
   COMMON CSS
========================================================= */

function receiptCss() {
  return `
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #eef3f8;
    }

    body {
      font-family:
        "Noto Naskh Arabic",
        "Noto Sans Arabic",
        Tahoma,
        "Segoe UI",
        "DejaVu Sans",
        Arial,
        sans-serif;

      color: #172033;

      -webkit-font-smoothing:
        antialiased;

      text-rendering:
        optimizeLegibility;
    }

    /* Latin/English number rendering for Hostinger Linux + Chromium */
    .latin-number,
    .phone,
    .amount,
    .balance-value,
    .detail-value.ltr,
    .footer-date {
      direction: ltr !important;
      unicode-bidi: isolate !important;
      font-family:
        "DejaVu Sans",
        "Liberation Sans",
        "Noto Sans",
        Arial,
        sans-serif !important;
      font-variant-numeric: tabular-nums lining-nums;
      font-feature-settings: "tnum" 1, "lnum" 1;
      font-synthesis: none;
      letter-spacing: 0 !important;
    }

    .receipt {
      width: 900px;
      min-height: 1250px;

      margin: 0;

      background: #ffffff;

      overflow: hidden;

      position: relative;
    }

    .header {
      min-height: 300px;

      padding:
        54px
        68px
        42px;

      position: relative;

      overflow: hidden;

      color: #ffffff;

      background:
        linear-gradient(
          135deg,
          #00d9ff 0%,
          #0095ff 42%,
          #075ee8 72%,
          #263ee8 100%
        );
    }

    .header::after {
      content: "";

      position: absolute;

      width: 680px;
      height: 260px;

      right: -160px;
      bottom: -175px;

      border-radius: 50%;

      background:
        rgba(255,255,255,.10);

      transform:
        rotate(-8deg);
    }

    .header-top {
      display: flex;

      align-items: flex-start;

      justify-content:
        space-between;

      position: relative;

      z-index: 2;
    }

    .company {
      text-align: right;
      direction: rtl;
    }

    .company-name {
      font-size: 42px;

      line-height: 1.3;

      font-weight: 800;

      margin: 0;
    }

    .company-subtitle {
      margin-top: 9px;

      font-size: 20px;

      line-height: 1.8;

      color: #e2efff;
    }

    .shop-logo-box {
      width: 78px;
      height: 78px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 22px;
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(0, 48, 150, 0.20);
    }

    .shop-logo {
      width: 66px;
      height: 66px;
      object-fit: contain;
      border-radius: 16px;
    }

    .shop-logo-fallback {
      width: 78px;
      height: 78px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 22px;
      background: #ffffff;
      color: #075ee8;
      font-family: Arial, sans-serif;
      font-size: 23px;
      font-weight: 900;
    }

    .company-address {
      margin-top: 5px;
      color: #ffffff;
      font-size: 18px;
      line-height: 1.7;
      font-weight: 600;
    }

    .brand-badge {
      min-width: 164px;

      padding:
        14px
        22px;

      border:
        1px solid
        rgba(255,255,255,.40);

      border-radius: 40px;

      background:
        rgba(255,255,255,.13);

      text-align: center;

      font-size: 24px;

      font-weight: 800;

      letter-spacing: .3px;
    }

    .header-title {
      position: relative;

      z-index: 2;

      margin-top: 42px;

      text-align: center;

      direction: rtl;
    }

    .header-title h1 {
      margin: 0;

      font-size: 46px;

      line-height: 1.4;

      font-weight: 900;
    }

    .header-title p {
      margin:
        8px
        0
        0;

      font-size: 21px;

      line-height: 1.8;

      color: #e7f1ff;
    }

    .content {
      padding:
        38px
        62px
        45px;
    }

    .customer-card {
      display: flex;

      align-items: center;

      justify-content:
        space-between;

      min-height: 160px;

      padding:
        28px
        35px;

      border:
        1px solid
        #e3eaf3;

      border-radius: 28px;

      background:
        #f9fbfe;
    }

    .customer-info {
      direction: rtl;

      text-align: right;

      flex: 1;
    }

    .small-label {
      color: #718096;

      font-size: 18px;

      font-weight: 600;

      line-height: 1.6;
    }

    .customer-name {
      margin-top: 4px;

      font-size: 35px;

      line-height: 1.5;

      font-weight: 900;

      color: #111827;
    }

    .phone {
      margin-top: 3px;

      direction: ltr;

      text-align: right;

      font-family:
        Arial,
        sans-serif;

      font-size: 23px;

      font-weight: 700;

      color: #475569;
    }

    .mini-brand {
      flex: 0 0 auto;

      min-width: 150px;

      padding:
        14px
        18px;

      margin-right: 25px;

      border-radius: 40px;

      background:
        #eaf3ff;

      color:
        #1758bd;

      font-family:
        Arial,
        sans-serif;

      font-size: 22px;

      font-weight: 800;

      text-align: center;
    }

    .amount-card {
      margin-top: 30px;

      min-height: 250px;

      padding:
        36px
        30px;

      border:
        2px solid
        #27d991;

      border-radius:
        34px;

      background:
        linear-gradient(
          135deg,
          #e5fff3,
          #c8fae3
        );

      text-align: center;
    }

    .amount-label {
      direction: rtl;

      color:
        #00864e;

      font-size: 26px;

      line-height: 1.6;

      font-weight: 800;
    }

    .amount {
      margin-top: 10px;

      direction: ltr;

      font-family:
        Arial,
        sans-serif;

      color:
        #00a660;

      font-size: 74px;

      line-height: 1.25;

      font-weight: 900;
    }

    .success-text {
      margin-top: 7px;

      direction: rtl;

      color:
        #5f7188;

      font-size: 19px;

      line-height: 1.8;
    }

    .detail-grid {
      display: grid;

      grid-template-columns:
        repeat(3, 1fr);

      gap: 18px;

      margin-top: 30px;
    }

    .detail-card {
      min-height: 135px;

      padding:
        22px
        15px;

      border:
        1px solid
        #dfe7f1;

      border-radius:
        24px;

      background:
        #f9fbfd;

      text-align:
        center;
    }

    .detail-label {
      direction: rtl;

      color:
        #718096;

      font-size: 18px;

      line-height: 1.5;

      font-weight: 600;
    }

    .detail-value {
      margin-top: 13px;

      color:
        #172033;

      font-size: 25px;

      line-height: 1.5;

      font-weight: 900;
    }

    .detail-value.rtl {
      direction: rtl;
    }

    .detail-value.ltr {
      direction: ltr;

      font-family:
        Arial,
        sans-serif;
    }

    .balance-card {
      display: flex;

      align-items: center;

      justify-content:
        space-between;

      margin-top: 30px;

      min-height: 145px;

      padding:
        28px
        34px;

      border:
        2px solid
        #49afff;

      border-radius:
        27px;

      background:
        linear-gradient(
          90deg,
          #eaf7ff,
          #d1ebff
        );
    }

    .balance-label {
      direction: rtl;

      text-align: right;

      color:
        #5f7188;

      font-size: 21px;

      line-height: 1.6;

      font-weight: 700;
    }

    .balance-value {
      direction: ltr;

      font-family:
        Arial,
        sans-serif;

      color:
        #006bea;

      font-size: 39px;

      line-height: 1.3;

      font-weight: 900;
    }

    .thanks {
      margin-top: 34px;

      text-align: center;

      direction: rtl;
    }

    .thanks-title {
      color:
        #087a4b;

      font-size: 29px;

      line-height: 1.7;

      font-weight: 900;
    }

    .thanks-subtitle {
      margin-top: 5px;

      color:
        #6b7b91;

      font-size: 17px;

      line-height: 1.8;
    }

    .footer {
      min-height: 105px;

      padding:
        24px
        62px;

      display: flex;

      align-items: center;

      justify-content:
        space-between;

      background:
        linear-gradient(
          90deg,
          #009cff,
          #075ee8
        );

      color: #ffffff;
    }

    .footer-brand {
      font-family:
        Arial,
        sans-serif;

      font-size: 21px;

      line-height: 1.5;

      font-weight: 900;
    }

    .footer-date {
      text-align: right;

      font-family:
        Arial,
        sans-serif;

      font-size: 16px;

      line-height: 1.5;

      color:
        #e4efff;
    }
  

    /* ===== Weekly account report: compact variant ===== */
    .weekly-report .header {
      min-height: 270px;
      padding: 38px 58px 32px;
    }

    .weekly-report .header-title h1 {
      font-size: 39px;
      letter-spacing: -0.3px;
    }

    .weekly-report .header-title p {
      font-size: 18px;
      opacity: 0.96;
    }

    .weekly-report .content {
      padding-top: 30px;
      padding-bottom: 30px;
    }

    .weekly-report .customer-card,
    .weekly-report .summary-section,
    .weekly-report .note-card {
      border-radius: 24px;
    }

    .weekly-report .summary-section {
      overflow: hidden;
      border: 1.5px solid #c9ddf4;
      box-shadow: 0 8px 26px rgba(10, 75, 150, 0.08);
    }

    .weekly-report .summary-title {
      background: linear-gradient(90deg, #07529b 0%, #0a4383 100%);
      color: #ffffff;
    }

    .weekly-report .summary-grid {
      gap: 22px;
      padding: 34px 28px;
    }

    .weekly-report .summary-card {
      min-height: 205px;
      border-radius: 22px;
      background: #ffffff;
      box-shadow: 0 7px 20px rgba(17, 72, 130, 0.07);
    }

    .weekly-report .summary-card.debt,
    .weekly-report .summary-card.remaining {
      border: 2px solid #ffd0d0;
      background: linear-gradient(180deg, #ffffff 0%, #fff8f8 100%);
    }

    .weekly-report .summary-card.debt .summary-label,
    .weekly-report .summary-card.debt .summary-value,
    .weekly-report .summary-card.debt .summary-currency,
    .weekly-report .summary-card.remaining .summary-label,
    .weekly-report .summary-card.remaining .summary-value,
    .weekly-report .summary-card.remaining .summary-currency {
      color: #d32222;
    }

    .weekly-report .summary-card.received,
    .weekly-report .summary-card.paid {
      border: 2px solid #b9efd4;
      background: linear-gradient(180deg, #ffffff 0%, #f2fff8 100%);
    }

    .weekly-report .summary-card.received .summary-label,
    .weekly-report .summary-card.received .summary-value,
    .weekly-report .summary-card.received .summary-currency,
    .weekly-report .summary-card.paid .summary-label,
    .weekly-report .summary-card.paid .summary-value,
    .weekly-report .summary-card.paid .summary-currency {
      color: #07945a;
    }

    .weekly-report .summary-card.total {
      border: 2px solid #bedcff;
      background: linear-gradient(180deg, #ffffff 0%, #f2f8ff 100%);
    }

    .weekly-report .summary-card.total .summary-label,
    .weekly-report .summary-card.total .summary-value,
    .weekly-report .summary-card.total .summary-currency {
      color: #086ac9;
    }

    .weekly-report .note-card {
      padding: 25px 30px;
      border: 1.8px solid #2491dc;
      background: #ffffff;
    }

    .weekly-report .footer {
      min-height: 94px;
      background: linear-gradient(90deg, #0754ad 0%, #058bd9 52%, #02a9e9 100%);
    }
`;
}


/* =========================================================
   PAYMENT RECEIPT
========================================================= */

export async function createPaymentReceiptPng({
  company = {},
  customer = {},
  payment = {},
  remainingBalance = 0,
  currency = "AFN",
}) {
  console.log("🔥 AZI GREEN PAYMENT RECEIPT RUNNING 🔥");

  const customerName = getCustomerName(customer);
  const phone = getCustomerPhone(customer);
  const amount = Number(payment.amount || 0);
  const balance = Number(remainingBalance || 0);
  const method = getPaymentMethod(payment);
  const date = getReceiptDate(payment);
  const time = getReceiptTime(payment);
  const money = getCurrency(currency);

  const companyLogo =
    company.logo_url ||
    company.shop_logo_url ||
    company.logo ||
    "";

  const amountText =
    money.code === "USD"
      ? `$${formatNumber(amount)}`
      : `${formatNumber(amount)} ${money.symbol}`;

  const balanceText =
    money.code === "USD"
      ? `${formatNumber(balance)} $`
      : `${formatNumber(balance)} ${money.symbol}`;

  const html = `
<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #effcf7;
  }

  body {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, "Segoe UI", "DejaVu Sans", Arial, sans-serif;
    color: #172033;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    padding: 55px 70px;
  }

  .receipt-green {
    width: 760px;
    min-height: 1085px;
    margin: 0 auto;
    background: #ffffff;
    border: 1.5px solid #14b879;
    border-radius: 34px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 22px 58px rgba(4, 119, 82, .28);
  }

  .green-header {
    min-height: 225px;
    padding: 32px 46px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 28px;
    color: #ffffff;
    background: linear-gradient(110deg, #07835f 0%, #009a68 52%, #10c875 100%);
    border-radius: 0 0 34px 34px;
    position: relative;
    overflow: hidden;
  }

  .green-header::after {
    content: "";
    position: absolute;
    right: -120px;
    bottom: -100px;
    width: 470px;
    height: 180px;
    border-radius: 50%;
    background: rgba(255,255,255,.07);
  }

  .header-copy {
    flex: 1;
    text-align: right;
    position: relative;
    z-index: 2;
  }

  .receipt-title {
    margin: 0;
    font-size: 45px;
    line-height: 1.35;
    font-weight: 900;
  }

  .receipt-subtitle {
    margin-top: 13px;
    font-size: 24px;
    line-height: 1.7;
    font-weight: 600;
    color: #eafff5;
  }

  .header-logo-wrap {
    width: 132px;
    min-height: 136px;
    flex: 0 0 132px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 2;
  }

  .header-logo {
    width: 102px;
    height: 102px;
    object-fit: contain;
  }

  .logo-fallback {
    font-family: Arial, sans-serif;
    font-size: 42px;
    font-weight: 900;
    color: #ffffff;
  }

  .logo-name {
    margin-top: 4px;
    font-size: 20px;
    font-weight: 900;
    color: #ffffff;
    text-align: center;
  }

  .body {
    padding: 24px 28px 0;
  }

  .customer-card {
    min-height: 110px;
    padding: 24px 30px;
    border: 1.5px solid #d9ece4;
    border-radius: 25px;
    background: #fbfefd;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  .customer-info {
    flex: 1;
    text-align: right;
  }

  .label {
    color: #657186;
    font-size: 19px;
    font-weight: 700;
  }

  .customer-name {
    margin-top: 4px;
    color: #101827;
    font-size: 35px;
    line-height: 1.35;
    font-weight: 900;
  }

  .phone {
    margin-top: 5px;
    direction: ltr;
    text-align: right;
    color: #647084;
    font: 700 22px Arial, sans-serif;
  }

  .customer-pill {
    flex: 0 0 auto;
    padding: 13px 27px;
    border-radius: 999px;
    background: #ddfaec;
    color: #07865e;
    font-size: 22px;
    font-weight: 900;
  }

  .amount-card {
    margin-top: 22px;
    min-height: 178px;
    padding: 28px 28px 24px;
    border: 2px solid #0fc276;
    border-radius: 28px;
    background: linear-gradient(135deg, #effff7 0%, #dcfbed 100%);
    text-align: center;
  }

  .amount-label {
    color: #07885f;
    font-size: 27px;
    font-weight: 900;
  }

  .amount {
    margin-top: 8px;
    direction: ltr;
    color: #07885f;
    font: 900 70px/1.2 Arial, sans-serif;
  }

  .amount-note {
    margin-top: 9px;
    color: #667287;
    font-size: 19px;
    font-weight: 600;
  }

  .detail-grid {
    margin-top: 22px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }

  .detail-card {
    min-height: 110px;
    padding: 22px 12px;
    border: 1.5px solid #d9ece4;
    border-radius: 23px;
    background: #fbfefd;
    text-align: center;
  }

  .detail-label {
    color: #697489;
    font-size: 19px;
    font-weight: 700;
  }

  .detail-value {
    margin-top: 13px;
    color: #101827;
    font-size: 24px;
    line-height: 1.4;
    font-weight: 900;
  }

  .detail-value.ltr {
    direction: ltr;
    font-family: Arial, sans-serif;
  }

  .balance-card {
    margin-top: 22px;
    min-height: 108px;
    padding: 25px 34px;
    border: 2px solid #0fc276;
    border-radius: 27px;
    background: linear-gradient(135deg, #f0fff8 0%, #e1f9ed 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .balance-label {
    color: #657186;
    font-size: 22px;
    font-weight: 800;
  }

  .balance-value {
    direction: ltr;
    color: #07885f;
    font: 900 43px/1.25 Arial, sans-serif;
  }

  .auto-note {
    padding: 24px 30px 22px;
    text-align: center;
    color: #667287;
    font-size: 18px;
    line-height: 1.7;
    font-weight: 600;
  }

  .green-footer {
    min-height: 98px;
    padding: 20px 34px;
    background: linear-gradient(110deg, #07835f 0%, #009a68 52%, #10c875 100%);
    color: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    direction: rtl;
  }

  .footer-name {
    font-size: 25px;
    line-height: 1.45;
    font-weight: 900;
  }

  .footer-address {
    margin-top: 4px;
    font-size: 17px;
    line-height: 1.5;
    font-weight: 700;
  }


  /* ===== Official Pashto report typography ===== */
  body {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, "Segoe UI", "DejaVu Sans", Arial, sans-serif;
  }

  h1, h2, h3,
  .receipt-title,
  .customer-name,
  .amount-label,
  .detail-label,
  .balance-label,
  .footer-name,
  .weekly-company-name,
  .head-title h1,
  .panel-title,
  .person-label,
  .summary-label,
  .note-title,
  .thanks,
  .shop,
  .title h1,
  .section-title,
  .clabel,
  .heading,
  .fbrand,
  .strong {
    font-family: "Amiri", "Noto Naskh Arabic", "Noto Sans Arabic", serif !important;
    font-weight: 700 !important;
    line-height: 1.55 !important;
    letter-spacing: 0 !important;
    word-spacing: normal !important;
  }

  p,
  .small-label,
  .success-text,
  .auto-note,
  .footer-address,
  .head-title p,
  .person-value:not(.ltr),
  .note-text,
  .small,
  .note,
  .sign,
  th,
  td {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, "Segoe UI", "DejaVu Sans", Arial, sans-serif;
    letter-spacing: 0 !important;
    word-spacing: normal !important;
  }

  /* Keep all numbers exactly as Latin digits: 434 / 25,000 / 078... */
  .latin-number,
  .phone,
  .amount,
  .balance-value,
  .detail-value.ltr,
  .footer-date,
  .meta-value,
  .person-value.ltr,
  .summary-value,
  .summary-currency,
  .ltr,
  .cvalue,
  .currency,
  .fdate {
    font-family: sans-serif !important;
    direction: ltr !important;
    unicode-bidi: isolate !important;
    font-variant-numeric: normal !important;
    font-feature-settings: normal !important;
    font-synthesis: auto !important;
    letter-spacing: 0 !important;
  }



  /* ===== Balanced official Pashto typography =====
     Keep the previous report sizes, make Pashto text heavier,
     and make section headers look like bold H2 headings. */
  body {
    font-weight: 600;
  }

  p,
  .small-label,
  .success-text,
  .auto-note,
  .footer-address,
  .head-title p,
  .person-value:not(.ltr),
  .note-text,
  .small,
  .note,
  .sign,
  th,
  td {
    font-weight: 600 !important;
  }

  h1,
  .receipt-title,
  .head-title h1,
  .title h1 {
    font-weight: 800 !important;
  }

  h2,
  h3,
  .panel-title,
  .section-title,
  .heading,
  .amount-label,
  .detail-label,
  .balance-label,
  .person-label,
  .summary-label,
  .note-title,
  .clabel {
    font-size: 28px !important;
    font-weight: 800 !important;
    line-height: 1.6 !important;
  }

  .customer-name,
  .weekly-company-name,
  .footer-name,
  .shop,
  .fbrand,
  .strong,
  .thanks {
    font-weight: 800 !important;
  }



  /* ===== FINAL OVERRIDE: very large titles/footer + smaller weekly note ===== */
  .receipt-title,
  .head-title h1,
  .title h1 {
    font-size: 62px !important;
    font-weight: 900 !important;
    line-height: 1.35 !important;
  }

  .receipt-subtitle,
  .head-title p {
    font-size: 26px !important;
    font-weight: 700 !important;
    line-height: 1.6 !important;
  }

  .shop,
  .weekly-company-name,
  .customer-name,
  .strong {
    font-size: 28px !important;
    font-weight: 900 !important;
    line-height: 1.55 !important;
  }

  .panel-title,
  .section-title,
  .heading,
  .amount-label,
  .detail-label,
  .balance-label,
  .person-label,
  .summary-label,
  .note-title,
  .clabel {
    font-size: 34px !important;
    font-weight: 900 !important;
    line-height: 1.5 !important;
  }

  .footer-name,
  .fbrand,
  .footer-brand,
  .footer-brand div:first-child {
    font-size: 40px !important;
    font-weight: 900 !important;
    line-height: 1.45 !important;
  }

  .footer-address,
  .address,
  .footer-brand div:last-child {
    font-size: 24px !important;
    font-weight: 800 !important;
    line-height: 1.6 !important;
  }

  /* user asked: text above weekly footer should be a bit smaller */
  .weekly-reference .note-card,
  .weekly-report .note-card {
    padding-top: 18px !important;
    padding-bottom: 18px !important;
  }

  .weekly-reference .note-title,
  .weekly-report .note-title {
    font-size: 24px !important;
    font-weight: 800 !important;
  }

  .weekly-reference .note-text,
  .weekly-report .note-text {
    font-size: 18px !important;
    font-weight: 600 !important;
    line-height: 1.65 !important;
  }

  .weekly-reference .thanks,
  .weekly-report .thanks {
    font-size: 22px !important;
    font-weight: 800 !important;
  }



  /* ===== WEEKLY TITLE BOLDER/BIGGER ===== */
  .weekly-reference .head-title h1,
  .weekly-report .head-title h1 {
    font-size: 68px !important;
    font-weight: 900 !important;
    line-height: 1.32 !important;
  }

  .weekly-reference .head-title p,
  .weekly-report .head-title p {
    font-size: 28px !important;
    font-weight: 800 !important;
    line-height: 1.55 !important;
  }



  /* ===== WEEKLY FOOTER SMALLER SO NOTE TEXT SHOWS ===== */
  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    height: 104px !important;
    bottom: 10px !important;
    padding: 6px 16px 2px !important;
    line-height: 1.32 !important;
  }

  .weekly-reference .footer-brand div:first-child,
  .weekly-report .footer-brand div:first-child {
    font-size: 32px !important;
    font-weight: 900 !important;
    line-height: 1.35 !important;
  }

  .weekly-reference .footer-brand div:last-child,
  .weekly-report .footer-brand div:last-child {
    font-size: 18px !important;
    font-weight: 700 !important;
    margin-top: 2px !important;
    line-height: 1.45 !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    margin-bottom: 12px !important;
  }



  /* ===== FINAL WEEKLY REPORT FIX: visible note, bigger title, fresher borders ===== */
  .weekly-reference .head-title h1,
  .weekly-report .head-title h1 {
    font-size: 74px !important;
    font-weight: 900 !important;
    line-height: 1.28 !important;
    color: #064f8d !important;
  }

  .weekly-reference .head-title p,
  .weekly-report .head-title p {
    font-size: 30px !important;
    font-weight: 800 !important;
    line-height: 1.5 !important;
  }

  .weekly-reference .meta-card,
  .weekly-report .meta-card,
  .weekly-reference .panel,
  .weekly-report .panel {
    border-color: #9fc8ea !important;
    box-shadow: 0 10px 24px rgba(7, 94, 178, 0.08) !important;
  }

  .weekly-reference .panel-title,
  .weekly-report .panel-title {
    border-bottom: 2px solid rgba(255,255,255,0.16) !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    min-height: 150px !important;
    margin-top: 34px !important;
    margin-bottom: 18px !important;
    padding: 18px 40px 12px !important;
    border: 3px solid #3192d4 !important;
    border-radius: 24px !important;
    box-shadow: 0 10px 24px rgba(49, 146, 212, 0.10) !important;
    background: linear-gradient(180deg, #ffffff 0%, #fbfeff 100%) !important;
  }

  .weekly-reference .note-title,
  .weekly-report .note-title {
    font-size: 25px !important;
    font-weight: 900 !important;
  }

  .weekly-reference .note-text,
  .weekly-report .note-text {
    margin-top: 12px !important;
    font-size: 20px !important;
    font-weight: 700 !important;
    line-height: 1.7 !important;
  }

  .weekly-reference .note-line,
  .weekly-report .note-line {
    margin-top: 16px !important;
  }

  .weekly-reference .thanks,
  .weekly-report .thanks {
    margin-top: 8px !important;
    font-size: 21px !important;
    font-weight: 800 !important;
  }

  .weekly-reference .bottom-purple,
  .weekly-report .bottom-purple {
    bottom: 126px !important;
    height: 58px !important;
  }

  .weekly-reference .bottom-blue,
  .weekly-report .bottom-blue {
    height: 172px !important;
  }

  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    height: 88px !important;
    bottom: 8px !important;
    padding: 4px 16px 2px !important;
    line-height: 1.28 !important;
  }

  .weekly-reference .footer-brand div:first-child,
  .weekly-report .footer-brand div:first-child {
    font-size: 30px !important;
    font-weight: 900 !important;
    line-height: 1.32 !important;
  }

  .weekly-reference .footer-brand div:last-child,
  .weekly-report .footer-brand div:last-child {
    font-size: 17px !important;
    font-weight: 700 !important;
    margin-top: 1px !important;
    line-height: 1.35 !important;
  }



  /* ===== RECEIPT REAL SMALL CARD INSIDE A FULL IMAGE CANVAS ===== */
  body {
    padding: 0 !important;
    background: #eaf9f2 !important;
  }

  .receipt-canvas {
    width: 900px;
    height: 1250px;
    padding: 0 !important;
    background: linear-gradient(145deg, #f3fff9 0%, #e7f8f0 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .receipt-canvas .receipt-green {
    width: 760px !important;
    min-height: 1085px !important;
    margin: 0 auto !important;
    border: 4px solid #0db36e !important;
    border-radius: 42px !important;
    box-shadow:
      0 24px 46px rgba(5, 126, 81, 0.24),
      0 0 0 10px rgba(16, 185, 112, 0.08) !important;
    transform: scale(0.96);
    transform-origin: center center;
    overflow: hidden !important;
  }



  /* ===== WEEKLY REPORT SOFTER BORDER + MORE EVEN SPACING ===== */
  .weekly-reference,
  .weekly-report {
    padding: 128px 84px 126px !important;
    border: 2px solid #b9d9f0 !important;
    border-radius: 34px !important;
    box-shadow: 0 12px 28px rgba(8, 105, 180, 0.08) !important;
    background: linear-gradient(180deg, #ffffff 0%, #fcfeff 100%) !important;
  }

  .weekly-reference .report-head,
  .weekly-report .report-head {
    margin-bottom: 28px !important;
  }

  .weekly-reference .meta-card,
  .weekly-report .meta-card,
  .weekly-reference .panel,
  .weekly-report .panel,
  .weekly-reference .note-card,
  .weekly-report .note-card {
    border-width: 2px !important;
    border-radius: 22px !important;
  }

  .weekly-reference .person-panel,
  .weekly-report .person-panel {
    margin-top: 8px !important;
  }

  .weekly-reference .account-panel,
  .weekly-report .account-panel {
    margin-top: 22px !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    margin-top: 28px !important;
    margin-bottom: 18px !important;
    padding: 18px 38px 14px !important;
    border-color: #57a8de !important;
  }



  /* ===== WEEKLY REPORT MORE MARGIN + ROUNDER/FRESHER BORDERS ===== */
  .weekly-reference,
  .weekly-report {
    padding: 140px 98px 138px !important;
    border: 2px solid #c7e2f4 !important;
    border-radius: 40px !important;
    box-shadow: 0 14px 30px rgba(8, 105, 180, 0.07) !important;
    background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%) !important;
  }

  .weekly-reference .meta-card,
  .weekly-report .meta-card,
  .weekly-reference .panel,
  .weekly-report .panel,
  .weekly-reference .note-card,
  .weekly-report .note-card,
  .weekly-reference .summary-card,
  .weekly-report .summary-card {
    border-radius: 26px !important;
    border-width: 2px !important;
    box-shadow: 0 8px 18px rgba(49, 146, 212, 0.06) !important;
  }

  .weekly-reference .meta-card,
  .weekly-report .meta-card,
  .weekly-reference .panel,
  .weekly-report .panel {
    border-color: #b8d8ee !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    border-color: #66b2e3 !important;
    margin-top: 32px !important;
    margin-bottom: 22px !important;
    padding: 20px 40px 16px !important;
  }

  .weekly-reference .summary-card,
  .weekly-report .summary-card {
    border-color: rgba(173, 211, 236, 0.95) !important;
  }



  /* ===== WEEKLY NOTE TEXT SLIGHTLY BIGGER ===== */
  .weekly-reference .note-text,
  .weekly-report .note-text {
    font-size: 23px !important;
    font-weight: 800 !important;
    line-height: 1.7 !important;
  }



  /* ===== FINAL USER FIX: clearer weekly border + small equal spacing around receipt ===== */
  .weekly-reference,
  .weekly-report {
    border: 3px solid #9fd0ec !important;
    border-radius: 42px !important;
    box-shadow:
      0 16px 32px rgba(8, 105, 180, 0.08),
      0 0 0 1px rgba(159, 208, 236, 0.65) inset !important;
  }

  .receipt-canvas {
    padding: 28px !important;
    box-sizing: border-box !important;
  }

  .receipt-canvas .receipt-green {
    border-radius: 44px !important;
    transform: scale(0.94) !important;
    transform-origin: center center !important;
  }



  /* ===== FINAL WEEKLY FOOTER TUNE: slightly shorter footer, slightly bigger text ===== */
  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    height: 82px !important;
    bottom: 8px !important;
    padding: 4px 16px 2px !important;
    line-height: 1.24 !important;
  }

  .weekly-reference .footer-brand div:first-child,
  .weekly-report .footer-brand div:first-child {
    font-size: 32px !important;
    font-weight: 900 !important;
    line-height: 1.28 !important;
  }

  .weekly-reference .footer-brand div:last-child,
  .weekly-report .footer-brand div:last-child {
    font-size: 19px !important;
    font-weight: 800 !important;
    margin-top: 2px !important;
    line-height: 1.35 !important;
  }

  .weekly-reference .bottom-blue,
  .weekly-report .bottom-blue {
    height: 166px !important;
  }

  .weekly-reference .bottom-purple,
  .weekly-report .bottom-purple {
    bottom: 118px !important;
    height: 54px !important;
  }



  /* ===== FINAL WEEKLY IMAGE SIZE + SHADOW + EQUAL SPACING ===== */
  body {
    width: 1080px !important;
    height: 1440px !important;
    padding: 26px !important;
    background: linear-gradient(180deg, #f8fcff 0%, #f3f9fe 100%) !important;
  }

  .weekly-reference,
  .weekly-report {
    width: 100% !important;
    height: 100% !important;
    padding: 132px 92px 128px !important;
    border: 3px solid #9fd0ec !important;
    border-radius: 40px !important;
    box-shadow: 0 20px 40px rgba(18, 89, 158, 0.12) !important;
    overflow: hidden !important;
  }

  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    left: 24px !important;
    right: 24px !important;
    border-radius: 24px 24px 18px 18px !important;
  }



  /* ===== FINAL WEEKLY FOOTER READABILITY FIX ===== */
  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    height: 74px !important;
    bottom: 8px !important;
    padding: 2px 14px 1px !important;
    line-height: 1.18 !important;
  }

  .weekly-reference .footer-brand div:first-child,
  .weekly-report .footer-brand div:first-child {
    font-size: 34px !important;
    font-weight: 900 !important;
    line-height: 1.18 !important;
  }

  .weekly-reference .footer-brand div:last-child,
  .weekly-report .footer-brand div:last-child {
    font-size: 20px !important;
    font-weight: 800 !important;
    margin-top: 1px !important;
    line-height: 1.22 !important;
  }

  .weekly-reference .bottom-blue,
  .weekly-report .bottom-blue {
    height: 158px !important;
  }

  .weekly-reference .bottom-purple,
  .weekly-report .bottom-purple {
    bottom: 108px !important;
    height: 50px !important;
  }



  /* ===== FINAL RECEIPT: RESTORE PREVIOUS WHATSAPP SIZE + LATIN DIGITS =====
     Keep the full pale canvas around the green receipt card, matching the
     previous WhatsApp receipt proportions. Use a dedicated Latin web font
     for all numeric fields so Hostinger Chromium renders 0-9 reliably. */
  body {
    width: auto !important;
    height: auto !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #eaf9f2 !important;
  }

  .receipt-canvas {
    width: 900px !important;
    height: 1250px !important;
    padding: 28px !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    background: linear-gradient(145deg, #f3fff9 0%, #e7f8f0 100%) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: hidden !important;
  }

  .receipt-canvas .receipt-green {
    width: 760px !important;
    min-height: 1085px !important;
    margin: 0 auto !important;
    border: 4px solid #0db36e !important;
    border-radius: 44px !important;
    box-shadow:
      0 24px 46px rgba(5, 126, 81, 0.24),
      0 0 0 10px rgba(16, 185, 112, 0.08) !important;
    transform: scale(0.94) !important;
    transform-origin: center center !important;
    overflow: hidden !important;
  }

  .latin-number,
  .phone,
  .amount,
  .balance-value,
  .detail-value.ltr,
  .footer-date,
  .meta-value,
  .person-value.ltr,
  .summary-value,
  .summary-currency,
  .ltr,
  .cvalue,
  .currency,
  .fdate {
    font-family: "Roboto", "DejaVu Sans", "Liberation Sans", Arial, sans-serif !important;
    font-synthesis: none !important;
    font-variant-numeric: lining-nums tabular-nums !important;
    font-feature-settings: "lnum" 1, "tnum" 1 !important;
    direction: ltr !important;
    unicode-bidi: isolate !important;
    letter-spacing: 0 !important;
  }
</style>
</head>
<body>

<div id="receipt" class="receipt-canvas">

<div class="receipt-green">

  <header class="green-header">
    <div class="header-logo-wrap">
      ${
        companyLogo
          ? `<img class="header-logo" src="${escapeHtml(companyLogo)}" alt="Logo" />`
          : `<div class="logo-fallback">N</div>`
      }
      <div class="logo-name">نیازی پلورنځی</div>
    </div>

    <div class="header-copy">
      <h1 class="receipt-title">د پیسو رسید</h1>
      <div class="receipt-subtitle">ستاسو د پیسو ترلاسه کېدو رسمي رسید</div>
    </div>
  </header>

  <main class="body">

    <section class="customer-card">
      <div class="customer-info">
        <div class="label">د مشتری نوم</div>
        <div class="customer-name">${escapeHtml(customerName)}</div>
        <div class="phone latin-number" lang="en" dir="ltr">${escapeHtml(toLatinDigits(phone))}</div>
      </div>
      <div class="customer-pill">مشتری</div>
    </section>

    <section class="amount-card">
      <div class="amount-label">وصول شوی مقدار</div>
      <div class="amount latin-number" lang="en" dir="ltr">${escapeHtml(toLatinDigits(amountText))}</div>
      <div class="amount-note">ستاسو د پیسو ترلاسه کېدو رسمي رسید</div>
    </section>

    <section class="detail-grid">
      <div class="detail-card">
        <div class="detail-label">طریقه</div>
        <div class="detail-value">${escapeHtml(method)}</div>
      </div>

      <div class="detail-card">
        <div class="detail-label">تاریخ</div>
        <div class="detail-value ltr latin-number" lang="en" dir="ltr">${escapeHtml(toLatinDigits(date))}</div>
      </div>

      <div class="detail-card">
        <div class="detail-label">وخت</div>
        <div class="detail-value ltr latin-number" lang="en" dir="ltr">${escapeHtml(toLatinDigits(time))}</div>
      </div>
    </section>

    <section class="balance-card">
      <div class="balance-label">اوسنی پاتې حساب</div>
      <div class="balance-value latin-number" lang="en" dir="ltr">${escapeHtml(toLatinDigits(balanceText))}</div>
    </section>

    <div class="auto-note">
      دا رسید د نیازی پلورنځی سیستم له لارې په اتومات ډول جوړ شوی دی
    </div>

  </main>

  <footer class="green-footer">
    <div class="footer-name">عمده فروشی فیض احمد و عزیزالله نیازی</div>
    <div class="footer-address">کابل، سرای احمدشاهی، دکان 174</div>
  </footer>

</div>

</div>

</body>
</html>
`;

  return htmlToPng(html, 900, 1250);
}


export async function createWeeklyDebtReportPng({
  company = {},
  customer = {},
  totalDebt = 0,
  totalPaid = 0,
  remainingBalance = 0,
  currency = "AFN",
  generatedAt = new Date(),
}) {
  console.log("📊 AZI HTML WEEKLY REPORT REFERENCE DESIGN RUNNING");

  const customerName = getCustomerName(customer);
  const money = getCurrency(currency);

  const companyName =
    company.company_name ||
    company.shop_name ||
    company.name ||
    "نیازی پلورنځی";

  const companyLogo =
    company.logo_url ||
    company.shop_logo_url ||
    company.logo ||
    "";

  const reportTitle = "د حساب اوونیز راپور";

  const currencyText = money.code === "USD" ? "USD" : money.symbol;

  const totalDebtText = toLatinDigits(formatNumber(totalDebt));
  const totalPaidText = toLatinDigits(formatNumber(totalPaid));
  const remainingText = toLatinDigits(formatNumber(remainingBalance));

  let reportDate = "—";

  try {
    const parsed = new Date(generatedAt);

    reportDate = toLatinDigits(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kabul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .format(parsed)
        .replace(/-/g, "/")
    );
  } catch {
    // Keep fallbacks.
  }

  const html = `
<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
  }

  body {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", "DejaVu Sans", Arial, sans-serif;
    color: #17324f;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Hostinger-safe weekly typography.
     The working payment receipt already loads these web fonts, so the weekly
     report uses the same remote Arabic font instead of relying on Linux system fonts. */
  .weekly-reference,
  .weekly-reference * {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", "DejaVu Sans", Arial, sans-serif;
  }

  .head-title h1,
  .panel-title,
  .summary-label,
  .note-title,
  .thanks,
  .footer-brand {
    font-family: "Amiri", "Noto Naskh Arabic", "Noto Sans Arabic", serif !important;
  }

  /* Latin digits/currency use Roboto loaded from the same Google Fonts request. */
  .weekly-latin {
    direction: ltr !important;
    unicode-bidi: isolate !important;
    font-family: "Roboto", "Noto Sans", "DejaVu Sans", Arial, sans-serif !important;
    font-variant-numeric: tabular-nums lining-nums !important;
    font-feature-settings: "tnum" 1, "lnum" 1 !important;
    font-synthesis: none !important;
    letter-spacing: 0 !important;
  }

  .weekly-reference {
    width: 1080px;
    height: 1440px;
    position: relative;
    overflow: hidden;
    background: #ffffff;
    padding: 122px 70px 118px;
  }

  /* Top geometric background from the supplied reference */
  .top-blue {
    position: absolute;
    top: -82px;
    right: -125px;
    width: 890px;
    height: 305px;
    background: linear-gradient(110deg,#22399d,#075bc7 54%,#04a9ec);
    clip-path: polygon(15% 0, 100% 0, 100% 62%, 63% 100%, 0 17%);
    z-index: 0;
  }

  .top-purple {
    position: absolute;
    top: -25px;
    right: -60px;
    width: 860px;
    height: 280px;
    background: #bf6db9;
    clip-path: polygon(11% 0, 100% 0, 100% 62%, 63% 100%, 0 16%);
    z-index: 0;
  }

  .top-blue-inner {
    position: absolute;
    top: -48px;
    right: -38px;
    width: 850px;
    height: 258px;
    background: linear-gradient(110deg,#22399d,#075bc7 54%,#04a9ec);
    clip-path: polygon(12% 0, 100% 0, 100% 61%, 63% 100%, 0 14%);
    z-index: 0;
  }

  .top-accent {
    position: absolute;
    top: 172px;
    right: 70px;
    width: 245px;
    height: 22px;
    background: #b66bb8;
    transform: rotate(-9deg);
    z-index: 1;
  }

  .report-head {
    position: relative;
    z-index: 2;
    width: 100%;
    min-height: 310px;
    direction: rtl;
  }

  .weekly-brand {
    display: none;
    position: absolute;
    top: -10px;
    right: 18px;
    width: 410px;
    min-height: 105px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 18px;
    direction: rtl;
    z-index: 4;
  }

  .weekly-logo-box {
    width: 88px;
    height: 88px;
    flex: 0 0 88px;
    border-radius: 22px;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 48, 120, .20);
  }

  .weekly-logo {
    width: 78px;
    height: 78px;
    object-fit: contain;
    border-radius: 16px;
  }

  .weekly-logo-fallback {
    color: #075ee8;
    font-family: Arial, sans-serif;
    font-size: 23px;
    font-weight: 900;
  }

  .weekly-company-name {
    max-width: 290px;
    color: #ffffff;
    font-size: 29px;
    line-height: 1.45;
    font-weight: 900;
    text-align: right;
    text-shadow: 0 2px 6px rgba(0,0,0,.14);
  }

  .head-title {
    position: absolute;
    top: 0;
    left: 20px;
    width: 560px;
    text-align: right;
  }

  .head-title h1 {
    margin: 0;
    color: #075a92;
    font-size: 48px;
    line-height: 1.35;
    font-weight: 900;
  }

  .head-title p {
    margin: 8px 0 0;
    color: #147a98;
    font-size: 27px;
    line-height: 1.6;
    font-weight: 800;
  }

  .title-line {
    position: absolute;
    top: 145px;
    left: 0;
    width: 465px;
    height: 2px;
    background: #1687b5;
  }

  .title-line::after {
    content: "";
    position: absolute;
    right: -5px;
    top: -4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #1687b5;
  }

  .meta-card {
    position: absolute;
    top: 150px;
    right: 8px;
    width: 392px;
    min-height: 150px;
    border: 2px solid #d0dce8;
    border-radius: 23px;
    background: #fbfdff;
    padding: 22px 30px;
    direction: rtl;
  }

  .meta-row {
    display: grid;
    grid-template-columns: 105px 1fr;
    align-items: center;
    min-height: 38px;
    gap: 10px;
  }

  .meta-label {
    color: #637087;
    font-size: 20px;
    font-weight: 800;
    text-align: right;
  }

  .meta-value {
    direction: ltr;
    text-align: left;
    color: #173c69;
    font-family: Arial, sans-serif;
    font-size: 20px;
    font-weight: 900;
  }

  .panel {
    position: relative;
    z-index: 2;
    width: 100%;
    border: 2px solid #cad9e8;
    border-radius: 25px;
    overflow: hidden;
    background: #ffffff;
  }

  .panel-title {
    height: 62px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(90deg, #0a559a 0%, #07437e 100%);
    color: #ffffff;
    font-size: 27px;
    font-weight: 900;
    text-align: center;
  }

  .person-panel {
    min-height: 170px;
  }

  .person-body {
    min-height: 108px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    padding: 18px 60px;
  }

  .person-block {
    text-align: center;
  }

  .person-label {
    color: #65748a;
    font-size: 19px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .person-value {
    color: #183f6f;
    font-size: 28px;
    font-weight: 900;
  }

  .person-value.ltr {
    direction: ltr;
    font-family: Arial, sans-serif;
  }

  .account-panel {
    margin-top: 48px;
    min-height: 390px;
  }

  .summary-grid {
    min-height: 326px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
    padding: 38px 28px 34px;
    direction: rtl;
  }

  .summary-card {
    min-height: 240px;
    border: 2px solid #d4dee9;
    border-radius: 24px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 18px 12px;
  }

  .summary-label {
    font-size: 24px;
    font-weight: 900;
    line-height: 1.5;
  }

  .summary-value {
    margin-top: 10px;
    direction: ltr;
    font-family: Arial, sans-serif;
    font-size: 48px;
    line-height: 1.15;
    font-weight: 900;
  }

  .summary-currency {
    margin-top: 6px;
    direction: ltr;
    font-family: Arial, sans-serif;
    font-size: 20px;
    font-weight: 900;
  }

  .summary-icon {
    margin-top: 16px;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
    font-size: 30px;
    font-weight: 900;
  }

  .remaining .summary-label,
  .remaining .summary-value,
  .remaining .summary-currency {
    color: #cc2027;
  }

  .remaining .summary-icon {
    color: #cc2027;
    background: #fde8e8;
  }

  .debt .summary-label,
  .debt .summary-value,
  .debt .summary-currency {
    color: #0871c8;
  }

  .debt .summary-icon {
    color: #0871c8;
    background: #e9f3ff;
  }

  .paid .summary-label,
  .paid .summary-value,
  .paid .summary-currency {
    color: #15925b;
  }

  .paid .summary-icon {
    color: #15925b;
    background: #e7f7ef;
  }

  .note-card {
    position: relative;
    z-index: 2;
    margin-top: 40px;
    min-height: 185px;
    border: 2px solid #268ac4;
    border-radius: 25px;
    background: #ffffff;
    padding: 26px 50px 18px;
    text-align: right;
    direction: rtl;
  }

  .note-title {
    color: #09699f;
    font-size: 24px;
    font-weight: 900;
  }

  .note-text {
    margin-top: 18px;
    color: #35485e;
    font-size: 23px;
    line-height: 1.75;
    font-weight: 700;
  }

  .note-line {
    margin-top: 25px;
    border-top: 2px dashed #d3dde7;
  }

  .thanks {
    margin-top: 10px;
    text-align: center;
    color: #176596;
    font-size: 23px;
    font-weight: 900;
  }

  .weekly-watermark {
    position: absolute;
    z-index: 1;
    left: 50%;
    top: 49%;
    width: 470px;
    height: 650px;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    opacity: .075;
  }

  .weekly-watermark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: grayscale(10%);
  }

  .report-head,
  .panel,
  .note-card {
    position: relative;
    z-index: 2;
  }

  /* Bottom geometric background from the supplied reference */
  /* Exact smooth footer from the reference:
     full blue base + curved top edge + thin purple rim */
  .bottom-purple {
    position: absolute;
    left: -3%;
    right: -3%;
    bottom: 156px;
    height: 78px;
    background: #c45ab6;
    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
    z-index: 2;
  }

  .bottom-blue {
    position: absolute;
    left: -3%;
    right: -3%;
    bottom: 0;
    height: 215px;
    background: linear-gradient(105deg,#24399e,#075bc7 52%,#05a9ec);
    border-radius: 50% 50% 0 0 / 28% 28% 0 0;
    z-index: 3;
    overflow: hidden;
  }

  .bottom-blue::before {
    content: "";
    position: absolute;
    left: -2%;
    right: -2%;
    top: -14px;
    height: 28px;
    background: #c45ab6;
    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
    z-index: 1;
  }

  .bottom-blue::after {
    content: "";
    position: absolute;
    right: -110px;
    bottom: -70px;
    width: 610px;
    height: 190px;
    background: rgba(0, 70, 190, .30);
    transform: rotate(-11deg);
    z-index: 0;
  }

  .footer-brand {
    position: absolute;
    z-index: 6;
    left: 35px;
    right: 35px;
    bottom: 18px;
    height: 132px;
    padding: 8px 20px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    direction: rtl;
    color: #ffffff;
    font-family: Tahoma, "Segoe UI", Arial, sans-serif;
    font-size: 36px;
    line-height: 1.42;
    font-weight: 900;
    text-shadow: 0 2px 5px rgba(0,0,0,.16);
  }

  .date-only-card {
    min-height: 82px;
    padding-top: 20px;
    padding-bottom: 20px;
  }

  .date-only-card .meta-row {
    min-height: 38px;
  }



  /* ===== FINAL WEEKLY HEADER + BIGGER PASHTO + SHORTER FOOTER =====
     Only the 7-day/weekly report is affected. Receipt and full report stay untouched. */

  /* Header geometry matched to the supplied blue/purple reference */
  .weekly-reference .top-purple {
    top: -34px !important;
    right: -78px !important;
    width: 900px !important;
    height: 276px !important;
    background: linear-gradient(110deg,#d59ace 0%,#c96bbd 100%) !important;
    clip-path: polygon(10% 0,100% 0,100% 60%,64% 100%,0 16%) !important;
  }

  .weekly-reference .top-blue {
    top: -72px !important;
    right: -112px !important;
    width: 915px !important;
    height: 294px !important;
    background: linear-gradient(112deg,#24379f 0%,#0c5fc7 54%,#08a9ea 100%) !important;
    clip-path: polygon(13% 0,100% 0,100% 61%,64% 94%,0 15%) !important;
  }

  .weekly-reference .top-blue-inner {
    top: -52px !important;
    right: -28px !important;
    width: 845px !important;
    height: 246px !important;
    background: linear-gradient(112deg,#25359d 0%,#0b63c9 56%,#0aa9e8 100%) !important;
    clip-path: polygon(13% 0,100% 0,100% 58%,65% 90%,0 12%) !important;
  }

  .weekly-reference .top-accent {
    top: 176px !important;
    right: 44px !important;
    width: 230px !important;
    height: 20px !important;
    background: linear-gradient(90deg,#d681cc 0%,#b85eb4 100%) !important;
    transform: rotate(-8deg) !important;
  }

  .weekly-reference .report-head {
    min-height: 330px !important;
  }

  .weekly-reference .head-title {
    top: 42px !important;
    left: 26px !important;
    width: 600px !important;
    text-align: right !important;
  }

  .weekly-reference .head-title h1 {
    font-size: 66px !important;
    line-height: 1.28 !important;
    font-weight: 900 !important;
    color: #0b638e !important;
  }

  .weekly-reference .head-title p {
    margin-top: 6px !important;
    font-size: 31px !important;
    line-height: 1.45 !important;
    font-weight: 800 !important;
    color: #147997 !important;
  }

  .weekly-reference .title-line {
    top: 196px !important;
    left: 0 !important;
    width: 505px !important;
    height: 3px !important;
  }

  .weekly-reference .title-line::after {
    width: 12px !important;
    height: 12px !important;
    top: -5px !important;
  }

  .weekly-reference .meta-card {
    top: 206px !important;
    right: 8px !important;
    min-height: 100px !important;
    padding: 15px 28px !important;
  }

  .weekly-reference .meta-row {
    min-height: 66px !important;
  }

  /* Slightly bigger Pashto text everywhere in the weekly report */
  .weekly-reference .meta-label {
    font-size: 24px !important;
    font-weight: 800 !important;
  }

  .weekly-reference .meta-value {
    font-size: 23px !important;
  }

  .weekly-reference .panel-title {
    height: 68px !important;
    font-size: 32px !important;
    font-weight: 900 !important;
  }

  .weekly-reference .person-label {
    font-size: 24px !important;
    font-weight: 800 !important;
  }

  .weekly-reference .person-value:not(.weekly-latin) {
    font-size: 33px !important;
    font-weight: 900 !important;
  }

  .weekly-reference .summary-label {
    font-size: 29px !important;
    line-height: 1.45 !important;
    font-weight: 900 !important;
  }

  .weekly-reference .summary-value {
    font-size: 52px !important;
    font-weight: 900 !important;
  }

  .weekly-reference .summary-currency {
    font-size: 22px !important;
    font-weight: 900 !important;
  }

  .weekly-reference .note-card {
    margin-top: 30px !important;
    min-height: 170px !important;
    padding: 20px 42px 14px !important;
  }

  .weekly-reference .note-title {
    font-size: 29px !important;
    font-weight: 900 !important;
  }

  .weekly-reference .note-text {
    margin-top: 10px !important;
    font-size: 26px !important;
    line-height: 1.62 !important;
    font-weight: 700 !important;
  }

  .weekly-reference .note-line {
    margin-top: 12px !important;
  }

  .weekly-reference .thanks {
    margin-top: 6px !important;
    font-size: 25px !important;
    font-weight: 900 !important;
  }

  /* Shorter footer so the note text remains fully visible */
  .weekly-reference .bottom-blue {
    height: 132px !important;
    border-radius: 50% 50% 0 0 / 32% 32% 0 0 !important;
  }

  .weekly-reference .bottom-blue::before {
    top: -9px !important;
    height: 18px !important;
  }

  .weekly-reference .bottom-blue::after {
    height: 125px !important;
    bottom: -48px !important;
  }

  .weekly-reference .bottom-purple {
    bottom: 92px !important;
    height: 42px !important;
  }

  .weekly-reference .footer-brand {
    left: 28px !important;
    right: 28px !important;
    bottom: 4px !important;
    height: 62px !important;
    padding: 1px 16px !important;
    line-height: 1.15 !important;
  }

  .weekly-reference .footer-brand div:first-child {
    font-size: 30px !important;
    line-height: 1.18 !important;
    font-weight: 900 !important;
  }

  .weekly-reference .footer-brand div:last-child {
    font-size: 18px !important;
    line-height: 1.2 !important;
    margin-top: 0 !important;
    font-weight: 700 !important;
  }

</style>
</head>

<body>
<div id="receipt" class="weekly-reference">

  ${
    companyLogo
      ? `<div class="weekly-watermark"><img src="${escapeHtml(companyLogo)}" alt="" /></div>`
      : ""
  }

  <div class="top-purple"></div>
  <div class="top-blue"></div>
  <div class="top-blue-inner"></div>
  <div class="top-accent"></div>

  <section class="report-head">

    <div class="head-title">
      <h1>${escapeHtml(reportTitle)}</h1>
      <p>د مشتری د حساب رسمي راپور</p>
    </div>

    <div class="title-line"></div>

    <div class="meta-card date-only-card">
      <div class="meta-row">
        <div class="meta-label">نېټه:</div>
        <div class="meta-value weekly-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(reportDate))}</div>
      </div>
    </div>
  </section>

  <section class="panel person-panel">
    <div class="panel-title">د شخص معلومات</div>
    <div class="person-body">
      <div class="person-block">
        <div class="person-label">نوم</div>
        <div class="person-value">${escapeHtml(customerName)}</div>
      </div>

      <div class="person-block">
        <div class="person-label">د حساب واحد</div>
        <div class="person-value ltr weekly-latin" lang="en" dir="ltr">${escapeHtml(currencyText)}</div>
      </div>
    </div>
  </section>

  <section class="panel account-panel">
    <div class="panel-title">د حساب لنډیز</div>

    <div class="summary-grid">
      <div class="summary-card remaining">
        <div class="summary-label">باقي قرض</div>
        <div class="summary-value weekly-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(remainingText))}</div>
        <div class="summary-currency weekly-latin" lang="en" dir="ltr">${escapeHtml(currencyText)}</div>
        <div class="summary-icon">◉</div>
      </div>

      <div class="summary-card debt">
        <div class="summary-label">ټول قرض</div>
        <div class="summary-value weekly-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(totalDebtText))}</div>
        <div class="summary-currency weekly-latin" lang="en" dir="ltr">${escapeHtml(currencyText)}</div>
        <div class="summary-icon">▣</div>
      </div>

      <div class="summary-card paid">
        <div class="summary-label">وصول شوي</div>
        <div class="summary-value weekly-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(totalPaidText))}</div>
        <div class="summary-currency weekly-latin" lang="en" dir="ltr">${escapeHtml(currencyText)}</div>
        <div class="summary-icon">▱</div>
      </div>
    </div>
  </section>

  <section class="note-card">
    <div class="note-title">یادونه</div>
    <div class="note-text">
      مهرباني وکړئ د فرصت په صورت کې خپل حساب تصفیه کړئ.
    </div>
    <div class="note-line"></div>
    <div class="thanks">مننه</div>
  </section>

  <div class="bottom-purple"></div>
  <div class="bottom-blue"></div>

  <div class="footer-brand">
    <div style="font-size:36px;font-weight:900">عمده فروشی فیض احمد و عزیزالله نیازی</div>
    <div style="font-size:21px;font-weight:700;margin-top:4px">کابل، سرای احمدشاهی، دکان 174</div>
  </div>

</div>

</div>

</div>

</div>

</div>
</body>
</html>
`;

  return htmlToPng(html, 1080, 1440);
}


/* =========================================================
   FULL ACCOUNT REPORT - 3 WEEK PDF
   Uses the same live company Settings branding as other reports.
========================================================= */

export async function createFullAccountReportPdf({
  company = {},
  customer = {},
  transactions = [],
  totalDebt = 0,
  totalPaid = 0,
  remainingBalance = 0,
  currency = "AFN",
  generatedAt = new Date(),
}) {
  const customerName = getCustomerName(customer);
  const money = getCurrency(currency);

  const companyName =
    company.company_name ||
    company.shop_name ||
    company.name ||
    "نیازی پلورنځی";

  const companyLogo =
    company.logo_url ||
    company.shop_logo_url ||
    company.logo ||
    "";

  const companyAddress =
    company.address ||
    company.shop_address ||
    company.company_address ||
    "";

  const reportTitle =
    company.full_report_title ||
    "بشپړ حساب راپور";

  let reportDate = "—";
  try {
    reportDate = formatJalaliDate(generatedAt);
  } catch {}

  const currencyText = money.code === "USD" ? "USD" : money.symbol;

  const paymentRows = (transactions || []).filter((item) => {
    const credit = Number(item.credit || 0);
    const type = String(
      item.type ||
      item.transaction_type ||
      item.kind ||
      ""
    ).trim().toLowerCase();

    return (
      credit > 0 ||
      type === "payment" ||
      type === "receipt" ||
      type === "credit" ||
      type === "وصولي" ||
      type === "وصول"
    );
  });

  const debtRows = (transactions || []).filter((item) => {
    const debit = Number(item.debit || 0);
    return debit > 0;
  });

  const paymentTableRows = paymentRows.map((item) => {
    const date = escapeHtml(
      formatJalaliDate(
        item.date ||
        item.payment_date ||
        item.created_at ||
        "—"
      )
    );

    const amount = Number(item.credit || item.amount || 0);

    const methodRaw = String(
      item.payment_method ||
      item.method ||
      item.payment_type ||
      ""
    ).trim().toLowerCase();

    const hawalaNumber =
      item.hawala_number ||
      item.hawala_no ||
      item.transfer_number ||
      item.transfer_no ||
      item.reference_number ||
      item.reference_no ||
      item.receipt_number ||
      item.receipt_no ||
      "";

    const isCash =
      methodRaw === "cash" ||
      methodRaw === "نقد" ||
      methodRaw === "نقده" ||
      (!hawalaNumber && !methodRaw);

    const method = isCash ? "نقده" : "حواله";

    const reference = isCash
      ? "—"
      : hawalaNumber
        ? String(hawalaNumber)
        : "—";

    return `
      <tr>
        <td class="date-cell full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(date))}</td>
        <td class="receipt-amount full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(formatNumber(amount)))}</td>
        <td class="receipt-method">${escapeHtml(method)}</td>
        <td class="receipt-reference full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(reference))}</td>
      </tr>
    `;
  }).join("");

  const debtTableRows = debtRows.map((item) => {
    const date = escapeHtml(
      formatJalaliDate(
        item.date ||
        item.invoice_date ||
        item.created_at ||
        "—"
      )
    );

    const amount = Number(item.debit || item.amount || 0);

    const billNumber =
      item.invoice_number ||
      item.invoice_no ||
      item.bill_number ||
      item.bill_no ||
      item.number ||
      item.reference_number ||
      item.reference_no ||
      "—";

    return `
      <tr>
        <td class="bill-number full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(billNumber))}</td>
        <td class="date-cell full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(date))}</td>
        <td class="bill-amount full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(formatNumber(amount)))}</td>
      </tr>
    `;
  }).join("");

  const reportPayments =
    Array.isArray(customer?.payments) ? customer.payments : [];

  const reportBalances =
    Array.isArray(customer?.balances) ? customer.balances : [];

  const paymentRowsHtml = reportPayments.slice(0, 10).map((row) => `
    <tr>
      <td>${escapeHtml(row.payment_date_shamsi || row.date_shamsi || row.payment_date || "—")}</td>
      <td class="red">${escapeHtml(formatNumber(row.amount || 0))}</td>
      <td class="red">${escapeHtml(row.method === "hawala" || row.method === "bank" ? "حواله" : "نقده")}</td>
      <td class="red">${escapeHtml(row.hawala_number || "—")}</td>
    </tr>`).join("");

  const balanceRowsHtml = reportBalances.slice(0, 6).map((row) => `
    <tr>
      <td class="blue">${escapeHtml(row.bill_number || row.invoice_number || "—")}</td>
      <td>${escapeHtml(row.balance_date_shamsi || row.date_shamsi || row.balance_date || "—")}</td>
      <td class="blue">${escapeHtml(formatNumber(row.amount || 0))}</td>
    </tr>`).join("");

  const html = `
<!DOCTYPE html><html lang="ps" dir="rtl"><head><meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Roboto:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:"Noto Naskh Arabic","Noto Sans Arabic",Tahoma,"Segoe UI","DejaVu Sans",Arial,sans-serif;color:#102e62}
.page{width:100%;min-height:1120px;position:relative;overflow:hidden;background:#fff;padding-bottom:125px}
.header{height:145px;position:relative;padding:25px 105px 20px 45px;text-align:center;color:#fff;background:linear-gradient(110deg,#22399d,#075bc7 54%,#04a9ec)}
.header:after{content:"";position:absolute;left:-3%;right:-3%;bottom:-15px;height:28px;background:#c45ab6;border-radius:0 0 50% 50%/0 0 100% 100%}
.header:before{content:"";position:absolute;z-index:2;left:-3%;right:-3%;bottom:-8px;height:22px;background:#fff;border-radius:0 0 50% 50%/0 0 100% 100%}
.shop{position:relative;z-index:3;font-size:30px;font-weight:900}.address{position:relative;z-index:3;margin-top:6px;font-size:18px;font-weight:700}
.logo{position:absolute;z-index:4;right:22px;top:20px;width:76px;height:76px;object-fit:contain;background:transparent;padding:0;border:0;border-radius:0}
.title{text-align:center;margin-top:28px}.title h1{margin:0;font-size:34px;font-weight:900;color:#0d397b}.line{width:240px;height:2px;background:#0c82d9;margin:7px auto 0}
.datebox{width:350px;height:65px;margin:8px 28px 18px auto;border:1.5px solid #b9d5f5;border-radius:17px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;font-size:18px;font-weight:800}.ltr{direction:ltr;unicode-bidi:isolate;font-family:"DejaVu Sans","Liberation Sans","Noto Sans",Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1,"lnum" 1}
.section{margin:0 28px 15px;border:1.5px solid #b7d7f6;border-radius:16px;overflow:hidden}.section-title{height:47px;background:linear-gradient(90deg,#087bc8,#07519a);color:#fff;display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:900}
.info{display:grid;grid-template-columns:repeat(3,1fr);min-height:72px}.cell{text-align:center;padding:11px;border-left:1px solid #c8def4}.cell:last-child{border-left:0}.small{font-size:14px;font-weight:700}.strong{margin-top:4px;font-size:21px;font-weight:900}
.summary{margin:0 28px 16px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{min-height:124px;border-radius:17px;padding:15px 10px;text-align:center}.green{border:1.5px solid #50d6a5;background:#f1fff8}.bluecard{border:1.5px solid #75bdf2;background:#f1f9ff}.redcard{border:1.5px solid #ef8ca0;background:#fff5f7}.clabel{font-size:20px;font-weight:900}.cvalue{margin-top:5px;font:900 38px Arial,sans-serif;direction:ltr}.currency{margin-top:4px;font:800 16px Arial,sans-serif}.green *{color:#07935f}.bluecard *{color:#0876cf}.redcard *{color:#e61941}
.block{margin:0 28px 15px}.heading{text-align:right;color:#0876ce;font-size:22px;font-weight:900;margin:0 0 6px}
table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #a9cef4;border-radius:7px;overflow:hidden;table-layout:fixed}th,td{padding:6px 7px;text-align:center;border-left:1px solid #a9cef4;border-bottom:1px solid #a9cef4;font-size:13px}th:last-child,td:last-child{border-left:0}tr:last-child td{border-bottom:0}th{background:linear-gradient(#edf6ff,#dcecff);font-size:14px;font-weight:900}td{font-weight:700}.red{color:#f01826}.blue{color:#0878d5;font-weight:900}
.watermark{position:absolute;z-index:0;left:50%;top:53%;transform:translate(-50%,-50%);width:340px;height:500px;opacity:.07}.watermark img{width:100%;height:100%;object-fit:contain}.content{position:relative;z-index:2}
.signs{margin:32px 28px 18px;display:grid;grid-template-columns:repeat(3,1fr);gap:38px}.sign{padding-top:14px;border-top:1.5px solid #7296c5;text-align:center;font-size:15px;font-weight:900}
.note{margin:0 28px 20px;min-height:65px;border:1.5px solid #1688e0;border-radius:15px;display:flex;align-items:center;justify-content:center;padding:12px 20px;text-align:center;font-size:16px;font-weight:700}
.purple{position:absolute;left:-3%;right:-3%;bottom:91px;height:45px;background:#c45ab6;border-radius:50% 50% 0 0/100% 100% 0 0;z-index:3}.footer{position:absolute;left:-3%;right:-3%;bottom:0;height:115px;background:linear-gradient(105deg,#24399e,#075bc7 52%,#05a9ec);border-radius:50% 50% 0 0/25% 25% 0 0;z-index:4}.fdate{position:absolute;z-index:6;left:35px;bottom:29px;color:#fff;font:700 15px Arial}.fbrand{position:absolute;z-index:6;right:40px;bottom:28px;color:#fff;font-size:15px;font-weight:700}


  /* ===== Official Pashto report typography ===== */
  body {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, "Segoe UI", "DejaVu Sans", Arial, sans-serif;
  }

  h1, h2, h3,
  .receipt-title,
  .customer-name,
  .amount-label,
  .detail-label,
  .balance-label,
  .footer-name,
  .weekly-company-name,
  .head-title h1,
  .panel-title,
  .person-label,
  .summary-label,
  .note-title,
  .thanks,
  .shop,
  .title h1,
  .section-title,
  .clabel,
  .heading,
  .fbrand,
  .strong {
    font-family: "Amiri", "Noto Naskh Arabic", "Noto Sans Arabic", serif !important;
    font-weight: 700 !important;
    line-height: 1.55 !important;
    letter-spacing: 0 !important;
    word-spacing: normal !important;
  }

  p,
  .small-label,
  .success-text,
  .auto-note,
  .footer-address,
  .head-title p,
  .person-value:not(.ltr),
  .note-text,
  .small,
  .note,
  .sign,
  th,
  td {
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, "Segoe UI", "DejaVu Sans", Arial, sans-serif;
    letter-spacing: 0 !important;
    word-spacing: normal !important;
  }

  /* Keep all numbers exactly as Latin digits: 434 / 25,000 / 078... */
  .latin-number,
  .phone,
  .amount,
  .balance-value,
  .detail-value.ltr,
  .footer-date,
  .meta-value,
  .person-value.ltr,
  .summary-value,
  .summary-currency,
  .ltr,
  .cvalue,
  .currency,
  .fdate {
    font-family: sans-serif !important;
    direction: ltr !important;
    unicode-bidi: isolate !important;
    font-variant-numeric: normal !important;
    font-feature-settings: normal !important;
    font-synthesis: auto !important;
    letter-spacing: 0 !important;
  }



  /* ===== Balanced official Pashto typography =====
     Keep the previous report sizes, make Pashto text heavier,
     and make section headers look like bold H2 headings. */
  body {
    font-weight: 600;
  }

  p,
  .small-label,
  .success-text,
  .auto-note,
  .footer-address,
  .head-title p,
  .person-value:not(.ltr),
  .note-text,
  .small,
  .note,
  .sign,
  th,
  td {
    font-weight: 600 !important;
  }

  h1,
  .receipt-title,
  .head-title h1,
  .title h1 {
    font-weight: 800 !important;
  }

  h2,
  h3,
  .panel-title,
  .section-title,
  .heading,
  .amount-label,
  .detail-label,
  .balance-label,
  .person-label,
  .summary-label,
  .note-title,
  .clabel {
    font-size: 28px !important;
    font-weight: 800 !important;
    line-height: 1.6 !important;
  }

  .customer-name,
  .weekly-company-name,
  .footer-name,
  .shop,
  .fbrand,
  .strong,
  .thanks {
    font-weight: 800 !important;
  }



  /* ===== FINAL OVERRIDE: very large titles/footer + smaller weekly note ===== */
  .receipt-title,
  .head-title h1,
  .title h1 {
    font-size: 62px !important;
    font-weight: 900 !important;
    line-height: 1.35 !important;
  }

  .receipt-subtitle,
  .head-title p {
    font-size: 26px !important;
    font-weight: 700 !important;
    line-height: 1.6 !important;
  }

  .shop,
  .weekly-company-name,
  .customer-name,
  .strong {
    font-size: 28px !important;
    font-weight: 900 !important;
    line-height: 1.55 !important;
  }

  .panel-title,
  .section-title,
  .heading,
  .amount-label,
  .detail-label,
  .balance-label,
  .person-label,
  .summary-label,
  .note-title,
  .clabel {
    font-size: 34px !important;
    font-weight: 900 !important;
    line-height: 1.5 !important;
  }

  .footer-name,
  .fbrand,
  .footer-brand,
  .footer-brand div:first-child {
    font-size: 40px !important;
    font-weight: 900 !important;
    line-height: 1.45 !important;
  }

  .footer-address,
  .address,
  .footer-brand div:last-child {
    font-size: 24px !important;
    font-weight: 800 !important;
    line-height: 1.6 !important;
  }

  /* user asked: text above weekly footer should be a bit smaller */
  .weekly-reference .note-card,
  .weekly-report .note-card {
    padding-top: 18px !important;
    padding-bottom: 18px !important;
  }

  .weekly-reference .note-title,
  .weekly-report .note-title {
    font-size: 24px !important;
    font-weight: 800 !important;
  }

  .weekly-reference .note-text,
  .weekly-report .note-text {
    font-size: 18px !important;
    font-weight: 600 !important;
    line-height: 1.65 !important;
  }

  .weekly-reference .thanks,
  .weekly-report .thanks {
    font-size: 22px !important;
    font-weight: 800 !important;
  }



  /* ===== WEEKLY TITLE BOLDER/BIGGER ===== */
  .weekly-reference .head-title h1,
  .weekly-report .head-title h1 {
    font-size: 68px !important;
    font-weight: 900 !important;
    line-height: 1.32 !important;
  }

  .weekly-reference .head-title p,
  .weekly-report .head-title p {
    font-size: 28px !important;
    font-weight: 800 !important;
    line-height: 1.55 !important;
  }



  /* ===== WEEKLY FOOTER SMALLER SO NOTE TEXT SHOWS ===== */
  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    height: 104px !important;
    bottom: 10px !important;
    padding: 6px 16px 2px !important;
    line-height: 1.32 !important;
  }

  .weekly-reference .footer-brand div:first-child,
  .weekly-report .footer-brand div:first-child {
    font-size: 32px !important;
    font-weight: 900 !important;
    line-height: 1.35 !important;
  }

  .weekly-reference .footer-brand div:last-child,
  .weekly-report .footer-brand div:last-child {
    font-size: 18px !important;
    font-weight: 700 !important;
    margin-top: 2px !important;
    line-height: 1.45 !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    margin-bottom: 12px !important;
  }



  /* ===== FINAL WEEKLY REPORT FIX: visible note, bigger title, fresher borders ===== */
  .weekly-reference .head-title h1,
  .weekly-report .head-title h1 {
    font-size: 74px !important;
    font-weight: 900 !important;
    line-height: 1.28 !important;
    color: #064f8d !important;
  }

  .weekly-reference .head-title p,
  .weekly-report .head-title p {
    font-size: 30px !important;
    font-weight: 800 !important;
    line-height: 1.5 !important;
  }

  .weekly-reference .meta-card,
  .weekly-report .meta-card,
  .weekly-reference .panel,
  .weekly-report .panel {
    border-color: #9fc8ea !important;
    box-shadow: 0 10px 24px rgba(7, 94, 178, 0.08) !important;
  }

  .weekly-reference .panel-title,
  .weekly-report .panel-title {
    border-bottom: 2px solid rgba(255,255,255,0.16) !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    min-height: 150px !important;
    margin-top: 34px !important;
    margin-bottom: 18px !important;
    padding: 18px 40px 12px !important;
    border: 3px solid #3192d4 !important;
    border-radius: 24px !important;
    box-shadow: 0 10px 24px rgba(49, 146, 212, 0.10) !important;
    background: linear-gradient(180deg, #ffffff 0%, #fbfeff 100%) !important;
  }

  .weekly-reference .note-title,
  .weekly-report .note-title {
    font-size: 25px !important;
    font-weight: 900 !important;
  }

  .weekly-reference .note-text,
  .weekly-report .note-text {
    margin-top: 12px !important;
    font-size: 20px !important;
    font-weight: 700 !important;
    line-height: 1.7 !important;
  }

  .weekly-reference .note-line,
  .weekly-report .note-line {
    margin-top: 16px !important;
  }

  .weekly-reference .thanks,
  .weekly-report .thanks {
    margin-top: 8px !important;
    font-size: 21px !important;
    font-weight: 800 !important;
  }

  .weekly-reference .bottom-purple,
  .weekly-report .bottom-purple {
    bottom: 126px !important;
    height: 58px !important;
  }

  .weekly-reference .bottom-blue,
  .weekly-report .bottom-blue {
    height: 172px !important;
  }

  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    height: 88px !important;
    bottom: 8px !important;
    padding: 4px 16px 2px !important;
    line-height: 1.28 !important;
  }

  .weekly-reference .footer-brand div:first-child,
  .weekly-report .footer-brand div:first-child {
    font-size: 30px !important;
    font-weight: 900 !important;
    line-height: 1.32 !important;
  }

  .weekly-reference .footer-brand div:last-child,
  .weekly-report .footer-brand div:last-child {
    font-size: 17px !important;
    font-weight: 700 !important;
    margin-top: 1px !important;
    line-height: 1.35 !important;
  }



  /* ===== WEEKLY REPORT SOFTER BORDER + MORE EVEN SPACING ===== */
  .weekly-reference,
  .weekly-report {
    padding: 128px 84px 126px !important;
    border: 2px solid #b9d9f0 !important;
    border-radius: 34px !important;
    box-shadow: 0 12px 28px rgba(8, 105, 180, 0.08) !important;
    background: linear-gradient(180deg, #ffffff 0%, #fcfeff 100%) !important;
  }

  .weekly-reference .report-head,
  .weekly-report .report-head {
    margin-bottom: 28px !important;
  }

  .weekly-reference .meta-card,
  .weekly-report .meta-card,
  .weekly-reference .panel,
  .weekly-report .panel,
  .weekly-reference .note-card,
  .weekly-report .note-card {
    border-width: 2px !important;
    border-radius: 22px !important;
  }

  .weekly-reference .person-panel,
  .weekly-report .person-panel {
    margin-top: 8px !important;
  }

  .weekly-reference .account-panel,
  .weekly-report .account-panel {
    margin-top: 22px !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    margin-top: 28px !important;
    margin-bottom: 18px !important;
    padding: 18px 38px 14px !important;
    border-color: #57a8de !important;
  }



  /* ===== WEEKLY REPORT MORE MARGIN + ROUNDER/FRESHER BORDERS ===== */
  .weekly-reference,
  .weekly-report {
    padding: 140px 98px 138px !important;
    border: 2px solid #c7e2f4 !important;
    border-radius: 40px !important;
    box-shadow: 0 14px 30px rgba(8, 105, 180, 0.07) !important;
    background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%) !important;
  }

  .weekly-reference .meta-card,
  .weekly-report .meta-card,
  .weekly-reference .panel,
  .weekly-report .panel,
  .weekly-reference .note-card,
  .weekly-report .note-card,
  .weekly-reference .summary-card,
  .weekly-report .summary-card {
    border-radius: 26px !important;
    border-width: 2px !important;
    box-shadow: 0 8px 18px rgba(49, 146, 212, 0.06) !important;
  }

  .weekly-reference .meta-card,
  .weekly-report .meta-card,
  .weekly-reference .panel,
  .weekly-report .panel {
    border-color: #b8d8ee !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    border-color: #66b2e3 !important;
    margin-top: 32px !important;
    margin-bottom: 22px !important;
    padding: 20px 40px 16px !important;
  }

  .weekly-reference .summary-card,
  .weekly-report .summary-card {
    border-color: rgba(173, 211, 236, 0.95) !important;
  }



  /* ===== WEEKLY NOTE TEXT SLIGHTLY BIGGER ===== */
  .weekly-reference .note-text,
  .weekly-report .note-text {
    font-size: 23px !important;
    font-weight: 800 !important;
    line-height: 1.7 !important;
  }



  /* ===== FINAL USER FIX: clearer weekly border + small equal spacing around receipt ===== */
  .weekly-reference,
  .weekly-report {
    border: 3px solid #9fd0ec !important;
    border-radius: 42px !important;
    box-shadow:
      0 16px 32px rgba(8, 105, 180, 0.08),
      0 0 0 1px rgba(159, 208, 236, 0.65) inset !important;
  }

  .receipt-canvas {
    padding: 28px !important;
    box-sizing: border-box !important;
  }

  .receipt-canvas .receipt-green {
    border-radius: 44px !important;
    transform: scale(0.94) !important;
    transform-origin: center center !important;
  }



  /* ===== FINAL WEEKLY FOOTER TUNE: slightly shorter footer, slightly bigger text ===== */
  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    height: 82px !important;
    bottom: 8px !important;
    padding: 4px 16px 2px !important;
    line-height: 1.24 !important;
  }

  .weekly-reference .footer-brand div:first-child,
  .weekly-report .footer-brand div:first-child {
    font-size: 32px !important;
    font-weight: 900 !important;
    line-height: 1.28 !important;
  }

  .weekly-reference .footer-brand div:last-child,
  .weekly-report .footer-brand div:last-child {
    font-size: 19px !important;
    font-weight: 800 !important;
    margin-top: 2px !important;
    line-height: 1.35 !important;
  }

  .weekly-reference .bottom-blue,
  .weekly-report .bottom-blue {
    height: 166px !important;
  }

  .weekly-reference .bottom-purple,
  .weekly-report .bottom-purple {
    bottom: 118px !important;
    height: 54px !important;
  }



  /* ===== FINAL WEEKLY IMAGE SIZE + SHADOW + EQUAL SPACING ===== */
  body {
    width: 1080px !important;
    height: 1440px !important;
    padding: 26px !important;
    background: linear-gradient(180deg, #f8fcff 0%, #f3f9fe 100%) !important;
  }

  .weekly-reference,
  .weekly-report {
    width: 100% !important;
    height: 100% !important;
    padding: 132px 92px 128px !important;
    border: 3px solid #9fd0ec !important;
    border-radius: 40px !important;
    box-shadow: 0 20px 40px rgba(18, 89, 158, 0.12) !important;
    overflow: hidden !important;
  }

  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    left: 24px !important;
    right: 24px !important;
    border-radius: 24px 24px 18px 18px !important;
  }



  /* ===== FINAL FIX: weekly spacing from border/shadow + footer text restored ===== */
  body {
    width: 1080px !important;
    height: 1440px !important;
    padding: 34px !important;
    box-sizing: border-box !important;
    background: linear-gradient(180deg, #f8fcff 0%, #f3f9fe 100%) !important;
  }

  .weekly-reference,
  .weekly-report {
    width: 100% !important;
    height: 100% !important;
    padding: 128px 90px 136px !important;
    border: 3px solid #9fd0ec !important;
    border-radius: 42px !important;
    box-shadow: 0 20px 40px rgba(18, 89, 158, 0.12) !important;
    overflow: hidden !important;
  }

  .weekly-reference .footer-brand,
  .weekly-report .footer-brand {
    left: 30px !important;
    right: 30px !important;
    bottom: 12px !important;
    height: 92px !important;
    padding: 6px 16px 6px !important;
    border-radius: 24px 24px 18px 18px !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    z-index: 6 !important;
    line-height: 1.2 !important;
  }

  .weekly-reference .footer-brand div:first-child,
  .weekly-report .footer-brand div:first-child {
    font-size: 31px !important;
    font-weight: 900 !important;
    line-height: 1.22 !important;
  }

  .weekly-reference .footer-brand div:last-child,
  .weekly-report .footer-brand div:last-child {
    font-size: 18px !important;
    font-weight: 800 !important;
    margin-top: 2px !important;
    line-height: 1.3 !important;
  }

  .weekly-reference .bottom-blue,
  .weekly-report .bottom-blue {
    height: 174px !important;
  }

  .weekly-reference .bottom-purple,
  .weekly-report .bottom-purple {
    bottom: 124px !important;
    height: 52px !important;
  }

  .weekly-reference .note-card,
  .weekly-report .note-card {
    margin-bottom: 20px !important;
  }



/* ===== FULL REPORT ONLY: FIT WIDTH, KEEP NATURAL HEIGHT =====
   Fit the full-account report to A4 WIDTH only.
   Do not shrink the whole report to one page vertically. */
@page { size: A4 portrait; margin: 0; }

html,
body {
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  background: #ffffff !important;
}

body {
  overflow-x: hidden !important;
  overflow-y: visible !important;
}

.page {
  width: 100% !important;
  max-width: 100% !important;
  min-height: 1120px !important;
  height: auto !important;
  padding-bottom: 125px !important;
  overflow-x: hidden !important;
  overflow-y: visible !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.content,
.header,
.section,
.summary,
.block,
.signs,
.note {
  max-width: 100% !important;
  box-sizing: border-box !important;
}

/* Keep the three account boxes slightly smaller, as requested. */
.summary {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 10px !important;
}

.summary .card {
  min-width: 0 !important;
  min-height: 105px !important;
  padding: 10px 8px !important;
}

.summary .clabel {
  font-size: 18px !important;
}

.summary .cvalue {
  margin-top: 3px !important;
  font-size: 32px !important;
  line-height: 1.05 !important;
}

.summary .currency {
  margin-top: 2px !important;
  font-size: 14px !important;
}

/* Tables always fit the A4 width and may continue naturally to the next page. */
table {
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed !important;
}

thead {
  display: table-header-group !important;
}

tr {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}

.block {
  break-inside: auto !important;
  page-break-inside: auto !important;
}

/* Full report numeric fields: use the same Latin font strategy as the fixed receipt. */
.full-report-latin,
.datebox .ltr,
.summary .cvalue,
.summary .currency,
.payment-history .date-cell,
.payment-history .receipt-amount,
.payment-history .receipt-reference,
.balance-history .date-cell,
.balance-history .bill-number,
.balance-history .bill-amount,
.fdate {
  font-family: "Roboto", "DejaVu Sans", "Liberation Sans", Arial, sans-serif !important;
  font-synthesis: none !important;
  font-variant-numeric: lining-nums tabular-nums !important;
  font-feature-settings: "lnum" 1, "tnum" 1 !important;
  direction: ltr !important;
  unicode-bidi: isolate !important;
  letter-spacing: 0 !important;
}

/* Receipt history: one dark-blue text color. */
.payment-history .heading,
.payment-history th,
.payment-history td,
.payment-history .date-cell,
.payment-history .receipt-amount,
.payment-history .receipt-method,
.payment-history .receipt-reference {
  color: #123a73 !important;
}

/* Balance/debt history: red text only. */
.balance-history .heading,
.balance-history th,
.balance-history td,
.balance-history .date-cell,
.balance-history .bill-number,
.balance-history .bill-amount {
  color: #e11d48 !important;
}

</style></head><body><div class="page">
${companyLogo?`<div class="watermark"><img src="${escapeHtml(companyLogo)}"/></div>`:""}
<div class="content">
<header class="header">${companyLogo?`<img class="logo" src="${escapeHtml(companyLogo)}"/>`:""}<div class="shop">عمده فروشی فیض احمد و عزیزالله نیازی</div><div class="address">کابل، سرای احمدشاهی، دکان 174</div></header>
<section class="title"><h1>د مشتری بشپړ حسابي راپور</h1><div class="line"></div></section>
<div class="datebox"><span>نیټه:</span><span class="ltr full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(reportDate))}</span></div>
<section class="section"><div class="section-title">د حساب معلومات</div><div class="info">
<div class="cell"><div class="small">مشتری</div><div class="strong">${escapeHtml(customerName)}</div></div>
<div class="cell"><div class="small">د حساب واحد</div><div class="strong">${escapeHtml(money.code)}</div></div>
<div class="cell"><div class="small">د راپور نیټه</div><div class="strong full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(reportDate))}</div></div>
</div></section>
<section class="summary">
<div class="card redcard"><div class="clabel">باقي حساب</div><div class="cvalue full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(formatNumber(remainingBalance)))}</div><div class="currency full-report-latin" lang="en" dir="ltr">${escapeHtml(money.code)}</div></div>
<div class="card bluecard"><div class="clabel">ټول قرض</div><div class="cvalue full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(formatNumber(totalDebt)))}</div><div class="currency full-report-latin" lang="en" dir="ltr">${escapeHtml(money.code)}</div></div>
<div class="card green"><div class="clabel">ټول وصولي</div><div class="cvalue full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(formatNumber(totalPaid)))}</div><div class="currency full-report-latin" lang="en" dir="ltr">${escapeHtml(money.code)}</div></div>
</section>
<section class="block payment-history"><div class="heading">د وصولو تاریخچه</div><table><thead><tr><th>تاریخ</th><th>مبلغ</th><th>طریقه</th><th>حواله نمبر</th></tr></thead><tbody>${paymentTableRows||`<tr><td colspan="4">ریکارډ نشته</td></tr>`}</tbody></table></section>
<section class="block balance-history"><div class="heading">باقیات</div><table><thead><tr><th>بل نمبر</th><th>تاریخ</th><th>مبلغ</th></tr></thead><tbody>${debtTableRows||`<tr><td colspan="3">ریکارډ نشته</td></tr>`}</tbody></table></section>
<section class="signs"><div class="sign">د فرمانده امضا</div><div class="sign">د محاسب امضا</div><div class="sign">مهر او تایید</div></section>
<div class="note">دا راپور د نیازی پلورنځی WMS سیستم له لارې په اتومات ډول جوړ شوی دی.</div>
</div>
<div class="purple"></div><div class="footer"></div><div class="fdate full-report-latin" lang="en" dir="ltr">${escapeHtml(toLatinDigits(reportDate))}</div><div class="fbrand">نیازی پلورنځی &nbsp; • &nbsp; WMS Pro</div>
</div></body></html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Render at the native A4 CSS width. The report may continue vertically
    // onto additional A4 pages; only horizontal fitting is enforced.
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 1,
    });

    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });

    console.log("📄 Full report: A4 width fit enabled; natural multi-page height kept.");

    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    });

    // Puppeteer may return Uint8Array instead of a Node Buffer.
    // Always normalize it here before handing it to WhatsApp.
    const pdfBuffer = Buffer.isBuffer(pdfBytes)
      ? pdfBytes
      : Buffer.from(pdfBytes);

    if (!pdfBuffer.length) {
      throw new Error("Generated 3-week PDF is empty.");
    }

    console.log(
      `✅ 3-week PDF generated: ${pdfBuffer.length} bytes`
    );

    return pdfBuffer;
  } finally {
    await page.close();
  }
}