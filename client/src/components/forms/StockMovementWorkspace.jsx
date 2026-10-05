import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FiArrowDown,
  FiArrowRight,
  FiArrowUp,
  FiBox,
  FiCalendar,
  FiPackage,
  FiSave,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Card from "../ui/Card";
import Loading from "../ui/Loading";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../lib/api";
import { productService, stockService } from "../../Services/wmsService";
import { formatNumber } from "../../utils/format";

const today = () => new Date().toISOString().slice(0, 10);

export default function StockMovementWorkspace({ type }) {
  const mode = type === "out" ? "out" : "in";
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedProductId = searchParams.get("product") || "";
  const requestedWarehouseId = searchParams.get("warehouse") || "";
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(requestedProductId);
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await productService.list({ page: 1, limit: 300, status: "all" });
      const rows = response?.data || [];
      setProducts(rows);
      if (requestedProductId && rows.some((p) => String(p.id) === String(requestedProductId))) {
        setSelectedId(requestedProductId);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "د محصولاتو معلومات ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, [requestedProductId]);

  useEffect(() => { load(); }, [load]);

  const selectedProduct = useMemo(
    () => products.find((product) => String(product.id) === String(selectedId)) || null,
    [products, selectedId],
  );
  const currentStock = Number(selectedProduct?.quantity || 0);
  const amount = Math.max(0, Number(quantity || 0));
  const nextStock = mode === "in" ? currentStock + amount : Math.max(0, currentStock - amount);
  const insufficient = mode === "out" && amount > currentStock;
  const MovementIcon = mode === "in" ? FiArrowDown : FiArrowUp;
  const isLocked = Boolean(requestedProductId && selectedProduct);

  const goBack = () => {
    if (requestedWarehouseId) {
      navigate(`/warehouse?warehouse=${encodeURIComponent(requestedWarehouseId)}`);
      return;
    }
    navigate(-1);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedProduct) return toast.error("محصول انتخاب کړئ.");
    if (amount <= 0) return toast.error("تعداد باید له صفر څخه زیات وي.");
    if (insufficient) return toast.error("موجود سټاک کافي نه دی.");
    setSaving(true);
    try {
      const payload = {
        product_id: selectedProduct.id,
        quantity: amount,
        date: today(),
        note: "",
        user: profile?.full_name || "Administrator",
      };
      if (mode === "in") await stockService.moveIn(payload);
      else await stockService.moveOut(payload);
      toast.success(mode === "in" ? "سټاک داخل شو." : "سټاک خارج شو.");
      setQuantity("");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="page-enter mx-auto w-full max-w-3xl py-2 sm:py-4 lg:py-6">
      <Card className="wms-stock-workspace overflow-hidden p-0">
        <div className={`flex items-center justify-between gap-3 px-4 py-3.5 text-white sm:px-6 lg:px-7 lg:py-4 ${mode === "in" ? "bg-gradient-to-l from-emerald-700 to-cyan-500" : "bg-gradient-to-l from-rose-700 to-orange-500"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-xl text-white transition hover:bg-white/25"
              aria-label="شاته"
              title="شاته"
            >
              <FiArrowRight />
            </button>
            <div className="min-w-0 text-right">
              <h1 className="truncate text-lg font-black sm:text-xl lg:text-2xl">{mode === "in" ? "سټاک داخلول" : "سټاک ایستل"}</h1>
              <p className="mt-0.5 text-[10px] font-bold text-white/80 sm:text-xs">ساده، چټک او واضح ثبت</p>
            </div>
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-xl ring-1 ring-white/25 sm:size-11"><MovementIcon /></span>
        </div>

        {loading ? <div className="p-8"><Loading /></div> : (
          <form onSubmit={submit} className="space-y-4 p-4 sm:p-5 lg:p-7">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black text-slate-700">محصول</span>
                {isLocked ? (
                  <div className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                    <FiPackage className="shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1 truncate font-black text-slate-900">{selectedProduct.name}</span>
                    <span className="text-[10px] font-bold text-slate-400">ثابت</span>
                  </div>
                ) : (
                  <select className="field h-12" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                    <option value="">محصول انتخاب کړئ</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                )}
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="flex items-center gap-1 text-[10px] font-black text-slate-500"><FiCalendar /> تاریخ</p>
                <p className="mt-1 text-sm font-black text-slate-800" dir="ltr">{today()}</p>
              </div>
            </div>

            {selectedProduct ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="flex items-center gap-2 text-[11px] font-black text-blue-600"><FiBox /> اوسنی سټاک</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(currentStock)}</p>
                </div>

                <div className={`rounded-2xl border px-4 py-3 ${insufficient ? "border-red-200 bg-red-50" : mode === "in" ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50"}`}>
                  <p className="text-[11px] font-black text-slate-600">له ثبت وروسته</p>
                  <p dir="ltr" className={`mt-1 text-xl font-black ${insufficient ? "text-red-600" : mode === "in" ? "text-emerald-700" : "text-orange-700"}`}>
                    {formatNumber(currentStock)} {mode === "in" ? "+" : "−"} {formatNumber(amount)} = {formatNumber(nextStock)}
                  </p>
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-xs font-black text-slate-700">تعداد</span>
              <input
                autoFocus={isLocked}
                type="number"
                min="0.01"
                step="0.01"
                max={mode === "out" ? currentStock : undefined}
                className="field h-12 text-lg font-black"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </label>

            {insufficient ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600">موجود سټاک کافي نه دی.</p> : null}

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button type="submit" disabled={saving || !selectedProduct || amount <= 0 || insufficient} className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl px-8 font-black text-white shadow-lg disabled:opacity-50 ${mode === "in" ? "bg-gradient-to-l from-emerald-700 to-cyan-500" : "bg-gradient-to-l from-rose-700 to-orange-500"}`}>
                <FiSave /> {saving ? "ثبتېږي..." : "ثبت"}
              </button>
              <button type="button" onClick={goBack} className="secondary-button h-12 rounded-xl px-6">
                <FiArrowRight /> شاته
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
