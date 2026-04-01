"use client";

import styles from "@/css/footer.module.css";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "dev";

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
            <p className={styles.footerDescription}>
              Quality dairy products delivered with care.
            </p>
          </div>

          {/* Quick Links Section */}
          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>Quick Links</h4>
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
                  Production
                </Link>
              </li>
              <li>
                <Link href="/productions/history" className={styles.footerLink}>
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

          {/* Contact Section */}
          <div className={styles.footerSection}>
            <h4 className={styles.sectionTitle}>Contact</h4>
            <ul className={styles.contactList}>
              {/* <li className={styles.contactItem}>
                <span className={styles.contactIcon}>📞</span>
                <span>+91 12345 67890</span>
              </li> */}
              <li className={styles.contactItem}>
                <span className={styles.contactIcon}>✉️</span>
                <span>hello@magizhdairy.com</span>
              </li>
              <li className={styles.contactItem}>
                <span className={styles.contactIcon}>📍</span>
                <span> Gudiyatham, Vellore,  India</span>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <div className={styles.copyright}>
            <span className={styles.copyrightText}>
              © {currentYear} Magizh Dairy. All rights reserved.
            </span>
            <span className={styles.version}>v1.5.5</span>
          </div>
        </div>
      </div>

      {/* -- SELECT * FROM Customers WHERE City != "";
-- SELECT * FROM Customers WHERE City IN("Helsinki", "Berlin");
-- SELECT Max(Price) FROM Products;
-- SELECT * FROM Customers WHERE CustomerID IN (SELECT CustomerID FROM Orders Where ShipperID IN (SELECT 		 	ShipperID From Shippers where ShipperName = "United Package"));
-- SELECT * FROM Customers WHERE Country IN (Select Country from Suppliers);
-- SELECT CustomerName, Concat_ws(", ", PostalCode, City, Country) as PinCode From Customers;
-- Select Orders.orderID, Orders.OrderDate, Customers.CustomerName FROM Customers, Orders WHERE 						 Customers.CustomerID=Orders.CustomerID;
SELECT Orders.orderID, Customers.customerName, Orders.orderDate FROM Orders left JOIN Customers ON Customers.CustomerID = Orders.CustomerID; */}
    </footer>
  );
}

