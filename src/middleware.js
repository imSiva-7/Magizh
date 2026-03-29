// middleware.js
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const rolePermissions = {
  admin: ["/admin", "/customer", "/supplier", "/productions", "/api/admin"],
  dev: ["/admin", "/customer", "/supplier", "/productions", "/api/admin"],
  employee: ["/customer", "/supplier", "/productions"],
};

const isPathAllowed = (path, userRole) => {
  if (!userRole) return false;
  if (userRole === "admin" || userRole === "dev") return true;
  const allowed = rolePermissions[userRole];
  return allowed?.some((prefix) => path.startsWith(prefix));
};

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role;

    if (!token) {
      // API routes: return 401 JSON instead of redirect
      if (path.startsWith("/api/")) {
        return new NextResponse(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      // For page routes, redirect to login
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (!isPathAllowed(path, role)) {
      // API routes: return 403 JSON
      if (path.startsWith("/api/")) {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  },
);

export const config = {
  matcher: [
    "/productions/:path*",
    "/supplier/:path*",
    "/customer/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};