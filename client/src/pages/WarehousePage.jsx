import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FiAlertTriangle,
  FiArrowDown,
  FiArrowLeft,
  FiArrowUp,
  FiBox,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiDollarSign,
  FiDownload,
  FiEdit2,
  FiEye,
  FiFilter,
  FiHome,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Loading from "../components/ui/Loading";
import Modal from "../components/ui/Modal";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { getErrorMessage } from "../lib/api";
import { productService, stockService, warehouseService } from "../Services/wmsService";
import { exportRowsToExcel } from "../utils/exporters";
import { formatDate, formatMoney, formatNumber } from "../utils/format";
import { can } from "../utils/permissions";

const PRODUCT_PAGE_SIZE = 5;
const PRODUCT_NUMBER_OPTIONS = ["6", "8", "10", "16", "20", "30"];

const emptyForm = {
  name: "",
  productNumber: "",
  sku: "",
  barcode: "",
  category: "",
  unit: "pcs",
  quantity: 0,
  min_stock: 5,
  purchase_price: 0,
  selling_price: 0,
  description: "",
  image_url: "",
  warehouse_id: "",
};

const splitProductName = (fullName = "") => {
  const cleanName = String(fullName || "").trim();
  const match = cleanName.match(/^(6|8|10|16|20|30)\s*نمبره\s+(.+)$/u);

  if (!match) {
    return { productNumber: "", baseName: cleanName };
  }

  return {
    productNumber: match[1],
    baseName: match[2].trim(),
  };
};

const createAutomaticSku = (productNumber) =>
  `AUTO-${productNumber || "ITEM"}-${Date.now().toString(36).toUpperCase()}`;

const getLowStockLevel = (product) =>
  Number(product?.min_stock ?? product?.low_stock_level ?? 0);

const getProductStatus = (product) => {
  const quantity = Number(product?.quantity || 0);
  const minimum = getLowStockLevel(product);

  if (quantity <= 0) {
    return {
      key: "out",
      label: "خلاص شوی",
      className: "bg-red-100 text-red-700",
    };
  }

  if (quantity <= minimum) {
    return {
      key: "low",
      label: "کم موجود",
      className: "bg-amber-100 text-amber-700",
    };
  }

  return {
    key: "in",
    label: "موجود",
    className: "bg-emerald-100 text-emerald-700",
  };
};

const movementProductId = (item) =>
  item?.product_id || item?.productId || item?.product?.id || null;

const movementQuantity = (item) => Number(item?.quantity || 0);

export default function WarehousePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { settings } = useSettings();
  const tr = (en, ps, fa = ps) => settings.language === "en" ? en : settings.language === "fa" ? fa : ps;
  const canManage = can(profile, "warehouse.manage");
  const canDelete = can(profile, "warehouse.delete");
  const [searchParams, setSearchParams] = useSearchParams();

  const [allProducts, setAllProducts] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("latest");
  const [historyType, setHistoryType] = useState("all");
  const [historyDate, setHistoryDate] = useState("all");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehouseModal, setWarehouseModal] = useState(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [activeWarehouseId, setActiveWarehouseId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [allResponse, movementsResponse, warehouseResponse] = await Promise.all([
        productService.list({ status: "all", page: 1, limit: 500 }),
        stockService.movementHistory({ limit: 500 }),
        warehouseService.list({ limit: 500 }),
      ]);

      setAllProducts(allResponse.data || []);
      setStockMovements(movementsResponse.data || []);
      setWarehouses(warehouseResponse.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, "د ګدام معلومات ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, status, sortBy]);

  useEffect(() => {
    if (searchParams.get("action") === "add" && canManage) {
      setModal("add");
    }
  }, [searchParams, canManage]);

  useEffect(() => {
    const warehouseId = searchParams.get("warehouse");
    if (!warehouseId || warehouses.length === 0) return;

    if (warehouses.some((item) => String(item.id) === String(warehouseId))) {
      setActiveWarehouseId(warehouseId);
      setDetailsOpen(true);
    }
  }, [searchParams, warehouses]);

  const products = useMemo(() => {
    const query = search.trim().toLowerCase();

    return allProducts.filter((product) => {
      const matchesSearch = !query || [product.name, product.sku, product.barcode, product.category]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const productState = getProductStatus(product).key;
      const matchesStatus = status === "all" || productState === status;
      return matchesSearch && matchesStatus;
    });
  }, [allProducts, search, status]);

  const movements = useMemo(
    () =>
      (stockMovements || []).map((movement) => ({
        id: movement.id,
        type: movement.type || movement.movement_type,
        productId: movement.product_id,
        productName: movement.product_name || "نامعلوم جنس",
        quantity: Number(movement.quantity || 0),
        date: movement.created_at || movement.date || new Date().toISOString(),
        reference: movement.reference_id || movement.id,
        user: movement.user_name || movement.created_by_name || "نامعلوم کارن",
        warehouseId: movement.warehouse_id || null,
      })),
    [stockMovements],
  );

  const movementTotals = useMemo(() => {
    const totals = new Map();

    movements.forEach((movement) => {
      const current = totals.get(movement.productId) || { in: 0, out: 0 };
      current[movement.type] += Number(movement.quantity || 0);
      totals.set(movement.productId, current);
    });

    return totals;
  }, [movements]);

  const stats = useMemo(() => {
    const stock = allProducts.reduce(
      (sum, product) => sum + Number(product.quantity || 0),
      0,
    );

    const low = allProducts.filter((product) => {
      const quantity = Number(product.quantity || 0);
      return quantity > 0 && quantity <= getLowStockLevel(product);
    }).length;

    const value = allProducts.reduce(
      (sum, product) =>
        sum +
        Number(product.quantity || 0) * Number(product.purchase_price || 0),
      0,
    );

    const stockIn = movements
      .filter((movement) => movement.type === "in")
      .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);

    const stockOut = movements
      .filter((movement) => movement.type === "out")
      .reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);

    return {
      stock,
      low,
      value,
      stockIn,
      stockOut,
      products: allProducts.length,
    };
  }, [allProducts, movements]);

  const warehouseStats = useMemo(() => {
    const map = new Map();
    for (const warehouse of warehouses) {
      map.set(warehouse.id, { products: 0, stock: 0, low: 0, value: 0, stockIn: 0, stockOut: 0 });
    }
    for (const product of allProducts) {
      const warehouseId = product.warehouse_id;
      if (!warehouseId) continue;
      const current = map.get(warehouseId) || { products: 0, stock: 0, low: 0, value: 0, stockIn: 0, stockOut: 0 };
      const quantity = Number(product.quantity || 0);
      current.products += 1;
      current.stock += quantity;
      current.value += quantity * Number(product.purchase_price || 0);
      if (quantity > 0 && quantity <= getLowStockLevel(product)) current.low += 1;
      map.set(warehouseId, current);
    }
    for (const movement of movements) {
      if (!movement.warehouseId) continue;
      const current = map.get(movement.warehouseId) || { products: 0, stock: 0, low: 0, value: 0, stockIn: 0, stockOut: 0 };
      if (movement.type === "in") current.stockIn += Number(movement.quantity || 0);
      if (movement.type === "out") current.stockOut += Number(movement.quantity || 0);
      map.set(movement.warehouseId, current);
    }
    return map;
  }, [allProducts, movements, warehouses]);

  const activeWarehouse = useMemo(
    () => warehouses.find((item) => item.id === activeWarehouseId) || null,
    [activeWarehouseId, warehouses],
  );

  const detailStats = useMemo(
    () => warehouseStats.get(activeWarehouseId) || { products: 0, stock: 0, low: 0, value: 0, stockIn: 0, stockOut: 0 },
    [activeWarehouseId, warehouseStats],
  );

  const filteredMovements = useMemo(() => {
    const now = new Date();

    return movements.filter((movement) => {
      if (detailsOpen && activeWarehouseId && movement.warehouseId !== activeWarehouseId) return false;
      if (historyType !== "all" && movement.type !== historyType) return false;
      if (historyDate === "all") return true;

      const movementDate = new Date(movement.date);
      const difference = now.getTime() - movementDate.getTime();
      const days = difference / (1000 * 60 * 60 * 24);

      if (historyDate === "today") {
        return movementDate.toDateString() === now.toDateString();
      }

      if (historyDate === "7") return days <= 7;
      if (historyDate === "30") return days <= 30;
      return true;
    });
  }, [activeWarehouseId, detailsOpen, historyDate, historyType, movements]);

  const lastMovementAt = useMemo(() => {
    const map = new Map();

    movements.forEach((movement) => {
      const timestamp = new Date(movement.date).getTime();
      if (!Number.isFinite(timestamp)) return;
      const current = map.get(movement.productId) || 0;
      if (timestamp > current) map.set(movement.productId, timestamp);
    });

    return map;
  }, [movements]);

  const detailProducts = useMemo(() => {
    const rows =
      !detailsOpen || !activeWarehouseId
        ? products
        : products.filter((product) => product.warehouse_id === activeWarehouseId);

    return [...rows].sort((a, b) => {
      const aQuantity = Number(a.quantity || 0);
      const bQuantity = Number(b.quantity || 0);

      if (sortBy === "low") return aQuantity - bQuantity;
      if (sortBy === "high") return bQuantity - aQuantity;

      const aTime =
        lastMovementAt.get(a.id) ||
        new Date(a.updated_at || a.created_at || 0).getTime() ||
        0;
      const bTime =
        lastMovementAt.get(b.id) ||
        new Date(b.updated_at || b.created_at || 0).getTime() ||
        0;

      return bTime - aTime;
    });
  }, [activeWarehouseId, detailsOpen, lastMovementAt, products, sortBy]);

  const totalPages = Math.max(
    1,
    Math.ceil(detailProducts.length / PRODUCT_PAGE_SIZE),
  );

  const visibleProducts = useMemo(() => {
    const start = (page - 1) * PRODUCT_PAGE_SIZE;
    return detailProducts.slice(start, start + PRODUCT_PAGE_SIZE);
  }, [detailProducts, page]);

  const filteredWarehouses = useMemo(() => {
    const query = warehouseSearch.trim().toLowerCase();
    if (!query) return warehouses;

    return warehouses.filter((warehouseItem) =>
      [warehouseItem.name, warehouseItem.location, warehouseItem.description].some(
        (value) => String(value || "").toLowerCase().includes(query),
      ),
    );
  }, [warehouseSearch, warehouses]);

  const closeWarehouseModal = () => {
    setWarehouseModal(null);
    setSelectedWarehouse(null);
  };

  const refreshWarehouses = async () => {
    const response = await warehouseService.list({ limit: 500 });
    setWarehouses(response.data || []);
  };

  const openWarehouseEdit = (warehouseItem) => {
    setSelectedWarehouse(warehouseItem);
    setWarehouseModal("edit");
  };

  const saveWarehouse = async (payload) => {
    try {
      if (warehouseModal === "edit" && selectedWarehouse?.id) {
        await warehouseService.update(selectedWarehouse.id, payload);
        toast.success("ګودام اصلاح شو.");
      } else {
        await warehouseService.create(payload);
        toast.success("نوی ګودام اضافه شو.");
      }

      closeWarehouseModal();
      await refreshWarehouses();
    } catch (error) {
      toast.error(getErrorMessage(error, "د ګودام معلومات ثبت نه شول."));
      throw error;
    }
  };

  const openProductEdit = (product) => {
    setSelected(product);
    setModal("edit");
  };

  const openWarehouseDetails = (warehouseId) => {
    setActiveWarehouseId(warehouseId);
    setDetailsOpen(true);
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.set("warehouse", warehouseId);
    setSearchParams(next, { replace: true });
  };

  const closeWarehouseDetails = () => {
    setDetailsOpen(false);
    setActiveWarehouseId(null);
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete("warehouse");
    setSearchParams(next, { replace: true });
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);

    if (searchParams.has("action")) {
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  };

  const remove = async (product) => {
    if (!window.confirm(`آیا ${product.name} حذف شي؟`)) return;

    try {
      await productService.remove(product.id);
      toast.success("محصول حذف شو.");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const exportProducts = () => {
    const rows = products.map((product, index) => {
      const totals = movementTotals.get(product.id) || { in: 0, out: 0 };
      const productStatus = getProductStatus(product);

      return {
        Number: index + 1,
        Product: product.name,
        StockIn: totals.in,
        StockOut: totals.out,
        CurrentStock: Number(product.quantity || 0),
        Status: productStatus.label,
      };
    });

    exportRowsToExcel(rows, "warehouse-products.xlsx");
  };

  if (!detailsOpen) {
    return (
      <div className="page-enter space-y-5">
        <section className="wms-hero-section overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-xl shadow-slate-900/10">
          <div className="wms-photo-hero relative overflow-hidden px-5 pb-24 pt-7 text-white sm:px-8 sm:pb-28 sm:pt-9" style={{ backgroundImage: "url('/header-images/header-daisy.jpeg')" }}>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/78 via-blue-950/45 to-cyan-950/20" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-blue-100 sm:text-base">
                  
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                  {tr("Warehouse Management", "د ګدام مدیریت", "مدیریت گدام")}
                </h1>
                <p className="mt-2 max-w-xl text-sm text-blue-100 sm:text-base">
                  {tr("Manage warehouse products, stock and low-stock alerts.", "د ګدام مالونه، موجودي او د کم سټاک خبرتیاوې مدیریت کړئ.", "کالاها، موجودی و هشدار کمبود گدام را مدیریت کنید.")}
                </p>
              </div>

              {canManage ? (
                <Button
                  variant="secondary"
                  className="border-white/80 bg-white px-5 text-blue-700 hover:bg-blue-50"
                  onClick={() => {
                    setSelectedWarehouse(null);
                    setWarehouseModal("add");
                  }}
                >
                  <FiPlus /> {tr("Add Warehouse", "نوی ګدام", "گدام جدید")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="wms-summary-grid relative -mt-12 grid grid-cols-2 gap-2.5 px-4 pb-4 sm:-mt-14 sm:gap-3 sm:px-6 sm:pb-5 xl:grid-cols-4">
            <WarehouseSummaryCard
              title={tr("Total Warehouses", "ټول ګدامونه", "تمام گدام ها")}
              value={formatNumber(warehouses.length)}
              caption={`${warehouses.filter((item) => item.status === "Active").length} ${tr("Active", "فعال", "فعال")}`}
              icon={FiHome}
              tone="blue"
              delay="stagger-delay-0"
            />
            <WarehouseSummaryCard
              title={tr("Total Stock", "ټول موجود مال", "موجودی کل")}
              value={formatNumber(stats.stock)}
              caption={tr("In inventory", "په ګدام کې موجود", "موجود در گدام")}
              icon={FiBox}
              tone="green"
              delay="stagger-delay-1"
            />
            <WarehouseSummaryCard
              title={tr("Total Products", "ټول جنسونه", "تمام کالاها")}
              value={formatNumber(stats.products)}
              caption={tr("All products", "ټول محصولات", "همه محصولات")}
              icon={FiPackage}
              tone="purple"
              delay="stagger-delay-2"
            />
            <WarehouseSummaryCard
              title={tr("Low Stock", "کم سټاک", "موجودی کم")}
              value={formatNumber(stats.low)}
              caption={tr("Requires attention", "پاملرنې ته اړتیا لري", "نیاز به توجه")}
              icon={FiAlertTriangle}
              tone="orange"
              delay="stagger-delay-3"
            />
          </div>
        </section>

        <section
          dir="ltr"
          className="wms-warehouse-overview-grid grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]"
        >
          <Card className="min-w-0 p-4 sm:p-5 xl:col-start-1 xl:row-start-1">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">Warehouses</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Your active storage locations
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                {formatNumber(warehouses.length)} Warehouse
              </span>
            </div>

            <div className="wms-warehouse-grid grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),560px))]">
              {warehouses.map((warehouseItem) => {
                const itemStats = warehouseStats.get(warehouseItem.id) || { products: 0, stock: 0, low: 0 };

                return (
                  <WarehouseCard
                    key={warehouseItem.id}
                    name={warehouseItem.name}
                    description={warehouseItem.description}
                    status={warehouseItem.status}
                    products={itemStats.products}
                    stock={itemStats.stock}
                    lowStock={itemStats.low}
                    onView={() => {
                      openWarehouseDetails(warehouseItem.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    onEdit={() => openWarehouseEdit(warehouseItem)}
                    canManage={canManage}
                  />
                );
              })}
            </div>
          </Card>

          <Card className="min-w-0 h-fit p-4 sm:p-5 xl:col-start-2 xl:row-start-1">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-950">Warehouse List</h2>
              <span className="text-xs font-black text-blue-600">View All</span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={warehouseSearch}
                  onChange={(event) => setWarehouseSearch(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="Search warehouse..."
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {filteredWarehouses.map((warehouseItem) => {
                const itemStats = warehouseStats.get(warehouseItem.id) || { products: 0, stock: 0 };
                const productsCount = itemStats.products;
                const stockCount = itemStats.stock;

                return (
                  <button
                    key={warehouseItem.id}
                    type="button"
                    onClick={() => openWarehouseDetails(warehouseItem.id)}
                    className="flex min-w-0 w-full items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-xl text-blue-700">
                      <FiHome />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-black text-slate-900">
                        {warehouseItem.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Products: {formatNumber(productsCount)} · Stock:{" "}
                        {formatNumber(stockCount)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                        warehouseItem.status === "Inactive"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {warehouseItem.status || "Active"}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        </section>

        <Modal
          open={canManage && warehouseModal !== null}
          onClose={closeWarehouseModal}
          title={warehouseModal === "edit" ? "Edit Warehouse" : "Add Warehouse"}
          size="sm"
        >
          <WarehouseForm
            warehouse={warehouseModal === "edit" ? selectedWarehouse : null}
            onCancel={closeWarehouseModal}
            onSave={saveWarehouse}
          />
        </Modal>

        <Modal
          open={canManage && modal === "add"}
          onClose={closeModal}
          title="New Product"
          size="md"
        >
          <ProductForm
            product={null}
            warehouses={warehouses}
            defaultWarehouseId={warehouses.find((item) => item.is_primary)?.id || warehouses[0]?.id || ""}
            onCancel={closeModal}
            onSaved={async () => {
              closeModal();
              await load();
            }}
          />
        </Modal>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-5">
      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-lg shadow-slate-900/5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={closeWarehouseDetails}
            className="icon-button mt-0.5 size-10"
            aria-label="Back to warehouses"
          >
            <FiArrowLeft />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {activeWarehouse?.name || "Warehouse Details"}
            </h1>
            <p className="pashto-text mt-1 text-sm text-slate-500">
              د همدې ګدام جنسونه، سټاک او وروستي فعالیتونه
            </p>
          </div>
        </div>

        {canManage ? (
          <Button onClick={() => setModal("add")}>
            <FiPlus /> Add Product
          </Button>
        ) : null}
      </section>

      <section className="wms-details-summary-grid grid grid-cols-2 gap-3 lg:grid-cols-5">
        <DetailsSummaryCard
          title="جمله جنس"
          value={formatNumber(detailStats.products)}
          icon={FiPackage}
          tone="blue"
          delay="stagger-delay-0"
        />
        <DetailsSummaryCard
          title="سټاک ان"
          value={formatNumber(detailStats.stockIn)}
          icon={FiArrowDown}
          tone="green"
          delay="stagger-delay-1"
        />
        <DetailsSummaryCard
          title="سټاک اوت"
          value={formatNumber(detailStats.stockOut)}
          icon={FiArrowUp}
          tone="orange"
          delay="stagger-delay-2"
        />
        <DetailsSummaryCard
          title="موجود مال"
          value={formatMoney(detailStats.value)}
          icon={FiDollarSign}
          tone="purple"
          delay="stagger-delay-3"
        />
        <DetailsSummaryCard
          title="سټاک کم"
          value={formatNumber(detailStats.low)}
          icon={FiAlertTriangle}
          tone="amber"
          delay="stagger-delay-4"
          className="col-span-2 lg:col-span-1"
        />
      </section>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <FiFilter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="h-11 rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">Filter</option>
                <option value="in">موجود</option>
                <option value="low">کم موجود</option>
                <option value="out">خلاص شوی</option>
              </select>
            </div>

            <select
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              aria-label="Sort products"
            >
              <option value="latest">وروستی بدلون</option>
              <option value="low">کم مقدار</option>
              <option value="high">ډېر مقدار</option>
            </select>

            <button
              type="button"
              onClick={exportProducts}
              className="secondary-button h-11 rounded-xl px-4 py-2"
            >
              <FiDownload /> Export
            </button>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <FiSearch className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 pr-11 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              placeholder="Search product..."
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8">
            <Loading />
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="جنس نشته"
              description="نوی جنس اضافه کړئ یا فلټر بدل کړئ."
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table dir="rtl" className="wms-stock-table min-w-[920px] w-full border-separate border-spacing-0 text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-5 py-4 text-right font-black">#</th>
                    <th className="px-5 py-4 text-right font-black">تفصیل جنس</th>
                    <th className="px-5 py-4 text-center font-black text-emerald-700">سټاک ان</th>
                    <th className="px-5 py-4 text-center font-black text-orange-600">سټاک اوت</th>
                    <th className="px-5 py-4 text-center font-black text-blue-700">موجود مال</th>
                    <th className="px-5 py-4 text-center font-black">حالت</th>
                    <th className="px-5 py-4 text-center font-black">اکشن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleProducts.map((product, index) => {
                    const totals = movementTotals.get(product.id) || {
                      in: 0,
                      out: 0,
                    };
                    const productStatus = getProductStatus(product);

                    return (
                      <tr
                        key={product.id}
                        className="bg-white transition hover:bg-blue-50/40"
                      >
                        <td className="px-5 py-4 text-right font-bold text-slate-700">
                          {(page - 1) * PRODUCT_PAGE_SIZE + index + 1}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="pashto-text text-base font-black text-slate-950">
                            {product.name}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-center font-black text-emerald-600">
                          {formatNumber(totals.in)}
                        </td>
                        <td className="px-5 py-4 text-center font-black text-orange-600">
                          {formatNumber(totals.out)}
                        </td>
                        <td className="px-5 py-4 text-center font-black text-blue-700">
                          {formatNumber(product.quantity)}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`status-badge ${productStatus.className}`}>
                            {productStatus.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div dir="ltr" className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/stock-in?product=${product.id}&warehouse=${activeWarehouseId || product.warehouse_id || ""}`)}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"
                            >
                              <FiArrowDown /> In
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/stock-out?product=${product.id}&warehouse=${activeWarehouseId || product.warehouse_id || ""}`)}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-red-700"
                            >
                              <FiArrowUp /> Out
                            </button>
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => openProductEdit(product)}
                                className="inline-flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
                                aria-label={`Edit ${product.name}`}
                              >
                                <FiEdit2 />
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => remove(product)}
                                className="inline-flex size-9 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm transition hover:bg-red-700"
                                aria-label={`Delete ${product.name}`}
                              >
                                <FiTrash2 />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {visibleProducts.map((product, index) => {
                const totals = movementTotals.get(product.id) || {
                  in: 0,
                  out: 0,
                };
                const productStatus = getProductStatus(product);

                return (
                  <article
                    key={product.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pashto-text truncate text-base font-black text-slate-950">
                          {product.name}
                        </p>
                        <span className={`status-badge mt-2 ${productStatus.className}`}>
                          {productStatus.label}
                        </span>
                      </div>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 font-black text-blue-700">
                        {(page - 1) * PRODUCT_PAGE_SIZE + index + 1}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <MiniMetric
                        label="سټاک ان"
                        value={formatNumber(totals.in)}
                        className="text-emerald-600"
                      />
                      <MiniMetric
                        label="سټاک اوت"
                        value={formatNumber(totals.out)}
                        className="text-orange-600"
                      />
                      <MiniMetric
                        label="موجود"
                        value={formatNumber(product.quantity)}
                        className="text-blue-700"
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/stock-in?product=${product.id}&warehouse=${activeWarehouseId || product.warehouse_id || ""}`)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white"
                      >
                        <FiArrowDown /> In
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/stock-out?product=${product.id}&warehouse=${activeWarehouseId || product.warehouse_id || ""}`)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-black text-white"
                      >
                        <FiArrowUp /> Out
                      </button>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => openProductEdit(product)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white"
                        >
                          <FiEdit2 /> Edit
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => remove(product)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-800 text-sm font-black text-white"
                        >
                          <FiTrash2 /> Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-600">
            Showing {detailProducts.length ? (page - 1) * PRODUCT_PAGE_SIZE + 1 : 0} to {Math.min(page * PRODUCT_PAGE_SIZE, detailProducts.length)} of {detailProducts.length} items
          </p>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </Card>

      <Card className="wms-stock-history overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div dir="rtl" className="text-right">
            <h2 className="text-base font-black text-slate-950 sm:text-lg">سټاک هسټوري</h2>
            <p className="text-[10px] font-semibold text-slate-400">وروستي ۴ فعالیتونه</p>
          </div>

          <div dir="rtl" className="flex flex-wrap items-center gap-1.5">
            <HistoryButton active={historyType === "all"} onClick={() => setHistoryType("all")} icon={FiDownload} label="ټول" tone="blue" compact />
            <HistoryButton active={historyType === "in"} onClick={() => setHistoryType("in")} icon={FiArrowDown} label="ان" tone="green" compact />
            <HistoryButton active={historyType === "out"} onClick={() => setHistoryType("out")} icon={FiArrowUp} label="اوټ" tone="red" compact />
            <span className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block" />
            <HistoryButton active={historyDate === "today"} onClick={() => setHistoryDate("today")} icon={FiCalendar} label="نن" compact />
            <HistoryButton active={historyDate === "7"} onClick={() => setHistoryDate("7")} icon={FiCalendar} label="اوونۍ" compact />
            <HistoryButton active={historyDate === "30"} onClick={() => setHistoryDate("30")} icon={FiCalendar} label="میاشت" compact />
            <button
              type="button"
              onClick={() => { setHistoryType("all"); setHistoryDate("all"); }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-black text-slate-600 transition hover:bg-slate-50"
            >
              <FiRefreshCw /> پاک
            </button>
          </div>
        </div>

        {filteredMovements.length ? (
          <div className="overflow-x-auto">
            <table dir="rtl" className="wms-history-table min-w-[720px] w-full border-separate border-spacing-0 text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-right font-black">جنس</th>
                  <th className="px-3 py-2 text-center font-black">مقدار</th>
                  <th className="px-3 py-2 text-center font-black">ډول</th>
                  <th className="px-3 py-2 text-right font-black">اجراکوونکی</th>
                  <th className="px-3 py-2 text-right font-black">نېټه</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.slice(0, 4).map((movement, index) => (
                  <tr key={movement.id} className={index % 2 ? "bg-slate-50/45" : "bg-white"}>
                    <td className="px-3 py-2 text-right font-black text-slate-900">{movement.productName}</td>
                    <td className={`px-3 py-2 text-center font-black ${movement.type === "in" ? "text-emerald-600" : "text-red-600"}`}>
                      {movement.type === "in" ? "+" : "-"}{formatNumber(movement.quantity)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black ${movement.type === "in" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {movement.type === "in" ? <FiArrowDown /> : <FiArrowUp />}
                        {movement.type === "in" ? "سټاک ان" : "سټاک اوت"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-slate-700">{movement.user}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-600">{formatDate(movement.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="سټاک هسټوري نشته" description="کله چې سټاک داخل یا خارج شي، معلومات به دلته ښکاره شي." />
          </div>
        )}
      </Card>

      <Modal
        open={canManage && (modal === "add" || modal === "edit")}
        onClose={closeModal}
        title={modal === "edit" ? "محصول اصلاح کړئ" : "نوی محصول"}
        size="md"
      >
        <ProductForm
          product={modal === "edit" ? selected : null}
          warehouses={warehouses}
          defaultWarehouseId={activeWarehouseId || ""}
          onCancel={closeModal}
          onSaved={async () => {
            closeModal();
            await load();
          }}
        />
      </Modal>

      <Modal
        open={modal === "view"}
        onClose={closeModal}
        title="د محصول معلومات"
        size="md"
      >
        {selected ? <ProductDetails product={selected} /> : null}
      </Modal>
    </div>
  );
}

function WarehouseSummaryCard({ title, value, caption, icon: Icon, tone, delay }) {
  const tones = {
    blue: {
      icon: "bg-blue-100 text-blue-700",
      caption: "text-blue-600",
    },
    green: {
      icon: "bg-emerald-100 text-emerald-700",
      caption: "text-emerald-600",
    },
    purple: {
      icon: "bg-violet-100 text-violet-700",
      caption: "text-violet-600",
    },
    orange: {
      icon: "bg-orange-100 text-orange-600",
      caption: "text-orange-600",
    },
  };

  const style = tones[tone] || tones.blue;

  return (
    <article
      className={`wms-summary-card stagger-item ${delay} rounded-[20px] border border-slate-100 bg-white p-3 shadow-lg shadow-slate-900/10 transition duration-300 hover:-translate-y-1 sm:rounded-[22px] sm:p-3.5`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-lg sm:size-11 sm:text-xl ${style.icon}`}
        >
          <Icon />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-600 sm:text-xs">{title}</p>
          <p className="mt-0.5 truncate text-lg font-black text-slate-950 sm:text-xl">
            {value}
          </p>
          <p className={`mt-0.5 truncate text-[9px] font-bold sm:text-[10px] ${style.caption}`}>
            {caption}
          </p>
        </div>
      </div>
    </article>
  );
}

function DetailsSummaryCard({ title, value, icon: Icon, tone, delay, className = "" }) {
  const tones = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    orange: "bg-orange-100 text-orange-600",
    purple: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-600",
  };

  return (
    <article
      className={`wms-summary-card stagger-item ${delay} ${className} rounded-[20px] border border-slate-200/75 bg-white p-4 shadow-lg shadow-slate-900/5 sm:p-5`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-xl sm:size-14 sm:text-2xl ${
            tones[tone] || tones.blue
          }`}
        >
          <Icon />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-black text-slate-950 sm:text-2xl">
            {value}
          </p>
          <p className="pashto-text mt-1 truncate text-xs font-black text-slate-600 sm:text-sm">
            {title}
          </p>
        </div>
      </div>
    </article>
  );
}

function WarehouseCard({
  name,
  description,
  products,
  stock,
  lowStock,
  status = "Active",
  onView,
  onEdit,
  canManage,
}) {
  const active = status !== "Inactive";

  return (
    <article className="wms-warehouse-card min-h-[300px] sm:min-h-[310px] lg:min-h-[320px] min-w-0 w-full overflow-hidden flex flex-col rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(37,99,235,0.13)]">
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-400 px-3.5 py-5 text-white sm:px-4 sm:py-5">
        <div className="pointer-events-none absolute -right-8 -top-10 size-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/10 text-lg shadow-inner">
              <FiHome />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-black leading-tight sm:text-xl">{name}</h3>
              <p className="mt-0.5 truncate text-[10px] font-semibold text-blue-50/90">{description || "Warehouse Overview"}</p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black text-white shadow-sm ${active ? "bg-emerald-500" : "bg-slate-500"}`}>
            {status || "Active"}
          </span>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-3 gap-2 px-3 pt-3">
        <WarehouseMetric label="Products" value={formatNumber(products)} icon={FiPackage} tone="blue" />
        <WarehouseMetric label="Stock" value={formatNumber(stock)} icon={FiBox} tone="green" />
        <WarehouseMetric label="Low Stock" value={formatNumber(lowStock)} icon={FiAlertTriangle} tone="red" danger />
      </div>

      <div className="flex-1" />

      <div className={`mt-auto grid gap-2 px-3 pb-3 pt-3 ${canManage ? "grid-cols-[1fr_42px]" : "grid-cols-1"}`}>
        <Button onClick={onView} className="min-w-0 rounded-xl py-2 text-xs">
          <FiEye /> <span className="truncate">View Warehouse</span>
        </Button>
        {canManage ? (
          <Button variant="secondary" onClick={onEdit} className="min-w-0 rounded-xl px-0 py-2 text-xs" aria-label="Edit warehouse">
            <FiEdit2 />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function WarehouseMetric({
  label,
  value,
  icon: Icon,
  tone = "blue",
  danger = false,
}) {
  const tones = {
    blue: {
      box: "border-blue-100 bg-blue-50/80",
      icon: "bg-blue-100 text-blue-700",
      label: "text-blue-700",
    },
    green: {
      box: "border-emerald-100 bg-emerald-50/80",
      icon: "bg-emerald-100 text-emerald-700",
      label: "text-emerald-700",
    },
    red: {
      box: "border-red-100 bg-red-50/80",
      icon: "bg-red-100 text-red-600",
      label: "text-red-600",
    },
  };

  const style = tones[tone] || tones.blue;

  return (
    <div
      className={`min-w-0 min-h-[105px] sm:min-h-[115px] rounded-[14px] border p-3 ${style.box}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <p
          className={`min-w-0 break-words text-[clamp(9px,0.7vw,11px)] font-black leading-4 ${style.label}`}
        >
          {label}
        </p>

        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs sm:size-7 ${style.icon}`}
        >
          <Icon />
        </span>
      </div>

      <p
        className={`mt-1.5 break-words text-[clamp(20px,1.7vw,28px)] font-black leading-none ${
          danger ? "text-red-600" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MiniMetric({ label, value, className = "" }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2.5 text-center">
      <p className="pashto-text text-[10px] font-bold text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-black ${className}`}>{value}</p>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }) {
  const pages = useMemo(() => {
    if (totalPages <= 6) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const result = new Set([1, totalPages, page - 1, page, page + 1]);
    return [...result]
      .filter((entry) => entry >= 1 && entry <= totalPages)
      .sort((a, b) => a - b);
  }, [page, totalPages]);

  return (
    <div dir="ltr" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onChange(Math.max(1, page - 1))}
        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FiChevronLeft />
      </button>

      {pages.map((entry, index) => {
        const previous = pages[index - 1];
        const showDots = previous && entry - previous > 1;

        return (
          <span key={entry} className="contents">
            {showDots ? <span className="px-1 text-slate-400">…</span> : null}
            <button
              type="button"
              onClick={() => onChange(entry)}
              className={`flex size-9 items-center justify-center rounded-lg border text-sm font-black transition ${
                entry === page
                  ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-blue-50"
              }`}
            >
              {entry}
            </button>
          </span>
        );
      })}

      <button
        type="button"
        disabled={page === totalPages}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FiChevronRight />
      </button>
    </div>
  );
}

function HistoryButton({ active, onClick, icon: Icon, label, tone = "slate", compact = false }) {
  const iconTone = {
    blue: "text-blue-600",
    green: "text-emerald-600",
    red: "text-red-600",
    slate: "text-slate-700",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${compact ? "inline-flex h-8 w-auto gap-1.5 rounded-lg px-2.5 text-[10px]" : "flex w-full gap-3 rounded-xl px-3 py-2.5 text-sm"} items-center font-black transition ${
        active
          ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
          : "bg-slate-50 text-slate-700 hover:bg-blue-50"
      }`}
    >
      <Icon className={active ? "text-white" : iconTone} />
      <span className={compact ? "whitespace-nowrap" : "pashto-text flex-1 text-right"}>{label}</span>
    </button>
  );
}

function WarehouseForm({ warehouse, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: warehouse?.name || "",
    location: warehouse?.location || "",
    description: warehouse?.description || "",
    status: warehouse?.status || "Active",
  });
  const [saving, setSaving] = useState(false);

  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("د ګودام نوم ضروري دی.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
        status: form.status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-3">
      <div className="rounded-[18px] bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 p-3.5 text-white">
        <p className="text-[11px] font-black text-blue-100">
          {warehouse ? "د ګودام معلومات اصلاح کړئ" : "نوی ګودام ثبت کړئ"}
        </p>
        <p className="mt-1 text-lg font-black">
          {warehouse?.name || "Warehouse"}
        </p>
      </div>

      <Field label="د ګودام نوم">
        <input
          className="field h-10"
          value={form.name}
          onChange={(event) => change("name", event.target.value)}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="موقعیت">
          <input
            className="field h-10"
            value={form.location}
            onChange={(event) => change("location", event.target.value)}
          />
        </Field>

        <Field label="حالت">
          <select
            className="field h-10"
            value={form.status}
            onChange={(event) => change("status", event.target.value)}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </Field>
      </div>

      <Field label="تفصیل">
        <textarea
          className="textarea-field min-h-16"
          value={form.description}
          onChange={(event) => change("description", event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
        <Button
          type="button"
          variant="secondary"
          className="h-10"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" className="h-10" disabled={saving}>
          {warehouse ? <FiEdit2 /> : <FiPlus />}
          {saving
            ? "ثبتېږي..."
            : warehouse
              ? "Edit Warehouse"
              : "Add Warehouse"}
        </Button>
      </div>
    </form>
  );
}

function ProductForm({
  product,
  warehouses = [],
  defaultWarehouseId = "",
  onCancel,
  onSaved,
}) {
  const parsedName = splitProductName(product?.name);
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    ...(product || {}),
    name: parsedName.baseName,
    productNumber: parsedName.productNumber,
    min_stock: getLowStockLevel(product || {}),
    warehouse_id: product?.warehouse_id || defaultWarehouseId,
  }));
  const [saving, setSaving] = useState(false);

  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const selectedWarehouse = warehouses.find(
    (warehouse) => warehouse.id === form.warehouse_id,
  );

  const finalProductName = useMemo(() => {
    const cleanName = String(form.name || "").trim();
    if (!cleanName) return "";

    return form.productNumber
      ? `${form.productNumber} نمبره ${cleanName}`
      : cleanName;
  }, [form.name, form.productNumber]);

  const submit = async (event) => {
    event.preventDefault();

    if (!form.warehouse_id) {
      toast.error("ګدام انتخاب کړئ.");
      return;
    }

    if (!String(form.name || "").trim()) {
      toast.error("د محصول نوم ولیکئ.");
      return;
    }

    if (Number(form.quantity || 0) <= 0) {
      toast.error("تعداد باید له صفر څخه زیات وي.");
      return;
    }

    setSaving(true);

    try {
      const { productNumber, ...storedForm } = form;

      const payload = {
        ...storedForm,
        name: finalProductName,
        sku:
          product?.sku ||
          storedForm.sku ||
          createAutomaticSku(productNumber),
        quantity: Number(storedForm.quantity || 0),
        min_stock: Number(storedForm.min_stock || 0),
        purchase_price: Number(storedForm.purchase_price || 0),
        selling_price: Number(storedForm.selling_price || 0),
      };

      if (product?.id) await productService.update(product.id, payload);
      else await productService.create(payload);

      toast.success(product?.id ? "محصول اصلاح شو." : "محصول اضافه شو.");
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      dir="rtl"
      onSubmit={submit}
      className="overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[0_16px_42px_rgba(37,99,235,0.12)]"
    >
      <div className="relative overflow-hidden bg-gradient-to-l from-blue-800 via-blue-600 to-cyan-400 px-4 py-4 text-white sm:px-5">
        <div className="pointer-events-none absolute -left-10 -top-14 size-32 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 right-12 size-28 rounded-full bg-cyan-100/20 blur-2xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-xl ring-1 ring-white/30 backdrop-blur-sm">
            <FiPackage />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="pashto-text text-lg font-black sm:text-xl">
              {product ? "محصول اصلاح کړئ" : "نوی محصول اضافه کړئ"}
            </h3>
            <p className="pashto-text mt-0.5 truncate text-[11px] font-medium text-blue-50 sm:text-xs">
              نوم، تعداد او واحد ثبت کړئ · نمبره اختیاري ده
              {selectedWarehouse?.name ? ` · ${selectedWarehouse.name}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {!defaultWarehouseId ? (
          <Field label="ګدام">
            <select
              className="field h-10 rounded-xl border-blue-100 bg-slate-50 font-bold text-slate-800 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              value={form.warehouse_id || ""}
              onChange={(event) => change("warehouse_id", event.target.value)}
              required
            >
              <option value="">ګدام انتخاب کړئ</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="نمبره">
            <select
              className="field h-10 rounded-xl border-blue-100 bg-blue-50/70 font-black text-blue-800 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              value={form.productNumber}
              onChange={(event) => change("productNumber", event.target.value)}
            >
              <option value="">اختیاري</option>
              {PRODUCT_NUMBER_OPTIONS.map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
          </Field>

          <Field label="د محصول نوم">
            <input
              className="field h-10 rounded-xl border-blue-100 bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              value={form.name}
              onChange={(event) => change("name", event.target.value)}
              placeholder="د محصول نوم"
              required
            />
          </Field>

          <Field label="تعداد">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="field h-10 rounded-xl border-emerald-100 bg-emerald-50/70 font-black text-emerald-800 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              value={form.quantity}
              onChange={(event) => change("quantity", event.target.value)}
              required
            />
          </Field>

          <Field label="د کم سټاک حد">
            <input
              type="number" min="0" step="1"
              className="field h-10 rounded-xl border-amber-100 bg-amber-50/70 font-black text-amber-800 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
              value={form.min_stock}
              onChange={(event) => change("min_stock", event.target.value)}
              placeholder="مثلاً 10 کارټنه"
            />
          </Field>

          <Field label="واحد">
            <select
              className="field h-10 rounded-xl border-violet-100 bg-violet-50/70 font-black text-violet-800 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              value={form.unit}
              onChange={(event) => change("unit", event.target.value)}
            >
              <option value="pcs">Pieces</option>
              <option value="carton">Carton</option>
              <option value="kg">KG</option>
              <option value="meter">Meter</option>
              <option value="set">Set</option>
            </select>
          </Field>
        </div>

        <div className="rounded-xl border border-blue-100 bg-gradient-to-l from-blue-50 via-white to-cyan-50 px-3 py-2.5 shadow-sm">
          <p className="pashto-text text-[10px] font-black text-blue-600">
            نهایی نوم
          </p>
          <p className="pashto-text mt-0.5 break-words text-sm font-black text-slate-950 sm:text-base">
            {finalProductName || "د محصول نوم ولیکئ"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="h-10 rounded-xl"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={saving}
            className="h-10 rounded-xl bg-gradient-to-r from-blue-700 to-cyan-500 shadow-md shadow-blue-600/20"
          >
            {saving ? "ثبتېږي..." : product ? "Update" : "Save Product"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ProductDetails({ product }) {
  const productStatus = getProductStatus(product);

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-100 to-sky-100">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-64 w-full object-cover"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-7xl text-blue-300">
            <FiPackage />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <h3 className="pashto-text text-2xl font-black">{product.name}</h3>
        <span className={`status-badge ${productStatus.className}`}>
          {productStatus.label}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="تعداد" value={`${formatNumber(product.quantity)} ${product.unit}`} />
        <Info label="کم حد" value={formatNumber(getLowStockLevel(product))} />
        <Info
          label="د پېرود قیمت"
          value={formatMoney(product.purchase_price, product.currency)}
        />
        <Info
          label="د خرڅلاو قیمت"
          value={formatMoney(product.selling_price, product.currency)}
        />
      </div>

      {product.description ? (
        <div className="pashto-text rounded-2xl bg-slate-50 p-4 text-sm leading-8 text-slate-600">
          {product.description}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="pashto-text mb-2 block text-sm font-black text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 p-3">
      <p className="pashto-text text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 truncate font-black text-slate-800">{value}</p>
    </div>
  );
}
