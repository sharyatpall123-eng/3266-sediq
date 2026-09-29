import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FiCheckCircle,
  FiEdit2,
  FiEye,
  FiKey,
  FiMail,
  FiPhone,
  FiPlus,
  FiSearch,
  FiShield,
  FiTrash2,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Loading from "../components/ui/Loading";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/api";
import { settingsService } from "../Services/wmsService";
import {
  getRolePermissions,
  USER_PERMISSION_OPTIONS,
} from "../utils/permissions";

function blankUser() {
  return {
    full_name: "",
    username: "",
    email: "",
    phone: "",
    role: "cashier",
    login_code: "",
    is_active: true,
    permissions: getRolePermissions("cashier"),
  };
}

const roleLabel = {
  administrator: "Administrator",
  manager: "Manager",
  store_keeper: "Store Keeper",
  cashier: "Cashier",
};

export default function UsersPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState(blankUser);
  const [viewUser, setViewUser] = useState(null);
  const [editUser, setEditUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await settingsService.users());
    } catch (error) {
      toast.error(getErrorMessage(error, "Users ترلاسه نه شول."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setNewUser(blankUser());
      setAddOpen(true);
    }
  }, [searchParams]);

  const closeAdd = () => {
    setAddOpen(false);
    if (searchParams.has("action")) {
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter((item) =>
      [item.full_name, item.username, item.email, item.phone, item.role].some(
        (value) => String(value || "").toLowerCase().includes(query),
      ),
    );
  }, [search, users]);

  const createUser = async (event) => {
    event.preventDefault();

    if (!newUser.full_name.trim()) {
      return toast.error("د User نوم ضروري دی.");
    }

    if (!newUser.username.trim() && !newUser.email.trim()) {
      return toast.error("Username یا Email ولیکئ.");
    }

    if (newUser.login_code.length < 4) {
      return toast.error("Login Code لږ تر لږه 4 کرکټر وي.");
    }

    setSaving("create");

    try {
      const created = await settingsService.createUser(newUser);
      setUsers((current) => [...current, created]);
      toast.success("نوی User جوړ شو.");
      closeAdd();
      setNewUser(blankUser());
    } catch (error) {
      toast.error(getErrorMessage(error, "User جوړ نه شو."));
    } finally {
      setSaving("");
    }
  };

  const openEdit = (item) => {
    setEditUser({
      ...item,
      login_code: "",
      permissions:
        item.role === "administrator"
          ? ["*"]
          : Array.isArray(item.permissions)
            ? item.permissions
            : [],
    });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editUser) return;

    const patch = {
      full_name: editUser.full_name,
      username: editUser.username,
      email: editUser.email,
      phone: editUser.phone,
      role: editUser.role,
      is_active: editUser.is_active !== false,
      permissions:
        editUser.role === "administrator"
          ? ["*"]
          : editUser.permissions,
    };

    if (editUser.login_code) {
      patch.login_code = editUser.login_code;
    }

    setSaving(`edit-${editUser.id}`);

    try {
      const updated = await settingsService.updateUser(editUser.id, patch);
      setUsers((current) =>
        current.map((item) =>
          item.id === editUser.id ? { ...item, ...updated } : item,
        ),
      );
      setEditUser(null);
      toast.success("User اصلاح شو.");
    } catch (error) {
      toast.error(getErrorMessage(error, "User اصلاح نه شو."));
    } finally {
      setSaving("");
    }
  };

  const deleteUser = async (item) => {
    if (item.id === profile?.id) {
      return toast.error("خپل User نشئ حذف کولی.");
    }

    if (!window.confirm(`آیا ${item.full_name} حذف شي؟`)) return;

    setSaving(`delete-${item.id}`);

    try {
      await settingsService.removeUser(item.id);
      setUsers((current) =>
        current.filter((entry) => entry.id !== item.id),
      );
      toast.success("User Recycle Bin ته ولېږدول شو.");
    } catch (error) {
      toast.error(getErrorMessage(error, "User حذف نه شو."));
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="page-enter min-w-0 space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-blue-100 bg-gradient-to-l from-blue-50/80 via-white to-cyan-50/50 p-5 sm:p-6">
          <PageHeader
            title="Users"
            subtitle="User Accounts، Login Code، Role او Permissions مدیریت کړئ."
            actions={
              <Button
                type="button"
                onClick={() => {
                  setNewUser(blankUser());
                  setAddOpen(true);
                }}
              >
                <FiPlus />
                Add User
              </Button>
            }
          />
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="field h-12 pl-11"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search user..."
              />
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-black text-blue-700">
              ټول Users: {filtered.length}
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8">
          <Loading />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((item) => (
              <UserCard
                key={item.id}
                item={item}
                currentUserId={profile?.id}
                deleting={saving === `delete-${item.id}`}
                onView={() => setViewUser(item)}
                onEdit={() => openEdit(item)}
                onDelete={() => deleteUser(item)}
              />
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card className="p-8 text-center text-sm font-bold text-slate-400">
              User پیدا نه شو.
            </Card>
          ) : null}
        </>
      )}

      <Modal
        open={addOpen}
        onClose={closeAdd}
        title="نوی User"
        size="md"
      >
        <form onSubmit={createUser} className="space-y-5">
          <div className="rounded-[20px] border border-blue-100 bg-gradient-to-l from-blue-50 to-cyan-50 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white">
                <FiUserPlus />
              </span>
              <div>
                <h3 className="font-black text-slate-900">
                  User Login معلومات
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Administrator User ثبتوي؛ وروسته User د نوم، Email یا Username + Login Code سره Login کېږي.
                </p>
              </div>
            </div>
          </div>

          <UserForm value={newUser} onChange={setNewUser} />
          <PermissionGrid
            value={newUser}
            onChange={setNewUser}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeAdd}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving === "create"}>
              {saving === "create" ? "جوړېږي..." : "Create User"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewUser)}
        onClose={() => setViewUser(null)}
        title="User Details"
        size="md"
      >
        {viewUser ? <UserDetails user={viewUser} /> : null}
      </Modal>

      <Modal
        open={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        title="User Edit"
        size="md"
      >
        {editUser ? (
          <form onSubmit={saveEdit} className="space-y-5">
            <UserForm value={editUser} onChange={setEditUser} edit />
            <PermissionGrid
              value={editUser}
              onChange={setEditUser}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditUser(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving === `edit-${editUser.id}`}
              >
                {saving === `edit-${editUser.id}`
                  ? "Save..."
                  : "Save Changes"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

function UserCard({
  item,
  currentUserId,
  deleting,
  onView,
  onEdit,
  onDelete,
}) {
  const initials = String(item.full_name || item.username || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const active = item.is_active !== false;

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 text-center shadow-[0_12px_34px_rgba(15,23,42,.07)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_42px_rgba(37,99,235,.12)]">
      <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-2xl font-black text-white shadow-lg shadow-blue-500/20">
        {initials || "U"}
      </div>

      <h3 className="mt-4 truncate text-lg font-black text-slate-950">
        {item.full_name}
      </h3>

      <p className="mt-1 truncate text-xs font-bold text-slate-400">
        @{item.username || item.email || "user"}
      </p>

      <div className="mt-5 space-y-2 text-left text-xs">
        <InfoRow label="Role" value={roleLabel[item.role] || item.role} />
        <InfoRow label="Phone" value={item.phone || "—"} />

        <div className="flex items-center justify-between gap-2">
          <span className="font-black text-slate-700">Status:</span>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
              active
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 border-t border-slate-100 pt-4">
        <ActionButton
          icon={FiEye}
          className="bg-blue-50 text-blue-600 hover:bg-blue-100"
          title="View"
          onClick={onView}
        />
        <ActionButton
          icon={FiEdit2}
          className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
          title="Edit"
          onClick={onEdit}
        />
        <ActionButton
          icon={FiTrash2}
          className="bg-red-50 text-red-600 hover:bg-red-100"
          title="Delete"
          disabled={
            item.id === currentUserId ||
            item.id === "u1" ||
            deleting
          }
          onClick={onDelete}
        />
      </div>
    </article>
  );
}

function ActionButton({
  icon: Icon,
  className,
  title,
  onClick,
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`flex size-9 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon />
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <p className="flex items-center justify-between gap-2">
      <span className="font-black text-slate-700">{label}:</span>
      <span className="truncate text-slate-500">{value}</span>
    </p>
  );
}

function UserForm({ value, onChange, edit = false }) {
  const setRole = (role) => {
    onChange({
      ...value,
      role,
      permissions:
        role === "administrator"
          ? ["*"]
          : getRolePermissions(role).filter((item) => item !== "*"),
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Full Name *">
        <input
          className="field h-11"
          value={value.full_name || ""}
          onChange={(event) =>
            onChange({ ...value, full_name: event.target.value })
          }
          placeholder="Ahmad Khan"
        />
      </Field>

      <Field label="Username">
        <input
          className="field h-11"
          value={value.username || ""}
          onChange={(event) =>
            onChange({ ...value, username: event.target.value })
          }
          placeholder="ahmad"
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          className="field h-11"
          value={value.email || ""}
          onChange={(event) =>
            onChange({ ...value, email: event.target.value })
          }
          placeholder="ahmad@example.com"
        />
      </Field>

      <Field label="Phone">
        <input
          className="field h-11"
          value={value.phone || ""}
          onChange={(event) =>
            onChange({ ...value, phone: event.target.value })
          }
          placeholder="0700000000"
        />
      </Field>

      <Field label="Role">
        <select
          className="field h-11"
          value={value.role || "cashier"}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="administrator">Administrator</option>
          <option value="manager">Manager</option>
          <option value="store_keeper">Store Keeper</option>
          <option value="cashier">Cashier</option>
        </select>
      </Field>

      <Field label={edit ? "New Login Code (optional)" : "Login Code *"}>
        <div className="relative">
          <FiKey className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
          <input
            type="password"
            className="field h-11 pl-10"
            value={value.login_code || ""}
            onChange={(event) =>
              onChange({ ...value, login_code: event.target.value })
            }
            placeholder={
              edit
                ? "خالي = Code نه بدلېږي"
                : "لږ تر لږه 4 کرکټر"
            }
          />
        </div>
      </Field>

      <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
        <div>
          <p className="text-sm font-black text-slate-800">
            User Status
          </p>
          <p className="mt-1 text-[10px] font-bold text-slate-400">
            Inactive User Login نشي کولی.
          </p>
        </div>

        <input
          type="checkbox"
          className="size-5 accent-blue-600"
          checked={value.is_active !== false}
          onChange={(event) =>
            onChange({ ...value, is_active: event.target.checked })
          }
        />
      </label>
    </div>
  );
}

function PermissionGrid({ value, onChange }) {
  if (value.role === "administrator") {
    return (
      <div className="rounded-[20px] border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 text-blue-700">
          <FiShield />
          <p className="font-black">
            Administrator ټول Permissions لري.
          </p>
        </div>
      </div>
    );
  }

  const selected = Array.isArray(value.permissions)
    ? value.permissions
    : [];

  const toggle = (key) => {
    onChange({
      ...value,
      permissions: selected.includes(key)
        ? selected.filter((item) => item !== key)
        : [...selected, key],
    });
  };

  const groups = [
    ...new Set(USER_PERMISSION_OPTIONS.map((item) => item.group)),
  ];

  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <FiShield />
        </span>
        <div>
          <h3 className="font-black text-slate-900">Permissions</h3>
          <p className="text-[10px] font-bold text-slate-400">
            یوازې Checked اجازې User ته ورکول کېږي.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {groups.map((group) => (
          <div key={group}>
            <p className="mb-1.5 text-[11px] font-black text-slate-500">
              {group}
            </p>

            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {USER_PERMISSION_OPTIONS
                .filter((item) => item.group === group)
                .map((item) => {
                  const checked = selected.includes(item.key);
                  const sensitive =
                    item.key === "debtors.view_total" ||
                    item.key === "transit.view_total_value";

                  return (
                    <label
                      key={item.key}
                      className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                        checked
                          ? sensitive
                            ? "border-orange-200 bg-orange-50 text-orange-800"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-blue-600"
                        checked={checked}
                        onChange={() => toggle(item.key)}
                      />
                      <span className="text-[10px] font-black leading-4">
                        {item.label}
                      </span>
                    </label>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserDetails({ user }) {
  const initials = String(user.full_name || user.username || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const permissions =
    user.role === "administrator"
      ? ["*"]
      : Array.isArray(user.permissions)
        ? user.permissions
        : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center rounded-[22px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-5 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-2xl font-black text-white">
          {initials || "U"}
        </div>
        <h3 className="mt-3 text-xl font-black text-slate-950">
          {user.full_name}
        </h3>
        <p className="mt-1 text-sm font-bold text-slate-400">
          @{user.username || "user"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailTile icon={FiMail} label="Email" value={user.email || "—"} />
        <DetailTile icon={FiPhone} label="Phone" value={user.phone || "—"} />
        <DetailTile
          icon={FiShield}
          label="Role"
          value={roleLabel[user.role] || user.role}
        />
        <DetailTile
          icon={FiCheckCircle}
          label="Status"
          value={user.is_active !== false ? "Active" : "Inactive"}
        />
      </div>

      <div className="rounded-[20px] border border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <FiShield className="text-violet-600" />
          <h3 className="font-black text-slate-900">Permissions</h3>
        </div>

        {permissions.includes("*") ? (
          <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm font-black text-blue-700">
            ټولې اجازې
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {USER_PERMISSION_OPTIONS.map((item) =>
              permissions.includes(item.key) ? (
                <span
                  key={item.key}
                  className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-black text-blue-700"
                >
                  {item.label}
                </span>
              ) : null,
            )}

            {permissions.length === 0 ? (
              <span className="text-xs font-bold text-slate-400">
                هیڅ Permission نشته.
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon />
        <span className="text-[10px] font-black">{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-black text-slate-800">
        {value}
      </p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
