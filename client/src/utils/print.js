export function printElement(elementId, title = "WMS Document") {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Print content پیدا نه شو.");

  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) throw new Error("Browser د Print window مخه نیولې ده.");

  const styles = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style'),
  )
    .map((node) => node.outerHTML)
    .join("\n");

  printWindow.document.write(`<!doctype html>
<html lang="ps" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
${styles}
<style>
  * { box-sizing: border-box !important; }
  html, body {
    direction: rtl !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #0f172a !important;
    overflow-x: hidden !important;
    overflow-y: visible !important;
  }
  body {
    padding: 6mm !important;
    font-family: Arial, Tahoma, sans-serif !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  button, .print-hidden { display: none !important; }
  #${elementId} {
    display: block !important;
    width: 100% !important;
    max-width: 198mm !important;
    min-width: 0 !important;
    margin: 0 auto !important;
    padding: 5mm !important;
    overflow: visible !important;
    transform: none !important;
    box-shadow: none !important;
  }
  #${elementId} * {
    min-width: 0 !important;
    max-width: 100% !important;
    overflow-wrap: anywhere !important;
    word-break: normal !important;
  }
  #${elementId} table {
    width: 100% !important;
    min-width: 0 !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
  }
  #${elementId} th,
  #${elementId} td {
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    vertical-align: top !important;
    font-size: 9px !important;
    line-height: 1.45 !important;
    padding: 5px !important;
  }
  #${elementId} img {
    object-fit: contain !important;
    page-break-inside: avoid !important;
  }
  #${elementId} section,
  #${elementId} article,
  #${elementId} tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  .glass-card, .soft-card, .table-shell {
    box-shadow: none !important;
  }
  @page { size: A4 portrait; margin: 6mm; }
</style>
</head>
<body>${element.outerHTML}</body>
</html>`);

  printWindow.document.close();
  printWindow.focus();

  const startPrint = () => {
    window.setTimeout(() => {
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close(), {
        once: true,
      });
    }, 450);
  };

  if (printWindow.document.readyState === "complete") {
    startPrint();
  } else {
    printWindow.addEventListener("load", startPrint, { once: true });
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
