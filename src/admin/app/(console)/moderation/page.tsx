import { Suspense } from "react";
import { ModerationScreen } from "./ModerationScreen";

export default function ModerationPage() {
  return (
    <Suspense>
      <ModerationScreen />
    </Suspense>
  );
}
