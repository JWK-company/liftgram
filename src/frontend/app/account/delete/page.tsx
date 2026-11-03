// @plm SRS-095  계정 삭제 요청 주소 — 구글 플레이가 「앱을 설치하지 않고도 웹에서 삭제를 요청하는 주소」를 요구한다.
// 계정 화면의 삭제 카드로 보낸다(로그인 전이면 계정 화면이 먼저 로그인을 받는다).
import { redirect } from "next/navigation";

export default function AccountDeletePage() {
  redirect("/account#delete-account");
}
