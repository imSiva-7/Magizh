import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function requireSummaryAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Only admins can view summaries" }, { status: 403 });
  return null;
}
