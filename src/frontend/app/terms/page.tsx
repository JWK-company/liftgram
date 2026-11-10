// @plm SRS-052  이용약관 — 구글 OAuth 앱 게시(브랜딩)와 가입 동의 안내가 이 주소를 가리킨다
import type { Metadata } from "next";
import { CONTACT_EMAIL, LegalPage } from "../components/legal/LegalPage";

export const metadata: Metadata = { title: "이용약관 · Liftgram" };

export default function TermsPage() {
  return (
    <LegalPage title="이용약관" effective="2026년 11월 10일">
      <h2>1. 서비스</h2>
      <p>
        Liftgram은 근력 운동 기록, 기록 분석, 운동 소셜 기능(피드·댓글·DM·스토리)을 제공하는 웹 서비스입니다.
        운동 기록 기능은 로그인 없이도 쓸 수 있고, 로그인하면 서버 백업과 소셜 기능이 열립니다.
      </p>

      <h2>2. 계정</h2>
      <ul>
        <li>이용자는 본인의 이메일 주소 또는 소셜 계정으로 가입합니다. 아이디는 가입한 이메일 주소입니다.</li>
        <li>
          계정은 만 14세 이상만 만들 수 있습니다. 로그인 없이 기기에 저장하는 운동 기록은 나이와 상관없이 쓸
          수 있습니다.
        </li>
        <li>
          이메일로 가입한 경우 주소 확인을 마쳐야 하며, 가입 후 72시간 안에 확인하지 않으면 소셜 기능의
          글쓰기가 제한됩니다.
        </li>
        <li>계정과 비밀번호 관리 책임은 이용자에게 있습니다.</li>
      </ul>

      <h2>3. 이용자가 올리는 콘텐츠</h2>
      <ul>
        <li>
          게시물·댓글·사진 등의 권리는 올린 이용자에게 있습니다. 서비스는 이를 서비스 안에서 보여 주는 데에만
          씁니다.
        </li>
        <li>타인을 비방하거나 권리를 침해하는 내용, 음란·불법 정보, 광고·스팸은 올릴 수 없습니다.</li>
        <li>
          올린 사진은 자동으로 검사하고, 걸리거나 여러 사람이 신고한 콘텐츠는 검토가 끝날 때까지 다른 사람에게
          보이지 않을 수 있습니다. 잘못 처리되었다고 생각하면 문의해 주세요.
        </li>
        <li>
          신고되거나 위 기준에 어긋나는 콘텐츠는 운영자가 가리거나 삭제할 수 있고, 반복되면 이용을 제한할 수
          있습니다.
        </li>
      </ul>

      {/* SPEC-054 — YouTube API 서비스 개발자 정책 III.A.1: 이용자가 YouTube 서비스 약관에 동의한다는 조항 */}
      <h2 id="youtube">3-1. YouTube 영상 가져오기</h2>
      <p data-testid="terms-youtube">
        영상·글로 루틴 가져오기와 영상 보며 받아 적기는 YouTube API 서비스를 씁니다. 이 기능을 쓰면 이용자는
        YouTube 서비스 약관(
        <a
          className="underline"
          href="https://www.youtube.com/t/terms"
          target="_blank"
          rel="noopener noreferrer"
        >
          youtube.com/t/terms
        </a>
        )에 동의하는 것으로 봅니다. 가져온 루틴은 이용자가 확인해 저장한 내 기록이며, 영상의 권리는 영상
        제작자와 YouTube 에 있습니다.
      </p>

      <h2>4. 건강 관련 고지</h2>
      <p>
        이 서비스는 운동 기록·웰니스 도구이며 질병의 진단·치료·예방을 목적으로 하지 않습니다. 추정 1RM 등
        수치는 참고용 추정값입니다. 무리한 중량·횟수는 부상 위험이 있으니 통증이 있으면 운동을 멈추고 전문가와
        상담하세요.
      </p>

      <h2>5. 서비스의 변경과 중단</h2>
      <p>
        운영자는 서비스를 개선하기 위해 기능을 바꾸거나 점검으로 잠시 멈출 수 있습니다. 서비스를 종료할 때는
        30일 전에 알리고, 이용자가 운동 기록을 백업 파일로 내려받을 수 있게 합니다.
      </p>

      <h2>6. 책임의 한계</h2>
      <p>
        운영자는 천재지변, 통신 장애 등 통제할 수 없는 사유로 생긴 손해에 책임지지 않습니다. 다만 운영자의
        고의 또는 과실로 생긴 손해는 관련 법령에 따릅니다.
      </p>

      <h2>7. 문의</h2>
      <p>
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </p>
    </LegalPage>
  );
}
