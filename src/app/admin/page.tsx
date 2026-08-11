import Dashboard from "@/components/Dashboard";
import AdminLoginGate from "@/components/AdminLoginGate";
import AdminRecordAction from "@/components/AdminRecordAction";
import CardRankingModalGuard from "@/components/CardRankingModalGuard";
import StaffLiquidShell from "@/components/StaffLiquidShell";
import { verifyAdmin } from "@/lib/auth";

export default async function AdminPage() {
  const isAuthorized = await verifyAdmin();

  if (!isAuthorized) {
    return (
      <StaffLiquidShell mode="admin">
        <AdminLoginGate />
      </StaffLiquidShell>
    );
  }

  return (
    <StaffLiquidShell mode="admin">
      <CardRankingModalGuard />
      <Dashboard mode="admin" />
      <AdminRecordAction adminDisplayName={process.env.ADMIN_DISPLAY_NAME || "Danh Thai"} />
    </StaffLiquidShell>
  );
}
