"use client";

import styles from "@/css/footer.module.css";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContainer}>
        <div className={styles.footerMain}>
          <div className={styles.footerSection}>
            <div className={styles.footerLogo}>
              <Image
                src="/favicon.ico"
                alt="Magizh Dairy"
                width={150}
                height={70}
                className={styles.logoIcon}
              />
            </div>
            <div className={styles.footerSection}>
              <h4 className={styles.sectionTitle}>Links</h4>
              <ul className={styles.footerLinks}>
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
              </ul>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <div className={styles.copyright}>
            <span className={styles.copyrightText}>
              © {currentYear} Magizh Dairy. All rights reserved.
            </span>
            <span className={styles.version}>v1.3.0</span>
          </div>



          {/* <div className={styles.technicalInfo}>
            <span className={styles.techItem}>Database: MongoDB</span>
            <span className={styles.techItem}>Framework: Next.js</span>
            <span className={styles.techItem}>Hosting: Vercel</span>
          </div> */}
        </div>
      </div>
    </footer>
  );
}
