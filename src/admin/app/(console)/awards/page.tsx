import { Suspense } from "react";
import { AwardsScreen } from "./AwardsScreen";

export default function AwardsPage() {
  return (
    <Suspense>
      <AwardsScreen />
    </Suspense>
  );
}
