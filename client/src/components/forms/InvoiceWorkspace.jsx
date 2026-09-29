import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiBox,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiMinus,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiUser,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Card from "../ui/Card";
import Loading from "../ui/Loading";
import EmptyState from "../ui/EmptyState";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../lib/api";
import { productService, stockService } from "../../Services/wmsService";
import { formatDate, formatNumber } from "../../utils/format";

const today = new Date().toISOString().slice(0, 10);

const themes = {
  in: {
    title: "Stock In",
    subtitle: "نوی سټاک مستقیم داخل کړئ",
    quantityLabel: "Quantity To Add",
    quantityPashto: "داخلېدونکی مقدار",
    newStockLabel: "New Stock After In",
    historyTitle: "Recent Stock In History",
    submitLabel: "سټاک داخل ثبت کړئ",
    hero: "from-blue-700 via-blue-600 to-cyan-400",
    heroIcon: "bg-white/15 text-white ring-white/30",
    sectionNumber: "bg-blue-100 text-blue-700",
    soft: "from-blue-50 to-cyan-50",
    current: "bg-blue-50 text-blue-700 ring-blue-100",
    movement: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    result: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    button:
      "bg-gradient-to-r from-emerald-600 to-green-500 shadow-emerald-600/25 hover:from-emerald-700 hover:to-green-600",
    accent: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
    icon: FiArrowDown,
    operator: "+",
  },
  out: {
    title: "Stock Out",
    subtitle: "سټاک مستقیم خارج کړئ",
    quantityLabel: "Quantity To Remove",
    quantityPashto: "خارجېدونکی مقدار",
    newStockLabel: "Remaining Stock",
    historyTitle: "Recent Stock Out History",
    submitLabel: "سټاک خارج ثبت کړئ",
    hero: "from-red-600 via-rose-500 to-orange-400",
    heroIcon: "bg-white/15 text-white ring-white/30",
    sectionNumber: "bg-red-100 text-red-700",
    soft: "from-red-50 to-orange-50",
    current: "bg-red-50 text-red-700 ring-red-100",
    movement: "bg-rose-50 text-rose-700 ring-rose-100",
    result: "bg-orange-50 text-orange-700 ring-orange-200",
    button:
      "bg-gradient-to-r from-red-600 to-rose-500 shadow-red-600/25 hover:from-red-700 hover:to-rose-600",
    accent: "text-red-600",
    badge: "bg-red-100 text-red-700",
    icon: FiArrowUp,
    operator: "−",
  },
};

const getMinimumStock = (product) =>
  Number(product?.min_stock ?? product?.low_stock_level ?? 0);

function getProductBadge(product) {
  const quantity = Number(product?.quantity || 0);
  const minimum = getMinimumStock(product);

  if (quantity <= 0) {
    return { label: "Out of Stock", className: "bg-red-100 text-red-700" };
  }

  if (quantity <= minimum) {
    return { label: "Low Stock", className: "bg-amber-100 text-amber-700" };
  }

  return { label: "In Stock", className: "bg-emerald-100 text-emerald-700" };
}

export default function StockMovementWorkspace({ type }) {
  const mode = type === "out" ? "out" : "in";
  const theme = themes[mode];
  const MovementIcon = theme.icon;
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [productResponse, historyResponse] = await Promise.all([
        productService.list({ page: 1, limit: 500, status: "all" }),
        stockService.movementHistory({ type: mode, page: 1, limit: 100 }),
      ]);

      const productRows = productResponse.data || [];
      setProducts(productRows);
      setHistory(historyResponse.data || []);

      const queryProduct = searchParams.get("product");
      setSelectedId((current) => {
        if (current && productRows.some((product) => product.id === current)) {
          return current;
        }
        if (queryProduct && productRows.some((product) => product.id === queryProduct)) {
          return queryProduct;
        }
        return productRows[0]?.id || "";
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "د سټاک معلومات ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, [mode, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;

    return products.filter((product) =>
      [product.name, product.sku, product.barcode, product.category].some((value) =>
        String(value || "").toLowerCase().includes(query),
      ),
    );
  }, [products, search]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) || null,
    [products, selectedId],
  );

  const currentStock = Number(selectedProduct?.quantity || 0);
  const movementQuantity = Math.max(0, Number(quantity || 0));
  const newStock =
    mode === "in"
      ? currentStock + movementQuantity
      : Math.max(0, currentStock - movementQuantity);
  const insufficient = mode === "out" && movementQuantity > currentStock;
  const productBadge = selectedProduct ? getProductBadge(selectedProduct) : null;
  const visibleHistory = showAll ? history : history.slice(0, 6);

  const submit = async (event) => {
    event.preventDefault();

    if (!selectedProduct) {
      toast.error("لومړی یو محصول انتخاب کړئ.");
      return;
    }

    if (movementQuantity <= 0) {
      toast.error("مقدار باید له صفر څخه زیات وي.");
      return;
    }

    if (insufficient) {
      toast.error("موجود سټاک د خارجېدونکي مقدار لپاره کافي نه دی.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        product_id: selectedProduct.id,
        quantity: movementQuantity,
        date,
        note: note.trim(),
        user: profile?.full_name || "Administrator",
      };

      if (mode === "in") await stockService.moveIn(payload);
      else await stockService.moveOut(payload);

      toast.success(mode === "in" ? "سټاک په بریالیتوب داخل شو." : "سټاک په بریالیتوب خارج شو.");
      setQuantity("");
      setNote("");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="ltr" className="page-enter space-y-5">
      <section
        className={`relative overflow-hidden rounded-[30px] bg-gradient-to-r ${theme.hero} px-5 py-6 text-white shadow-xl shadow-slate-900/10 sm:px-7 sm:py-7`}
      >
        <div className="pointer-events-none absolute -right-10 -top-16 size-52 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-72 rounded-full bg-slate-950/10 blur-3xl" />

        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{theme.title}</h1>
            <p dir="rtl" className="mt-1 text-right text-sm font-semibold text-white/85 sm:text-base">
              {theme.subtitle}
            </p>
          </div>

          <span
            className={`flex size-16 shrink-0 items-center justify-center rounded-[22px] text-3xl ring-1 backdrop-blur ${theme.heroIcon}`}
          >
            <MovementIcon />
          </span>
        </div>
      </section>

      {loading ? (
        <Card className="p-10">
          <Loading />
        </Card>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <section className="grid gap-5 xl:grid-cols-2">
            <Card className="overflow-hidden p-0">
              <SectionHeading number="1" title="Product Details" theme={theme} />

              <div className="space-y-5 p-4 sm:p-6">
                <div>
                  <label className="mb-2 block text-sm font-black text-slate-700">
                    Search Product
                  </label>
                  <div className="relative">
                    <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="field pl-11"
                      placeholder="Search by product name or barcode..."
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-black text-slate-700">
                    Select Product
                  </label>
                  <div className="relative">
                    <select
                      value={selectedId}
                      onChange={(event) => setSelectedId(event.target.value)}
                      className="field appearance-none pr-11"
                    >
                      <option value="">Select a product</option>
                      {filteredProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>

                {selectedProduct ? (
                  <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-2xl text-blue-600 shadow-sm ring-1 ring-slate-200">
                      {selectedProduct.image_url ? (
                        <img
                          src={selectedProduct.image_url}
                          alt={selectedProduct.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FiPackage />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-black text-slate-950">
                        {selectedProduct.name}
                      </h3>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {selectedProduct.category || "Warehouse Product"}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${productBadge.className}`}
                    >
                      {productBadge.label}
                    </span>
                  </article>
                ) : (
                  <EmptyState
                    title="محصول نه دی انتخاب شوی"
                    description="له پورته لېست څخه یو محصول انتخاب کړئ."
                  />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricInputCard
                    title="Current Stock"
                    value={formatNumber(currentStock)}
                    suffix={selectedProduct?.unit || "pcs"}
                    icon={FiBox}
                    className={theme.current}
                  />

                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">
                      {theme.quantityLabel}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0.01"
                        max={mode === "out" ? currentStock : undefined}
                        step="0.01"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        className={`field pr-16 font-black ${
                          insufficient
                            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                            : ""
                        }`}
                        placeholder="0"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        {selectedProduct?.unit || "pcs"}
                      </span>
                    </div>
                    <p dir="rtl" className="mt-1.5 text-right text-xs font-semibold text-slate-500">
                      {theme.quantityPashto}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">
                      Note <span className="font-medium text-slate-400">(Optional)</span>
                    </label>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      className="textarea-field min-h-24"
                      placeholder="Add a short note..."
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        className="field pr-11"
                      />
                      <FiCalendar className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className={`overflow-hidden bg-gradient-to-br ${theme.soft} p-0`}>
              <SectionHeading number="2" title="Stock Preview" theme={theme} />

              <div className="space-y-3 p-4 sm:p-6">
                <PreviewValue
                  title="Current Stock"
                  value={currentStock}
                  unit={selectedProduct?.unit || "pcs"}
                  className={theme.current}
                />

                <OperatorBadge value={theme.operator} theme={theme} />

                <PreviewValue
                  title={theme.quantityLabel}
                  value={movementQuantity}
                  unit={selectedProduct?.unit || "pcs"}
                  className={theme.movement}
                />

                <OperatorBadge value="=" theme={theme} />

                <PreviewValue
                  title={theme.newStockLabel}
                  value={newStock}
                  unit={selectedProduct?.unit || "pcs"}
                  className={theme.result}
                  strong
                />

                {insufficient ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
                    <FiAlertTriangle className="mt-0.5 shrink-0 text-xl" />
                    <p dir="rtl" className="flex-1 text-right text-sm font-bold leading-6">
                      موجود سټاک کافي نه دی. له موجود مقدار څخه زیات سټاک نشئ خارجولی.
                    </p>
                  </div>
                ) : selectedProduct && movementQuantity > 0 ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
                    <FiCheckCircle className="shrink-0 text-xl" />
                    <p dir="rtl" className="flex-1 text-right text-sm font-bold">
                      نوی سټاک د ثبت لپاره چمتو دی.
                    </p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={saving || !selectedProduct || movementQuantity <= 0 || insufficient}
                  className={`mt-2 inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:pointer-events-none disabled:opacity-50 ${theme.button}`}
                >
                  {saving ? <FiRefreshCw className="animate-spin" /> : <FiSave />}
                  <span dir="rtl">{saving ? "ثبتېږي..." : theme.submitLabel}</span>
                </button>
              </div>
            </Card>
          </section>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className={`flex size-10 items-center justify-center rounded-2xl ${theme.badge}`}>
                  <FiClock />
                </span>
                <div>
                  <h2 className="text-lg font-black text-slate-950 sm:text-xl">
                    {theme.historyTitle}
                  </h2>
                  <p dir="rtl" className="mt-0.5 text-right text-xs font-semibold text-slate-500">
                    وروستي مستقیم سټاک فعالیتونه
                  </p>
                </div>
              </div>

              {history.length > 6 ? (
                <button
                  type="button"
                  onClick={() => setShowAll((current) => !current)}
                  className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100"
                >
                  {showAll ? "Show Less" : "View All"}
                </button>
              ) : null}
            </div>

            {visibleHistory.length ? (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-[900px] w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-5 py-4 text-left font-black">Product</th>
                        <th className="px-5 py-4 text-center font-black">Quantity</th>
                        <th className="px-5 py-4 text-center font-black">Previous Stock</th>
                        <th className="px-5 py-4 text-center font-black">New Stock</th>
                        <th className="px-5 py-4 text-left font-black">Date</th>
                        <th className="px-5 py-4 text-left font-black">Note</th>
                        <th className="px-5 py-4 text-left font-black">User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleHistory.map((movement) => (
                        <tr key={movement.id} className="bg-white transition hover:bg-slate-50/80">
                          <td className="px-5 py-4 font-black text-slate-950">
                            {movement.product_name || "Unknown Product"}
                          </td>
                          <td className={`px-5 py-4 text-center font-black ${theme.accent}`}>
                            {mode === "in" ? "+" : "−"}
                            {formatNumber(movement.quantity)}
                          </td>
                          <td className="px-5 py-4 text-center font-bold text-slate-600">
                            {formatNumber(movement.previous_stock)}
                          </td>
                          <td className="px-5 py-4 text-center font-black text-slate-950">
                            {formatNumber(movement.new_stock)}
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-600">
                            {formatDate(movement.date || movement.created_at)}
                          </td>
                          <td className="max-w-56 truncate px-5 py-4 text-slate-600">
                            {movement.note || "—"}
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">
                              <FiUser /> {movement.user || "Administrator"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 p-3 md:hidden">
                  {visibleHistory.map((movement) => (
                    <article
                      key={movement.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-black text-slate-950">
                            {movement.product_name || "Unknown Product"}
                          </h3>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {formatDate(movement.date || movement.created_at)}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>
                          {mode === "in" ? "+" : "−"}
                          {formatNumber(movement.quantity)}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <HistoryMetric label="Previous Stock" value={movement.previous_stock} />
                        <HistoryMetric label="New Stock" value={movement.new_stock} strong />
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
                        <span className="min-w-0 truncate font-semibold text-slate-500">
                          {movement.note || "No note"}
                        </span>
                        <span className="shrink-0 font-black text-blue-700">
                          {movement.user || "Administrator"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-8">
                <EmptyState
                  title="د سټاک تاریخچه نشته"
                  description="کله چې سټاک ثبت شي، معلومات به دلته ښکاره شي."
                />
              </div>
            )}
          </Card>
        </form>
      )}
    </div>
  );
}

function SectionHeading({ number, title, theme }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
      <span className={`flex size-8 items-center justify-center rounded-xl text-sm font-black ${theme.sectionNumber}`}>
        {number}
      </span>
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
    </div>
  );
}

function MetricInputCard({ title, value, suffix, icon: Icon, className }) {
  return (
    <div>
      <p className="mb-2 text-sm font-black text-slate-700">{title}</p>
      <div className={`flex h-12 items-center gap-3 rounded-2xl px-4 ring-1 ${className}`}>
        <Icon className="text-xl" />
        <strong className="text-xl font-black text-slate-950">{value}</strong>
        <span className="ml-auto text-xs font-bold text-slate-400">{suffix}</span>
      </div>
    </div>
  );
}

function PreviewValue({ title, value, unit, className, strong = false }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${className}`}>
      <p className="text-xs font-black opacity-80">{title}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className={`${strong ? "text-3xl" : "text-2xl"} font-black text-slate-950`}>
          {formatNumber(value)}
        </p>
        <span className="pb-1 text-xs font-bold text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function OperatorBadge({ value, theme }) {
  return (
    <div className="flex justify-center">
      <span className={`flex size-9 items-center justify-center rounded-full border-4 border-white text-lg font-black shadow-sm ${theme.sectionNumber}`}>
        {value === "+" ? <FiPlus /> : value === "−" ? <FiMinus /> : value}
      </span>
    </div>
  );
}

function HistoryMetric({ label, value, strong = false }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className={`mt-1 ${strong ? "text-blue-700" : "text-slate-800"} text-base font-black`}>
        {formatNumber(value)}
      </p>
    </div>
  );
}