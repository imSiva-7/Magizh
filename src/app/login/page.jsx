import { redirect } from "next/navigation";
import { getInitialSession } from "@/lib/server-session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await getInitialSession();

  if (session?.user?.id) {
    redirect("/");
  }

  return <LoginForm />;
}
