// components/Footer.js
"use client";

import styles from "@/css/footer.module.css";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContainer}>
        {/* Main Footer Content */}
        <div className={styles.footerMain}>
          {/* Company Info */}
          <div className={styles.footerSection}>
            <div className={styles.footerLogo}>
              <Image
                src="/favicon.ico"
                alt="Magizh Dairy"
                width={180}
                height={80}
                className={styles.logoIcon}
              />
            </div>
            {/* Quick Links */}
            <div className={styles.footerSection}>
              <h4 className={styles.sectionTitle}>Links</h4>
              <ul className={styles.footerLinks}>
                {/* <li>
                <Link href="/" className={styles.footerLink}>
                  Home
                </Link>
              </li> */}
                <li>
                  <Link href="/productions" className={styles.footerLink}>
                    Production
                  </Link>
                </li>
                <li>
                  <Link
                    href="/productions/history"
                    className={styles.footerLink}
                  >
                    History
                  </Link>
                </li>
                <li>
                  <Link href="/supplier" className={styles.footerLink}>
                    Suppliers
                  </Link>
                </li>
                {/* <li>
                <Link href="/procurement" className={styles.footerLink}>
                  Procurement
                </Link>
              </li> */}
              </ul>
            </div>

            {/* Stats */}
          </div>
        </div>

        {/* Copyright Bar */}
        <div className={styles.footerBottom}>
          <div className={styles.copyright}>
            <span className={styles.copyrightText}>
              © {currentYear} Magizh Dairy. All rights reserved.
            </span>
            <span className={styles.version}>v1.0.0</span>
          </div>

          <div className={styles.technicalInfo}>
            <span className={styles.techItem}>Database: MongoDB</span>
            <span className={styles.techItem}>Framework: Next.js</span>
            <span className={styles.techItem}>Hosting: Vercel</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
