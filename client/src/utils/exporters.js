import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export function exportRowsToExcel(rows, filename = "report.xlsx") {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  XLSX.writeFile(workbook, filename);
}

export function exportRowsToPdf({ title, columns, rows, filename = "report.pdf" }) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pdf.setFontSize(18);
  pdf.text(title, 40, 40);
  autoTable(pdf, {
    startY: 60,
    head: [columns],
    body: rows,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  pdf.save(filename);
}
