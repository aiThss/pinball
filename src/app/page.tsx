import Dashboard from "@/components/Dashboard";
import CardRankingModalGuard from "@/components/CardRankingModalGuard";
import StaffLiquidShell from "@/components/StaffLiquidShell";
import StaffLoadAllRecords from "@/components/StaffLoadAllRecords";

export default function Home() {
  return (
    <StaffLiquidShell>
      <CardRankingModalGuard />
      <StaffLoadAllRecords />
      <Dashboard mode="staff" />
    </StaffLiquidShell>
  );
}
