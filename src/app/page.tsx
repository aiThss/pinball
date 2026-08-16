import Dashboard from "@/components/Dashboard";
import CardRankingModalGuard from "@/components/CardRankingModalGuard";
import StaffLiquidShell from "@/components/StaffLiquidShell";

export default function Home() {
  return (
    <StaffLiquidShell>
      <CardRankingModalGuard />
      <Dashboard mode="staff" />
    </StaffLiquidShell>
  );
}
