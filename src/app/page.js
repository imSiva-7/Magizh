"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./page.module.css";
import Image from "next/image";


export default function Home() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // useEffect(() => {
  //   async function fetchStats() {
  //     try {
  //       const res = await fetch("/api/dashboard/stats");
  //       if (res.ok) {
  //         const data = await res.json();
  //         setStats(data);
  //       } else {
  //         // Fallback mock data
  //         setStats({
  //           totalOrders: 128,
  //           totalMilk: 3540.5,
  //           pendingPayments: 24500,
  //           totalCustomers: 42,
  //           totalSuppliers: 18,
  //         });
  //       }
  //     } catch (error) {
  //       console.error("Failed to fetch stats", error);
  //       setStats({
  //         totalOrders: 128,
  //         totalMilk: 3540.5,
  //         pendingPayments: 24500,
  //         totalCustomers: 42,
  //         totalSuppliers: 18,
  //       });
  //     } finally {
  //       setLoading(false);
  //     }
  //   }
  //   fetchStats();
  // }, []);

  const handleSignOut = () => signOut({ callbackUrl: "/login" });

  return (
    <div className={styles.dashboard}>
      {/* Header with user info */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <h1>Dairy Dashboard</h1>
        </div>
        <div className={styles.userInfo}>
          {status === "authenticated" ? (
            <>
              <span className={styles.userEmail}>{session.user?.email}</span>
              {session.user?.role === "admin" && (
                <span className={styles.adminBadge}>Admin</span>
              )}
              {/* <button onClick={handleSignOut} className={styles.logoutBtn}>
                Sign out
              </button> */}
            </>
          ) : (
            <Link href="/login" className={styles.loginLink}>
               Log in
            </Link>
          )}
        </div>
      </header>

      {/* Quick Stats Cards */}
      {/* <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>📦</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Total Orders</div>
            <div className={styles.statValue}>
              {loading ? "..." : stats?.totalOrders}
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>🥛</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Milk Procured</div>
            <div className={styles.statValue}>
              {loading ? "..." : `${stats?.totalMilk.toFixed(1)} L`}
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>💰</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Pending Payments</div>
            <div className={styles.statValue}>
              {loading ? "..." : `₹${stats?.pendingPayments?.toLocaleString()}`}
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>👥</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Customers</div>
            <div className={styles.statValue}>
              {loading ? "..." : stats?.totalCustomers}
            </div>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>🚜</div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>Suppliers</div>
            <div className={styles.statValue}>
              {loading ? "..." : stats?.totalSuppliers}
            </div>
          </div>
        </div>
      </div> */}

      {/* Main Navigation Grid */}
      <div className={styles.navGrid}>
        <Link href="/productions" className={styles.navCard}>
          <div className={styles.navIcon}>🏭</div>
          <h2>Production</h2>
          <p>Record daily milk production and by‑products</p>
        </Link>

        <Link href="/customer" className={styles.navCard}>
          <div className={styles.navIcon}>👥</div>
          <h2>Customers</h2>
          <p>View and manage customer details</p>
        </Link>
        <Link href="/customer/payments" className={styles.navCard}>
          <div className={styles.navIcon}>💵</div>
          <h2>Customers Payments</h2>
          <p>Track and mark payments to Customers</p>
        </Link>

        <Link href="/supplier" className={styles.navCard}>
          <div className={styles.navIcon}>🚜</div>
          <h2>Suppliers</h2>
          <p>Manage supplier information and rates</p>
        </Link>

        <Link href="/supplier/payments" className={styles.navCard}>
          <div className={styles.navIcon}>💵</div>
          <h2>Supplier Payments</h2>
          <p>Track and settle payments to suppliers</p>
        </Link>

        <Link href="/productions/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>📊</div>
          <h2>Productions Analytics</h2>
          <p>View production insights and reports</p>
        </Link>
        <Link href="/supplier/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>📊</div>
          <h2> Suppliers Analytics</h2>
          <p>View suppliers insights and reports</p>
        </Link>
        <Link href="/customer/analytics" className={styles.navCard}>
          <div className={styles.navIcon}>📊</div>
          <h2>Customers Analytics</h2>
          <p>View customer insights and reports</p>
        </Link>

        {/* <Link href="/reports" className={styles.navCard}>
          <div className={styles.navIcon}>📈</div>
          <h2>Reports</h2>
          <p>Generate financial and operational reports</p>
        </Link> */}
      </div>
    </div>
  );
}