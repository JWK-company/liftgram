// 사업자 정보 — booktarae 와 같은 회사(타래 · TARAE) 제품이다(2026-10-26 사용자 확정).
// 값은 booktarae `lib/business.ts` 와 같다. 바뀌면 두 저장소를 함께 고친다.
export type BusinessInfo = {
  name: string;
  ceo: string;
  bizNo: string;
  address: string;
  email: string;
};

export const BUSINESS: BusinessInfo = {
  name: "타래(TARAE)",
  ceo: "김정민",
  bizNo: "889-27-01850",
  address: "(18004) 경기도 평택시 고덕갈평10길 117-8, 201호 (고덕동)",
  email: "admin@tarae.org",
};
