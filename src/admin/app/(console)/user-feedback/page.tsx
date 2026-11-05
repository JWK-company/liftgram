import { Suspense } from "react";
import { UserFeedbackScreen } from "./UserFeedbackScreen";

export default function UserFeedbackPage() {
  return (
    <Suspense>
      <UserFeedbackScreen />
    </Suspense>
  );
}
