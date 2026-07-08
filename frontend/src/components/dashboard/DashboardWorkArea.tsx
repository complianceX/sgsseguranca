"use client";

import { ActivityFeed } from "./ActivityFeed";
import { PendingQueue } from "./PendingQueue";
import { SiteCompliance } from "./SiteCompliance";
import { SSTScoreRings } from "./SSTScoreRings";
import type { UseDashboardDataResult } from "@/hooks/useDashboardData";

export function DashboardWorkArea({
  dashboardData,
}: {
  dashboardData: UseDashboardDataResult;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <PendingQueue />
        <ActivityFeed dashboardData={dashboardData} />
      </div>
      <div className="space-y-5">
        <SiteCompliance dashboardData={dashboardData} />
        <SSTScoreRings dashboardData={dashboardData} />
      </div>
    </section>
  );
}
