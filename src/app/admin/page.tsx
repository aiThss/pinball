import Dashboard from "@/components/Dashboard";
import AdminLoginGate from "@/components/AdminLoginGate";
import { verifyAdmin } from "@/lib/auth";

export default async function AdminPage() {
  const isAuthorized = await verifyAdmin();

  if (!isAuthorized) {
    return <AdminLoginGate />;
  }

  return <Dashboard mode="admin" />;
}
