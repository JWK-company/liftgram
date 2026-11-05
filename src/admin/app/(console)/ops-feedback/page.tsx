import { Suspense } from "react";
import { OpsFeedbackScreen } from "./OpsFeedbackScreen";

export default function OpsFeedbackPage() {
  return (
    <Suspense>
      <OpsFeedbackScreen />
    </Suspense>
  );
}
