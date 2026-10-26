"use client";

import { useSession } from "next-auth/react";

export default function AdminSummary({ children }) {
  const { data: session, status } = useSession();
  return status === "authenticated" && session?.user?.role === "admin" ? children : null;
}
