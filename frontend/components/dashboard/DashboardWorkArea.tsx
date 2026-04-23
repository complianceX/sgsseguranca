"use client";

import { ActivityFeed } from "./ActivityFeed";
import { PendingQueue } from "./PendingQueue";
import { SiteCompliance } from "./SiteCompliance";
import { SSTScoreRings } from "./SSTScoreRings";

export function DashboardWorkArea() {
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_320px]">
      <div className="space-y-5">
        <PendingQueue />
        <ActivityFeed />
      </div>
      <div className="space-y-5">
        <SiteCompliance />
        <SSTScoreRings />
      </div>
    </section>
  );
}
