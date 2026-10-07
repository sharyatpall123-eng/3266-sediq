import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowDown, FiArrowLeft, FiArrowUp, FiBox, FiCalendar, FiEdit2,
  FiEye, FiHash, FiPackage, FiRefreshCw, FiTrash2, FiUser,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Card from "../components/ui/Card";
import Loading from "../components/ui/Loading";
import Modal from "../components/ui/Modal";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/api";
import { productService, stockService } from "../Services/wmsService";
import { formatDate, formatNumber } from "../utils/format";
import { can } from "../utils/permissions";

export default function ProductStockHistoryPage() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const { profile } = useAuth();
  const canManage = can(profile, "warehouse.manage");
  const canDelete = can(profile, "warehouse.delete");
  const cachedProduct = productService.peek?.(productId);
  const cachedMovements = stockService.peekMovementHistory?.({ product_id: productId, limit: 500 });
  const [product, setProduct] = useState(() => cachedProduct || null);
  const [movements, setMovements] = useState(() => cachedMovements?.data || []);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(() => !(cachedProduct && cachedMovements));
  const [editOpen, setEditOpen] = useState(false);

  const load = async (force = false) => {
    const warm = productService.peek?.(productId) &&
      stockService.peekMovementHistory?.({ product_id: productId, limit: 500 });
    if (!warm) setLoading(true);
    try {
      const [productData, movementResponse] = await Promise.all([
        productService.get(productId, { force }),
        stockService.movementHistory({ product_id: productId, limit: 500 }, { force }),
      ]);
      setProduct(productData || null);
      setMovements(movementResponse.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, "د جنس هسټوري ترلاسه نه شوه."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [productId]);

  const rows = useMemo(
    () => filter === "all" ? movements : movements.filter((item) => (item.type || item.movement_type) === filter),
    [filter, movements],
  );

  const totals = useMemo(() => movements.reduce((result, item) => {
    const type = item.type || item.movement_type;
    const quantity = Number(item.quantity || 0);
    if (type === "in") result.stockIn += quantity;
    if (type === "out") result.stockOut += quantity;
    return result;
  }, { stockIn: 0, stockOut: 0 }), [movements]);

  const removeProduct = async () => {
    if (!product || !window.confirm(`آیا ${product.name} حذف شي؟`)) return;
    try {
      await productService.remove(product.id);
      toast.success("محصول حذف شو.");
      navigate(-1);
    } catch (error) {
      toast.error(getErrorMessage(error, "محصول حذف نه شو."));
    }
  };

  if (loading) return <Loading label="د جنس هسټوري راوړل کېږي..." />;

  return (
    <div className="page-enter space-y-4 sm:space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-slate-950 px-4 py-5 text-white shadow-xl shadow-slate-900/10 sm:px-6 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 size-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 transition hover:bg-white/20">
            <FiArrowLeft />
          </button>
          <div className="min-w-0 flex-1" dir="rtl">
            <div className="flex items-center gap-2 text-[11px] font-black text-blue-200"><FiEye /> د محصول بشپړ جزیات او هسټوري</div>
            <h1 className="pashto-text mt-1 truncate text-2xl font-black sm:text-3xl">{product?.name || "د جنس هسټوري"}</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-300">
              {product?.sku ? <span className="rounded-lg bg-white/10 px-2.5 py-1"><FiHash className="inline" /> {product.sku}</span> : null}
              {product?.category ? <span className="rounded-lg bg-white/10 px-2.5 py-1"><FiPackage className="inline" /> {product.category}</span> : null}
            </div>
          </div>
          <button type="button" onClick={() => load(true)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 transition hover:bg-white/20">
            <FiRefreshCw />
          </button>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          {canManage ? (
            <button type="button" onClick={() => setEditOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-xs font-black text-slate-950 transition hover:bg-amber-300">
              <FiEdit2 /> ایډیټ
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={removeProduct}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-xs font-black text-white transition hover:bg-red-600">
              <FiTrash2 /> ډلیټ
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <Summary label="ټول داخل" value={totals.stockIn} icon={FiArrowDown} tone="emerald" />
        <Summary label="ټول خارج" value={totals.stockOut} icon={FiArrowUp} tone="red" />
        <Summary label="اوسنی موجود" value={product?.quantity} icon={FiBox} tone="blue" />
      </section>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white p-3 sm:p-4">
          <div dir="rtl" className="flex items-center gap-2">
            <Filter active={filter === "all"} onClick={() => setFilter("all")}>ټول</Filter>
            <Filter active={filter === "in"} onClick={() => setFilter("in")} tone="emerald">داخل</Filter>
            <Filter active={filter === "out"} onClick={() => setFilter("out")} tone="red">خارج</Filter>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{formatNumber(rows.length)} فعالیتونه</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm font-bold text-slate-500">د دې جنس لپاره هسټوري نشته.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table dir="rtl" className="w-full min-w-[860px] text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr>
                  <th className="px-4 py-3 text-right font-black">نېټه</th>
                  <th className="px-4 py-3 text-center font-black">عملیات</th>
                  <th className="px-4 py-3 text-center font-black">مقدار</th>
                  <th className="px-4 py-3 text-center font-black">وروستی موجود</th>
                  <th className="px-4 py-3 text-right font-black">اجراکوونکی</th>
                  <th className="px-4 py-3 text-right font-black">یادښت</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{rows.map((item, index) => <HistoryRow key={item.id || index} item={item} />)}</tbody>
              </table>
            </div>
            <div className="space-y-2.5 bg-slate-50/50 p-3 md:hidden">
              {rows.map((item, index) => <HistoryMobileCard key={item.id || index} item={item} />)}
            </div>
          </>
        )}
      </Card>

      <Modal open={editOpen && canManage} onClose={() => setEditOpen(false)} title="د محصول اصلاح" size="md">
        {product ? <EditProductForm product={product} onCancel={() => setEditOpen(false)} onSaved={async () => {
          setEditOpen(false);
          await load(true);
        }} /> : null}
      </Modal>
    </div>
  );
}

function Summary({ label, value, icon: Icon, tone }) {
  const styles = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    red: "border-red-100 bg-red-50 text-red-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
  };
  return <article className={`min-w-0 rounded-2xl border p-3 shadow-sm sm:p-4 ${styles[tone]}`}>
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0"><p className="pashto-text truncate text-[10px] font-black sm:text-xs">{label}</p>
        <p className="mt-1 truncate text-xl font-black text-slate-950 sm:text-3xl">{formatNumber(value || 0)}</p></div>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/80 sm:size-10"><Icon /></span>
    </div>
  </article>;
}

function Filter({ active, onClick, tone = "blue", children }) {
  const activeStyle = tone === "emerald" ? "border-emerald-600 bg-emerald-600" : tone === "red" ? "border-red-600 bg-red-600" : "border-blue-600 bg-blue-600";
  return <button type="button" onClick={onClick}
    className={`h-9 rounded-xl border px-3 text-xs font-black transition ${active ? `${activeStyle} text-white shadow-sm` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{children}</button>;
}

function HistoryRow({ item }) {
  const isIn = (item.type || item.movement_type) === "in";
  return <tr className="bg-white hover:bg-slate-50/70">
    <td className="px-4 py-3 text-right font-bold text-slate-700">{formatDate(item.created_at || item.date)}</td>
    <td className="px-4 py-3 text-center"><MovementBadge isIn={isIn} /></td>
    <td className={`px-4 py-3 text-center font-black ${isIn ? "text-emerald-600" : "text-red-600"}`}>{isIn ? "+" : "-"}{formatNumber(item.quantity)}</td>
    <td className="px-4 py-3 text-center font-black text-blue-700">{item.balance_after == null ? "—" : formatNumber(item.balance_after)}</td>
    <td className="px-4 py-3 text-right font-bold text-slate-700"><FiUser className="ml-1 inline text-slate-400" />{item.user_name || "نامعلوم کارن"}</td>
    <td className="px-4 py-3 text-right font-semibold text-slate-500">{item.note || item.notes || "—"}</td>
  </tr>;
}

function HistoryMobileCard({ item }) {
  const isIn = (item.type || item.movement_type) === "in";
  return <article className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><MovementBadge isIn={isIn} />
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><FiCalendar /> {formatDate(item.created_at || item.date)}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Metric label="مقدار" value={`${isIn ? "+" : "-"}${formatNumber(item.quantity)}`} tone={isIn ? "text-emerald-600" : "text-red-600"} />
      <Metric label="وروستی موجود" value={item.balance_after == null ? "—" : formatNumber(item.balance_after)} tone="text-blue-700" />
    </div>
    <div dir="rtl" className="mt-2.5 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
      <span className="flex size-7 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><FiUser /></span>
      <span className="min-w-0 truncate">{item.user_name || "نامعلوم کارن"}</span>
    </div>
    {(item.note || item.notes) ? <p dir="rtl" className="pashto-text mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{item.note || item.notes}</p> : null}
  </article>;
}

function Metric({ label, value, tone }) {
  return <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="pashto-text text-[10px] font-bold text-slate-500">{label}</p><p className={`mt-1 text-base font-black ${tone}`}>{value}</p></div>;
}

function MovementBadge({ isIn }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black ${isIn ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
    {isIn ? <FiArrowDown /> : <FiArrowUp />}{isIn ? "داخل" : "خارج"}
  </span>;
}

function EditProductForm({ product, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || "", sku: product.sku || "", barcode: product.barcode || "",
    category: product.category || "", unit: product.unit || "pcs",
    min_stock: product.min_stock ?? 0, purchase_price: product.purchase_price ?? 0,
    selling_price: product.selling_price ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await productService.update(product.id, form);
      toast.success("محصول اصلاح شو.");
      await onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, "محصول اصلاح نه شو."));
    } finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="space-y-4" dir="rtl">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="د جنس نوم" value={form.name} onChange={change("name")} required />
      <Field label="SKU" value={form.sku} onChange={change("sku")} />
      <Field label="بارکوډ" value={form.barcode} onChange={change("barcode")} />
      <Field label="کټګوري" value={form.category} onChange={change("category")} />
      <Field label="واحد" value={form.unit} onChange={change("unit")} />
      <Field label="کم سټاک حد" type="number" value={form.min_stock} onChange={change("min_stock")} />
      <Field label="د خرید قیمت" type="number" value={form.purchase_price} onChange={change("purchase_price")} />
      <Field label="د خرڅ قیمت" type="number" value={form.selling_price} onChange={change("selling_price")} />
    </div>
    <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">د موجودي مقدار د Stock In / Stock Out له لارې بدل کړئ، څو هسټوري سمه پاتې شي.</p>
    <div className="flex gap-2">
      <button type="submit" disabled={saving} className="h-10 flex-1 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-60">{saving ? "ثبتېږي..." : "بدلون ثبت کړه"}</button>
      <button type="button" onClick={onCancel} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-600">لغوه</button>
    </div>
  </form>;
}

function Field({ label, ...props }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black text-slate-600">{label}</span>
    <input {...props} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
  </label>;
}
