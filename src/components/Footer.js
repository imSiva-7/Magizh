// components/Footer.js
"use client";

import styles from "@/css/footer.module.css";
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
              <span className={styles.footerLogoIcon}>🥛</span>
              <h3 className={styles.footerTitle}>Magizh Dairy</h3>
            </div>
            <p className={styles.footerDescription}>
              Streamlining dairy production management with precision and efficiency.
            </p>
            <div className={styles.footerContact}>
              <div className={styles.contactItem}>
                <span className={styles.contactIcon}>📞</span>
                <span className={styles.contactText}>+91 9876543210</span>
              </div>
              <div className={styles.contactItem}>
                <span className={styles.contactIcon}>📧</span>
                <span className={styles.contactText}>info@magizhdairy.com</span>
              </div>
              <div className={styles.contactItem}>
                <span className={styles.contactIcon}>📍</span>
                <span className={styles.contactText}>Chennai, Tamil Nadu</span>
              </div>
            </div>
          </div>
          
          {/* Quick Links */}
          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>Quick Links</h4>
            <ul className={styles.footerLinks}>
              <li><Link href="/" className={styles.footerLink}>Dashboard</Link></li>
              <li><Link href="/productions" className={styles.footerLink}>Production</Link></li>
              <li><Link href="/supplier" className={styles.footerLink}>Suppliers</Link></li>
              <li><Link href="/procurement" className={styles.footerLink}>Procurement</Link></li>
              <li><Link href="/productions/history" className={styles.footerLink}>History</Link></li>
            </ul>
          </div>
          
          {/* Stats */}
          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>System Status</h4>
            <div className={styles.statsGrid}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>24/7</span>
                <span className={styles.statLabel}>Uptime</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>99.9%</span>
                <span className={styles.statLabel}>Reliability</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>🔒</span>
                <span className={styles.statLabel}>Secure</span>
              </div>
            </div>
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