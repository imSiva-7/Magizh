import { requireAdmin } from "@/lib/mutation-auth";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import getDatabase from "@/database/connectToMongoDB";

export async function POST(request) {
  try {
    const { name, email, password, role } = await request.json();
    if (role && role !== "employee") {
      const denied = await requireAdmin();
      if (denied) return denied;
    }

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const db = await getDatabase();
    const users = db.collection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 400 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Only an authenticated admin may create elevated accounts.
    const allowedRoles = ["employee", "admin", "dev"];
    const userRole = allowedRoles.includes(role) ? role : "employee";

    const result = await users.insertOne({
      name,
      email,
      password: hashedPassword,
      role: userRole,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json(
      { message: "User created", userId: result.insertedId },
      { status: 201 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
