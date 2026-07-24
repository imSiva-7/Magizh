import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb"; // added for DB query

export const authOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const client = await clientPromise;
        const db = client.db("production");
        const user = await db.collection("users").findOne({ email: credentials.email });
        if (!user) return null;
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;
        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role || "employee",
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      // First login / explicit sign-in: set initial token values
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // On every subsequent request, refresh role & verify user exists
      if (token?.id) {
        const client = await clientPromise;
        const db = client.db("production");
        const dbUser = await db.collection("users").findOne({
          _id: new ObjectId(token.id),
        });

        if (!dbUser) {
          // User was deleted – invalidate the token so middleware rejects them
          return {};
        }

        // Always use the latest role from the database
        token.role = dbUser.role || "employee";
        // Keep name/email in sync if they change
        token.name = dbUser.name;
        token.email = dbUser.email;
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,

  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };