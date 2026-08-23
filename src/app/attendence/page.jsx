"use client";

import { useSession } from "next-auth/react";

export default function Attendence() {
  const { data: session } = useSession();
  
  return (
    <>
    </>
  );
}