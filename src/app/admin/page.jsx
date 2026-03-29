"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "@/css/admin.module.css";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleChanges, setRoleChanges] = useState({});

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
    if (session?.user?.role !== "admin" && session?.user?.role !== "dev") {
      router.push("/unauthorized");
      return;
    }
    fetchUsers();
  }, [session, status, router]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data);
      setRoleChanges({}); // reset changes after fetch
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (userId, newRole) => {
    setUpdating(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success("Role updated successfully");

      // If the updated user is the current user, refresh the session to reflect new role
      if (userId === session?.user?.id) {
        await update(); // This will fetch a new session from the server
        toast.info("Your session has been updated with the new role.");
      }

      setRoleChanges((prev) => {
        const newChanges = { ...prev };
        delete newChanges[userId];
        return newChanges;
      });
      fetchUsers(); // refresh list
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const deleteUser = async (userId, userName) => {
    if (userId === session?.user?.id) {
      toast.error("You cannot delete yourself");
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to delete user "${userName}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(userId);
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("User deleted successfully");
      fetchUsers(); // refresh list
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleRoleChange = (userId, newRole) => {
    setRoleChanges((prev) => ({
      ...prev,
      [userId]: newRole,
    }));
  };

  const filteredUsers = users.filter((user) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      user.name?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term)
    );
  });

  const roleOptions = ["employee", "admin", "dev"];

  // Compute stats
  const totalUsers = users.length;
  const roleCounts = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading_container}>
          <div className={styles.spinner}></div>
          <span className={styles.loading_text}>Loading users...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div className={styles.header}>
        <h1>Admin Dashboard</h1>
        <div className={styles.user_info}>
          <span>Logged in as:</span>
          <span className={styles.user_role}>{session?.user?.email}</span>
          <span className={styles.user_role}>({session?.user?.role})</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.stats_grid}>
        <div className={styles.stat_card}>
          <div className={styles.stat_title}>Total Users</div>
          <div className={styles.stat_number}>{totalUsers}</div>
        </div>
        {roleOptions.map((role) => (
          <div key={role} className={styles.stat_card}>
            <div className={styles.stat_title}>{role}</div>
            <div className={styles.stat_number}>{roleCounts[role] || 0}</div>
          </div>
        ))}
      </div>

      {/* Search & Actions */}
      {/* <div className={styles.actions_bar}>
        <div className={styles.search_wrapper}>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.search_input}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className={styles.clear_search}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
           <button onClick={fetchUsers} className={styles.refresh_btn} disabled={loading}>
          Refresh
        </button>
        </div>
       
      </div> */}

      {/* User Table */}
      <div className={styles.table_section}>
        <div className={styles.section_header}>
          <h2>Users Info</h2>
          <div className={styles.entry_count}>
            {filteredUsers.length} of {totalUsers} user(s)
          </div>
        </div>
        <div className={styles.table_wrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const currentRole = roleChanges[user._id] ?? user.role;
                const isChanged =
                  roleChanges[user._id] !== undefined &&
                  roleChanges[user._id] !== user.role;
                return (
                  <tr key={user._id}>
                    <td className={styles.name_cell}>
                      {session?.user?.email == user.email
                        ? "You"
                        : user.name || "-"}
                    </td>
                    <td className={styles.email_cell}>{user.email}</td>
                    <td className={styles.role_cell}>
                      <select
                        value={currentRole}
                        onChange={(e) =>
                          handleRoleChange(user._id, e.target.value)
                        }
                        disabled={session?.user?.email == user.email}
                        className={styles.role_select}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      {isChanged && (
                        <span className={styles.changed_indicator}></span>
                      )}
                    </td>
                    <td className={styles.actions_cell}>
                      <div className={styles.action_buttons}>
                        {isChanged && (
                          <button
                            onClick={() => updateRole(user._id, currentRole)}
                            disabled={
                              updating === user._id || deleting === user._id
                            }
                            className={styles.save_btn}
                          >
                            {updating === user._id ? "Saving..." : "Save"}
                          </button>
                        )}
                        <button
                          onClick={() =>
                            deleteUser(user._id, user.name || user.email)
                          }
                          disabled={session?.user?.email == user.email}
                          className={styles.delete_btn}
                        >
                          {deleting === user._id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="4" className={styles.empty_cell}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
