// client/src/utils/debtorWhatsAppReport.js
// WMS Pro - Debtor WhatsApp Report Card
// Header/Footer based on the supplied blue/purple geometric design.
// No address or phone number is printed.
// Main title comes from Settings: company.report_title

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const safeText = (value, fallback = "—") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

function roundedRect(ctx, x, y, w, h, r, fill, stroke = null, lineWidth = 2) {
  const radius = Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawTopArtwork(ctx, width) {
  const blue = ctx.createLinearGradient(width * 0.58, 0, width, 300);
  blue.addColorStop(0, "#1439a3");
  blue.addColorStop(0.48, "#0874cc");
  blue.addColorStop(1, "#079fd9");

  // Main top blue shape
  ctx.beginPath();
  ctx.moveTo(width * 0.30, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width, 165);
  ctx.lineTo(width * 0.70, 245);
  ctx.closePath();
  ctx.fillStyle = blue;
  ctx.fill();

  // Purple lower trim
  ctx.beginPath();
  ctx.moveTo(width * 0.295, 0);
  ctx.lineTo(width * 0.70, 225);
  ctx.lineTo(width, 145);
  ctx.lineTo(width, 166);
  ctx.lineTo(width * 0.70, 250);
  ctx.lineTo(width * 0.275, 0);
  ctx.closePath();
  ctx.fillStyle = "#bc78bd";
  ctx.fill();

  // Navy trim
  ctx.beginPath();
  ctx.moveTo(width * 0.32, 0);
  ctx.lineTo(width * 0.70, 210);
  ctx.lineTo(width, 130);
  ctx.lineTo(width, 145);
  ctx.lineTo(width * 0.70, 228);
  ctx.lineTo(width * 0.30, 0);
  ctx.closePath();
  ctx.fillStyle = "#26348e";
  ctx.fill();

  // Decorative small blocks
  const blocks = [
    [820, 205, 90, 20, "#b26ab6"],
    [925, 183, 74, 18, "#31328c"],
    [1010, 155, 70, 18, "#243789"],
  ];

  blocks.forEach(([x, y, w, h, color]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.14);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });
}

function drawBottomArtwork(ctx, width, height) {
  const blue = ctx.createLinearGradient(0, height - 210, width, height);
  blue.addColorStop(0, "#183795");
  blue.addColorStop(0.55, "#0871c7");
  blue.addColorStop(1, "#079fd9");

  // Purple shapes behind footer
  ctx.beginPath();
  ctx.moveTo(0, height - 205);
  ctx.lineTo(190, height - 115);
  ctx.lineTo(110, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = "#26348e";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, height - 225);
  ctx.lineTo(230, height - 145);
  ctx.lineTo(190, height - 115);
  ctx.lineTo(0, height - 175);
  ctx.closePath();
  ctx.fillStyle = "#c07ac0";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(width, height - 245);
  ctx.lineTo(width - 165, height - 160);
  ctx.lineTo(width - 70, height);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = "#29338f";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(width, height - 225);
  ctx.lineTo(width - 180, height - 145);
  ctx.lineTo(width - 135, height - 105);
  ctx.lineTo(width, height - 170);
  ctx.closePath();
  ctx.fillStyle = "#c07ac0";
  ctx.fill();

  // Main footer blue band
  ctx.beginPath();
  ctx.moveTo(85, height - 115);
  ctx.lineTo(width - 165, height - 125);
  ctx.lineTo(width, height - 58);
  ctx.lineTo(width, height);
  ctx.lineTo(120, height);
  ctx.closePath();
  ctx.fillStyle = blue;
  ctx.fill();
}

function drawIconCircle(ctx, x, y, fill, stroke, kind) {
  ctx.beginPath();
  ctx.arc(x, y, 34, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 4;

  if (kind === "paid") {
    ctx.strokeRect(x - 16, y - 10, 32, 22);
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 10);
    ctx.lineTo(x - 3, y - 18);
    ctx.lineTo(x + 15, y - 18);
    ctx.stroke();
  } else if (kind === "debt") {
    ctx.strokeRect(x - 13, y - 18, 26, 36);
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 7);
    ctx.lineTo(x + 7, y - 7);
    ctx.moveTo(x - 7, y + 2);
    ctx.lineTo(x + 7, y + 2);
    ctx.moveTo(x - 7, y + 11);
    ctx.lineTo(x + 3, y + 11);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y + 4, 15, 0, Math.PI * 2);
    ctx.moveTo(x - 8, y - 14);
    ctx.lineTo(x + 8, y - 14);
    ctx.lineTo(x + 13, y - 4);
    ctx.lineTo(x - 13, y - 4);
    ctx.closePath();
    ctx.stroke();
  }
}

function wrapRtl(ctx, text, rightX, startY, maxWidth, lineHeight, maxLines = 3) {
  const words = safeText(text, "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = candidate;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  lines.forEach((item, index) => {
    ctx.fillText(item, rightX, startY + index * lineHeight);
  });
}

function reportDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("fa-AF", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function reportTime(date = new Date()) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildWhatsAppDebtMessage({
  company = {},
  customer = {},
  totals = {},
  currency = "AFN",
}) {
  const unit = currency || "AFN";

  return [
    company.whatsapp_greeting || "السلام علیکم",
    `محترم ${safeText(customer.name, "مشتري")} صاحب،`,
    "",
    `ټول قرض: ${money(totals.totalDebt)} ${unit}`,
    `وصول شوی: ${money(totals.totalPaid)} ${unit}`,
    `باقي قرض: ${money(totals.balance)} ${unit}`,
    "",
    company.whatsapp_request ||
      "مهرباني وکړئ د فرصت په صورت کې خپل حساب تصفیه کړئ.",
    "",
    company.whatsapp_closing || "مننه",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

export async function createWhatsAppDebtReportBlob({
  company = {},
  customer = {},
  totals = {},
  currency = "AFN",
  now = new Date(),
}) {
  const canvas = document.createElement("canvas");

  // Portrait report image, ideal for WhatsApp
  canvas.width = 1080;
  canvas.height = 1440;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas جوړ نه شو.");
  }

  // White paper
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTopArtwork(ctx, canvas.width);
  drawBottomArtwork(ctx, canvas.width, canvas.height);

  // Default RTL text
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  // Settings title - NO address / NO phone
  const title =
    safeText(company.report_title, "") ||
    safeText(company.reportTitle, "") ||
    safeText(company.company_name, "") ||
    "د حساب راپور";

  ctx.fillStyle = "#064b85";
  ctx.font = "900 50px Tahoma, Arial, sans-serif";
  ctx.fillText(title, 510, 170);

  ctx.fillStyle = "#0c7494";
  ctx.font = "800 28px Tahoma, Arial, sans-serif";
  ctx.fillText("د قرضدار د حساب رسمي راپور", 510, 220);

  // Header line
  ctx.strokeStyle = "#1686c9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 270);
  ctx.lineTo(535, 270);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(70, 270, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#1686c9";
  ctx.fill();

  // Date/report info card
  roundedRect(ctx, 610, 275, 390, 150, 22, "#f8fbff", "#c8d9ec", 2);

  ctx.fillStyle = "#52637a";
  ctx.font = "700 20px Tahoma, Arial, sans-serif";
  ctx.fillText("نېټه:", 955, 320);
  ctx.fillText("وخت:", 955, 365);
  ctx.fillText("راپور:", 955, 410);

  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "#173f75";
  ctx.font = "800 20px Arial, sans-serif";
  ctx.fillText(reportDate(now), 660, 320);
  ctx.fillText(reportTime(now), 660, 365);

  const shortId = safeText(customer.id, "ACC").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  ctx.fillText(`DB-${shortId || "ACCOUNT"}`, 660, 410);

  // Debtor information
  ctx.direction = "rtl";
  ctx.textAlign = "right";

  roundedRect(ctx, 70, 470, 940, 170, 25, "#ffffff", "#bfd2e8", 2);

  const debtorHeader = ctx.createLinearGradient(70, 470, 1010, 470);
  debtorHeader.addColorStop(0, "#0c4a91");
  debtorHeader.addColorStop(1, "#06356f");
  roundedRect(ctx, 70, 470, 940, 60, 24, debtorHeader);

  // Mask lower rounded header corners for a clean straight edge
  ctx.fillStyle = "#063f7e";
  ctx.fillRect(70, 505, 940, 25);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 26px Tahoma, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("د شخص معلومات", 540, 510);

  ctx.textAlign = "right";
  ctx.fillStyle = "#63758a";
  ctx.font = "700 19px Tahoma, Arial, sans-serif";
  ctx.fillText("نوم", 930, 570);
  ctx.fillText("د حساب واحد", 430, 570);

  ctx.fillStyle = "#123c73";
  ctx.font = "900 26px Tahoma, Arial, sans-serif";
  ctx.fillText(safeText(customer.name), 930, 610);

  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.font = "900 25px Arial, sans-serif";
  ctx.fillText(currency || "AFN", 175, 610);

  // Account section
  ctx.direction = "rtl";
  ctx.textAlign = "right";

  roundedRect(ctx, 70, 690, 940, 390, 25, "#ffffff", "#bfd2e8", 2);

  const accountHeader = ctx.createLinearGradient(70, 690, 1010, 690);
  accountHeader.addColorStop(0, "#0b4890");
  accountHeader.addColorStop(1, "#07356e");
  roundedRect(ctx, 70, 690, 940, 62, 24, accountHeader);
  ctx.fillStyle = "#063f7e";
  ctx.fillRect(70, 726, 940, 26);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "900 27px Tahoma, Arial, sans-serif";
  ctx.fillText("د حساب لنډیز", 540, 730);

  const cards = [
    {
      x: 100,
      label: "وصول شوی",
      value: totals.totalPaid,
      color: "#0b8f51",
      fill: "#effbf5",
      iconFill: "#e0f5e9",
      kind: "paid",
    },
    {
      x: 390,
      label: "ټول قرض",
      value: totals.totalDebt,
      color: "#0c67c8",
      fill: "#f3f8ff",
      iconFill: "#e7f1fb",
      kind: "debt",
    },
    {
      x: 680,
      label: "باقي قرض",
      value: totals.balance,
      color: "#d32222",
      fill: "#fff5f5",
      iconFill: "#fde8e8",
      kind: "balance",
    },
  ];

  cards.forEach((card) => {
    roundedRect(ctx, card.x, 790, 260, 245, 23, "#ffffff", "#d6e0ec", 2);

    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = card.color;
    ctx.font = "900 23px Tahoma, Arial, sans-serif";
    ctx.fillText(card.label, card.x + 130, 845);

    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.fillStyle = card.color;
    ctx.font = "900 43px Arial, sans-serif";
    ctx.fillText(money(card.value), card.x + 130, 905);

    ctx.font = "800 20px Arial, sans-serif";
    ctx.fillText(currency || "AFN", card.x + 130, 940);

    drawIconCircle(
      ctx,
      card.x + 130,
      990,
      card.iconFill,
      card.color,
      card.kind,
    );
  });

  // Reminder section
  roundedRect(ctx, 70, 1120, 940, 190, 24, "#fbfdff", "#3d8ed9", 2);

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#1569b8";
  ctx.font = "900 22px Tahoma, Arial, sans-serif";
  ctx.fillText("یادونه", 955, 1165);

  ctx.fillStyle = "#30465f";
  ctx.font = "700 24px Tahoma, Arial, sans-serif";

  wrapRtl(
    ctx,
    company.whatsapp_request ||
      "مهرباني وکړئ د فرصت په صورت کې خپل حساب تصفیه کړئ.",
    930,
    1215,
    820,
    37,
    2,
  );

  ctx.strokeStyle = "#c7d8eb";
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(100, 1260);
  ctx.lineTo(980, 1260);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0d69bd";
  ctx.font = "900 25px Tahoma, Arial, sans-serif";
  ctx.fillText(company.whatsapp_closing || "مننه", 540, 1298);

  // Footer contains NO address / phone
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 23px Tahoma, Arial, sans-serif";
  ctx.fillText(
    safeText(company.company_name, "WMS Pro"),
    540,
    1395,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("د راپور عکس جوړ نه شو."));
      },
      "image/png",
      0.96,
    );
  });
}

export function downloadReportBlob(blob, fileName = "debtor-account-report.png") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
