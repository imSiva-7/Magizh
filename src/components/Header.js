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
    { name: "Production", path: "/productions", icon: "" },
    { name: "History", path: "/productions/history", icon: "" },
    { name: "Suppliers", path: "/supplier", icon: "" },
  ];

  const isActive = (path) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.endsWith(path);
  };

  const handleNavigation = (path) => {
    router.push(path);
    setMobileMenuOpen(false);
  };

  

  return (
    <header className={styles.header}>
      <div className={styles.headerContainer}>
        <div
          className={styles.logoSection}
          onClick={() => router.push("/productions")}
        >
          <div className={styles.logo}>
            <div className={styles.logoImage}>
              <Image
                src="/favicon.ico"
                alt="Magizh Dairy Logo"
                width={180}
                height={90}
                priority
                className={styles.logoIcon}
              />
            </div>
          </div>
        </div>

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
                  <span className={styles.navText}>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.headerRight}>
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
