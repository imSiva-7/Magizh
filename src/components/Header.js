// components/Header.js
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import styles from "@/css/header.module.css";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    // { name: "Dashboard", path: "/", icon: "" },
    { name: "Production", path: "/productions", icon: "" },
    { name: "History", path: "/productions/history", icon: "" },
    { name: "Suppliers", path: "/supplier", icon: "" },
    // { name: "Procurement", path: "/procurement", icon: "" },
  ];

  const isActive = (path) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  const handleNavigation = (path) => {
    router.push(path);
    setMobileMenuOpen(false);
  };

  const currentPage =
    navItems.find((item) => isActive(item.path))?.name || "Dashboard";

  return (
    <header className={styles.header}>
      <div className={styles.headerContainer}>
        {/* Logo Section */}
        <div
          className={styles.logoSection}
          onClick={() => router.push("/productions")}
        >
          <div className={styles.logo}>
            <div className={styles.logoImage}>
              <Image
                src="/favicon.ico"
                alt="Magizh Dairy Logo"
                width={150}
                height={70}
                priority
                className={styles.logoIcon}
              />
            </div>
            {/* <div className={styles.logoText}>
              <h1 className={styles.logoTitle}>Magizh Dairy</h1>
              <p className={styles.logoSubtitle}>Production Management</p>
            </div> */}
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className={styles.desktopNav}>
          <ul className={styles.navList}>
            {navItems.map((item) => (
              <li key={item.path} className={styles.navItem}>
                <button
                  onClick={() => handleNavigation(item.path)}
                  className={`${styles.navButton} ${
                    isActive(item.path) ? styles.active : ""
                  }`}
                  aria-label={`Go to ${item.name}`}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navText}>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Current Page & Mobile Menu Toggle */}
        <div className={styles.headerRight}>
          <div className={styles.currentPage}>
            {/* <span className={styles.currentPageIcon}>📍</span>
            <span className={styles.currentPageText}>{currentPage}</span> */}
          </div>

          <button
            className={styles.mobileMenuButton}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className={styles.mobileNavOverlay}>
            <nav className={styles.mobileNav}>
              <ul className={styles.mobileNavList}>
                {navItems.map((item) => (
                  <li key={item.path} className={styles.mobileNavItem}>
                    <button
                      onClick={() => handleNavigation(item.path)}
                      className={`${styles.mobileNavButton} ${
                        isActive(item.path) ? styles.mobileActive : ""
                      }`}
                    >
                      <span className={styles.mobileNavIcon}>{item.icon}</span>
                      <span className={styles.mobileNavText}>{item.name}</span>
                      {isActive(item.path) && (
                        <span className={styles.mobileActiveIndicator}>●</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
