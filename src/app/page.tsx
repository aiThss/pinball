import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <Dashboard user={user} />;
}
