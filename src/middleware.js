// middleware.js
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const rolePermissions = {
  admin: ["/admin", "/customer", "/supplier", "/productions", "/api/admin"],
  dev: ["/admin", "/customer", "/supplier", "/productions", "/api/admin"],
  employee: ["/customer", "/supplier", "/productions"],
};

const isPathAllowed = (path, userRole) => {
  if (!userRole) {
    console.warn("No user role found, denying access");
    return false;
  }
  if (userRole === "admin" || userRole === "dev") return true;
  const allowed = rolePermissions[userRole];
  if (!allowed) return false;
  return allowed.some((prefix) => path.startsWith(prefix));
};

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role;

    console.log(`[Auth] Path: ${path}, Role: ${role || "none"}`);

    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (!isPathAllowed(path, role)) {
      console.log(`[Auth] Access denied for ${role} to ${path}`);
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
