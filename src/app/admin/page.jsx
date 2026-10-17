"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/admin.module.css";

const ROLES = [
  {
    value: "employee",
    label: "Employee",
    description: "Production, stock, suppliers and customers.",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Workspace operations and user management.",
  },
  {
    value: "dev",
    label: "Developer",
    description: "View workspace data and add entries. Changes require an admin.",
  },
  {
    value: "customer",
    label: "Customer",
    description: "An account classified as a customer.",
  },
  {
    value: "supplier",
    label: "Supplier",
    description: "An account classified as a supplier.",
  },
];
const roleName = (role) =>
  ROLES.find((item) => item.value === role)?.label || role || "Unassigned";
const sameUser = (user, current) =>
  String(user._id) === String(current?.id) ||
  Boolean(
    user.email &&
    current?.email &&
    user.email.toLowerCase() === current.email.toLowerCase(),
  );
const initials = (user) =>
  (user.name || user.email || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
async function readResponse(response, fallback) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || fallback);
  return data;
}

function DeleteDialog({ user, busy, onClose, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="delete-user-title"
      aria-describedby="delete-user-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className={styles.dialogBody}>
        <span className={styles.dangerEyebrow}>REMOVE ACCOUNT</span>
        <h2 id="delete-user-title">Delete this account?</h2>
        <p id="delete-user-description">
          {user.name || "This user"} will lose access to the workspace. This
          cannot be undone.
        </p>
        <div className={styles.deleteIdentity}>
          {user.email || "No email recorded"}
        </div>
        <p className={styles.muted}>Existing business records are kept.</p>
        <div className={styles.dialogActions}>
          <button data-button="secondary"
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={busy}
            autoFocus
          >
            Keep account
          </button>
          <button data-button="danger"
            type="button"
            className={styles.dangerButton}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const allowed =
    status === "authenticated" &&
    session?.user?.role === "admin";
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [changes, setChanges] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const controller = useRef(null);
  const searchRef = useRef(null);
  const fetchUsers = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        cache: "no-store",
        signal: request.signal,
      });
      const data = await readResponse(
        response,
        "Could not load users. Please try again.",
      );
      if (!Array.isArray(data))
        throw new Error("The user list could not be read. Please try again.");
      if (!request.signal.aborted) {
        setUsers(data);
        setLoaded(true);
        setChanges({});
        setRowErrors({});
      }
    } catch (error) {
      if (!request.signal.aborted) setError(error.message);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (!allowed) {
      router.replace("/unauthorized");
      return;
    }
    fetchUsers();
    return () => controller.current?.abort();
  }, [status, allowed, router, fetchUsers]);

  const clearChange = (id) => {
    setChanges((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setRowErrors((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };
  const updateRole = async (user) => {
    if (busy || loading || sameUser(user, session?.user) || !changes[user._id])
      return;
    const role = changes[user._id];
    setBusy({ id: user._id, type: "save" });
    try {
      await readResponse(
        await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user._id, role }),
        }),
        "The role could not be updated.",
      );
      setUsers((previous) =>
        previous.map((item) =>
          item._id === user._id ? { ...item, role } : item,
        ),
      );
      clearChange(user._id);
      toast.success(`${user.name || user.email}: role updated`);
    } catch (error) {
      setRowErrors((previous) => ({ ...previous, [user._id]: error.message }));
    } finally {
      setBusy(null);
    }
  };
  const deleteUser = async () => {
    if (!deleteTarget || busy || sameUser(deleteTarget, session?.user)) return;
    const user = deleteTarget;
    setBusy({ id: user._id, type: "delete" });
    try {
      await readResponse(
        await fetch(`/api/admin/users?id=${encodeURIComponent(user._id)}`, {
          method: "DELETE",
        }),
        "The account could not be deleted.",
      );
      setUsers((previous) => previous.filter((item) => item._id !== user._id));
      clearChange(user._id);
      setDeleteTarget(null);
      toast.success("Account deleted");
      searchRef.current?.focus();
    } catch (error) {
      setDeleteTarget(null);
      setRowErrors((previous) => ({ ...previous, [user._id]: error.message }));
    } finally {
      setBusy(null);
    }
  };
  const counts = users.reduce(
    (result, user) => ({
      ...result,
      [user.role]: (result[user.role] || 0) + 1,
    }),
    {},
  );
  const term = search.trim().toLowerCase();
  const visible = users.filter(
    (user) =>
      (filter === "all" || user.role === filter) &&
      (!term ||
        `${user.name || ""} ${user.email || ""}`.toLowerCase().includes(term)),
  );
  const pending = Object.keys(changes).length;
  if (!allowed)
    return (
      <div className={styles.page}>
        <div className={styles.emptyState} role="status">
          {status === "loading" ? "Checking workspace access…" : "Redirecting…"}
        </div>
      </div>
    );
  return (
    <div className={styles.page}>
      <ToastContainer position="top-right" autoClose={3000} />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>WORKSPACE ADMINISTRATION</span>
          <h1>Admin Dashboard</h1>
          <p>
            People, roles and access. Keep your workspace in the right hands.
          </p>
        </div>
        <div className={styles.session}>
          <span className={styles.sessionDot} aria-hidden="true" />
          <div>
            <strong>{roleName(session.user.role)} access</strong>
            <span>{session.user.email || session.user.name}</span>
          </div>
        </div>
      </header>
      <div className={styles.stats} aria-label="Account overview">
        {[
          ["All accounts", users.length, "Registered in this workspace", "01"],
          ["Employees", counts.employee || 0, "Daily operations", "02"],
          [
            "Administrators",
            (counts.admin || 0) + (counts.dev || 0),
            "Admins and developers",
            "03",
          ],
          [
            "Business accounts",
            (counts.customer || 0) + (counts.supplier || 0),
            "Customers and suppliers",
            "04",
          ],
        ].map(([title, count, caption, index]) => (
          <div key={title} className={styles.stat}>
            <div className={styles.statTop}>
              <span>{title}</span>
              <span className={styles.statIndex} aria-hidden="true">
                {index}
              </span>
            </div>
            <strong>{loaded ? count : "—"}</strong>
            <p>{caption}</p>
          </div>
        ))}
      </div>
      <div className={styles.layout}>
        <section
          className={styles.panel}
          aria-labelledby="user-directory-title"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>TEAM DIRECTORY</span>
              <h2 id="user-directory-title">Workspace accounts</h2>
            </div>
            <button data-button="secondary"
              type="button"
              className={styles.secondaryButton}
              disabled={loading || Boolean(busy) || pending > 0}
              title={
                pending
                  ? "Save or cancel pending edits before refreshing"
                  : "Reload users"
              }
              onClick={fetchUsers}
            >
              {loading && loaded ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <label className={styles.srOnly} htmlFor="user-search">
                Search users
              </label>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                ref={searchRef}
                id="user-search"
                type="search"
                placeholder="Search name or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className={styles.resultCount} aria-live="polite">
              {loaded
                ? `${visible.length} of ${users.length} accounts`
                : "Loading accounts…"}
            </span>
          </div>
          <div
            className={styles.filters}
            role="group"
            aria-label="Filter users by role"
          >
            {[{ value: "all", label: "All roles" }, ...ROLES].map((role) => (
              <button data-button="toggle"
                type="button"
                key={role.value}
                aria-pressed={filter === role.value}
                onClick={() => setFilter(role.value)}
              >
                {role.label}
                <span>
                  {role.value === "all"
                    ? users.length
                    : counts[role.value] || 0}
                </span>
              </button>
            ))}
          </div>
          {pending > 0 && (
            <div className={styles.pendingBar}>
              <span>
                {pending} unsaved role {pending === 1 ? "change" : "changes"}
              </span>
              <button data-button="secondary"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  setChanges({});
                  setRowErrors({});
                }}
              >
                Discard changes
              </button>
            </div>
          )}
          {error && (
            <div className={styles.errorBanner} role="alert">
              <div>
                <strong>Could not load accounts</strong>
                <p>{error}</p>
                {loaded && (
                  <p>Your previously loaded accounts are still shown.</p>
                )}
              </div>
              <button data-button="secondary"
                type="button"
                className={styles.secondaryButton}
                disabled={loading || Boolean(busy) || pending > 0}
                onClick={fetchUsers}
              >
                Try again
              </button>
            </div>
          )}
          {loading && !loaded ? (
            <div className={styles.emptyState} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              Loading workspace accounts…
            </div>
          ) : !loaded ? null : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  Workspace user accounts and role management
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Role</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((user) => {
                    const self = sameUser(user, session.user),
                      changed = changes[user._id] !== undefined,
                      disabled = self || loading || Boolean(busy);
                    return (
                      <tr key={user._id}>
                        <td>
                          <div className={styles.account}>
                            <span className={styles.avatar} aria-hidden="true">
                              {initials(user)}
                            </span>
                            <div className={styles.identity}>
                              <div className={styles.accountName}>
                                {user.name || "Unnamed account"}
                                {self && (
                                  <span className={styles.you}>You</span>
                                )}
                              </div>
                              <span className={styles.email}>
                                {user.email || "No email recorded"}
                              </span>
                            </div>
                          </div>
                          {rowErrors[user._id] && (
                            <p className={styles.rowError} role="alert">
                              {rowErrors[user._id]}
                            </p>
                          )}
                        </td>
                        <td data-label="Role">
                          <div className={styles.roleEditor}>
                            <span
                              className={`${styles.badge} ${styles[user.role] || ""}`}
                            >
                              {roleName(user.role)}
                            </span>
                            <select
                              aria-label={`Role for ${user.name || user.email}`}
                              value={changes[user._id] ?? user.role ?? ""}
                              disabled={disabled}
                              onChange={(event) => {
                                const role = event.target.value;
                                if (role === user.role) clearChange(user._id);
                                else {
                                  setChanges((previous) => ({
                                    ...previous,
                                    [user._id]: role,
                                  }));
                                  setRowErrors((previous) => ({
                                    ...previous,
                                    [user._id]: "",
                                  }));
                                }
                              }}
                            >
                              {!ROLES.some(
                                (role) => role.value === user.role,
                              ) && (
                                <option value={user.role || ""}>
                                  {roleName(user.role)}
                                </option>
                              )}
                              {ROLES.map((role) => (
                                <option key={role.value} value={role.value}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                            {changed && (
                              <span className={styles.pendingText}>
                                Unsaved change
                              </span>
                            )}
                          </div>
                        </td>
                        <td data-label="Actions">
                          <div className={styles.rowActions}>
                            {self ? (
                              <span className={styles.selfNote}>
                                Your account is protected
                              </span>
                            ) : (
                              <>
                                {changed && (
                                  <>
                                    <button data-button="primary"
                                      type="button"
                                      className={styles.primaryButton}
                                      disabled={disabled}
                                      onClick={() => updateRole(user)}
                                      aria-label={`Save role for ${user.name || user.email}`}
                                    >
                                      {busy?.id === user._id &&
                                      busy.type === "save"
                                        ? "Saving…"
                                        : "Save role"}
                                    </button>
                                    <button data-button="secondary"
                                      type="button"
                                      className={styles.textButton}
                                      disabled={disabled}
                                      onClick={() => clearChange(user._id)}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                                <button data-button="danger"
                                  type="button"
                                  className={styles.deleteButton}
                                  disabled={disabled}
                                  aria-label={`Delete ${user.name || user.email}`}
                                  onClick={() => setDeleteTarget(user)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visible.length === 0 && (
                <div className={styles.emptyState}>
                  <h3>
                    {users.length ? "No matching accounts" : "No accounts yet"}
                  </h3>
                  <p>
                    {users.length
                      ? "Try a different name, email or role."
                      : "Registered users will appear here."}
                  </p>
                  {users.length > 0 && (
                    <button data-button="secondary"
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
        <aside className={styles.guide} aria-labelledby="role-guide-title">
          <span className={styles.eyebrow}>ACCESS AT A GLANCE</span>
          <h2 id="role-guide-title">A role for every account</h2>
          <p>
            Choose a role, then save it on that account. Changes take effect on
            the user’s next authenticated request.
          </p>
          <div className={styles.roleGuide}>
            {ROLES.map((role) => (
              <div key={role.value}>
                <span className={`${styles.badge} ${styles[role.value]}`}>
                  {role.label}
                </span>
                <p>{role.description}</p>
              </div>
            ))}
          </div>
          <div className={styles.protection}>
            <strong>Your account stays protected</strong>
            <p>
              You can manage other accounts here. Your own role and account
              cannot be changed from this page.
            </p>
          </div>
        </aside>
      </div>
      {deleteTarget && (
        <DeleteDialog
          user={deleteTarget}
          busy={busy?.type === "delete"}
          onClose={() => setDeleteTarget(null)}
          onConfirm={deleteUser}
        />
      )}
    </div>
  );
}
