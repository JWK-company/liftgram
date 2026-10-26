// @plm SRS-052  사업자 정보 바닥글 — booktarae `components/BusinessInfo.tsx` 와 같은 모양·같은 값(같은 회사 제품)
//
// 전자상거래법상 사업자 정보 표시. "사업자정보 확인"은 공정위 사업자 조회로 간다(booktarae 와 같은 링크).
import { BUSINESS } from "@/lib/business";

export function BusinessInfo({ className = "" }: { className?: string }) {
  const digits = BUSINESS.bizNo.replace(/\D/g, "");
  return (
    <address
      data-testid="business-info"
      className={`not-italic text-(--color-ink3) text-[length:var(--text-xs)] leading-relaxed ${className}`}
    >
      <p>
        {BUSINESS.name} · 대표 {BUSINESS.ceo}
      </p>
      <p>
        사업자등록번호 {BUSINESS.bizNo}{" "}
        <a
          href={`https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          사업자정보 확인
        </a>
      </p>
      <p>{BUSINESS.address}</p>
      <p>
        고객센터{" "}
        <a href={`mailto:${BUSINESS.email}`} className="underline underline-offset-2">
          {BUSINESS.email}
        </a>
      </p>
    </address>
  );
}
