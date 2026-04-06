"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import styles from "@/css/header.module.css";

// Navigation data
const desktopNavItems = [
  {
    name: "Productions",
    path: "/productions",
    children: [{ name: "Production History", path: "/productions/history" }],
  },
  {
    name: "Suppliers",
    path: "/supplier",
    children: [
      { name: "Procurement History", path: "/supplier/procurement/history" },
      { name: "Procurement Payments", path: "/supplier/payments" },
    ],
  },
  {
    name: "Customers",
    path: "/customer",
    children: [
      { name: "Order History", path: "/customer/order/history" },
      { name: "Order Payments", path: "/customer/payments" },
    ],
  },
];

// Complete mobile nav items (including all important pages)
const mobileNavItems = [
  { name: "Home", path: "/" },
  { name: "Productions", path: "/productions" },
  { name: "Production History", path: "/productions/history" },
  { name: "Suppliers", path: "/supplier" },
  { name: "Procurement History", path: "/supplier/procurement/history" },
  { name: "Procurement Payments", path: "/supplier/payments" },
  { name: "Customers", path: "/customer" },
  { name: "Order History", path: "/customer/order/history" },
  { name: "Order Payments", path: "/customer/payments" },
  { name: "Analytics", path: "/analytics" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, status } = useSession();
  const mobileMenuRef = useRef(null);
  const menuButtonRef = useRef(null);

  // Close mobile menu when route changes (FIXED: uncommented)
  // useEffect(() => {
  //   setMobileMenuOpen(false);
  // }, [pathname]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        mobileMenuOpen &&
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target)
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (mobileMenuOpen && event.key === "Escape") {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  // const handleNavigation = useCallback((path) => {
  //   router.push(path);
  //   setMobileMenuOpen(false);
  // }, [router]);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  if (status === "loading") return null;

  return (
    <header className={styles.header}>
      <div className={styles.headerContainer}>
        {/* Logo */}
        <div className={styles.logoSection} onClick={() => router.push("/")}>
          <Image
            src="/favicon.ico"
            alt="Company Logo"
            width={130}
            height={60}
            priority
          />
        </div>

        {/* Desktop Navigation */}
        <nav className={styles.desktopNav} aria-label="Main navigation">
          <ul className={styles.navList}>
            {desktopNavItems.map((item) => (
              <li key={item.path} className={styles.navItem}>
                <Link
                  href={item.path}
                  className={`${styles.navButton} ${
                    pathname.startsWith(item.path) ? styles.active : ""
                  }`}
                  aria-current={
                    pathname.startsWith(item.path) ? "page" : undefined
                  }
                >
                  {item.name}
                </Link>
                {item.children && (
                  <ul className={styles.dropdown} role="menu">
                    {item.children.map((child) => (
                      <li key={child.path} role="none">
                        <Link
                          href={child.path}
                          className={styles.dropdownItem}
                          role="menuitem"
                          aria-current={
                            pathname === child.path ? "page" : undefined
                          }
                        >
                          <span className={styles.arrow}>↳ </span> {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Right side: user & mobile button */}
        <div className={styles.headerRight}>
          {session ? (
            <div className={styles.userSection}>
              <span className={styles.userName}>
                Hi, {session.user?.name || "User"}
              </span>
              <button
                onClick={() => signOut()}
                className={styles.logoutButton}
                aria-label="Sign out"
              >
                <Image
                  src="/logout.png"
                  alt=""
                  width={18}
                  height={18}
                  aria-hidden
                />
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className={styles.loginButton}
              aria-label="Log in"
            >
              <Image
                src="/user.png"
                alt=""
                width={20}
                height={20}
                aria-hidden
              />
            </button>
          )}

          <button
            ref={menuButtonRef}
            className={styles.mobileMenuButton}
            onClick={toggleMobileMenu}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Mobile Navigation Overlay - IMPROVED */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop overlay */}
            <div
              className={styles.mobileBackdrop}
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={mobileMenuRef}
              className={styles.mobileNavOverlay}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation menu"
            >
              <div className={styles.mobileNavHeader}>
                <span className={styles.mobileNavTitle}>Menu</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className={styles.mobileCloseBtn}
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>
              <nav className={styles.mobileNav}>
                <ul className={styles.mobileNavList}>
                  {mobileNavItems.map((item) => (
                    <li key={item.path}>
                      <Link
                        href={item.path}
                        className={`${styles.mobileNavButton} ${
                          pathname === item.path ? styles.mobileActive : ""
                        }`}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-current={pathname === item.path ? "page" : undefined}
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                  {/* Logout option for mobile if logged in */}
                  {session && (
                    <li>
                      <button
                        onClick={() => {
                          signOut();
                          setMobileMenuOpen(false);
                        }}
                        className={styles.mobileLogoutButton}
                      >
                        Sign Out
                      </button>
                    </li>
                  )}
                </ul>
              </nav>
            </div>
          </>
        )}
      </div>
    </header>
  );
}