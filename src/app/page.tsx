import Dashboard from "@/components/Dashboard";
import StaffLiquidShell from "@/components/StaffLiquidShell";
import StaffLoadAllRecords from "@/components/StaffLoadAllRecords";

export default function Home() {
  return (
    <StaffLiquidShell>
      <StaffLoadAllRecords />
      <Dashboard mode="staff" />
    </StaffLiquidShell>
  );
}
