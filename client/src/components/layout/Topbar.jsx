import { useEffect, useRef, useState } from "react";
import { FiBell, FiMenu, FiSearch, FiX } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { notificationService } from "../../Services/wmsService";
import { queuedCount } from "../../lib/offlineStore";
import { syncOfflineQueue } from "../../lib/api";

export default function Topbar({ onMenu }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    notificationService.list({ unread: true, limit: 1 })
      .then((data) => active && setUnread(data.meta?.unread || 0))
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    let active = true;
    const refreshCount = () => queuedCount().then((count) => active && setPendingSync(count)).catch(() => {});
    const onOnline = () => { setOnline(true); refreshCount(); syncOfflineQueue().catch(() => {}); };
    const onOffline = () => setOnline(false);
    const onQueue = () => refreshCount();
    const onSync = (event) => {
      setSyncing(Boolean(event.detail?.syncing));
      refreshCount();
    };
    refreshCount();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("wms-offline-queue-changed", onQueue);
    window.addEventListener("wms-sync-state", onSync);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("wms-offline-queue-changed", onQueue);
      window.removeEventListener("wms-sync-state", onSync);
    };
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const value = query.trim();
    if (value) navigate(`/warehouse?q=${encodeURIComponent(value)}`);
  };

  const initials = (profile?.full_name || profile?.username || "A").trim().charAt(0).toUpperCase();

  return (
    <header dir="ltr" className="glass-card flex min-h-[66px] items-center gap-2 px-3 py-2.5 sm:px-4">
      <button className="icon-button size-10 xl:hidden" onClick={onMenu} aria-label="Open menu"><FiMenu /></button>

      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={() => online && syncOfflineQueue().catch(() => {})} className={`rounded-xl px-2.5 py-2 text-[10px] font-black ${online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} title={pendingSync ? `${pendingSync} بدلونونه Sync ته منتظر دي` : "د اتصال حالت"}>
          {syncing ? "Syncing…" : online ? (pendingSync ? `Online • ${pendingSync} pending` : "Online • Synced") : (pendingSync ? `Offline • ${pendingSync} pending` : "Offline")}
        </button>
        <Link to="/settings" className="flex items-center gap-2 rounded-2xl px-1 py-1 transition hover:bg-white/60">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-sky-500 text-base font-black text-white shadow-lg shadow-brand-600/20">{initials}</div>
          <div className="hidden md:block">
            <p className="max-w-36 truncate text-xs font-black text-slate-900">{profile?.full_name || "Administrator"}</p>
            <p className="text-[10px] text-slate-500">{profile?.role || "administrator"}</p>
          </div>
        </Link>

        <Link to="/notifications" className="icon-button relative size-10 shrink-0">
          <FiBell className="text-lg" />
          {unread > 0 ? <span className="absolute -left-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{unread > 99 ? "99+" : unread}</span> : null}
        </Link>
      </div>

      <form className="ml-auto flex min-w-0 items-center justify-end" onSubmit={submit}>
        <div className={`relative transition-all duration-300 ${searchOpen ? "w-[min(520px,58vw)]" : "w-10"}`}>
          {searchOpen ? (
            <>
              <FiSearch className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => !query && setSearchOpen(false)} className="field h-10 border-white/70 bg-white/65 pr-11 pl-10" placeholder="محصول، بارکوډ یا SKU ولټوئ..." />
              <button type="button" onClick={() => { setQuery(""); setSearchOpen(false); }} className="absolute left-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><FiX /></button>
            </>
          ) : (
            <button type="button" onClick={() => setSearchOpen(true)} className="icon-button size-10" aria-label="Open search"><FiSearch /></button>
          )}
        </div>
      </form>
    </header>
  );
}
