"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { getTodayDate } from "@/lib/india-date.mjs";
import styles from "@/css/header.module.css";

// Desktop navigation items
const desktopNavItems = [
  { name: "Overview", path: "/" },
  {
    name: "Productions",
    path: "/productions",
    children: { name: "Production History", path: "/productions/history" },
  },
  {
    name: "Stock",
    path: "/stock",
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
      { name: "Subscriptions", path: "/customer/subscriptions" },
    ],
  },
  {
    name: "Employees",
    path: "/employee",
    children: [
      { name: "Attendance", path: "/employee/attendance" },
      { name: "Attendance History", path: "/employee/attendance/history" },
    ],
  },
];

const mobileNavGroups = [
  {
    label: "Operations",
    links: [
      { name: "Home", path: "/", adminOnly: true },
      { name: "Productions", path: "/productions" },
      { name: "Stock", path: "/stock" },
    ],
  },
  {
    label: "Suppliers",
    links: [
      { name: "Suppliers", path: "/supplier" },
      { name: "Procurement History", path: "/supplier/procurement/history" },
      { name: "Procurement Payments", path: "/supplier/payments" },
    ],
  },
  {
    label: "Customers",
    links: [
      { name: "Customers", path: "/customer" },
      { name: "Subscriptions", path: "/customer/subscriptions" },
      { name: "Order History", path: "/customer/order/history" },
      { name: "Order Payments", path: "/customer/payments" },
    ],
  },
  {
    label: "Employees",
    adminOnly: true,
    links: [
      { name: "Employees", path: "/employee" },
      { name: "Attendance History", path: "/employee/attendance/history" },
    ],
  },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const accountName = session?.user?.name?.trim();
  const firstName = accountName?.split(/\s+/)[0];
  const mobileMenuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const accountIconRef = useRef(null);
  const accountCanvasRef = useRef(null);
  const accountId = session?.user?.id;

  useEffect(() => {
    const icon = accountIconRef.current;
    const canvas = accountCanvasRef.current;
    if (!accountId || !icon || !canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const storageKey = `magizh-header-greeting:${accountId}`;
    const today = getTodayDate();
    let cancelled = false;
    let burst;
    const frame = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(storageKey) === today) return;
        localStorage.setItem(storageKey, today);
      } catch {
        return; // A persistent marker is required to keep the greeting daily.
      }

      icon.classList.add(styles.accountCelebrating);
      import("canvas-confetti").then(({ default: confetti }) => {
        if (cancelled || !icon.classList.contains(styles.accountCelebrating)) return;
        burst = confetti.create(canvas, { disableForReducedMotion: true });
        burst({
          particleCount: 18,
          startVelocity: 3,
          spread: 360,
          gravity: 0.12,
          ticks: 110,
          scalar: 0.32,
          colors: ["#ef4444", "#22c55e", "#3b82f6"],
          origin: { x: 0.5, y: 0.5 },
        });
      }).catch(() => {}); // The icon can animate if the particle effect fails to load.
    });

    const clearCelebration = () => {
      burst?.reset();
      icon.classList.remove(styles.accountCelebrating);
    };
    icon.addEventListener("animationend", clearCelebration, { once: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      icon.removeEventListener("animationend", clearCelebration);
      clearCelebration();
    };
  }, [accountId]);

  // A drawer belongs to the mobile page that opened it. Browser history and
  // crossing the desktop breakpoint must also release its body scroll lock.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1100px)");
    const closeMenu = () => setMobileMenuOpen(false);
    const handleDesktop = (event) => {
      if (event.matches) closeMenu();
    };
    desktop.addEventListener("change", handleDesktop);
    window.addEventListener("popstate", closeMenu);
    return () => {
      desktop.removeEventListener("change", handleDesktop);
      window.removeEventListener("popstate", closeMenu);
    };
  }, []);

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

  // Escape key closes mobile menu
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

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      const panel = mobileMenuRef.current;
      const menuButton = menuButtonRef.current;
      menuButton?.focus();
      const trapFocus = (event) => {
        if (event.key !== "Tab") return;
        const items = panel?.querySelectorAll("a[href], button:not(:disabled)");
        if (!items?.length) return;
        const first = menuButton;
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      };
      document.addEventListener("keydown", trapFocus);
      return () => {
        document.body.style.overflow = previousOverflow;
        document.removeEventListener("keydown", trapFocus);
        menuButton?.focus();
      };
    }
  }, [mobileMenuOpen]);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  return (
    <header className={styles.header}>
      <div
        className={styles.headerContainer}
        role={mobileMenuOpen ? "dialog" : undefined}
        aria-modal={mobileMenuOpen || undefined}
        aria-label={mobileMenuOpen ? "Mobile navigation menu" : undefined}
      >
        {/* Logo */}
        <Link
          href="/"
          className={styles.logoSection}
          aria-label="Magizh Dairy home"
        >
          <Image
            src="/magizh-logo.png"
            alt="Magizh Dairy"
            width={120}
            height={48}
            priority
          />
          <span className={styles.brandText}>OPERATIONS WORKSPACE</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className={styles.desktopNav} aria-label="Main navigation">
          <ul className={styles.navList}>
            {desktopNavItems.filter(item => (item.path !== "/" || isAdmin) && (item.path !== "/employee" || isAdmin)).map((item) => (
              <li
                key={item.path}
                className={`${styles.navItem} ${openDropdown === item.path ? styles.dropdownOpen : ""}`}
                onMouseEnter={() => setOpenDropdown(item.path)}
                onMouseLeave={() => setOpenDropdown(null)}
                onFocusCapture={() => setOpenDropdown(item.path)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setOpenDropdown(null);
                }}
                onClick={() => setOpenDropdown(null)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.currentTarget.querySelector("a")?.focus();
                    setOpenDropdown(null);
                  }
                }}
              >
                <Link
                  href={item.path}
                  className={`${styles.navButton} ${
                    (
                      item.path === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.path)
                    )
                      ? styles.active
                      : ""
                  }`}
                  aria-current={
                    (
                      item.path === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.path)
                    )
                      ? "page"
                      : undefined
                  }
                >
                  {item.name}
                </Link>
                {item.children && (
                  <ul className={styles.dropdown}>
                    {Array.isArray(item.children) ? (
                      item.children.map((child) => (
                        <li key={child.path}>
                          <Link
                            href={child.path}
                            className={styles.dropdownItem}
                          >
                            <span className={styles.arrow} aria-hidden="true">
                              ↳{" "}
                            </span>{" "}
                            {child.name}
                          </Link>
                        </li>
                      ))
                    ) : (
                      <li key={item.children.path}>
                        <Link
                          href={item.children.path}
                          className={styles.dropdownItem}
                        >
                          <span className={styles.arrow} aria-hidden="true">
                            ↳{" "}
                          </span>{" "}
                          {item.children.name}
                        </Link>
                      </li>
                    )}
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
              <div className={styles.accountGreeting} title={accountName || undefined}>
                <span ref={accountIconRef} className={styles.accountIcon} aria-hidden="true">
                  <Image src="/user.png" alt="" width={18} height={18} />
                  <canvas ref={accountCanvasRef} className={styles.accountParticles} width={32} height={32} />
                </span>
                <span className={styles.userName}>
                  {firstName ? `Hi, ${firstName}` : "Hi there"}
                </span>
              </div>
              <button
                data-button="icon"
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
          ) : status === "loading" ? (
            <span className={styles.sessionLoading}>Connecting…</span>
          ) : (
            <button
              data-button="secondary"
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
              <span>Sign in</span>
            </button>
          )}

          <button
            data-button="icon"
            ref={menuButtonRef}
            className={styles.mobileMenuButton}
            onClick={toggleMobileMenu}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            <span className={styles.menuIcon} aria-hidden="true" />
          </button>
        </div>

        {/* Mobile Navigation Overlay */}
        {
          <>
            <div
              className={`${styles.mobileBackdrop} ${mobileMenuOpen ? styles.menuVisible : ""}`}
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={mobileMenuRef}
              id="mobile-navigation"
              className={`${styles.mobileNavOverlay} ${mobileMenuOpen ? styles.menuVisible : ""}`}
              inert={!mobileMenuOpen}
              aria-hidden={!mobileMenuOpen}
            >
              <div className={styles.mobileNavContent}>
                <nav className={styles.mobileNav} aria-label="Workspace navigation">
                  {mobileNavGroups.filter(group => !group.adminOnly || isAdmin).map(group => (
                    <div className={styles.mobileNavGroup} key={group.label}>
                      <ul className={styles.mobileNavList}>
                        {group.links.filter(item => !item.adminOnly || isAdmin).map(item => (
                          <li key={item.path}>
                            <Link
                              href={item.path}
                              className={styles.mobileNavButton}
                              onClick={() => setMobileMenuOpen(false)}
                              aria-current={pathname === item.path ? "page" : undefined}
                            >
                              {item.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
                {session && (
                  <div className={styles.mobileNavFooter}>
                    <button
                      data-button="menu-danger"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        signOut();
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        }
      </div>
    </header>
  );
}
