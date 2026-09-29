import { useEffect, useRef, useState } from "react";
import { FiDatabase, FiDownload, FiEdit2, FiFileText, FiLock, FiMessageCircle, FiPlus, FiSave, FiSettings, FiTrash2, FiTruck, FiUpload, FiUser, FiUsers } from "react-icons/fi";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Loading from "../components/ui/Loading";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { getErrorMessage } from "../lib/api";
import { debtorService, recycleBinService, representativeService, settingsService, uploadService, warehouseService } from "../Services/wmsService";
import { can } from "../utils/permissions";

const defaultNewUser = { email: "", username: "", full_name: "", phone: "", role: "cashier", password: "", permissions: [] };

const DELETE_PERMISSION_OPTIONS = [
  { key: "representatives.delete", label: "استازی حذف" },
  { key: "debtors.delete", label: "قرضدار حذف" },
  { key: "warehouse.delete", label: "ګودام / جنس حذف" },
  { key: "recycle.restore", label: "Recycle Restore" },
  { key: "recycle.delete", label: "دایمي حذف" },
];


const defaultCompany = {
  company_name: "",
  logo_url: "",
  address: "",
  phone: "",
  email: "",
  currency: "AFN",
  date_format: "yyyy-MM-dd",
  report_title: "د قرضدار رسمي حسابي راپور",
  representative_report_title: "د شرکت مسلکي حسابي راپور",
  representative_balance_report_title: "د اتومات بقایاتو راپور",
  representative_receipt_report_title: "د وصولیو راپور",
  document_prefix: "DB",
  footer_text: "مننه چې زمونږ سره حساب کوئ",
  debtor_signature_label: "د قرضدار امضا",
  accountant_signature_label: "د محاسب امضا",
  stamp_label: "مهر او تایید",
  whatsapp_greeting: "السلام علیکم",
  whatsapp_request: "مهرباني وکړئ د فرصت په صورت کې خپل حساب تصفیه کړئ",
  whatsapp_closing: "مننه",
  watermark_enabled: true,
  watermark_logo_url: "",
  watermark_opacity: 0.06,
};

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const canEditCompany = can(profile, "settings.company");
  const isAdministrator = profile?.role === "administrator";
  const { settings, updateSettings } = useSettings();
  const [company, setCompany] = useState(defaultCompany);
  const [user, setUser] = useState({ full_name: profile?.full_name || "", phone: profile?.phone || "", avatar_url: profile?.avatar_url || "" });
  const [password, setPassword] = useState({ password: "", confirm: "" });
  const [users, setUsers] = useState([]);
  const [representatives, setRepresentatives] = useState([]);
  const [debtors, setDebtors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [recycleBin, setRecycleBin] = useState([]);
  const [access, setAccess] = useState(null);
  const [userModal, setUserModal] = useState(false);
  const [newUser, setNewUser] = useState(defaultNewUser);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [whatsappTestPhone, setWhatsappTestPhone] = useState("");
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [automation, setAutomation] = useState({
    automation_enabled: true,
    payment_receipt_enabled: true,
    weekly_report_enabled: true,
    weekly_day: 4,
    weekly_hour: 9,
    weekly_minute: 0,
    full_report_enabled: true,
    full_report_interval_weeks: 3,
    full_report_hour: 10,
    full_report_minute: 0,
    timezone: "Asia/Kabul",
  });
  const [activeSection, setActiveSection] = useState("general");
  const [dashboardSlideSeconds, setDashboardSlideSeconds] = useState(() => {
    try {
      const value = Number(localStorage.getItem("wms_dashboard_slide_seconds") || 10);
      return Number.isFinite(value) && value >= 3 ? value : 10;
    } catch {
      return 10;
    }
  });
  const restoreInput = useRef(null);
  const logoInput = useRef(null);
  const watermarkInput = useRef(null);
  const avatarInput = useRef(null);

  const hasDeletePermission = (permission) =>
    access?.role === "administrator" ||
    (Array.isArray(access?.permissions) &&
      (access.permissions.includes("*") ||
        access.permissions.includes(permission)));

  const canDeleteRepresentative = hasDeletePermission("representatives.delete");
  const canDeleteDebtor = hasDeletePermission("debtors.delete");
  const canDeleteWarehouse = hasDeletePermission("warehouse.delete");
  const canRestoreRecycle = hasDeletePermission("recycle.restore");
  const canPermanentlyDeleteRecycle = hasDeletePermission("recycle.delete");

  const reloadRecycleBin = async () => {
    try {
      const result = await recycleBinService.list({ limit: 1000 });
      setRecycleBin(result?.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, "Recycle Bin ترلاسه نه شو."));
    }
  };


  useEffect(() => {
    Promise.all([
      settingsService.get(),
      settingsService.currentAccess(profile),
      settingsService.whatsappAutomation
        ? settingsService.whatsappAutomation().catch(() => null)
        : Promise.resolve(null),
      isAdministrator ? settingsService.users().catch(() => []) : Promise.resolve([]),
      representativeService.list({ limit: 500 }).catch(() => ({ data: [] })),
      debtorService.list({ limit: 500 }).catch(() => ({ data: [] })),
      warehouseService.list({ limit: 500 }).catch(() => ({ data: [] })),
      recycleBinService.list({ limit: 1000 }).catch(() => ({ data: [] })),
    ])
      .then(
        ([
          result,
          accessResult,
          whatsappAutomationResult,
          userRows,
          representativeRows,
          debtorRows,
          warehouseRows,
          recycleRows,
        ]) => {
          setCompany({ ...defaultCompany, ...(result.company || {}) });
          if (result.profile) {
            setUser({
              full_name: result.profile.full_name || "",
              phone: result.profile.phone || "",
              avatar_url: result.profile.avatar_url || "",
            });
          }
          setAccess(accessResult || null);
          if (whatsappAutomationResult) {
            setAutomation((current) => ({
              ...current,
              ...(whatsappAutomationResult.settings ||
                whatsappAutomationResult.automation ||
                whatsappAutomationResult),
            }));
          }
          setUsers(userRows || []);
          setRepresentatives(representativeRows?.data || []);
          setDebtors(debtorRows?.data || []);
          setWarehouses(warehouseRows?.data || []);
          setRecycleBin(recycleRows?.data || []);
        },
      )
      .catch((error) =>
        toast.error(getErrorMessage(error, "تنظیمات ترلاسه نه شول.")),
      )
      .finally(() => setLoading(false));
  }, [isAdministrator, profile]);

  useEffect(() => {
    if (
      activeSection !== "whatsapp" ||
      !isAdministrator ||
      !settingsService.whatsappStatus
    ) {
      return undefined;
    }

    let cancelled = false;

    const loadWhatsAppStatus = async () => {
      try {
        const result = await settingsService.whatsappStatus();

        if (!cancelled) {
          setWhatsappStatus(result || null);
        }
      } catch {
        if (!cancelled) {
          setWhatsappStatus((current) => current || {
            connected: false,
            state: "UNAVAILABLE",
            qrDataUrl: null,
          });
        }
      }
    };

    loadWhatsAppStatus();

    const timer = window.setInterval(
      loadWhatsAppStatus,
      5000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeSection, isAdministrator]);



  const reloadUsers = async () => {
    if (!isAdministrator) return;
    try {
      setUsers(await settingsService.users());
    } catch (error) {
      toast.error(getErrorMessage(error, "Users ترلاسه نه شول."));
    }
  };

  const createSystemUser = async (event) => {
    event.preventDefault();
    if (!newUser.email.includes("@") || !newUser.username.trim() || !newUser.full_name.trim() || newUser.password.length < 8) {
      return toast.error("د User ټول ضروري معلومات سم ولیکئ.");
    }
    setSaving("new-user");
    try {
      await settingsService.createUser(newUser);
      toast.success("نوی User جوړ شو.");
      setNewUser(defaultNewUser);
      setUserModal(false);
      await reloadUsers();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving("");
    }
  };

  const updateSystemUser = async (id, patch) => {
    setSaving(`user-${id}`);
    try {
      const updated = await settingsService.updateUser(id, patch);
      setUsers((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item));
      toast.success("User اصلاح شو.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving("");
    }
  };

  const removeRepresentativeFromSettings = async (representative) => {
    if (
      !window.confirm(
        `آیا ${representative.name} Recycle Bin ته ولېږدول شي؟`,
      )
    ) {
      return;
    }

    setSaving(`representative-${representative.id}`);
    try {
      await representativeService.remove(representative.id, { actor: profile });
      setRepresentatives((current) =>
        current.filter((item) => item.id !== representative.id),
      );
      await reloadRecycleBin();
      toast.success("استازی Recycle Bin ته ولېږدول شو.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving("");
    }
  };

  const removeDebtorFromSettings = async (debtor) => {
    if (!window.confirm(`آیا ${debtor.name} Recycle Bin ته ولېږدول شي؟`)) {
      return;
    }

    setSaving(`debtor-${debtor.id}`);
    try {
      await debtorService.remove(debtor.id, { actor: profile });
      setDebtors((current) => current.filter((item) => item.id !== debtor.id));
      await reloadRecycleBin();
      toast.success("قرضدار Recycle Bin ته ولېږدول شو.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving("");
    }
  };

  const removeWarehouseFromSettings = async (warehouse) => {
    if (!window.confirm(`آیا ${warehouse.name} Recycle Bin ته ولېږدول شي؟`)) {
      return;
    }

    setSaving(`warehouse-${warehouse.id}`);
    try {
      await warehouseService.remove(warehouse.id, { actor: profile });
      setWarehouses((current) =>
        current.filter((item) => item.id !== warehouse.id),
      );
      await reloadRecycleBin();
      toast.success("ګودام Recycle Bin ته ولېږدول شو.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving("");
    }
  };

  const restoreRecycleItem = async (item) => {
    setSaving(`restore-${item.id}`);
    try {
      await recycleBinService.restore(item.id, { actor: profile });
      await Promise.all([
        reloadRecycleBin(),
        representativeService
          .list({ limit: 500 })
          .then((result) => setRepresentatives(result?.data || [])),
        debtorService
          .list({ limit: 500 })
          .then((result) => setDebtors(result?.data || [])),
        warehouseService
          .list({ limit: 500 })
          .then((result) => setWarehouses(result?.data || [])),
      ]);
      toast.success("ریکارډ بېرته Restore شو.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving("");
    }
  };

  const permanentlyDeleteRecycleItem = async (item) => {
    if (
      !window.confirm(
        `آیا ${item.label} دایمي حذف شي؟ دا عمل بیا بېرته نه راګرځي.`,
      )
    ) {
      return;
    }

    setSaving(`permanent-${item.id}`);
    try {
      await recycleBinService.removePermanently(item.id, { actor: profile });
      setRecycleBin((current) =>
        current.filter((row) => row.id !== item.id),
      );
      toast.success("ریکارډ دایمي حذف شو.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving("");
    }
  };

  const toggleUserDeletePermission = async (userRow, permission) => {
    if (userRow.role === "administrator") return;

    const current = Array.isArray(userRow.permissions)
      ? userRow.permissions
      : [];
    const next = current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission];

    await updateSystemUser(userRow.id, { permissions: next });
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Logo باید تر 5MB کم وي.");
    setSaving("logo");
    try {
      const result = await uploadService.companyAsset(file);
      setCompany((current) => ({ ...current, logo_url: result.url }));
      toast.success("Company logo پورته شو. اوس Save Company وکړئ.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Logo پورته نه شو."));
    } finally {
      setSaving("");
      event.target.value = "";
    }
  };

  const uploadWatermark = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Watermark logo باید تر 5MB کم وي.");
      return;
    }

    setSaving("watermark");
    try {
      const result = await uploadService.companyAsset(file);
      setCompany((current) => ({
        ...current,
        watermark_logo_url: result.url,
      }));
      toast.success("Watermark logo پورته شو. اوس Save Company وکړئ.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Watermark logo پورته نه شو."));
    } finally {
      setSaving("");
      event.target.value = "";
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Profile picture باید تر 5MB کم وي.");
    setSaving("avatar");
    try {
      const result = await uploadService.profileImage(file);
      setUser((current) => ({ ...current, avatar_url: result.url }));
      toast.success("Profile picture پورته شو. اوس Save Profile وکړئ.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Profile picture پورته نه شو."));
    } finally {
      setSaving("");
      event.target.value = "";
    }
  };

  const saveCompany = async (event) => {
    event.preventDefault();
    setSaving("company");
    try {
      const result = await settingsService.updateCompany(company);
      setCompany(result);
      toast.success("د شرکت تنظیمات ثبت شول.");
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setSaving(""); }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving("profile");
    try {
      await settingsService.updateProfile(user);
      await refreshProfile();
      toast.success("Profile اصلاح شو.");
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setSaving(""); }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (password.password.length < 8) return toast.error("Password باید لږ تر لږه 8 توري وي.");
    if (password.password !== password.confirm) return toast.error("Password یو شان نه دی.");
    setSaving("password");
    try {
      await settingsService.changePassword({ password: password.password });
      setPassword({ password: "", confirm: "" });
      toast.success("Password بدل شو.");
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setSaving(""); }
  };

  const backup = async () => {
    setSaving("backup");
    try {
      const data = await settingsService.backup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `wms-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("Backup ډاونلوډ شو.");
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setSaving(""); }
  };

  const restore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Restore موجود معلومات بدلولای شي. دوام ورکړو؟")) return;
    setSaving("restore");
    try {
      const payload = JSON.parse(await file.text());
      await settingsService.restore(payload);
      toast.success("Database restore بشپړ شو.");
    } catch (error) { toast.error(getErrorMessage(error, "Backup file ناسم دی.")); }
    finally { setSaving(""); event.target.value = ""; }
  };

  const saveDashboardSliderSeconds = () => {
    const seconds = Math.max(3, Math.min(120, Number(dashboardSlideSeconds) || 10));
    try {
      localStorage.setItem("wms_dashboard_slide_seconds", String(seconds));
      window.dispatchEvent(new Event("dashboard-slider-seconds-updated"));
      setDashboardSlideSeconds(seconds);
      toast.success(`د Dashboard عکسونه به هر ${seconds} ثانیو کې بدل شي.`);
    } catch {
      toast.error("د Slider وخت ثبت نه شو.");
    }
  };

  const saveWhatsAppAutomation = async () => {
    if (!settingsService.updateWhatsappAutomation) {
      return toast.error("WhatsApp Automation API په wmsService.js کې نشته.");
    }

    setSaving("whatsapp-automation");
    try {
      const result = await settingsService.updateWhatsappAutomation(automation);
      if (result) {
        setAutomation((current) => ({
          ...current,
          ...(result.settings || result.automation || result),
        }));
      }
      toast.success("د WhatsApp اتومات تنظیمات ثبت شول.");
    } catch (error) {
      toast.error(getErrorMessage(error, "د WhatsApp اتومات تنظیمات ثبت نه شول."));
    } finally {
      setSaving("");
    }
  };

  const sendWhatsAppTest = async () => {
    const phone = whatsappTestPhone.trim();

    if (!phone) {
      return toast.error("د Test Message لپاره WhatsApp نمبر ولیکئ.");
    }

    setSaving("whatsapp-test");
    try {
      const result = await settingsService.whatsappTest({
        phone,
        message:
          "السلام علیکم، دا د AZI System د WhatsApp اتومات سیستم ازمایښتي پیغام دی.",
      });

      toast.success(
        result?.message ||
          "Test Message په بریالیتوب WhatsApp ته ولېږل شو.",
      );
    } catch (error) {
      console.error("WhatsApp Test Message Error:", error);
      toast.error(getErrorMessage(error, "Test Message ونه لېږل شو."));
    } finally {
      setSaving("");
    }
  };

  const updateAutomationTime = (prefix, value) => {
    const [hour, minute] = String(value || "00:00").split(":");
    setAutomation((current) => ({
      ...current,
      [`${prefix}_hour`]: Number(hour || 0),
      [`${prefix}_minute`]: Number(minute || 0),
    }));
  };

  const automationTime = (prefix, fallbackHour = 9) =>
    `${String(automation[`${prefix}_hour`] ?? fallbackHour).padStart(2, "0")}:${String(
      automation[`${prefix}_minute`] ?? 0,
    ).padStart(2, "0")}`;

  if (loading) return <Card className="p-6"><Loading /></Card>;

  const sections = [
    { id: "general", label: "عمومي تنظیمات", icon: FiSettings },
    { id: "company", label: "د شرکت تنظیمات", icon: FiTruck },
    { id: "profile", label: "کاروونکی / پروفایل", icon: FiUser },
    { id: "reports", label: "د راپور تنظیمات", icon: FiFileText },
    { id: "whatsapp", label: "WhatsApp اتومات", icon: FiMessageCircle },
    { id: "system", label: "سیستم", icon: FiSettings },
    { id: "security", label: "امنیت", icon: FiLock },
    ...(canDeleteRepresentative
      ? [{ id: "representatives", label: "د استازو مدیریت", icon: FiTruck }]
      : []),
    ...(canDeleteDebtor
      ? [{ id: "debtors", label: "د قرضدارانو مدیریت", icon: FiUsers }]
      : []),
    ...(canDeleteWarehouse
      ? [{ id: "warehouses", label: "د ګودامونو مدیریت", icon: FiDatabase }]
      : []),
    ...(canRestoreRecycle ||
    canPermanentlyDeleteRecycle ||
    canDeleteRepresentative ||
    canDeleteDebtor ||
    canDeleteWarehouse
      ? [{ id: "recycle", label: "Recycle Bin", icon: FiTrash2 }]
      : []),
    ...(isAdministrator
      ? [
          { id: "users", label: "د کاروونکو مدیریت", icon: FiUsers },
          { id: "database", label: "Backup او Restore", icon: FiDatabase },
        ]
      : []),
  ];

  return (
    <div className="page-enter min-w-0 space-y-5 rounded-[30px] bg-gradient-to-br from-[#f5f7fb] via-white to-cyan-50/55 p-1">
      <Card className="overflow-hidden rounded-[26px] border border-blue-100/80 bg-gradient-to-br from-white via-white to-cyan-50/55 p-0 shadow-[0_18px_48px_rgba(15,23,42,0.09)]">
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <PageHeader
            title="تنظیمات"
            subtitle="د سیستم، شرکت، کاروونکو او راپورونو معلومات په منظم ډول اداره کړئ."
          />
        </div>

        <div
          dir="rtl"
          className="grid grid-cols-2 gap-3 border-t border-blue-100 bg-gradient-to-l from-blue-50/80 via-white to-cyan-50/60 p-3 sm:grid-cols-4"
        >
          <MiniSummary
            icon={FiTruck}
            label="شرکت"
            value={company.company_name || "WMS Pro"}
          />
          <MiniSummary
            icon={FiUsers}
            label="کاروونکي"
            value={isAdministrator ? users.length : 1}
          />
          <MiniSummary icon={FiDatabase} label="سیستم نسخه" value="2.0.0" />
          <MiniSummary
            icon={FiSettings}
            label="وروستی لید"
            value={new Date().toLocaleDateString("en-CA")}
          />
        </div>
      </Card>

      <div
        dir="rtl"
        className="flex gap-2 overflow-x-auto rounded-[20px] border border-blue-100 bg-gradient-to-l from-white to-blue-50/60 p-2 shadow-md lg:hidden"
      >
        {sections.map((section) => (
          <SettingsNavButton
            key={section.id}
            compact
            active={activeSection === section.id}
            icon={section.icon}
            label={section.label}
            onClick={() => setActiveSection(section.id)}
          />
        ))}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <Card className="hidden h-fit overflow-hidden rounded-[24px] border border-blue-100/80 bg-gradient-to-b from-white via-white to-cyan-50/45 p-2.5 shadow-[0_16px_38px_rgba(30,64,175,0.10)] lg:sticky lg:top-24 lg:block">
          <div dir="rtl" className="space-y-1">
            {sections.map((section) => (
              <SettingsNavButton
                key={section.id}
                active={activeSection === section.id}
                icon={section.icon}
                label={section.label}
                onClick={() => setActiveSection(section.id)}
              />
            ))}
          </div>
        </Card>

        <div className="min-w-0">
          {activeSection === "general" ? (
            <SettingsPanel
              icon={FiSettings}
              title="عمومي تنظیمات"
              subtitle="د ژبې، پیسو، نیټې او ظاهري حالت عمومي انتخابونه."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <CompactField label="ژبه">
                  <select
                    className="field h-11"
                    value={settings.language}
                    onChange={(event) =>
                      updateSettings({ language: event.target.value })
                    }
                  >
                    <option value="ps">پښتو</option>
                    <option value="fa">دری</option>
                    <option value="en">English</option>
                  </select>
                </CompactField>

                <CompactField label="د پیسو واحد">
                  <select
                    className="field h-11"
                    value={settings.currency}
                    onChange={(event) =>
                      updateSettings({ currency: event.target.value })
                    }
                  >
                    <option value="AFN">AFN - افغاني</option>
                    <option value="USD">USD - ډالر</option>
                  </select>
                </CompactField>

                <CompactField label="د نیټې Format">
                  <select
                    className="field h-11"
                    value={settings.dateFormat}
                    onChange={(event) =>
                      updateSettings({ dateFormat: event.target.value })
                    }
                  >
                    <option value="yyyy-MM-dd">YYYY-MM-DD</option>
                    <option value="dd/MM/yyyy">DD/MM/YYYY</option>
                    <option value="MM/dd/yyyy">MM/DD/YYYY</option>
                  </select>
                </CompactField>

                <CompactField label="Theme">
                  <select
                    className="field h-11"
                    value={settings.theme}
                    onChange={(event) =>
                      updateSettings({ theme: event.target.value })
                    }
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </CompactField>
              </div>

              <div dir="rtl" className="mt-4 overflow-hidden rounded-[20px] border border-blue-100 bg-gradient-to-l from-blue-50/80 via-white to-cyan-50/70 p-3.5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">Smart Warehouse Slider</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                      په Dashboard کې د Smart Warehouse عکسونو د بدلیدو وخت له همدې ځایه وټاکئ.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="field h-10 min-w-[130px]"
                      value={dashboardSlideSeconds}
                      onChange={(event) => setDashboardSlideSeconds(Number(event.target.value))}
                    >
                      <option value={5}>5 ثانیې</option>
                      <option value={10}>10 ثانیې</option>
                      <option value={15}>15 ثانیې</option>
                      <option value={20}>20 ثانیې</option>
                      <option value={30}>30 ثانیې</option>
                      <option value={60}>60 ثانیې</option>
                    </select>

                    <Button type="button" onClick={saveDashboardSliderSeconds} className="h-10 rounded-xl px-4">
                      <FiSave /> ثبت کړه
                    </Button>
                  </div>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-blue-600 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(8, (dashboardSlideSeconds / 60) * 100))}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 rounded-[16px] border border-slate-200 bg-slate-50/70 p-3 text-right">
                <p className="text-sm font-black text-slate-800">
                  عمومي تنظیمات سمدستي تطبیقېږي
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                  د ژبې، پیسو، نیټې او Theme انتخابونه د سیستم په موجود Settings Context کې ساتل کېږي.
                </p>
              </div>
            </SettingsPanel>
          ) : null}

          {activeSection === "company" ? (
            <SettingsPanel
              icon={FiTruck}
              title="د شرکت تنظیمات"
              subtitle="د شرکت نوم، تماس، ادرس او لوګو په یوه منظم ځای کې."
            >
              <form onSubmit={saveCompany} className="space-y-4">
                <CompactField label="د شرکت نوم">
                  <input
                    className="field h-11"
                    disabled={!canEditCompany}
                    value={company.company_name}
                    onChange={(event) =>
                      setCompany({ ...company, company_name: event.target.value })
                    }
                  />
                </CompactField>

                <div className="grid gap-3 md:grid-cols-2">
                  <CompactField label="تلیفون">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.phone || ""}
                      onChange={(event) =>
                        setCompany({ ...company, phone: event.target.value })
                      }
                    />
                  </CompactField>

                  <CompactField label="ایمیل">
                    <input
                      type="email"
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.email || ""}
                      onChange={(event) =>
                        setCompany({ ...company, email: event.target.value })
                      }
                    />
                  </CompactField>
                </div>

                <CompactField label="د شرکت ادرس">
                  <textarea
                    className="textarea-field min-h-20"
                    disabled={!canEditCompany}
                    value={company.address || ""}
                    onChange={(event) =>
                      setCompany({ ...company, address: event.target.value })
                    }
                  />
                </CompactField>

                <div className="rounded-[18px] border border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-cyan-50/50 p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_180px] md:items-center">
                    <div>
                      <CompactField label="د شرکت لوګو">
                        <input
                          className="field h-11"
                          disabled={!canEditCompany}
                          value={company.logo_url || ""}
                          onChange={(event) =>
                            setCompany({ ...company, logo_url: event.target.value })
                          }
                          placeholder="Logo URL"
                        />
                      </CompactField>

                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => logoInput.current?.click()}
                          disabled={!canEditCompany || saving === "logo"}
                        >
                          <FiUpload />
                          {saving === "logo" ? "Uploading..." : "لوګو پورته کړه"}
                        </Button>
                        <input
                          ref={logoInput}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={uploadLogo}
                        />
                      </div>
                    </div>

                    <div className="flex min-h-28 items-center justify-center rounded-[16px] border border-dashed border-slate-300 bg-white p-3">
                      {company.logo_url ? (
                        <img
                          src={company.logo_url}
                          alt="Company logo"
                          className="max-h-20 max-w-[140px] object-contain"
                        />
                      ) : (
                        <span className="text-xs font-bold text-slate-400">
                          لوګو نشته
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {canEditCompany ? (
                  <SaveBar
                    disabled={saving === "company"}
                    text={saving === "company" ? "ثبتېږي..." : "د شرکت معلومات ذخیره کړه"}
                  />
                ) : (
                  <p className="text-sm font-bold text-slate-500">
                    Company settings یوازې Administrator او Manager اصلاح کولی شي.
                  </p>
                )}
              </form>
            </SettingsPanel>
          ) : null}

          {activeSection === "profile" ? (
            <SettingsPanel
              icon={FiUser}
              title="کاروونکی / پروفایل"
              subtitle="د اوسني کاروونکي شخصي معلومات او Profile Picture."
            >
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="space-y-3">
                    <CompactField label="بشپړ نوم">
                      <input
                        className="field h-11"
                        value={user.full_name}
                        onChange={(event) =>
                          setUser({ ...user, full_name: event.target.value })
                        }
                      />
                    </CompactField>

                    <CompactField label="تلیفون">
                      <input
                        className="field h-11"
                        value={user.phone}
                        onChange={(event) =>
                          setUser({ ...user, phone: event.target.value })
                        }
                      />
                    </CompactField>

                    <CompactField label="Profile Picture URL">
                      <input
                        className="field h-11"
                        value={user.avatar_url || ""}
                        onChange={(event) =>
                          setUser({ ...user, avatar_url: event.target.value })
                        }
                      />
                    </CompactField>
                  </div>

                  <div className="flex flex-col items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50/60 p-4">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt="Profile"
                        className="size-24 rounded-full border-4 border-white object-cover shadow-md"
                      />
                    ) : (
                      <span className="flex size-24 items-center justify-center rounded-full border-4 border-white bg-slate-200 text-3xl font-black text-slate-500 shadow-md">
                        {(user.full_name || "A").charAt(0).toUpperCase()}
                      </span>
                    )}

                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3"
                      onClick={() => avatarInput.current?.click()}
                      disabled={saving === "avatar"}
                    >
                      <FiUpload />
                      {saving === "avatar" ? "Uploading..." : "تصویر بدل کړه"}
                    </Button>
                    <input
                      ref={avatarInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={uploadAvatar}
                    />
                  </div>
                </div>

                <SaveBar
                  disabled={saving === "profile"}
                  text={saving === "profile" ? "ثبتېږي..." : "پروفایل ذخیره کړه"}
                />
              </form>
            </SettingsPanel>
          ) : null}

          {activeSection === "reports" ? (
            <SettingsPanel
              icon={FiFileText}
              title="د راپور تنظیمات"
              subtitle="د حساب، وصولۍ، بقایا، امضا، Footer او Watermark تنظیمات."
            >
              <form onSubmit={saveCompany} className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <CompactField label="د قرضدار راپور عنوان">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.report_title || ""}
                      onChange={(event) =>
                        setCompany({ ...company, report_title: event.target.value })
                      }
                    />
                  </CompactField>

                  <CompactField label="د استازي مشترک حسابي راپور عنوان">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.representative_report_title || ""}
                      onChange={(event) =>
                        setCompany({
                          ...company,
                          representative_report_title: event.target.value,
                        })
                      }
                    />
                  </CompactField>

                  <CompactField label="د بقایاتو راپور عنوان">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.representative_balance_report_title || ""}
                      onChange={(event) =>
                        setCompany({
                          ...company,
                          representative_balance_report_title: event.target.value,
                        })
                      }
                    />
                  </CompactField>

                  <CompactField label="د وصولیو راپور عنوان">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.representative_receipt_report_title || ""}
                      onChange={(event) =>
                        setCompany({
                          ...company,
                          representative_receipt_report_title: event.target.value,
                        })
                      }
                    />
                  </CompactField>

                  <CompactField label="د سند Prefix">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.document_prefix || ""}
                      onChange={(event) =>
                        setCompany({
                          ...company,
                          document_prefix: event.target.value,
                        })
                      }
                      placeholder="DB"
                    />
                  </CompactField>

                  <CompactField label="د قرضدار د امضا عنوان">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.debtor_signature_label || ""}
                      onChange={(event) =>
                        setCompany({
                          ...company,
                          debtor_signature_label: event.target.value,
                        })
                      }
                    />
                  </CompactField>

                  <CompactField label="د محاسب د امضا عنوان">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.accountant_signature_label || ""}
                      onChange={(event) =>
                        setCompany({
                          ...company,
                          accountant_signature_label: event.target.value,
                        })
                      }
                    />
                  </CompactField>

                  <CompactField label="د مهر عنوان">
                    <input
                      className="field h-11"
                      disabled={!canEditCompany}
                      value={company.stamp_label || ""}
                      onChange={(event) =>
                        setCompany({ ...company, stamp_label: event.target.value })
                      }
                    />
                  </CompactField>
                </div>

                <CompactField label="د راپور Footer">
                  <input
                    className="field h-11"
                    disabled={!canEditCompany}
                    value={company.footer_text || ""}
                    onChange={(event) =>
                      setCompany({ ...company, footer_text: event.target.value })
                    }
                  />
                </CompactField>

                <div className="rounded-[18px] border border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-cyan-50/50 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-right">
                      <p className="font-black text-slate-900">
                        د راپور Watermark
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        د چاپ په راپور کې نازک Company Logo ښکاره کوي.
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
                      <input
                        type="checkbox"
                        disabled={!canEditCompany}
                        checked={company.watermark_enabled !== false}
                        onChange={(event) =>
                          setCompany({
                            ...company,
                            watermark_enabled: event.target.checked,
                          })
                        }
                      />
                      فعال
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_170px]">
                    <div>
                      <input
                        className="field h-11"
                        disabled={!canEditCompany}
                        value={company.watermark_logo_url || ""}
                        onChange={(event) =>
                          setCompany({
                            ...company,
                            watermark_logo_url: event.target.value,
                          })
                        }
                        placeholder="Watermark logo URL"
                      />

                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-2"
                        onClick={() => watermarkInput.current?.click()}
                        disabled={!canEditCompany || saving === "watermark"}
                      >
                        <FiUpload />
                        {saving === "watermark"
                          ? "Uploading..."
                          : "Watermark پورته کړه"}
                      </Button>
                      <input
                        ref={watermarkInput}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={uploadWatermark}
                      />
                    </div>

                    <div className="flex min-h-24 items-center justify-center rounded-[16px] border border-dashed border-slate-300 bg-white p-3">
                      {company.watermark_logo_url || company.logo_url ? (
                        <img
                          src={company.watermark_logo_url || company.logo_url}
                          alt="Watermark preview"
                          className="max-h-14 max-w-[120px] object-contain opacity-10 grayscale"
                        />
                      ) : (
                        <span className="text-xs font-bold text-slate-400">
                          Watermark نشته
                        </span>
                      )}
                    </div>
                  </div>

                  <CompactField label={`د Watermark نازکوالی: ${Number(company.watermark_opacity || 0.06).toFixed(2)}`}>
                    <input
                      type="range"
                      min="0.02"
                      max="0.18"
                      step="0.01"
                      disabled={!canEditCompany}
                      className="w-full"
                      value={Number(company.watermark_opacity || 0.06)}
                      onChange={(event) =>
                        setCompany({
                          ...company,
                          watermark_opacity: Number(event.target.value),
                        })
                      }
                    />
                  </CompactField>
                </div>

                <div className="rounded-[18px] border border-slate-200 bg-white p-3">
                  <p className="mb-3 text-right text-sm font-black text-slate-900">
                    د واتساپ متن
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <CompactField label="سلام">
                      <input
                        className="field h-11"
                        disabled={!canEditCompany}
                        value={company.whatsapp_greeting || ""}
                        onChange={(event) =>
                          setCompany({
                            ...company,
                            whatsapp_greeting: event.target.value,
                          })
                        }
                      />
                    </CompactField>
                    <CompactField label="پای">
                      <input
                        className="field h-11"
                        disabled={!canEditCompany}
                        value={company.whatsapp_closing || ""}
                        onChange={(event) =>
                          setCompany({
                            ...company,
                            whatsapp_closing: event.target.value,
                          })
                        }
                      />
                    </CompactField>
                  </div>

                  <CompactField label="د حساب تصفیې غوښتنه">
                    <textarea
                      className="textarea-field min-h-20"
                      disabled={!canEditCompany}
                      value={company.whatsapp_request || ""}
                      onChange={(event) =>
                        setCompany({
                          ...company,
                          whatsapp_request: event.target.value,
                        })
                      }
                    />
                  </CompactField>
                </div>

                {canEditCompany ? (
                  <SaveBar
                    disabled={saving === "company"}
                    text={saving === "company" ? "ثبتېږي..." : "د راپور تنظیمات ذخیره کړه"}
                  />
                ) : null}
              </form>
            </SettingsPanel>
          ) : null}

          {activeSection === "whatsapp" ? (
            <SettingsPanel
              icon={FiMessageCircle}
              title="WhatsApp اتومات"
              subtitle="د وصولۍ، هفتوار راپور او بشپړ PDF راپور تنظیمات جلا اداره کړئ."
            >
              <div dir="rtl" className="space-y-4">
                {isAdministrator ? (
                  <div className="rounded-[18px] border border-emerald-100 bg-gradient-to-l from-emerald-50/70 via-white to-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="text-right">
                        <h3 className="font-black text-slate-900">
                          WhatsApp اتصال
                        </h3>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          QR په همدې صفحه کې Scan کړئ. له اتصال وروسته QR په اتومات ډول پټېږي.
                        </p>
                      </div>

                      <span
                        className={`inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-black ${
                          whatsappStatus?.connected
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {whatsappStatus?.connected
                          ? "Connected"
                          : whatsappStatus?.state || "Waiting"}
                      </span>
                    </div>

                    {!whatsappStatus?.connected ? (
                      <div className="mt-4 flex min-h-48 items-center justify-center rounded-[16px] border border-dashed border-slate-200 bg-white p-4">
                        {whatsappStatus?.qrDataUrl ? (
                          <div className="text-center">
                            <img
                              src={whatsappStatus.qrDataUrl}
                              alt="WhatsApp QR"
                              className="mx-auto size-[260px] max-h-[70vw] max-w-[70vw] object-contain"
                              draggable={false}
                            />
                            <p className="mt-3 text-xs font-bold text-slate-500">
                              WhatsApp → Linked Devices → Link a Device
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-slate-500">
                            د WhatsApp QR ته انتظار...
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-[14px] bg-emerald-50 px-3 py-2 text-right text-sm font-black text-emerald-700">
                        WhatsApp په بریالیتوب وصل دی.
                      </p>
                    )}
                  </div>
                ) : null}

                <div className="rounded-[18px] border border-emerald-100 bg-gradient-to-l from-emerald-50/70 via-white to-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-right">
                      <h3 className="font-black text-slate-900">د وصولۍ اتومات رسید</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        کله چې وصولي ثبت شي، رسید WhatsApp ته سمدستي واستوي.
                      </p>
                    </div>
                    <label className="inline-flex shrink-0 items-center gap-2 text-xs font-black text-slate-700">
                      <input
                        type="checkbox"
                        checked={automation.payment_receipt_enabled !== false}
                        onChange={(event) =>
                          setAutomation((current) => ({
                            ...current,
                            payment_receipt_enabled: event.target.checked,
                          }))
                        }
                      />
                      فعال
                    </label>
                  </div>
                </div>

                <div className="rounded-[18px] border border-blue-100 bg-gradient-to-l from-blue-50/75 via-white to-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-right">
                      <h3 className="font-black text-slate-900">هفتوار راپور</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        د پاتې حساب لرونکو قرضدارانو هفتوار راپور په ټاکلې ورځ او وخت واستوي.
                      </p>
                    </div>
                    <label className="inline-flex shrink-0 items-center gap-2 text-xs font-black text-slate-700">
                      <input
                        type="checkbox"
                        checked={automation.weekly_report_enabled !== false}
                        onChange={(event) =>
                          setAutomation((current) => ({
                            ...current,
                            weekly_report_enabled: event.target.checked,
                          }))
                        }
                      />
                      فعال
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <CompactField label="ورځ">
                      <select
                        className="field h-11"
                        value={Number(automation.weekly_day ?? 4)}
                        onChange={(event) =>
                          setAutomation((current) => ({
                            ...current,
                            weekly_day: Number(event.target.value),
                          }))
                        }
                      >
                        <option value={0}>یکشنبه</option>
                        <option value={1}>دوشنبه</option>
                        <option value={2}>سه شنبه</option>
                        <option value={3}>چهارشنبه</option>
                        <option value={4}>پنجشنبه</option>
                        <option value={5}>جمعه</option>
                        <option value={6}>شنبه</option>
                      </select>
                    </CompactField>

                    <CompactField label="وخت">
                      <input
                        type="time"
                        className="field h-11"
                        value={automationTime("weekly", 9)}
                        onChange={(event) =>
                          updateAutomationTime("weekly", event.target.value)
                        }
                      />
                    </CompactField>
                  </div>
                </div>

                <div className="rounded-[18px] border border-violet-100 bg-gradient-to-l from-violet-50/70 via-white to-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-right">
                      <h3 className="font-black text-slate-900">بشپړ PDF راپور</h3>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        بشپړ حسابي PDF راپور په ټاکلې دوره او وخت WhatsApp ته واستوي.
                      </p>
                    </div>
                    <label className="inline-flex shrink-0 items-center gap-2 text-xs font-black text-slate-700">
                      <input
                        type="checkbox"
                        checked={automation.full_report_enabled !== false}
                        onChange={(event) =>
                          setAutomation((current) => ({
                            ...current,
                            full_report_enabled: event.target.checked,
                          }))
                        }
                      />
                      فعال
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <CompactField label="د راپور دوره">
                      <select
                        className="field h-11"
                        value={Number(automation.full_report_interval_weeks ?? 3)}
                        onChange={(event) =>
                          setAutomation((current) => ({
                            ...current,
                            full_report_interval_weeks: Number(event.target.value),
                          }))
                        }
                      >
                        <option value={1}>هره ۱ هفته</option>
                        <option value={2}>هرې ۲ هفتې</option>
                        <option value={3}>هرې ۳ هفتې</option>
                        <option value={4}>هرې ۴ هفتې</option>
                      </select>
                    </CompactField>

                    <CompactField label="وخت">
                      <input
                        type="time"
                        className="field h-11"
                        value={automationTime("full_report", 10)}
                        onChange={(event) =>
                          updateAutomationTime("full_report", event.target.value)
                        }
                      />
                    </CompactField>
                  </div>
                </div>

                <div className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <CompactField label="WhatsApp Test نمبر">
                      <input
                        className="field h-11"
                        value={whatsappTestPhone}
                        onChange={(event) => setWhatsappTestPhone(event.target.value)}
                        placeholder="مثال: 0781234567"
                      />
                    </CompactField>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11"
                      onClick={sendWhatsAppTest}
                      disabled={saving === "whatsapp-test"}
                    >
                      <FiMessageCircle />
                      {saving === "whatsapp-test" ? "لېږل کېږي..." : "Test Message"}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end border-t border-blue-100 pt-4">
                  <Button
                    type="button"
                    onClick={saveWhatsAppAutomation}
                    disabled={saving === "whatsapp-automation"}
                  >
                    <FiSave />
                    {saving === "whatsapp-automation"
                      ? "ثبتېږي..."
                      : "WhatsApp تنظیمات ذخیره کړه"}
                  </Button>
                </div>
              </div>
            </SettingsPanel>
          ) : null}

          {activeSection === "system" ? (
            <SettingsPanel
              icon={FiSettings}
              title="سیستم"
              subtitle="د WMS موجود محلي تنظیمات او د سیستم لنډ معلومات."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <InfoTile label="Theme" value={settings.theme || "light"} />
                <InfoTile label="Language" value={settings.language || "ps"} />
                <InfoTile label="Currency" value={settings.currency || "AFN"} />
                <InfoTile label="Date Format" value={settings.dateFormat || "yyyy-MM-dd"} />
                <InfoTile label="System Version" value="2.0.0" />
                <InfoTile label="Current User" value={profile?.full_name || "Administrator"} />
              </div>
            </SettingsPanel>
          ) : null}

          {activeSection === "security" ? (
            <SettingsPanel
              icon={FiLock}
              title="امنیت"
              subtitle="د اوسني User پاسورډ له همدې برخې بدل کړئ."
            >
              <form onSubmit={changePassword} className="max-w-2xl space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CompactField label="نوی Password">
                    <input
                      type="password"
                      className="field h-11"
                      value={password.password}
                      onChange={(event) =>
                        setPassword({ ...password, password: event.target.value })
                      }
                    />
                  </CompactField>

                  <CompactField label="Password تکرار">
                    <input
                      type="password"
                      className="field h-11"
                      value={password.confirm}
                      onChange={(event) =>
                        setPassword({ ...password, confirm: event.target.value })
                      }
                    />
                  </CompactField>
                </div>

                <SaveBar
                  icon={FiLock}
                  disabled={saving === "password"}
                  text={saving === "password" ? "بدلېږي..." : "Password بدل کړه"}
                />
              </form>
            </SettingsPanel>
          ) : null}

          {activeSection === "representatives" && canDeleteRepresentative ? (
            <SettingsPanel
              icon={FiTruck}
              title="د استازو مدیریت"
              subtitle="حذف شوی استازی دایمي نه حذفېږي؛ لومړی Recycle Bin ته ځي."
              badge={`${representatives.length} شرکتونه`}
            >
              <div className="overflow-hidden rounded-[18px] border border-blue-100 bg-white shadow-sm">
                <div
                  dir="rtl"
                  className="hidden grid-cols-[minmax(220px,1fr)_160px_130px_120px] gap-2 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500 md:grid"
                >
                  <span>شرکت</span>
                  <span>شمېره</span>
                  <span>ټول مال</span>
                  <span>عملیات</span>
                </div>

                <div className="divide-y divide-blue-50">
                  {representatives.length === 0 ? (
                    <p className="p-6 text-center font-bold text-slate-500">
                      استازی نشته.
                    </p>
                  ) : (
                    representatives.map((item) => (
                      <div
                        key={item.id}
                        dir="rtl"
                        className="grid gap-2 bg-white p-3 md:grid-cols-[minmax(220px,1fr)_160px_130px_120px] md:items-center md:px-4"
                      >
                        <div className="flex min-w-0 items-center gap-2 text-right">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                            <FiTruck />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-black text-slate-950">
                              {item.name}
                            </p>
                            <p className="mt-0.5 truncate text-xs font-bold text-slate-400">
                              {item.address || "ادرس نشته"}
                            </p>
                          </div>
                        </div>

                        <p className="font-bold text-slate-600">
                          {item.phone || "—"}
                        </p>
                        <p className="font-black text-blue-700">
                          {Number(item.total_goods || 0).toLocaleString()}
                        </p>

                        <button
                          type="button"
                          disabled={saving === `representative-${item.id}`}
                          onClick={() => removeRepresentativeFromSettings(item)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          <FiTrash2 />
                          {saving === `representative-${item.id}`
                            ? "حذفېږي..."
                            : "حذف"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </SettingsPanel>
          ) : null}


          {activeSection === "debtors" && canDeleteDebtor ? (
            <SettingsPanel
              icon={FiUsers}
              title="د قرضدارانو مدیریت"
              subtitle="یوازې هغه User حذف کولی شي چې debtors.delete اجازه ولري."
              badge={`${debtors.length} قرضداران`}
            >
              <ManagementList
                rows={debtors}
                emptyText="قرضدار نشته."
                icon={FiUsers}
                getTitle={(item) => item.name}
                getSubtitle={(item) =>
                  `${item.phone || "شمېره نشته"} • ${item.address || "ادرس نشته"}`
                }
                getMeta={(item) =>
                  `${Number(item.current_balance || 0).toLocaleString()} ${item.currency || "AFN"}`
                }
                saving={saving}
                savingPrefix="debtor"
                onDelete={removeDebtorFromSettings}
              />
            </SettingsPanel>
          ) : null}

          {activeSection === "warehouses" && canDeleteWarehouse ? (
            <SettingsPanel
              icon={FiDatabase}
              title="د ګودامونو مدیریت"
              subtitle="د Main Warehouse پرته نور ګودامونه د اجازې لرونکي User لخوا Recycle Bin ته لېږدول کېږي."
              badge={`${warehouses.length} ګودامونه`}
            >
              <ManagementList
                rows={warehouses}
                emptyText="ګودام نشته."
                icon={FiDatabase}
                getTitle={(item) => item.name}
                getSubtitle={(item) =>
                  `${item.location || "موقعیت نشته"} • ${item.status || "Active"}`
                }
                getMeta={(item) =>
                  item.id === "main" ? "اصلي ګودام" : `${Number(item.products || 0)} جنس`
                }
                saving={saving}
                savingPrefix="warehouse"
                onDelete={removeWarehouseFromSettings}
                disableDelete={(item) => item.id === "main"}
              />
            </SettingsPanel>
          ) : null}

          {activeSection === "recycle" ? (
            <SettingsPanel
              icon={FiTrash2}
              title="Recycle Bin"
              subtitle="حذف شوي استازي، قرضداران، ګودامونه او جنسونه دلته خوندي پاتې کېږي."
              badge={`${recycleBin.length} ریکارډونه`}
            >
              {recycleBin.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50/70 p-10 text-center">
                  <FiTrash2 className="mx-auto text-3xl text-slate-300" />
                  <p className="mt-3 font-black text-slate-600">
                    Recycle Bin خالي دی.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recycleBin.map((item) => (
                    <div
                      key={item.id}
                      dir="rtl"
                      className="grid gap-3 rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_150px_170px_240px] md:items-center"
                    >
                      <div className="min-w-0 text-right">
                        <div className="flex items-center gap-2">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                            <FiTrash2 />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-black text-slate-950">
                              {item.label}
                            </p>
                            <p className="mt-0.5 text-xs font-bold text-slate-400">
                              {recycleTypeLabel(item.entity_type)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs font-black text-slate-600">
                        {new Date(item.deleted_at).toLocaleString()}
                      </p>

                      <p className="truncate text-xs font-bold text-slate-500">
                        حذف کوونکی: {item.deleted_by?.name || "—"}
                      </p>

                      <div className="flex flex-wrap justify-end gap-2">
                        {canRestoreRecycle ? (
                          <button
                            type="button"
                            disabled={saving === `restore-${item.id}`}
                            onClick={() => restoreRecycleItem(item)}
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {saving === `restore-${item.id}`
                              ? "Restore..."
                              : "بېرته Restore"}
                          </button>
                        ) : null}

                        {canPermanentlyDeleteRecycle ? (
                          <button
                            type="button"
                            disabled={saving === `permanent-${item.id}`}
                            onClick={() => permanentlyDeleteRecycleItem(item)}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                          >
                            <FiTrash2 />
                            {saving === `permanent-${item.id}`
                              ? "حذف..."
                              : "دایمي حذف"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SettingsPanel>
          ) : null}

          {activeSection === "users" && isAdministrator ? (
            <SettingsPanel
              icon={FiUsers}
              title="د کاروونکو مدیریت"
              subtitle="نوي User جوړول، Role بدلول او User فعال/غیرفعال کول."
              action={
                <Button type="button" onClick={() => setUserModal(true)}>
                  <FiPlus /> نوی User
                </Button>
              }
            >
              <div className="overflow-x-auto rounded-[18px] border border-slate-200">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Name",
                        "Username",
                        "Email",
                        "Phone",
                        "Role",
                        "Status",
                        "Delete Permissions",
                        "Action",
                      ].map((item) => (
                        <th
                          key={item}
                          className="px-4 py-3 text-right text-xs font-black text-slate-500"
                        >
                          {item}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {users.map((item) => (
                      <tr key={item.id} className="bg-white">
                        <td className="px-4 py-3 font-black text-slate-900">
                          {item.full_name}
                        </td>
                        <td className="px-4 py-3">@{item.username}</td>
                        <td className="px-4 py-3">{item.email}</td>
                        <td className="px-4 py-3">{item.phone || "—"}</td>
                        <td className="px-4 py-3">
                          <select
                            className="field h-9 min-w-36"
                            value={item.role}
                            disabled={saving === `user-${item.id}`}
                            onChange={(event) =>
                              updateSystemUser(item.id, {
                                role: event.target.value,
                              })
                            }
                          >
                            <option value="administrator">Administrator</option>
                            <option value="manager">Manager</option>
                            <option value="cashier">Cashier</option>
                            <option value="store_keeper">Store Keeper</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`status-badge ${
                              item.is_active !== false
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {item.is_active !== false ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {item.role === "administrator" ? (
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                              ټولې اجازې
                            </span>
                          ) : (
                            <div className="flex min-w-[360px] flex-wrap gap-1.5">
                              {DELETE_PERMISSION_OPTIONS.map((permission) => {
                                const checked = Array.isArray(item.permissions)
                                  ? item.permissions.includes(permission.key)
                                  : false;

                                return (
                                  <label
                                    key={permission.key}
                                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-black ${
                                      checked
                                        ? "border-blue-200 bg-blue-50 text-blue-700"
                                        : "border-slate-200 bg-white text-slate-500"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={saving === `user-${item.id}`}
                                      onChange={() =>
                                        toggleUserDeletePermission(
                                          item,
                                          permission.key,
                                        )
                                      }
                                    />
                                    {permission.label}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="secondary-button px-3 py-2"
                            disabled={
                              item.id === profile.id ||
                              saving === `user-${item.id}`
                            }
                            onClick={() =>
                              updateSystemUser(item.id, {
                                is_active: !item.is_active,
                              })
                            }
                          >
                            <FiEdit2 />
                            {item.is_active ? "Disable" : "Enable"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SettingsPanel>
          ) : null}

          {activeSection === "database" && isAdministrator ? (
            <SettingsPanel
              icon={FiDatabase}
              title="Backup او Restore"
              subtitle="د Database Backup واخلئ یا پخوانی Backup بېرته Restore کړئ."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[18px] border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-cyan-50/60 p-4 text-right shadow-sm">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                    <FiDownload />
                  </span>
                  <h3 className="mt-3 font-black text-slate-900">
                    Database Backup
                  </h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                    ټول مهم معلومات JSON فایل ته Export کوي.
                  </p>
                  <Button
                    type="button"
                    className="mt-4"
                    onClick={backup}
                    disabled={saving === "backup"}
                  >
                    <FiDownload />
                    {saving === "backup" ? "Backup..." : "Backup جوړ کړه"}
                  </Button>
                </div>

                <div className="rounded-[18px] border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-cyan-50/60 p-4 text-right shadow-sm">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
                    <FiUpload />
                  </span>
                  <h3 className="mt-3 font-black text-slate-900">
                    Database Restore
                  </h3>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                    له Backup فایل څخه موجود معلومات بېرته راولي.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-4"
                    onClick={() => restoreInput.current?.click()}
                    disabled={saving === "restore"}
                  >
                    <FiUpload />
                    {saving === "restore" ? "Restore..." : "فایل انتخاب کړه"}
                  </Button>
                  <input
                    ref={restoreInput}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={restore}
                  />
                </div>
              </div>
            </SettingsPanel>
          ) : null}
        </div>
      </div>

      <Modal
        open={userModal}
        onClose={() => setUserModal(false)}
        title="نوی User"
        size="md"
      >
        <form onSubmit={createSystemUser} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full Name">
              <input
                className="field h-10"
                value={newUser.full_name}
                onChange={(event) =>
                  setNewUser({ ...newUser, full_name: event.target.value })
                }
              />
            </Field>
            <Field label="Username">
              <input
                className="field h-10"
                value={newUser.username}
                onChange={(event) =>
                  setNewUser({ ...newUser, username: event.target.value })
                }
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className="field h-10"
                value={newUser.email}
                onChange={(event) =>
                  setNewUser({ ...newUser, email: event.target.value })
                }
              />
            </Field>
            <Field label="Phone">
              <input
                className="field h-10"
                value={newUser.phone}
                onChange={(event) =>
                  setNewUser({ ...newUser, phone: event.target.value })
                }
              />
            </Field>
            <Field label="Role">
              <select
                className="field h-10"
                value={newUser.role}
                onChange={(event) =>
                  setNewUser({ ...newUser, role: event.target.value })
                }
              >
                <option value="administrator">Administrator</option>
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
                <option value="store_keeper">Store Keeper</option>
              </select>
            </Field>
            <Field label="Password">
              <input
                type="password"
                className="field h-10"
                value={newUser.password}
                onChange={(event) =>
                  setNewUser({ ...newUser, password: event.target.value })
                }
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setUserModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving === "new-user"}>
              {saving === "new-user" ? "جوړېږي..." : "Create User"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}



function recycleTypeLabel(type) {
  const labels = {
    representative: "استازی",
    debtor: "قرضدار",
    warehouse: "ګودام",
    product: "جنس",
  };
  return labels[type] || type || "ریکارډ";
}

function ManagementList({
  rows,
  emptyText,
  icon: Icon,
  getTitle,
  getSubtitle,
  getMeta,
  saving,
  savingPrefix,
  onDelete,
  disableDelete = () => false,
}) {
  if (!rows.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center font-bold text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-blue-100 bg-white shadow-sm">
      <div className="divide-y divide-blue-50">
        {rows.map((item) => {
          const disabled = disableDelete(item);
          return (
            <div
              key={item.id}
              dir="rtl"
              className="grid gap-2 bg-white p-3 transition hover:bg-gradient-to-l hover:from-blue-50/80 hover:to-cyan-50/40 md:grid-cols-[minmax(240px,1fr)_160px_130px] md:items-center md:px-4"
            >
              <div className="flex min-w-0 items-center gap-2 text-right">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-950">
                    {getTitle(item)}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-bold text-slate-400">
                    {getSubtitle(item)}
                  </p>
                </div>
              </div>

              <p className="text-right text-xs font-black text-slate-600 md:text-center">
                {getMeta(item)}
              </p>

              <button
                type="button"
                disabled={disabled || saving === `${savingPrefix}-${item.id}`}
                onClick={() => onDelete(item)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FiTrash2 />
                {disabled
                  ? "نه حذفېږي"
                  : saving === `${savingPrefix}-${item.id}`
                    ? "لېږل کېږي..."
                    : "Recycle Bin"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsNavButton({
  active,
  icon: Icon,
  label,
  onClick,
  compact = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl font-black transition ${
        compact ? "h-10 px-3 text-xs" : "h-11 w-full px-3 text-sm"
      } ${
        active
          ? "bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/25"
          : "bg-transparent text-slate-600 hover:bg-gradient-to-l hover:from-blue-50 hover:to-cyan-50 hover:text-blue-700"
      }`}
    >
      <Icon className="shrink-0 text-base" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function SettingsPanel({
  icon: Icon,
  title,
  subtitle,
  badge,
  action,
  children,
}) {
  return (
    <Card className="overflow-hidden rounded-[24px] border border-blue-100 bg-gradient-to-br from-white via-white to-slate-50/70 p-0 shadow-[0_16px_45px_rgba(15,23,42,0.09)]">
      <div
        dir="rtl"
        className="flex flex-col gap-3 border-b border-blue-100 bg-gradient-to-l from-blue-50/80 via-white to-cyan-50/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      >
        <div className="flex items-center gap-3 text-right">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-lg text-white shadow-lg shadow-blue-500/20">
            <Icon />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-950 sm:text-xl">
                {title}
              </h2>
              {badge ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
              {subtitle}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}

function MiniSummary({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[16px] border border-blue-100 bg-gradient-to-br from-white to-blue-50/60 px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:shadow-md">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 text-blue-700 shadow-sm">
        <Icon />
      </span>
      <div className="min-w-0 text-right">
        <p className="text-[10px] font-black text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-sm font-black text-slate-800">
          {value}
        </p>
      </div>
    </div>
  );
}

function CompactField({ label, children }) {
  return (
    <label className="block text-right">
      <span className="mb-1.5 block text-xs font-black text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function SaveBar({ disabled, text, icon: Icon = FiSave }) {
  return (
    <div className="flex justify-end border-t border-blue-100 bg-gradient-to-l from-blue-50/40 to-transparent pt-4">
      <Button type="submit" disabled={disabled}>
        <Icon />
        {text}
      </Button>
    </div>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-[16px] border border-blue-100 bg-gradient-to-br from-white to-blue-50/70 p-3 text-right shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}