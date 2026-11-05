import { Suspense } from "react";
import { StatsScreen } from "./StatsScreen";

export default function StatsPage() {
  return (
    <Suspense>
      <StatsScreen />
    </Suspense>
  );
}
