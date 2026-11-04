"use client";
import { t } from "@/lib/i18n";
import { ErrorState } from "./components/States";
export default function ErrorPage({ reset }: { reset: () => void }) {
  // [원본] message={error.message} — 영어 예외 원문이 그대로 보였다
  return <ErrorState message={t("common.screenFailed")} onRetry={reset} />;
}
