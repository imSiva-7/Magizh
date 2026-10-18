"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useEntryForm() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = params.get("add") === "1";
  const [open, setOpen] = useState(requested);
  const [previousRequested, setPreviousRequested] = useState(requested);
  if (previousRequested !== requested) {
    setPreviousRequested(requested);
    if (requested) setOpen(true);
  }
  useEffect(() => {
    if (!requested) return;
    const next = new URLSearchParams(params.toString());
    next.delete("add");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [requested, params, pathname, router]);
  return [open, setOpen];
}
