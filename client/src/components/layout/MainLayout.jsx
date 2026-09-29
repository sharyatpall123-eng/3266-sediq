import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar, { readCompactPreference } from "./Sidebar";
import Topbar from "./Topbar";

export default function MainLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(readCompactPreference);
  const isDashboard = location.pathname === "/";

  return (
    <div
      className={`min-h-screen ${
        isDashboard ? "dashboard-background" : "page-background"
      }`}
    >
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        compact={sidebarCompact}
        onCompactChange={setSidebarCompact}
      />

      <div
        className={[
          "wms-shell-content min-h-screen transition-[margin] duration-300 ease-out",
          sidebarCompact ? "xl:ml-[100px]" : "xl:ml-[302px]",
        ].join(" ")}
      >
        <div className="wms-topbar-wrap sticky top-0 z-30 p-3 sm:p-4 lg:p-4">
          <Topbar onMenu={() => setMenuOpen(true)} />
        </div>

        <main className="wms-main-content px-3 pb-6 sm:px-4 lg:px-4">
          <div className="wms-page-frame min-h-[calc(100vh-116px)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
