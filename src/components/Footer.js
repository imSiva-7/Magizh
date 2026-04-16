"use client";

import styles from "@/css/footer.module.css";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getTodayDate } from "@/utils/dateUtils";

export default function Footer() {
  const currentYear = new Date().getFullYear();

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
                <Link href="/customer" className={styles.footerLink}>
                  Customers{" "}
                </Link>
              </li>

              <li>
                <Link href="/supplier" className={styles.footerLink}>
                  Suppliers
                </Link>
              </li>
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
            <span className={styles.copyrightText}>
              Today:{" "}
              {new Date(getTodayDate()).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>

            <span className={styles.copyrightText}>
              © {currentYear} Magizh Dairy. All rights reserved.
            </span>

            <span className={styles.version}>v1.6.1</span>
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
