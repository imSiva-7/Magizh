"use client";
import { getTodayDate, INDIA_TIME_ZONE } from "@/lib/india-date.mjs";
import { useEffect, useRef, useSyncExternalStore } from "react";

import styles from "@/css/footer.module.css";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";

const weekdayFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  timeZone: INDIA_TIME_ZONE,
});
const getWeekday = () => weekdayFormatter.format(new Date());
const getServerWeekday = () => "day";
const subscribeToDay = (callback) => {
  const timer = setInterval(callback, 60000);
  return () => clearInterval(timer);
};

function FooterNavLink({ href, children }) {
  return (
    <li>
      <Link href={href} className={styles.footerLink}>
        <span className={styles.linkRollover}>
          <span>{children}</span>
          <span aria-hidden="true">{children}</span>
        </span>
      </Link>
    </li>
  );
}

export default function Footer() {
  const wordmarkRef = useRef(null);
  const currentYear = Number(getTodayDate().slice(0, 4));
  const weekday = useSyncExternalStore(
    subscribeToDay,
    getWeekday,
    getServerWeekday,
  );

  useEffect(() => {
    const wordmark = wordmarkRef.current;
    if (!wordmark || typeof IntersectionObserver === "undefined") return;

    wordmark.dataset.reveal = "pending";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < 0.25) return;
        wordmark.dataset.reveal = "visible";
        observer.disconnect();
      },
      { threshold: 0.25 },
    );

    observer.observe(wordmark);
    return () => {
      observer.disconnect();
      delete wordmark.dataset.reveal;
    };
  }, []);

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
              <Image src="/magizh-logo.png" alt="Magizh Dairy" width={110} height={44} />
            </div>
            <p className={styles.footerDescription}>
              Fresh thinking for everyday dairy operations. Production, people,
              and payments in one place.
            </p>
          </div>

          {/* Quick Links Section */}
          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>COMPANY</h4>
            <ul className={styles.footerLinks}>
              {isAdmin && <FooterNavLink href="/admin">Admin Panel</FooterNavLink>}

              <FooterNavLink href="/productions">Productions</FooterNavLink>
              <FooterNavLink href="/stock">Stock</FooterNavLink>
              <FooterNavLink href="/customer">Customers</FooterNavLink>

              <FooterNavLink href="/supplier">Suppliers</FooterNavLink>
              {isAdmin && (
                <FooterNavLink href="/employee/attendance/history">Employees</FooterNavLink>
              )}
            </ul>
          </div>
          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>ANALYTICS</h4>
            <ul className={styles.footerLinks}>
              <FooterNavLink href="/supplier/analytics">Procurements</FooterNavLink>
              <FooterNavLink href="/productions/analytics">Production</FooterNavLink>

              <FooterNavLink href="/customer/analytics">Orders</FooterNavLink>
            </ul>
          </div>

          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>OPERATIONS</h4>
            <ul className={styles.footerLinks}>
              <FooterNavLink href="/productions/history">Stock</FooterNavLink>
              <FooterNavLink href="/supplier/procurement/history">Procurements</FooterNavLink>
              <FooterNavLink href="/customer/order/history">Orders</FooterNavLink>
            </ul>
          </div>
        </div>

        <div ref={wordmarkRef} className={styles.wordmark} aria-hidden="true">
          {Array.from("MAGIZH", (letter, index) => (
            <span
              key={letter}
              className={styles.letter}
              style={{ "--letter-index": index }}
            >
              {letter}
            </span>
          ))}
        </div>

        <div className={styles.footerBottom}>
          <p className={styles.greeting}>Enjoy the rest of your {weekday}.</p>
          <div className={styles.copyright}>
            {" "}
            <span className={styles.copyrightText}>
              © {currentYear} Magizh Dairy Productions. All rights reserved.
            </span>
            <span className={styles.version}>v1.7.36</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
