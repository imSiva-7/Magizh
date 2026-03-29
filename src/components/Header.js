"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react"; // ← added
import styles from "@/css/header.module.css";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, status } = useSession(); // ← added

  const navItems = [
    { name: "Production", path: "/productions", icon: "" },
    { name: "Production History", path: "/productions/history", icon: "" },
    { name: "Suppliers", path: "/supplier", icon: "" },
    { name: "Customers", path: "/customer", icon: "" },
    { name: "Procurement History", path: "/supplier/procurement/history" },
    { name: "Procurement Payments", path: "/supplier/payments" },
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

  const handleLogout = () => {
    signOut({ callbackUrl: "/" });
  };

  // Loading state while session is being fetched
  if (status === "loading") {
    // You could return a simple loading spinner or nothing
    return null;
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerContainer}>
        <div className={styles.logoSection} onClick={() => router.push("/")}>
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
          {/* Authentication Section */}
          {session ? (
            <div className={styles.userSection}>
              <span className={styles.userName}>
                Hi, {session.user.name || session.user.email}
              </span>
              <button
                onClick={handleLogout}
                className={styles.logoutButton}
                aria-label="Logout"
              >
                  <Image
                          src="/logout.png"
                          alt="Log out"
                          width={20}
                          height={20}
                          priority
                        />
              </button>
            </div>
          ) : (
            <div className={styles.authButtons}>
              <button
                onClick={() => router.push("/login")}
                className={styles.loginButton}
                aria-label="Login"
              >
                <Image
                  src="/user.png"
                  alt="Account"
                  width={20}
                  height={20}
                  priority
                  // className={styles.logoIcon}
                /> 
              </button>
              {/* <button
                onClick={() => router.push("/register")}
                className={styles.registerButton}
                aria-label="Register"
              >
                Register
              </button> */}
            </div>
          )}

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
                {/* Add mobile auth links */}
                {!session && (
                  <>
                    <li className={styles.mobileNavItem}>
                      <button
                        onClick={() => handleNavigation("/login")}
                        className={styles.mobileNavButton}
                      >
                        <span className={styles.mobileNavText}>
                        {" "}  <Image
                            src="/user.png"
                            alt="Account"
                            width={20}
                            height={20}
                            priority
                          /> 
                        </span>
                      </button>
                    </li>
                    {/* <li className={styles.mobileNavItem}>
                      <button
                        onClick={() => handleNavigation("/register")}
                        className={styles.mobileNavButton}
                      >
                        <span className={styles.mobileNavText}>Register</span>
                      </button>
                    </li> */}
                  </>
                )}
                {session && (
                  <li className={styles.mobileNavItem}>
                    <button
                      onClick={handleLogout}
                      className={styles.mobileNavButton}
                    >
                      <span className={styles.mobileNavText}>
                        <Image
                          src="/logout.png"
                          alt="Log out"
                          width={25}
                          height={25}
                          priority
                        />
                      </span>
                    </button>
                  </li>
                )}
              </ul>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
