import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "../components/layout/MainLayout";
import Loading from "../components/ui/Loading";
import ProtectedRoute from "./ProtectedRoute";
import PermissionRoute from "./PermissionRoute";
import { useAuth } from "../context/AuthContext";

const LoginPage = lazy(() => import("../pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("../pages/ResetPasswordPage"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const WarehousePage = lazy(() => import("../pages/WarehousePage"));
const ProductStockHistoryPage = lazy(() => import("../pages/ProductStockHistoryPage"));
const StockInPage = lazy(() => import("../pages/StockInPage"));
const StockOutPage = lazy(() => import("../pages/StockOutPage"));
const DebtorsPage = lazy(() => import("../pages/DebtorsPage"));
const DebtorDetailsPage = lazy(() => import("../pages/DebtorDetailsPage"));
const RepresentativesPage = lazy(() => import("../pages/RepresentativesPage"));
const RepresentativeDetailsPage = lazy(() => import("../pages/RepresentativeDetailsPage"));
const RepresentativeGoodsDetailsPage = lazy(() => import("../pages/RepresentativeGoodsDetailsPage"));
const RepresentativeAccountPage = lazy(() => import("../pages/RepresentativeAccountPage"));
const RepresentativeAccountReportPage = lazy(() => import("../pages/RepresentativeAccountReportPage"));
const ReportsPage = lazy(() => import("../pages/ReportsPage"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const UsersPage = lazy(() => import("../pages/UsersPage"));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loading />
    </div>
  );
}

function Lazy({ children }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export default function AppRoutes() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile?.id) return undefined;
    const preload = async () => {
      const modules = Promise.allSettled([
        import("../pages/WarehousePage"),
        import("../pages/StockInPage"),
        import("../pages/StockOutPage"),
        import("../pages/DebtorsPage"),
        import("../pages/DebtorDetailsPage"),
        import("../pages/RepresentativesPage"),
        import("../pages/RepresentativeDetailsPage"),
        import("../pages/RepresentativeGoodsDetailsPage"),
        import("../pages/RepresentativeAccountPage"),
        import("../pages/ReportsPage"),
        import("../pages/NotificationsPage"),
        import("../pages/UsersPage"),
        import("../pages/SettingsPage"),
        import("../pages/ProductStockHistoryPage"),
      ]);

      const servicesPromise = import("../Services/wmsService");
      const services = await servicesPromise;

      await Promise.allSettled([
        services.dashboardService.prefetch?.(),
        services.productService.prefetchList?.({ status: "all", page: 1, limit: 500 }),
        services.warehouseService.prefetchList?.({ limit: 500 }),
        services.debtorService.prefetchList?.({ search: "", limit: 100 }),
        services.representativeService.prefetchList?.({ search: "", limit: 100 }),
        services.notificationService.prefetchList?.({ limit: 100 }),
        services.settingsService.prefetch?.(),
        services.settingsService.prefetchAccess?.(),
      ]);

      const now = new Date();
      const fromDate = new Date(now);
      fromDate.setMonth(fromDate.getMonth() - 5);
      fromDate.setDate(1);
      const from = fromDate.toISOString().slice(0, 10);
      const to = now.toISOString().slice(0, 10);

      await Promise.allSettled([
        services.reportService.prefetch?.({ from, to }),
        services.representativeService.prefetchList?.({ limit: 200 }),
        services.stockService.prefetchMovementHistory?.({ limit: 500 }),
      ]);

      await modules;
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }

    const timer = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(timer);
  }, [profile?.id]);

  return (
    <Routes>
      <Route path="/login" element={<Lazy><LoginPage /></Lazy>} />
      <Route path="/reset-password" element={<Lazy><ResetPasswordPage /></Lazy>} />
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Lazy><DashboardPage /></Lazy>} />
        <Route path="warehouse" element={<Lazy><WarehousePage /></Lazy>} />
        <Route path="warehouse/products/:productId/history" element={<Lazy><ProductStockHistoryPage /></Lazy>} />
        <Route path="stock-in" element={<PermissionRoute permission="stock.in"><Lazy><StockInPage /></Lazy></PermissionRoute>} />
        <Route path="stock-out" element={<PermissionRoute permission="stock.out"><Lazy><StockOutPage /></Lazy></PermissionRoute>} />
        <Route path="debtors" element={<Lazy><DebtorsPage /></Lazy>} />
        <Route path="debtors/:id" element={<Lazy><DebtorDetailsPage /></Lazy>} />
        <Route path="representatives" element={<PermissionRoute permission="representatives.view"><Lazy><RepresentativesPage /></Lazy></PermissionRoute>} />
        <Route path="representatives/:id" element={<PermissionRoute permission="representatives.view"><Lazy><RepresentativeDetailsPage /></Lazy></PermissionRoute>} />
        <Route path="representatives/:id/goods/:goodsId" element={<PermissionRoute permission="representatives.view"><Lazy><RepresentativeGoodsDetailsPage /></Lazy></PermissionRoute>} />
        <Route path="representatives/:id/account" element={<PermissionRoute permission="representatives.view"><Lazy><RepresentativeAccountPage /></Lazy></PermissionRoute>} />
        <Route path="representatives/:id/account/report" element={<PermissionRoute permission="representatives.view"><Lazy><RepresentativeAccountReportPage /></Lazy></PermissionRoute>} />
        <Route path="reports" element={<PermissionRoute permission="reports.view"><Lazy><ReportsPage /></Lazy></PermissionRoute>} />
        <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
        <Route path="users" element={<PermissionRoute permission="users.manage"><Lazy><UsersPage /></Lazy></PermissionRoute>} />
        <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
