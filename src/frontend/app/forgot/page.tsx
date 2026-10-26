// @plm SRS-052  비밀번호 찾기 — 재설정 링크를 메일로 받는다
import { env } from "@/lib/env";
import ForgotClient from "./ForgotClient";

export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return <ForgotClient siteKey={env.TURNSTILE_SITE_KEY} />;
}
