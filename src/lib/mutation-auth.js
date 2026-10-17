import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

async function requireRoles(roles) {
  // getServerSession runs the JWT callback, which refreshes the user's role
  // from MongoDB. Never accept a role or permission supplied in the request.
  const session = await getServerSession(authOptions);
  if (!session?.user?.role) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!roles.includes(session.user.role)) return NextResponse.json({ error: roles.length === 1 ? "Only an admin can change existing records" : "This account cannot add business entries" }, { status: 403 });
  return null;
}

export const requireAdmin = () => requireRoles(["admin"]);
export const requireStaff = () => requireRoles(["admin", "dev", "employee"]);
