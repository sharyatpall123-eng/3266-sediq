import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiBox,
  FiCalendar,
  FiCheckCircle,
  FiDollarSign,
  FiDownload,
  FiFileText,
  FiFilter,
  FiPackage,
  FiPrinter,
  FiRefreshCw,
  FiTrendingDown,
  FiTrendingUp,
  FiTruck,
  FiUsers,
} from "react-icons/fi";
import {
  Area,
  Bar,
  BarChart,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import toast from "react-hot-toast";
import Card from "../components/ui/Card";
import Loading from "../components/ui/Loading";
import PageHeader from "../components/ui/PageHeader";
import { getErrorMessage } from "../lib/api";
import { reportService, representativeService } from "../Services/wmsService";
import { formatDate, formatNumber } from "../utils/format";
import { useAuth } from "../context/AuthContext";

const today = () => new Date().toISOString().slice(0, 10);

function sixMonthsAgo() {
  const date = new Date();
  date.setMonth(date.getMonth() - 5);
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function money(value, currency = "AFN") {
  const number = Number(value || 0);
  const formatted = number.toLocaleString(undefined, {
    minimumFractionDigits: number % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });

  return currency === "USD" ? `$ ${formatted}` : `${formatted} ؋`;
}

function compactNumber(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(0)}K`;
  return number.toLocaleString();
}

function csvDownload(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");

  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function ReportsPage() {
  const { profile } = useAuth();
  const [filters, setFilters] = useState({
    from: sixMonthsAgo(),
    to: today(),
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companyStock, setCompanyStock] = useState([]);

  const load = async (nextFilters = appliedFilters, silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [result, companyResult] = await Promise.all([
        reportService.get(nextFilters),
        representativeService.list({ limit: 200, actor: profile }),
      ]);
      setData(result);
      setCompanyStock(
        (companyResult.data || [])
          .map((company) => ({
            id: company.id,
            name: company.name,
            quantity: Math.max(0, Number(company.total_goods || 0)),
          }))
          .filter((company) => company.quantity > 0)
          .sort((a, b) => b.quantity - a.quantity),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "راپورونه ترلاسه نه شول."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  const summaryCards = useMemo(() => {
    if (!data) return [];

    return [
      {
        label: "جمله قرضونه",
        value: formatNumber(data.summary.activeDebts),
        caption: "هغه حسابونه چې باقي لري",
        icon: FiDollarSign,
        tone: "blue",
      },
      {
        label: "قرضداران",
        value: formatNumber(data.summary.totalDebtors),
        caption: "ټول ثبت شوي قرضداران",
        icon: FiUsers,
        tone: "green",
      },
      {
        label: "AFN قرض",
        value: data.summary.canViewDebtTotal === false ? "محدود" : money(data.summary.debtAFN, "AFN"),
        caption: data.summary.canViewDebtTotal === false ? "Permission نشته" : "په افغانۍ روان قرض",
        icon: FiTrendingUp,
        tone: "orange",
      },
      {
        label: "USD قرض",
        value: data.summary.canViewDebtTotal === false ? "محدود" : money(data.summary.debtUSD, "USD"),
        caption: data.summary.canViewDebtTotal === false ? "Permission نشته" : "په ډالر روان قرض",
        icon: FiDollarSign,
        tone: "purple",
      },
    ];
  }, [data]);

  const exportReport = () => {
    if (!data) return;

    csvDownload(`wms-report-${today()}.csv`, [
      ["راپور", "مقدار"],
      ["قرضداران", data.summary.totalDebtors],
      ["جمله قرضونه", data.summary.activeDebts],
      ["AFN قرض", data.summary.debtAFN],
      ["USD قرض", data.summary.debtUSD],
      [],
      ["میاشت", "Stock In", "Stock Out"],
      ...data.monthly.map((row) => [row.label, row.stockIn, row.stockOut]),
      [],
      ["وروستۍ وصولیانې"],
      ["نوم", "رسید", "تاریخ", "مقدار", "اسعار"],
      ...data.recentReceipts.map((row) => [
        row.party_name,
        row.receipt_number || row.method || "",
        row.date,
        row.amount,
        row.currency,
      ]),
      [],
      ["وروستي نقل بلونه"],
      ["شرکت", "جنس", "بل", "تاریخ", "کرایه"],
      ...data.recentTransferBills.map((row) => [
        row.company_name,
        row.goods_name,
        row.bill_name,
        row.date,
        row.freight,
      ]),
    ]);
  };

  if (loading) {
    return (
      <Card className="p-8">
        <Loading />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-8 text-center font-black text-slate-500">
        د راپور معلومات پیدا نه شول.
      </Card>
    );
  }

  return (
    <div className="page-enter min-w-0 space-y-4">
      <style>{`
        @media print {
          .report-no-print { display: none !important; }
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      <PageHeader
        title="راپورونه"
        subtitle="د سټاک، قرضونو، وصولیو، نقل بلونو او موجودي مهم معلومات په یوه منظم راپور کې."
      />

      <Card className="report-no-print overflow-hidden border border-blue-100 bg-gradient-to-l from-blue-50/70 via-white to-cyan-50/50 p-3 shadow-sm">
        <div
          dir="rtl"
          className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_190px_190px_auto]"
        >
          <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-right">
            <p className="text-[10px] font-black text-blue-500">د راپور ډول</p>
            <p className="mt-1 font-black text-slate-900">ټول راپورونه</p>
          </div>

          <DateField
            label="له نېټې"
            value={filters.from}
            onChange={(value) => setFilters({ ...filters, from: value })}
          />

          <DateField
            label="تر نېټې"
            value={filters.to}
            onChange={(value) => setFilters({ ...filters, to: value })}
          />

          <button
            type="button"
            onClick={() => setAppliedFilters(filters)}
            className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-5 font-black text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5"
          >
            <FiFilter />
            تطبیق کړه
          </button>
        </div>

        <div
          dir="rtl"
          className="mt-3 flex flex-wrap justify-end gap-2 border-t border-blue-100 pt-3"
        >
          <button
            type="button"
            onClick={() => load(appliedFilters, true)}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            <FiRefreshCw className={refreshing ? "animate-spin" : ""} />
            تازه کړه
          </button>

          <button
            type="button"
            onClick={exportReport}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700 hover:bg-emerald-100"
          >
            <FiDownload />
            Excel / CSV
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            <FiPrinter />
            چاپ / PDF
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[1.12fr_0.88fr]">
        <StockComparisonChart rows={data.monthly} />

        <div className="grid min-w-0 gap-4 xl:grid-cols-2 2xl:grid-cols-1">
          <RecentReceipts rows={data.recentReceipts} />
          <RecentTransferBills rows={data.recentTransferBills} />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <CategoryChart rows={companyStock} />
        <MonthlyTable rows={data.monthly} />
        <QuickStats summary={data.summary} />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <TopProducts rows={data.topProducts} />
        <ReportOverview summary={data.summary} />
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <label className="block text-right">
      <span className="mb-1 block text-[10px] font-black text-slate-500">
        {label}
      </span>
      <div className="relative">
        <FiCalendar className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500" />
        <input
          type="date"
          className="field h-11 pr-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function SummaryCard({ label, value, caption, icon: Icon, tone }) {
  const tones = {
    blue: {
      card: "border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-50/50",
      icon: "bg-blue-100 text-blue-700",
      label: "text-blue-700",
    },
    green: {
      card: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-green-50/50",
      icon: "bg-emerald-100 text-emerald-700",
      label: "text-emerald-700",
    },
    orange: {
      card: "border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50/50",
      icon: "bg-orange-100 text-orange-700",
      label: "text-orange-700",
    },
    purple: {
      card: "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-purple-50/50",
      icon: "bg-violet-100 text-violet-700",
      label: "text-violet-700",
    },
  };

  const style = tones[tone] || tones.blue;

  return (
    <article
      dir="rtl"
      className={`wms-summary-card rounded-[20px] border p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${style.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-right">
          <p className={`text-xs font-black ${style.label}`}>{label}</p>
          <p className="mt-2 truncate text-xl font-black text-slate-950 sm:text-2xl">
            {value}
          </p>
          <p className="mt-1 truncate text-[10px] font-bold text-slate-400">
            {caption}
          </p>
        </div>

        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-sm ${style.icon}`}
        >
          <Icon />
        </span>
      </div>
    </article>
  );
}

function StockComparisonChart({ rows }) {
  const totalIn = rows.reduce((sum, row) => sum + Number(row.stockIn || 0), 0);
  const totalOut = rows.reduce((sum, row) => sum + Number(row.stockOut || 0), 0);
  const hasData = rows.some(
    (row) => Number(row.stockIn || 0) > 0 || Number(row.stockOut || 0) > 0,
  );

  return (
    <Card className="min-w-0 overflow-hidden rounded-[24px] border border-blue-100 bg-white p-0 shadow-[0_14px_40px_rgba(15,23,42,0.07)]">
      <div
        dir="rtl"
        className="flex flex-col gap-3 border-b border-blue-100 bg-gradient-to-l from-blue-50/90 via-white to-red-50/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-2 text-right">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-100 text-lg text-blue-700">
            <FiTrendingUp />
          </span>
          <div>
            <h2 className="text-base font-black text-slate-950 sm:text-lg">
              د Stock In او Stock Out مقایسه
            </h2>
            <p className="mt-0.5 text-[10px] font-bold text-slate-500">
              د ټاکلې مودې داخل او خارج سټاک میاشتنی حرکت
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <MetricPill label="Stock In" value={formatNumber(totalIn)} tone="blue" />
          <MetricPill label="Stock Out" value={formatNumber(totalOut)} tone="red" />
        </div>
      </div>

      <div className="h-[330px] min-w-0 p-3 sm:h-[380px] sm:p-4">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 20, right: 10, left: -8, bottom: 2 }}>
              <defs>
                <linearGradient id="stockInFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="stockOutFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 5" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 11, fontWeight: 700 }}
                dy={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                tickFormatter={compactNumber}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend verticalAlign="top" align="right" iconType="circle" />

              <Area
                type="monotone"
                dataKey="stockIn"
                name="Stock In"
                stroke="#2563eb"
                strokeWidth={3}
                fill="url(#stockInFill)"
                dot={{ r: 4, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 3 }}
              />

              <Area
                type="monotone"
                dataKey="stockOut"
                name="Stock Out"
                stroke="#ef4444"
                strokeWidth={3}
                fill="url(#stockOutFill)"
                dot={{ r: 4, fill: "#ef4444", stroke: "#ffffff", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#ef4444", stroke: "#ffffff", strokeWidth: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={FiTrendingUp}
            title="د دې مودې Stock حرکت نشته"
            text="کله چې Stock In یا Stock Out ثبت شي، ګراف به اتومات ښکاره شي."
          />
        )}
      </div>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      dir="rtl"
      className="min-w-40 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur"
    >
      <p className="mb-2 text-xs font-black text-slate-900">{label}</p>

      {payload.map((item) => (
        <div
          key={item.dataKey}
          className="flex items-center justify-between gap-4 py-1 text-xs"
        >
          <span className="font-bold text-slate-500">{item.name}</span>
          <span
            className={`font-black ${
              item.dataKey === "stockIn" ? "text-blue-700" : "text-red-600"
            }`}
          >
            {formatNumber(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MetricPill({ label, value, tone }) {
  const style =
    tone === "red"
      ? "border-red-100 bg-red-50 text-red-700"
      : "border-blue-100 bg-blue-50 text-blue-700";

  return (
    <div className={`rounded-xl border px-3 py-2 ${style}`}>
      <p className="text-[8px] font-black opacity-70">{label}</p>
      <p className="text-xs font-black">{value}</p>
    </div>
  );
}

function RecentReceipts({ rows }) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[22px] border border-emerald-100 bg-white p-0 shadow-sm">
      <SectionHeader
        title="وروستۍ وصولیانې"
        subtitle="د قرضدارانو او استازو وروستۍ وصولۍ"
        icon={FiCheckCircle}
        tone="green"
      />

      <div className="p-3">
        {!rows.length ? (
          <EmptyState
            icon={FiCheckCircle}
            title="وصولي نشته"
            text="د ټاکلې مودې لپاره وصولي ریکارډ پیدا نه شو."
            compact
          />
        ) : (
          <div className="space-y-1.5">
            {rows.slice(0, 5).map((row) => (
              <div
                dir="rtl"
                key={`${row.source}-${row.id}`}
                className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2 rounded-xl border border-emerald-100 bg-gradient-to-l from-emerald-50/70 to-white px-3 py-2.5"
              >
                <div className="min-w-0 text-right">
                  <p className="truncate text-xs font-black text-slate-900">
                    {row.party_name}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] font-bold text-slate-400">
                    {row.receipt_number
                      ? `رسید: ${row.receipt_number}`
                      : row.method || "وصولي"}{" "}
                    • {formatDate(row.date)}
                  </p>
                </div>

                <p className="text-left text-sm font-black text-emerald-700">
                  {money(row.amount, row.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function RecentTransferBills({ rows }) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[22px] border border-blue-100 bg-white p-0 shadow-sm">
      <SectionHeader
        title="وروستي بارچلان / نقل بلونه"
        subtitle="د Stock List په شان منظم جدول: شرکت، بل، نېټه او مبلغ"
        icon={FiTruck}
        tone="blue"
      />

      {!rows.length ? (
        <div className="p-3">
          <EmptyState
            icon={FiFileText}
            title="نقل بل نشته"
            text="تر اوسه د ټاکلې مودې لپاره نقل بل نه دی پورته شوی."
            compact
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table dir="rtl" className="wms-rep-report-table min-w-[620px] w-full border-separate border-spacing-0 text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 text-right font-black">شرکت</th>
                <th className="px-3 py-2.5 text-right font-black">جنس</th>
                <th className="px-3 py-2.5 text-center font-black">بل نمبر</th>
                <th className="px-3 py-2.5 text-center font-black">نېټه</th>
                <th className="px-3 py-2.5 text-center font-black text-blue-700">مبلغ</th>
                <th className="px-3 py-2.5 text-center font-black">فایل</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((row, index) => {
                const billNumber = row.bill_number || row.bill_no || row.bill_name || "—";
                const amountText = row.currency ? money(row.freight, row.currency) : formatNumber(row.freight);
                return (
                  <tr key={row.id} className={index % 2 ? "bg-slate-50/55" : "bg-white"}>
                    <td className="px-3 py-2.5 text-right font-black text-slate-900">{row.company_name || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-600">{row.goods_name || "—"}</td>
                    <td className="px-3 py-2.5 text-center font-black text-slate-700">{billNumber}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-slate-500">{formatDate(row.date)}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-black text-blue-700">{amountText}</td>
                    <td className="px-3 py-2.5 text-center">
                      {row.bill_data_url ? (
                        <a
                          href={row.bill_data_url}
                          download={row.bill_name || "transfer-bill"}
                          className="inline-flex size-8 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 shadow-sm hover:bg-blue-50"
                          aria-label="بل ډاونلوډ"
                        >
                          <FiDownload />
                        </a>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function CategoryChart({ rows }) {
  const colorClasses = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-red-500",
    "bg-cyan-500",
  ];
  const colors = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

  return (
    <Card className="min-w-0 overflow-hidden rounded-[22px] border border-violet-100 bg-white p-0 shadow-sm">
      <SectionHeader
        title="د شرکتونو مال"
        subtitle="د هر شرکت د ثبت شوو مالونو مقدار"
        icon={FiPackage}
        tone="purple"
      />

      <div className="grid min-h-[250px] grid-cols-[145px_minmax(0,1fr)] items-center gap-2 p-3">
        {rows.length ? (
          <>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rows}
                    dataKey="quantity"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={66}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {rows.map((row, index) => (
                      <Cell key={row.name} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div dir="rtl" className="space-y-2">
              {rows.slice(0, 6).map((row, index) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${
                        colorClasses[index % colorClasses.length]
                      }`}
                    />
                    <span className="truncate text-[10px] font-bold text-slate-600">
                      {row.name}
                    </span>
                  </div>

                  <span className="text-[10px] font-black text-slate-900">
                    {formatNumber(row.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="col-span-2">
            <EmptyState
              icon={FiPackage}
              title="د شرکتونو مال نشته"
              text="کله چې شرکتونو ته مال ثبت شي، دلته به یې وېش ښکاره شي."
              compact
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function MonthlyTable({ rows }) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[22px] border border-cyan-100 bg-white p-0 shadow-sm">
      <SectionHeader
        title="میاشتنی جریان"
        subtitle="Stock In او Stock Out لوکس ګراف"
        icon={FiTrendingUp}
        tone="blue"
      />

      <div className="h-[235px] p-3 sm:h-[270px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fontWeight: 700, fill: "#64748b" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={42}
              tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }}
            />
            <Tooltip
              cursor={{ fill: "rgba(59,130,246,0.05)" }}
              contentStyle={{ borderRadius: 14, borderColor: "#dbeafe", fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 800 }} />
            <Bar dataKey="stockIn" name="Stock In" fill="#2563eb" radius={[8, 8, 0, 0]} maxBarSize={22} />
            <Bar dataKey="stockOut" name="Stock Out" fill="#ef4444" radius={[8, 8, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function QuickStats({ summary }) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-0 shadow-sm">
      <SectionHeader
        title="چټک احصایې"
        subtitle="د موجودي مهم لنډ ارقام"
        icon={FiBox}
        tone="slate"
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <QuickStat
          label="ټول محصولات"
          value={formatNumber(summary.totalProducts)}
          icon={FiPackage}
          tone="blue"
        />
        <QuickStat
          label="جمله موجودي"
          value={formatNumber(summary.stockUnits)}
          icon={FiBox}
          tone="green"
        />
        <QuickStat
          label="Low Stock"
          value={formatNumber(summary.lowStock)}
          icon={FiAlertTriangle}
          tone="orange"
        />
        <QuickStat
          label="Out of Stock"
          value={formatNumber(summary.outOfStock)}
          icon={FiAlertTriangle}
          tone="red"
        />
      </div>
    </Card>
  );
}

function QuickStat({ label, value, icon: Icon, tone }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50/70 text-blue-700",
    green: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
    orange: "border-orange-100 bg-orange-50/70 text-orange-700",
    red: "border-red-100 bg-red-50/70 text-red-700",
  };

  return (
    <div
      dir="rtl"
      className={`rounded-2xl border p-3 text-right ${
        tones[tone] || tones.blue
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black">{label}</span>
        <Icon />
      </div>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function TopProducts({ rows }) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[22px] border border-blue-100 bg-white p-0 shadow-sm">
      <SectionHeader
        title="Top 5 محصولات د موجودي له مخې"
        subtitle="تر ټولو لوړ موجودي ارزښت لرونکي محصولات"
        icon={FiPackage}
        tone="blue"
      />

      <div className="space-y-2 p-3">
        {!rows.length ? (
          <EmptyState
            icon={FiPackage}
            title="محصول نشته"
            text="د محصول معلومات نشته."
            compact
          />
        ) : (
          rows.slice(0, 5).map((row, index) => (
            <div
              dir="rtl"
              key={row.id}
              className="grid grid-cols-[32px_minmax(0,1fr)_130px] items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-black text-blue-700">
                {index + 1}
              </span>

              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-800">
                  {row.name}
                </p>
                <p className="mt-0.5 text-[9px] font-bold text-slate-400">
                  {formatNumber(row.quantity)} {row.unit || ""}
                </p>
              </div>

              <p className="text-left text-xs font-black text-blue-700">
                {money(row.value, "AFN")}
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function ReportOverview({ summary }) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[22px] border border-violet-100 bg-gradient-to-br from-white via-white to-violet-50/40 p-0 shadow-sm">
      <SectionHeader
        title="عمومي راپور"
        subtitle="د سیستم څو نور مهم ټولیز معلومات"
        icon={FiFileText}
        tone="purple"
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <OverviewTile
          label="ګودامونه"
          value={formatNumber(summary.totalWarehouses)}
          icon={FiTruck}
          tone="purple"
        />
        <OverviewTile
          label="Stock Value"
          value={money(summary.stockValue, "AFN")}
          icon={FiDollarSign}
          tone="blue"
        />
        <OverviewTile
          label="وصولیانې"
          value={formatNumber(summary.receiptCount)}
          icon={FiCheckCircle}
          tone="green"
        />
        <OverviewTile
          label="نقل بلونه"
          value={formatNumber(summary.transferBillCount)}
          icon={FiFileText}
          tone="orange"
        />
      </div>
    </Card>
  );
}

function OverviewTile({ label, value, icon: Icon, tone }) {
  const tones = {
    purple: "border-violet-100 bg-violet-50 text-violet-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    orange: "border-orange-100 bg-orange-50 text-orange-700",
  };

  return (
    <div
      dir="rtl"
      className={`rounded-2xl border p-3 ${tones[tone] || tones.blue}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black">{label}</span>
        <Icon />
      </div>
      <p className="mt-2 truncate text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle, icon: Icon, tone }) {
  const tones = {
    green: "from-emerald-50/90 to-white text-emerald-700 border-emerald-100",
    blue: "from-blue-50/90 to-white text-blue-700 border-blue-100",
    purple: "from-violet-50/90 to-white text-violet-700 border-violet-100",
    slate: "from-slate-50 to-white text-slate-700 border-slate-100",
  };

  return (
    <div
      dir="rtl"
      className={`flex items-center justify-between gap-3 border-b bg-gradient-to-l px-4 py-3 ${
        tones[tone] || tones.blue
      }`}
    >
      <div className="min-w-0 text-right">
        <h3 className="truncate text-sm font-black text-slate-950 sm:text-base">
          {title}
        </h3>
        <p className="mt-0.5 truncate text-[9px] font-bold text-slate-400">
          {subtitle}
        </p>
      </div>

      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm">
        <Icon />
      </span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text, compact = false }) {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center text-center ${
        compact ? "min-h-28 p-4" : "min-h-52 p-8"
      }`}
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-400">
        <Icon />
      </span>
      <p className="mt-3 text-sm font-black text-slate-700">{title}</p>
      <p className="mt-1 max-w-xs text-[10px] font-bold leading-5 text-slate-400">
        {text}
      </p>
    </div>
  );
}
