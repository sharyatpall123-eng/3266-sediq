import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiDollarSign,
  FiDownload,
  FiFileText,
  FiHash,
  FiPackage,
  FiPrinter,
  FiTruck,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Card from "../components/ui/Card";
import Loading from "../components/ui/Loading";
import { getErrorMessage } from "../lib/api";
import { representativeService, settingsService } from "../Services/wmsService";
import { formatDate, formatNumber } from "../utils/format";

const today = () => new Date().toISOString().slice(0, 10);

function money(value, currency = "USD") {
  const amount = Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return currency === "AFN" ? `${amount} ؋` : `$ ${amount}`;
}

export default function RepresentativeAccountReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountResult, settingsResult] = await Promise.all([
        representativeService.account(id),
        settingsService.get().catch(() => ({ company: null })),
      ]);
      setAccount(accountResult);
      setCompany(settingsResult.company || null);
    } catch (error) {
      toast.error(getErrorMessage(error, "راپور ترلاسه نه شو."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const ledger = useMemo(() => {
    let balance = 0;
    return (account?.ledger || []).map((row) => {
      balance = Math.max(
        0,
        Number(balance) + Number(row.debit || 0) - Number(row.credit || 0),
      );
      return { ...row, running_balance: balance };
    });
  }, [account]);

  const downloadCsv = () => {
    if (!account) return;
    const rows = [
      ["تاریخ", "تفصیل", "بقایه", "وصولي", "روان حساب"],
      ...ledger.map((row) => [
        row.date,
        row.description,
        row.debit || 0,
        row.credit || 0,
        row.running_balance || 0,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${account.representative.name}-account-report.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <Card className="p-8">
        <Loading />
      </Card>
    );
  }

  if (!account?.representative) {
    return (
      <Card className="p-8 text-center font-black text-slate-500">
        راپور پیدا نه شو.
      </Card>
    );
  }

  const representative = account.representative;
  const summary = account.summary || {};
  const currency = account.currency || "USD";
  const reportNo = `RA-${String(representative.id).toUpperCase()}-${today().replaceAll("-", "")}`;

  return (
    <div className="page-enter min-w-0 space-y-4">
      <style>{`
        @media print {
          .report-actions { display: none !important; }
          body { background: white !important; }
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      <div className="report-actions flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(`/representatives/${id}/account`)}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
        >
          <FiArrowLeft /> حساب ته بېرته
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700"
          >
            <FiDownload /> Excel / CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white"
          >
            <FiPrinter /> چاپ / PDF
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
        <div className="bg-gradient-to-l from-blue-950 via-blue-800 to-cyan-600 px-6 py-6 text-white sm:px-8">
          <div dir="rtl" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-right">
              <p className="text-sm font-black text-blue-100">
                {company?.company_name || "WMS Pro"}
              </p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">
                {company?.representative_report_title ||
                  `د ${representative.name} مسلکي حسابي راپور`}
              </h1>
              <p className="mt-2 text-sm font-bold text-blue-100">
                {representative.phone || "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/25 bg-white/10 px-5 py-3 backdrop-blur">
              <p className="text-xs font-black text-blue-100">د راپور نمبر</p>
              <p className="mt-1 font-black">{reportNo}</p>
              <p className="mt-2 text-xs font-bold text-blue-100">
                نېټه: {formatDate(today())}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Summary icon={FiBookOpen} label="ټول حساب" value={money(summary.total_account, currency)} tone="blue" />
            <Summary icon={FiCheckCircle} label="جمله وصولي" value={money(summary.total_receipts, currency)} tone="green" />
            <Summary icon={FiDollarSign} label="جمله باقي" value={money(summary.remaining, currency)} tone="orange" />
            <Summary icon={FiPackage} label="تسلیم کارتن" value={formatNumber(summary.delivered_cartons || 0)} tone="purple" />
          </div>

          <section className="overflow-hidden rounded-[22px] border border-blue-100">
            <div dir="rtl" className="bg-blue-50 px-4 py-3 text-right">
              <h2 className="font-black text-blue-900">مشترک حسابي Ledger</h2>
            </div>
            <div className="overflow-x-auto">
              <table dir="rtl" className="min-w-[820px] w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-right">تاریخ</th>
                    <th className="px-4 py-3 text-right">تفصیل</th>
                    <th className="px-4 py-3 text-center text-orange-700">بقایه</th>
                    <th className="px-4 py-3 text-center text-emerald-700">وصولي</th>
                    <th className="px-4 py-3 text-center text-blue-700">روان حساب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-bold">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{row.description || "—"}</td>
                      <td className="px-4 py-3 text-center font-black text-orange-700">{row.debit ? money(row.debit, currency) : "—"}</td>
                      <td className="px-4 py-3 text-center font-black text-emerald-700">{row.credit ? money(row.credit, currency) : "—"}</td>
                      <td className="px-4 py-3 text-center font-black text-blue-700">{money(row.running_balance, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ReportList
              title={company?.representative_balance_report_title || "د اتومات بقایاتو راپور"}
              tone="orange"
              icon={FiTruck}
              rows={(account.charges || []).map((row) => ({
                id: row.id,
                title: row.goods_name || "مال",
                meta: `${formatNumber(row.delivered_quantity || 0)} کارتن • ${formatDate(row.date)}`,
                value: money(row.amount, currency),
              }))}
            />

            <ReportList
              title={company?.representative_receipt_report_title || "د وصولیو راپور"}
              tone="green"
              icon={FiFileText}
              rows={(account.receipts || []).map((row) => ({
                id: row.id,
                title: `رسید #${row.receipt_number || "—"}`,
                meta: formatDate(row.date),
                value: money(row.amount, currency),
              }))}
            />
          </div>

          <div dir="rtl" className="grid gap-8 pt-4 sm:grid-cols-3">
            {["د شرکت استازي امضا", "د محاسب امضا", "مهر او تایید"].map((label) => (
              <div key={label} className="border-t border-slate-300 pt-3 text-center text-xs font-black text-slate-500">
                {label}
              </div>
            ))}
          </div>

          <p dir="rtl" className="border-t border-slate-200 pt-4 text-center text-xs font-bold text-slate-400">
            {company?.footer_text || "دا راپور د WMS Pro سیستم له خوا جوړ شوی دی."}
          </p>
        </div>
      </section>
    </div>
  );
}

function Summary({ icon: Icon, label, value, tone }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    orange: "border-orange-100 bg-orange-50 text-orange-700",
    purple: "border-violet-100 bg-violet-50 text-violet-700",
  };
  return (
    <article className={`rounded-[20px] border p-3.5 ${tones[tone]}`}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-white text-lg shadow-sm">
          <Icon />
        </span>
        <div dir="rtl" className="min-w-0 text-right">
          <p className="text-[10px] font-black opacity-70">{label}</p>
          <p className="mt-1 truncate text-lg font-black">{value}</p>
        </div>
      </div>
    </article>
  );
}

function ReportList({ title, tone, icon: Icon, rows }) {
  const green = tone === "green";
  const shell = green
    ? "border-emerald-200 bg-emerald-50/35 text-emerald-700"
    : "border-orange-200 bg-orange-50/35 text-orange-700";

  return (
    <section className={`overflow-hidden rounded-[18px] border ${shell}`}>
      <div dir="rtl" className="flex items-center justify-between gap-2 border-b border-current/10 px-4 py-3 text-right">
        <div className="flex items-center gap-2">
          <Icon />
          <h3 className="font-black">{title}</h3>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black shadow-sm">{rows.length} ریکارډ</span>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto bg-white">
          <table dir="rtl" className="wms-rep-report-table min-w-[560px] w-full border-separate border-spacing-0 text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 text-right font-black">تفصیل</th>
                <th className="px-3 py-2.5 text-right font-black">معلومات / تاریخ</th>
                <th className={`px-3 py-2.5 text-center font-black ${green ? "text-emerald-700" : "text-orange-700"}`}>مقدار</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className={index % 2 ? "bg-slate-50/55" : "bg-white"}>
                  <td className="px-3 py-2.5 text-right font-black text-slate-900">{row.title}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-500">{row.meta}</td>
                  <td className={`px-3 py-2.5 text-center text-sm font-black ${green ? "text-emerald-700" : "text-orange-700"}`}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="bg-white p-5 text-center text-sm font-black text-slate-400">ریکارډ نشته</p>
      )}
    </section>
  );
}

