import Dashboard from "@/components/Dashboard";
import StaffLiquidShell from "@/components/StaffLiquidShell";

export default function Home() {
  return (
    <StaffLiquidShell>
      <Dashboard mode="staff" />
    </StaffLiquidShell>
  );
}
