import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// React caches this only within the current server request, never across users.
export const getInitialSession = cache(() => getServerSession(authOptions));
