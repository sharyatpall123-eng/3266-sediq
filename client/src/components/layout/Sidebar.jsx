import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FiArchive,
  FiArrowDownCircle,
  FiArrowUpCircle,
  FiBell,
  FiCheck,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiCircle,
  FiFileText,
  FiHome,
  FiList,
  FiLogOut,
  FiPlus,
  FiSearch,
  FiSettings,
  FiTruck,
  FiUserPlus,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { useAuth } from "../../context/AuthContext";
import {
  notificationService,
  representativeService,
  warehouseService,
} from "../../Services/wmsService";
import { can } from "../../utils/permissions";
import { useSettings } from "../../context/SettingsContext";

const COLLAPSED_KEY = "wms-sidebar-compact";

function usesPermanentSidebar() {
  if (typeof window === "undefined") return true;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const touchPoints = typeof navigator !== "undefined" ? Number(navigator.maxTouchPoints || 0) : 0;
  const tabletLike =
    window.innerWidth <= 1400 &&
    touchPoints > 1 &&
    /iPad|Android|Macintosh/i.test(ua);
  return window.innerWidth >= 1280 && !tabletLike;
}

const groupMeta = {
  warehouse: {
    label: "Warehouse",
    icon: FiArchive,
    color: "text-[#63d5c0]",
  },
  debtors: {
    label: "Debtors",
    icon: FiUsers,
    color: "text-[#f3c35c]",
  },
  companies: {
    label: "Companies",
    icon: FiTruck,
    color: "text-[#63d5c0]",
  },
  reports: {
    label: "Reports",
    icon: FiFileText,
    color: "text-[#78aef5]",
  },
  notifications: {
    label: "Notifications",
    icon: FiBell,
    color: "text-[#78aef5]",
  },
  users: {
    label: "Users",
    icon: FiUsers,
    color: "text-[#63d5c0]",
  },
};

function readCompactPreference() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function routeStartsWith(pathname, route) {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

function routeGroup(pathname, search) {
  if (
    routeStartsWith(pathname, "/warehouse") ||
    routeStartsWith(pathname, "/stock-in") ||
    routeStartsWith(pathname, "/stock-out")
  ) {
    return "warehouse";
  }

  if (routeStartsWith(pathname, "/debtors")) return "debtors";
  if (routeStartsWith(pathname, "/representatives")) return "companies";
  if (routeStartsWith(pathname, "/reports")) return "reports";
  if (routeStartsWith(pathname, "/notifications")) return "notifications";

  if (routeStartsWith(pathname, "/users")) return "users";

  return null;
}

export default function Sidebar({
  open,
  onClose,
  compact,
  onCompactChange,
}) {
  const { logout, profile } = useAuth();
  const { settings } = useSettings();
  const lang = settings.language;
  const tr = (en, ps, fa = ps) => lang === "en" ? en : lang === "fa" ? fa : ps;
  const location = useLocation();
  const navigate = useNavigate();

  const [openGroup, setOpenGroup] = useState(() =>
    routeGroup(location.pathname, location.search),
  );
  const [warehouses, setWarehouses] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const [desktopMode, setDesktopMode] = useState(() =>
    usesPermanentSidebar(),
  );
  const loadedAtRef = useRef({
    warehouse: 0,
    companies: 0,
    notifications: 0,
  });

  const visualCompact = compact && desktopMode;

  const name = profile?.full_name || profile?.username || "Administrator";
  const email = profile?.email || "admin@local.test";
  const avatar = profile?.avatar_url;
  const initial = name.trim().charAt(0).toUpperCase() || "A";

  const canWarehouse = can(profile, "warehouse.view");
  const canWarehouseManage = can(profile, "warehouse.manage");
  const canStockIn = can(profile, "stock.in");
  const canStockOut = can(profile, "stock.out");
  const canDebtors = can(profile, "debtors.view");
  const canDebtorsManage = can(profile, "debtors.manage");
  const canCompanies = can(profile, "representatives.view");
  const canCompaniesManage = can(profile, "representatives.manage");
  const canReports = can(profile, "reports.view");
  const canNotifications = can(profile, "notifications.view");
  const canSettings = can(profile, "settings.view");
  const canUsers = can(profile, "users.manage");

  const loadSidebarData = useCallback(async (target, force = false) => {
    const jobs = [];
    const now = Date.now();
    const freshFor = 30_000;
    const needsLoad = (key) =>
      force || now - Number(loadedAtRef.current[key] || 0) > freshFor;

    if (target === "warehouse" && canWarehouse && needsLoad("warehouse")) {
      jobs.push(
        warehouseService
          .list({ limit: 100 })
          .then((response) => {
            setWarehouses(response?.data || []);
            loadedAtRef.current.warehouse = Date.now();
          })
          .catch(() => {}),
      );
    }

    if (target === "companies" && canCompanies && needsLoad("companies")) {
      jobs.push(
        representativeService
          .list({ limit: 100 })
          .then((response) => {
            setCompanies(response?.data || []);
            loadedAtRef.current.companies = Date.now();
          })
          .catch(() => {}),
      );
    }

    if (target === "notifications" && canNotifications && needsLoad("notifications")) {
      jobs.push(
        notificationService
          .list({ unread: true, limit: 1 })
          .then((response) => {
            setUnreadCount(
              Number(
                response?.meta?.unread ??
                  (response?.data || []).filter((item) => !item.is_read).length,
              ),
            );
            loadedAtRef.current.notifications = Date.now();
          })
          .catch(() => {}),
      );
    }

    await Promise.all(jobs);
  }, [canCompanies, canNotifications, canWarehouse]);

  useEffect(() => {
    loadSidebarData("notifications");
    const active = routeGroup(location.pathname, location.search);
    if (active === "warehouse" || active === "companies") {
      loadSidebarData(active);
    }
  }, [loadSidebarData, location.pathname, location.search]);

  useEffect(() => {
    const active = routeGroup(location.pathname, location.search);
    if (active) setOpenGroup(active);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncViewport = () => setDesktopMode(usesPermanentSidebar());
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, compact ? "1" : "0");
    } catch {
      // Ignore browser storage errors.
    }
  }, [compact]);

  const groups = useMemo(
    () =>
      [
        canWarehouse && "warehouse",
        canDebtors && "debtors",
        canCompanies && "companies",
        canReports && "reports",
        canNotifications && "notifications",
        canUsers && "users",
      ].filter(Boolean),
    [
      canCompanies,
      canDebtors,
      canNotifications,
      canReports,
      canUsers,
      canWarehouse,
    ],
  );

  const toggleGroup = async (group) => {
    const next = openGroup === group ? null : group;
    setOpenGroup(next);

    if (next === "warehouse" || next === "companies") {
      await loadSidebarData(next);
    }

    if (next === "notifications") {
      await loadSidebarData("notifications", true);
    }
  };

  const go = (to) => {
    navigate(to);
    if (!usesPermanentSidebar()) onClose?.();
  };

  const timeParts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(clock);

  const hour = timeParts.find((part) => part.type === "hour")?.value || "12";
  const minute = timeParts.find((part) => part.type === "minute")?.value || "00";
  const period = timeParts.find((part) => part.type === "dayPeriod")?.value || "";

  const timeText = `${period} ${hour}:${minute}`;

  const dateText = clock.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <>
      {open ? (
        <button
          type="button"
          className="wms-sidebar-overlay fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm xl:hidden"
          onClick={onClose}
          aria-label="Close menu"
        />
      ) : null}

      <aside
        className={[
          "fixed left-0 top-0 z-50 h-[100dvh] max-h-[100dvh] transition-all duration-300 ease-out",
          "xl:bottom-4 xl:left-4 xl:top-4 xl:h-auto xl:max-h-none",
          visualCompact ? "xl:w-[84px]" : "xl:w-[286px]",
          "w-[min(86vw,286px)] xl:w-auto",
          open ? "translate-x-0" : "-translate-x-full xl:translate-x-0",
          "wms-sidebar",
        ].join(" ")}
      >
        <div className="relative flex h-full min-h-0 flex-col overflow-visible rounded-[34px] bg-[#19233f] shadow-[0_28px_75px_rgba(12,22,48,.30)]">
          <ProfileCard
            name={name}
            email={email}
            avatar={avatar}
            initial={initial}
            visualCompact={visualCompact}
            onCompactChange={onCompactChange}
          />

          <section
            className={[
              "relative -mt-px flex min-h-0 flex-1 flex-col overflow-visible",
              "rounded-b-[34px] rounded-t-none",
              "bg-gradient-to-b from-[#232b49] via-[#1e2846] to-[#19233f]",
              "border-l border-b border-white/[0.05]",
              visualCompact ? "pt-6" : "pt-5 lg:pt-7",
            ].join(" ")}
          >
            <button
              type="button"
              className="wms-sidebar-close absolute right-3 top-3 z-30 flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white xl:hidden"
              onClick={onClose}
              aria-label="Close menu"
            >
              <FiX />
            </button>

            <nav
              className={[
                "relative z-20 min-h-0 flex-1 space-y-1.5 pl-3 pr-0",
                "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                visualCompact
                  ? "overflow-visible pb-3"
                  : "overflow-y-auto overscroll-contain pb-[max(16px,env(safe-area-inset-bottom))]",
              ].join(" ")}
            >
              <div className={visualCompact ? "" : "relative z-30 mt-1 mb-3 lg:-mt-1"}>
                <DirectItem
                  to="/"
                  label={tr("Dashboard", "عمومي", "عمومی")}
                  icon={FiHome}
                  iconColor="text-[#0d6872]"
                  visualCompact={visualCompact}
                  onNavigate={onClose}
                  end
                />
              </div>

              {groups.map((group) => (
                <SidebarGroup
                  key={group}
                  meta={{...groupMeta[group], label: group === "warehouse" ? tr("Warehouse", "ګدامونه", "گدام ها") : group === "debtors" ? tr("Debtors", "قرضداران", "بدهکاران") : group === "companies" ? tr("Companies", "ترانسپورتي شرکتونه", "شرکت های ترانسپورتی") : group === "reports" ? tr("Reports", "راپورونه", "گزارش ها") : group === "notifications" ? tr("Notifications", "خبرتیاوې", "اطلاعیه ها") : tr("Users", "غړي", "اعضا") }}
                  open={openGroup === group}
                  active={routeGroup(location.pathname, location.search) === group}
                  visualCompact={visualCompact}
                  unreadCount={
                    group === "notifications" ? unreadCount : 0
                  }
                  prominent={
                    group === "warehouse" ||
                    group === "debtors" ||
                    group === "companies"
                  }
                  onToggle={() => toggleGroup(group)}
                >
                  {group === "warehouse" ? (
                    <>
                      <SubItem
                        icon={FiHome}
                        label={tr("Overview", "عمومي کتنه", "نمای کلی")}
                        onClick={() => go("/warehouse")}
                        visualCompact={visualCompact}
                      />

                      {warehouses.length ? (
                        warehouses.map((warehouse) => (
                          <SubItem
                            key={warehouse.id}
                            icon={FiArchive}
                            label={warehouse.name}
                            onClick={() =>
                              go(
                                `/warehouse?warehouse=${encodeURIComponent(
                                  warehouse.id,
                                )}`,
                              )
                            }
                            visualCompact={visualCompact}
                          />
                        ))
                      ) : (
                        <SubText label="No warehouses" />
                      )}

                      {canWarehouseManage ? (
                        <SubItem
                          icon={FiPlus}
                          label={tr("Add Warehouse", "نوی ګدام", "گدام جدید")}
                          onClick={() => go("/warehouse?action=add")}
                          visualCompact={visualCompact}
                        />
                      ) : null}

                      {canStockIn ? (
                        <SubItem
                          icon={FiArrowDownCircle}
                          label={tr("Stock In", "مال داخلول", "ورود مال")}
                          onClick={() => go("/stock-in")}
                          visualCompact={visualCompact}
                        />
                      ) : null}

                      {canStockOut ? (
                        <SubItem
                          icon={FiArrowUpCircle}
                          label={tr("Stock Out", "مال ایستل", "خروج مال")}
                          onClick={() => go("/stock-out")}
                          visualCompact={visualCompact}
                        />
                      ) : null}
                    </>
                  ) : null}

                  {group === "debtors" ? (
                    <>
                      <SubItem
                        icon={FiHome}
                        label={tr("Overview", "عمومي کتنه", "نمای کلی")}
                        onClick={() => go("/debtors")}
                        visualCompact={visualCompact}
                      />

                      {canDebtorsManage ? (
                        <SubItem
                          icon={FiUserPlus}
                          label={tr("Add Debtor", "نوی قرضدار", "بدهکار جدید")}
                          onClick={() => go("/debtors?action=add")}
                          visualCompact={visualCompact}
                        />
                      ) : null}

                      <SubItem
                        icon={FiSearch}
                        label={tr("Search Debtors", "قرضداران ولټوه", "جستجوی بدهکاران")}
                        onClick={() => go("/debtors?focus=search")}
                        visualCompact={visualCompact}
                      />
                    </>
                  ) : null}

                  {group === "companies" ? (
                    <>
                      <SubItem
                        icon={FiHome}
                        label={tr("Overview", "عمومي کتنه", "نمای کلی")}
                        onClick={() => go("/representatives")}
                        visualCompact={visualCompact}
                      />

                      {companies.length ? (
                        companies.map((company) => (
                          <SubItem
                            key={company.id}
                            icon={FiTruck}
                            label={company.name}
                            onClick={() => go(`/representatives/${company.id}`)}
                            visualCompact={visualCompact}
                          />
                        ))
                      ) : (
                        <SubText label="No companies" />
                      )}

                      {canCompaniesManage ? (
                        <SubItem
                          icon={FiPlus}
                          label={tr("Add Company", "نوی استازی", "نماینده جدید")}
                          onClick={() => go("/representatives?action=add")}
                          visualCompact={visualCompact}
                        />
                      ) : null}
                    </>
                  ) : null}

                  {group === "reports" ? (
                    <>
                      <SubItem
                        icon={FiFileText}
                        label={tr("Stock Report", "د ګدام راپور", "گزارش گدام")}
                        onClick={() => go("/reports?section=stock")}
                        visualCompact={visualCompact}
                      />
                      <SubItem
                        icon={FiUsers}
                        label={tr("Debtors Report", "د قرضدارانو راپور", "گزارش بدهکاران")}
                        onClick={() => go("/reports?section=debtors")}
                        visualCompact={visualCompact}
                      />
                    </>
                  ) : null}

                  {group === "notifications" ? (
                    <>
                      <SubItem
                        icon={FiCheck}
                        label="All Read"
                        onClick={() => go("/notifications?filter=read")}
                        visualCompact={visualCompact}
                      />
                      <SubItem
                        icon={FiList}
                        label="All"
                        onClick={() => go("/notifications?filter=all")}
                        visualCompact={visualCompact}
                      />
                      <SubItem
                        icon={FiCircle}
                        label="Unread"
                        badge={unreadCount}
                        onClick={() => go("/notifications?filter=unread")}
                        visualCompact={visualCompact}
                      />
                    </>
                  ) : null}

                  {group === "users" ? (
                    <>
                      <SubItem
                        icon={FiUsers}
                        label={tr("Users List", "غړي", "اعضا")}
                        onClick={() => go("/users")}
                        visualCompact={visualCompact}
                      />
                      <SubItem
                        icon={FiUserPlus}
                        label={tr("Add User", "نوی غړی", "عضو جدید")}
                        onClick={() =>
                          go("/users?action=add")
                        }
                        visualCompact={visualCompact}
                      />
                    </>
                  ) : null}
                </SidebarGroup>
              ))}

              {canSettings ? (
                <DirectItem
                  to="/settings"
                  label={tr("Settings", "تنظیمات", "تنظیمات")}
                  icon={FiSettings}
                  iconColor="text-[#f3c35c]"
                  visualCompact={visualCompact}
                  onNavigate={onClose}

                />
              ) : null}

              <ActionItem
                label={tr("Logout", "وتل", "خروج")}
                icon={FiLogOut}
                color="text-[#63d5c0]"
                visualCompact={visualCompact}
                onClick={logout}
              />

              <div
                className={[
                  "relative z-20 mt-4 shrink-0",
                  visualCompact ? "pr-3" : "pr-3",
                ].join(" ")}
              >
                <SidebarClock
                  date={clock}
                  timeText={timeText}
                  dateText={dateText}
                  visualCompact={visualCompact}
                />

                {!visualCompact ? (
                  <p className="mb-2 mt-3 text-center text-[10px] font-medium tracking-wide text-slate-300">
                    WMS Pro&nbsp;&nbsp;•&nbsp;&nbsp;Version 2.0
                  </p>
                ) : null}
              </div>
            </nav>
          </section>
        </div>
      </aside>
    </>
  );
}

function ProfileCard({
  name,
  email,
  avatar,
  initial,
  visualCompact,
  onCompactChange,
}) {
  return (
    <div
      className={[
        "group/profile relative z-10 shrink-0 overflow-hidden",
        "border-x border-t border-[#2b8290]/45 bg-gradient-to-br from-[#0b5767] via-[#0d6170] to-[#0a5665]",
        visualCompact
          ? "mx-0 min-h-[118px] rounded-t-[28px] rounded-b-none px-2 py-4"
          : "min-h-[170px] rounded-t-[28px] rounded-b-none px-4 pb-4 pt-5 lg:min-h-[205px] lg:rounded-t-[34px] lg:px-5 lg:pb-5 lg:pt-7",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full bg-cyan-200/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 size-36 rounded-full bg-blue-950/10 blur-3xl" />

      {!visualCompact ? (
        <button
          type="button"
          onClick={() => onCompactChange?.(true)}
          className="absolute left-4 top-4 flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-white/70 opacity-0 transition group-hover/profile:opacity-100 focus:opacity-100"
          title="Compact sidebar"
        >
          <FiChevronLeft />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onCompactChange?.(false)}
          className="absolute left-1/2 top-3 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-white/80"
          title="Expand sidebar"
        >
          <FiChevronRight />
        </button>
      )}

      <div
        className={[
          "relative z-10 flex h-full flex-col items-center justify-center text-center",
          visualCompact ? "pt-7" : "",
        ].join(" ")}
      >
        <div
          className={[
            "relative flex shrink-0 items-center justify-center rounded-full border-[3px] border-white bg-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,.18)]",
            visualCompact ? "size-12" : "size-[66px] lg:size-[78px]",
          ].join(" ")}
        >
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span
              className={[
                "font-black text-white",
                visualCompact ? "text-xl" : "text-[28px] lg:text-[34px]",
              ].join(" ")}
            >
              {initial}
            </span>
          )}

          <span
            className={[
              "absolute rounded-full border-[3px] border-[#0d6170] bg-[#58ccb1]",
              visualCompact
                ? "-bottom-1 -right-1 size-4"
                : "-bottom-1 right-0 size-5",
            ].join(" ")}
          />
        </div>

        {!visualCompact ? (
          <>
            <p className="mt-3 max-w-full truncate text-[17px] font-black tracking-tight text-white lg:mt-4 lg:text-[19px]">
              {name}
            </p>
            <p className="mt-1 max-w-full truncate text-[10px] font-medium text-cyan-50/80 lg:text-[11px]">
              {email}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DirectItem({
  to,
  label,
  icon: Icon,
  iconColor,
  visualCompact,
  onNavigate,
  end = false,
  matchSearch,
}) {
  const location = useLocation();

  return (
    <NavLink
      to={to}
      end={end}
      dir="ltr"
      onClick={() => {
        if (!usesPermanentSidebar()) onNavigate?.();
      }}
      title={visualCompact ? label : undefined}
      className={({ isActive: routerActive }) => {
        const active =
          routerActive &&
          (typeof matchSearch === "function"
            ? matchSearch(location.search)
            : true);

        return [
          "group relative flex w-full items-center overflow-visible transition-all duration-200",
          "before:pointer-events-none before:absolute before:-top-[24px] before:right-0 before:size-[24px] before:rounded-br-[24px] before:bg-transparent",
          "after:pointer-events-none after:absolute after:-bottom-[24px] after:right-0 after:size-[24px] after:rounded-tr-[24px] after:bg-transparent",
          visualCompact
            ? "min-h-12 w-[calc(100%+22px)] justify-start gap-0 rounded-l-2xl rounded-r-none pl-[22px] pr-5"
            : "min-h-[54px] w-[calc(100%+28px)] gap-4 rounded-l-[999px] rounded-r-none pl-5 pr-8",
          active
            ? [
                "z-30 bg-[#f5f7fb] text-[#0d6570]",
                "before:shadow-[12px_12px_0_12px_#f5f7fb]",
                "after:shadow-[12px_-12px_0_12px_#f5f7fb]",
              ].join(" ")
            : [
                "text-slate-100",
                "hover:z-30 hover:bg-[#f5f7fb] hover:text-[#0d6570]",
                "hover:before:shadow-[12px_12px_0_12px_#f5f7fb]",
                "hover:after:shadow-[12px_-12px_0_12px_#f5f7fb]",
              ].join(" "),
        ].join(" ");
      }}
    >
      {({ isActive: routerActive }) => {
        const active =
          routerActive &&
          (typeof matchSearch === "function"
            ? matchSearch(location.search)
            : true);

        return (
          <>
            <span
              className={[
                "relative z-10 flex shrink-0 items-center justify-center text-[21px] transition-colors duration-200 group-hover:text-[#0d6570]",
                active ? "text-[#0d6570]" : iconColor || "text-slate-200",
              ].join(" ")}
            >
              <Icon />
            </span>

            {!visualCompact ? (
              <span
                className={[
                  "relative z-10 min-w-0 flex-1 truncate text-left text-[15px]",
                  active ? "font-black" : "font-semibold",
                ].join(" ")}
              >
                {label}
              </span>
            ) : null}
          </>
        );
      }}
    </NavLink>
  );
}

function SidebarGroup({
  meta,
  open,
  active,
  visualCompact,
  unreadCount,
  prominent = false,
  onToggle,
  children,
}) {
  const Icon = meta.icon;
  const highlighted = active || open;

  return (
    <div className="relative">
      <button
        type="button"
        dir="ltr"
        onClick={onToggle}
        title={visualCompact ? meta.label : undefined}
        className={[
          "group relative flex w-full items-center overflow-visible transition-all duration-200",
          "before:pointer-events-none before:absolute before:-top-[24px] before:right-0 before:size-[24px] before:rounded-br-[24px] before:bg-transparent",
          "after:pointer-events-none after:absolute after:-bottom-[24px] after:right-0 after:size-[24px] after:rounded-tr-[24px] after:bg-transparent",
          visualCompact
            ? "min-h-12 w-[calc(100%+22px)] justify-start rounded-l-2xl rounded-r-none pl-[22px] pr-5"
            : prominent
              ? "min-h-[54px] w-[calc(100%+28px)] gap-4 rounded-l-[999px] rounded-r-none pl-5 pr-8"
              : "min-h-[50px] w-[calc(100%+28px)] gap-4 rounded-l-[999px] rounded-r-none pl-5 pr-8",
          highlighted
            ? [
                "z-30 bg-[#f5f7fb] text-[#0d6570]",
                "before:shadow-[12px_12px_0_12px_#f5f7fb]",
                "after:shadow-[12px_-12px_0_12px_#f5f7fb]",
              ].join(" ")
            : [
                "text-slate-100",
                "hover:z-30 hover:bg-[#f5f7fb] hover:text-[#0d6570]",
                "hover:before:shadow-[12px_12px_0_12px_#f5f7fb]",
                "hover:after:shadow-[12px_-12px_0_12px_#f5f7fb]",
              ].join(" "),
        ].join(" ")}
      >
        <span
          className={[
            "relative z-10 flex shrink-0 items-center justify-center transition-colors duration-200 group-hover:text-[#0d6570]",
            prominent && !visualCompact ? "text-[22px]" : "text-[20px]",
            highlighted ? "text-[#0d6570]" : meta.color,
          ].join(" ")}
        >
          <Icon />
        </span>

        {!visualCompact ? (
          <>
            <span
              className={[
                "relative z-10 min-w-0 flex-1 truncate text-left tracking-tight",
                prominent
                  ? "text-[16px] font-semibold"
                  : "text-[15px] font-medium",
                highlighted ? "!font-black" : "",
              ].join(" ")}
            >
              {meta.label}
            </span>

            {unreadCount > 0 ? (
              <span className="relative z-10 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-black text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}

            <FiChevronDown
              className={[
                "relative z-10 shrink-0 text-[16px] transition-transform duration-300",
                highlighted ? "text-[#0d6570]" : "text-slate-200",
                open ? "rotate-180" : "rotate-0",
              ].join(" ")}
            />
          </>
        ) : null}
      </button>

      {!visualCompact ? (
        <div
          className={[
            "grid transition-all duration-300 ease-out",
            open
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          ].join(" ")}
        >
          <div className="overflow-hidden">
            <div className="relative ml-[26px] mt-1 space-y-0.5 pb-1 pl-[30px] before:absolute before:bottom-3 before:left-[8px] before:top-2 before:w-px before:bg-[#4ac3bd]/70">
              {children}
            </div>
          </div>
        </div>
      ) : open ? (
        <div className="absolute left-[calc(100%+12px)] top-0 z-[200] hidden w-60 rounded-[22px] border border-white/10 bg-[#1c2745]/98 p-2.5 text-white shadow-[0_24px_70px_rgba(2,16,46,.45)] backdrop-blur-xl lg:block">
          <div dir="ltr" className="mb-2 flex items-center gap-2 border-b border-white/10 px-2 pb-2">
            <span className={`text-lg ${meta.color}`}>
              <Icon />
            </span>
            <p className="font-black">{meta.label}</p>
          </div>
          <div className="space-y-1">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function SubItem({
  icon: Icon,
  label,
  onClick,
  badge = 0,
  visualCompact,
}) {
  return (
    <button
      type="button"
      dir="ltr"
      onClick={onClick}
      className={[
        "group/sub relative flex w-full items-center rounded-xl text-left text-slate-100 transition duration-200 hover:bg-white/[0.045]",
        visualCompact
          ? "min-h-10 gap-2 px-2.5 text-xs"
          : "min-h-[34px] gap-2 px-2 text-[12px] font-medium",
      ].join(" ")}
    >
      {!visualCompact ? (
        <span className="absolute -left-[26px] size-2.5 rounded-full border-2 border-[#1e2846] bg-[#54c8bd]" />
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-cyan-100">
          <Icon />
        </span>
      )}

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {badge > 0 ? (
        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-black text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}

function SubText({ label }) {
  return (
    <div className="relative min-h-[32px] px-2 py-2 text-[10px] font-medium text-slate-400">
      <span className="absolute -left-[26px] top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-[#1e2846] bg-[#54c8bd]" />
      {label}
    </div>
  );
}

function ActionItem({
  label,
  icon: Icon,
  color,
  visualCompact,
  onClick,
}) {
  return (
    <button
      type="button"
      dir="ltr"
      onClick={onClick}
      title={visualCompact ? label : undefined}
      className={[
        "group relative flex w-full items-center overflow-visible transition-all duration-200",
        "before:pointer-events-none before:absolute before:-top-[22px] before:right-[12px] before:size-[22px] before:rounded-br-[22px] before:bg-transparent",
        "after:pointer-events-none after:absolute after:-bottom-[22px] after:right-[12px] after:size-[22px] after:rounded-tr-[22px] after:bg-transparent",
        visualCompact
          ? "min-h-12 w-[calc(100%+22px)] justify-start rounded-l-2xl rounded-r-none pl-[22px] pr-5"
          : "min-h-[50px] w-[calc(100%+28px)] gap-4 rounded-l-[999px] rounded-r-none pl-5 pr-8",
        "text-slate-100",
        "hover:z-30 hover:bg-[#f5f7fb] hover:text-[#0d6570]",
        "hover:before:shadow-[12px_12px_0_12px_#f5f7fb]",
        "hover:after:shadow-[12px_-12px_0_12px_#f5f7fb]",
      ].join(" ")}
    >
      <span
        className={`relative z-10 text-[21px] transition-colors duration-200 ${color} group-hover:text-[#0d6570]`}
      >
        <Icon />
      </span>

      {!visualCompact ? (
        <span className="relative z-10 text-left text-[15px] font-medium">
          {label}
        </span>
      ) : null}
    </button>
  );
}

function SidebarClock({
  date,
  timeText,
  dateText,
  visualCompact,
}) {
  const seconds = date.getSeconds();
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;

  const point = (value, total, radius) => {
    const angle = (value / total) * Math.PI * 2 - Math.PI / 2;
    return {
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
    };
  };

  const hourPoint = point(hours, 12, 25);
  const minutePoint = point(minutes, 60, 33);
  const secondPoint = point(seconds, 60, 35);

  if (visualCompact) {
    return (
      <div
        className="group/clock relative mx-auto hidden size-13 items-center justify-center rounded-2xl bg-[#f7f8fa] shadow-[0_8px_22px_rgba(0,0,0,.16)] lg:flex"
        title={`${timeText} • ${dateText}`}
      >
        <AnalogClock
          hourPoint={hourPoint}
          minutePoint={minutePoint}
          secondPoint={secondPoint}
          compact
        />

        <div className="pointer-events-none absolute bottom-1/2 left-[calc(100%+12px)] z-[100] hidden w-44 translate-y-1/2 rounded-2xl border border-white/10 bg-[#1c2745]/95 p-3 shadow-2xl backdrop-blur-xl group-hover/clock:block">
          <p className="text-lg font-black text-white">{timeText}</p>
          <p className="mt-1 text-[10px] font-medium text-slate-300">
            {dateText}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/60 bg-[#f7f7f9] p-3 shadow-[0_14px_32px_rgba(5,15,35,.18)] lg:rounded-[26px] lg:p-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_76px] items-center gap-2 lg:grid-cols-[minmax(0,1fr)_92px]">
        <div className="min-w-0 pl-1 text-left">
          <p className="truncate text-[21px] font-black tracking-tight text-[#1c2744] lg:text-[25px]">
            {timeText}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-[#276979] lg:text-[12px]">
            {dateText}
          </p>
          <div className="mt-3 h-[3px] w-[96px] max-w-full rounded-full bg-gradient-to-r from-[#1599ad] via-[#1599ad] to-[#70c7c6]/25 lg:mt-4 lg:w-[112px]" />
        </div>

        <div className="flex size-[74px] items-center justify-center rounded-full lg:size-[92px]">
          <AnalogClock
            hourPoint={hourPoint}
            minutePoint={minutePoint}
            secondPoint={secondPoint}
          />
        </div>
      </div>
    </div>
  );
}

function AnalogClock({
  hourPoint,
  minutePoint,
  secondPoint,
  compact = false,
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={compact ? "size-10" : "size-[68px] lg:size-[88px]"}
      aria-label="Live analog clock"
    >
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="#f7f7f9"
        stroke="#d9dce5"
        strokeWidth="1.6"
      />

      <text x="50" y="17" textAnchor="middle" fill="#1f2945" fontSize="9" fontWeight="700">
        12
      </text>
      <text x="83" y="54" textAnchor="middle" fill="#1f2945" fontSize="9" fontWeight="700">
        3
      </text>
      <text x="50" y="89" textAnchor="middle" fill="#1f2945" fontSize="9" fontWeight="700">
        6
      </text>
      <text x="17" y="54" textAnchor="middle" fill="#1f2945" fontSize="9" fontWeight="700">
        9
      </text>

      {[5, 10, 20, 25, 35, 40, 50, 55].map((minute) => {
        const angle = (minute / 60) * Math.PI * 2 - Math.PI / 2;
        const x1 = 50 + Math.cos(angle) * 39;
        const y1 = 50 + Math.sin(angle) * 39;
        const x2 = 50 + Math.cos(angle) * 42;
        const y2 = 50 + Math.sin(angle) * 42;

        return (
          <line
            key={minute}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#222b45"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        );
      })}

      <line
        x1="50"
        y1="50"
        x2={hourPoint.x}
        y2={hourPoint.y}
        stroke="#374151"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <line
        x1="50"
        y1="50"
        x2={minutePoint.x}
        y2={minutePoint.y}
        stroke="#141b2e"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <line
        x1="50"
        y1="50"
        x2={secondPoint.x}
        y2={secondPoint.y}
        stroke="#5aaec1"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="5" fill="#2e7f8d" />
    </svg>
  );
}

export { readCompactPreference };
