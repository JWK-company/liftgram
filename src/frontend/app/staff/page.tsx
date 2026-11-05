// [원본] 운영 탭 첫 화면 — StaffClient 를 그렸다. 옛 주소와 옛 설치본을 위해 운영자 페이지로 보낸다(SPEC-032).
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/admin");
}
