import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiBell, FiCheckCircle, FiPackage, FiTrash2, FiUsers } from "react-icons/fi";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Loading from "../components/ui/Loading";
import PageHeader from "../components/ui/PageHeader";
import { getErrorMessage } from "../lib/api";
import { notificationService } from "../Services/wmsService";
import { formatDate } from "../utils/format";

const icons = { low_stock: FiPackage, stock_in: FiPackage, stock_out: FiPackage, payment: FiCheckCircle, debtor: FiUsers };
const tones = {
  low_stock: "bg-amber-100 text-amber-700",
  stock_in: "bg-emerald-100 text-emerald-700",
  stock_out: "bg-blue-100 text-blue-700",
  payment: "bg-violet-100 text-violet-700",
  debtor: "bg-red-100 text-red-700",
};

export default function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const initialFilter = ["all", "read", "unread"].includes(
    searchParams.get("filter"),
  )
    ? searchParams.get("filter")
    : "all";
  const [filter, setFilter] = useState(initialFilter);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await notificationService.list({
        unread: filter === "unread" ? true : undefined,
        limit: 100,
      });

      const rows = response.data || [];
      setItems(
        filter === "read"
          ? rows.filter((item) => item.is_read)
          : rows,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "خبرتیاوې ترلاسه نه شوې."));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const requested = searchParams.get("filter");
    if (["all", "read", "unread"].includes(requested)) {
      setFilter(requested);
    }
  }, [searchParams]);

  const changeFilter = (value) => {
    setFilter(value);
    const next = new URLSearchParams(searchParams);
    next.set("filter", value);
    setSearchParams(next, { replace: true });
  };

  const markRead = async (item) => {
    if (item.is_read) return;
    try {
      await notificationService.markRead(item.id);
      setItems((current) =>
        filter === "unread"
          ? current.filter((entry) => entry.id !== item.id)
          : current.map((entry) =>
              entry.id === item.id ? { ...entry, is_read: true } : entry,
            ),
      );
    } catch (error) { toast.error(getErrorMessage(error)); }
  };

  const markAll = async () => {
    try {
      await notificationService.markAllRead();
      setItems((current) => current.map((entry) => ({ ...entry, is_read: true })));
      toast.success("ټولې خبرتیاوې لوستل شوې.");
    } catch (error) { toast.error(getErrorMessage(error)); }
  };

  const remove = async (id) => {
    try {
      await notificationService.remove(id);
      setItems((current) => current.filter((entry) => entry.id !== id));
    } catch (error) { toast.error(getErrorMessage(error)); }
  };

  return (
    <Card className="page-enter p-5 sm:p-6">
      <PageHeader
        title="خبرتیاوې"
        subtitle="Low stock، Stock movements او Payment notifications"
        actions={<Button variant="secondary" onClick={markAll}><FiCheckCircle /> ټول لوستل شوي</Button>}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {[['all','ټولې'],['read','لوستل شوې'],['unread','نا لوستل شوې']].map(([value, label]) => <button key={value} onClick={() => changeFilter(value)} className={`rounded-2xl px-4 py-2.5 text-sm font-black transition ${filter === value ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50"}`}>{label}</button>)}
      </div>

      {loading ? <Loading /> : items.length === 0 ? <EmptyState title="خبرتیا نشته" description="نوې خبرتیاوې به دلته ښکاره شي." /> : (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = icons[item.type] || FiBell;
            return (
              <article key={item.id} onClick={() => markRead(item)} className={`flex cursor-pointer items-start gap-4 rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${item.is_read ? "border-slate-200 bg-white/70" : "border-brand-200 bg-brand-50/90 shadow-md shadow-brand-900/5"}`}>
                <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl ${tones[item.type] || "bg-slate-100 text-slate-600"}`}><Icon /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{item.title}</h3>{!item.is_read ? <span className="size-2 rounded-full bg-brand-600" /> : null}</div><p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p><p className="mt-2 text-xs font-bold text-slate-400">{formatDate(item.created_at)}</p></div>
                <button className="icon-button shrink-0 text-red-600" onClick={(event) => { event.stopPropagation(); remove(item.id); }}><FiTrash2 /></button>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
