"use client";
import { getTodayDate } from "@/lib/india-date.mjs";

import styles from "@/css/footer.module.css";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function Footer() {
  const currentYear = Number(getTodayDate().slice(0, 4));

  const { data: session } = useSession();
  const isAdmin =
    session?.user?.role === "admin" || session?.user?.role === "dev";

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContainer}>
        <div className={styles.footerMain}>
          {/* Brand Section */}
          <div className={styles.footerSection}>
            <div className={styles.footerLogo}>
              <Image
                src="/favicon.ico"
                alt="Magizh Dairy"
                width={150}
                height={70}
                className={styles.logoIcon}
                priority
              />
            </div>
            <p className={styles.footerDescription}>Fresh thinking for everyday dairy operations. Production, people, and payments in one place.</p>
          </div>

          {/* Quick Links Section */}
          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>COMPANY</h4>
            <ul className={styles.footerLinks}>
              {isAdmin && (
                <li>
                  <Link href="/admin" className={styles.footerLink}>
                    Admin Panel
                  </Link>
                </li>
              )}

              <li>
                <Link href="/productions" className={styles.footerLink}>
                  Productions
                </Link>
              </li>
              <li>
                <Link href="/stock" className={styles.footerLink}>
                  Stock
                </Link>
              </li>
              <li>
                <Link href="/customer" className={styles.footerLink}>
                  Customers{" "}
                </Link>
              </li>

              <li>
                <Link href="/supplier" className={styles.footerLink}>
                  Suppliers
                </Link>
              </li>
              {isAdmin && (
                <li>
                  <Link href="/employee/attendance/history" className={styles.footerLink}>
                    Employees
                  </Link>
                </li>
              )}
            </ul>
          </div>
          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>ANALYTICS</h4>
            <ul className={styles.footerLinks}>
              <li>
                <Link href="/supplier/analytics" className={styles.footerLink}>
                  Procurements
                </Link>
              </li>
              <li>
                <Link
                  href="/productions/analytics"
                  className={styles.footerLink}
                >
                  Production
                </Link>
              </li>

              <li>
                <Link href="/customer/analytics" className={styles.footerLink}>
                  Orders
                </Link>
              </li>
            </ul>
          </div>

          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>OPERATIONS</h4>
            <ul className={styles.footerLinks}>
              {/* <li>
                <Link href="/productions/history" className={styles.footerLink}>
                 Stock
                </Link>
              </li> */}
              <li>
                <Link
                  href="/supplier/procurement/history"
                  className={styles.footerLink}
                >
                  Procurements
                </Link>
              </li>
              <li>
                <Link
                  href="/customer/order/history"
                  className={styles.footerLink}
                >
                  Orders
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <div className={styles.copyright}>
            {" "}
            <span className={styles.copyrightText}>
              © {currentYear} Magizh Dairy Productions. All rights reserved.
            </span>
            <span className={styles.version}>v1.7.5</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
