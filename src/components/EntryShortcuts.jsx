"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import styles from "./EntryShortcuts.module.css";

const actions = [
  { label: "Add Order", path: "/customer/order/history" },
  { label: "Add Procurement", path: "/supplier/procurement/history" },
];

export default function EntryShortcuts() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const onHistory = actions.some(action => action.path === pathname);
  const onEntryPage = !onHistory && ["/customer/order", "/supplier/procurement"].some(path => pathname === path || pathname.startsWith(`${path}/`));
  if (!["admin", "dev", "employee"].includes(session?.user?.role) || pathname === "/login" || onEntryPage) return null;
  return <nav aria-label="Quick entries" className={`${styles.shortcuts} ${onHistory ? styles.aboveHistoryAction : ""}`}>
    {actions.filter(action => action.path !== pathname).map(action => <Link key={action.path} href={`${action.path}?add=1`} data-button="primary"><span aria-hidden="true">+</span>{action.label}</Link>)}
  </nav>;
}
