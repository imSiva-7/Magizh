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


const publicPaths = ["/api/auth/", "/login", "/unauthorized"];

const isPublicPath = (path) => {
  return publicPaths.some((publicPath) => path.startsWith(publicPath));
};

export default withAuth(
  function middleware(req) {
    const token = req.nextauth?.token;
    const path = req.nextUrl.pathname;
    const role = token?.role;

    // Log for debugging (visible in serverless logs)
    console.log(`[Middleware] Path: ${path}, Token exists: ${!!token}, Role: ${role || "none"}`);

    // Always allow public paths (no redirect, no blocking)
    if (isPublicPath(path)) {
      return NextResponse.next();
    }

    if (!token) {
      // API routes: return 401 JSON instead of redirect
      if (path.startsWith("/api/")) {
        console.log(`[Middleware] API route ${path} - No token, returning 401`);
        return new NextResponse(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      // For page routes, redirect to login
      console.log(`[Middleware] Page route ${path} - No token, redirecting to login`);
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (!isPathAllowed(path, role)) {
      // API routes: return 403 JSON
      if (path.startsWith("/api/")) {
        console.log(`[Middleware] API route ${path} - Forbidden for role ${role}`);
        return new NextResponse(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      console.log(`[Middleware] Page route ${path} - Forbidden for role ${role}, redirecting to unauthorized`);
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