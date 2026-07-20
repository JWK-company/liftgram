// @plm SRS-039  착용장비 클릭 집계 DTO — 카테고리 8종 화이트리스트·태그 원천·링크 해석 종류.
import { IsIn, IsUUID } from 'class-validator';

// 착용장비 카테고리 8종(ADR-027 D5). app/src/domain/gear.ts 의 GEAR_CATEGORIES 와 문자·순서까지 동일해야 한다.
// 서버는 앱 소스를 import 할 수 없으므로(별 배포 단위) 이 배열이 유일한 서버 측 사본이며, 여기가 곧 동기 지점이다.
// 화이트리스트를 두는 이유: 조작된 클라이언트가 임의 문자열을 실어 보내면 집계 축이 오염되어
// Phase 1 투자 판단의 근거 자체가 무너진다. 브랜드·모델은 카테고리에 표현하지 않는다(로고 오인식 분쟁 회피).
export const GEAR_CATEGORIES = [
  'wristWrap',
  'strap',
  'belt',
  'kneeSleeve',
  'gloves',
  'shoes',
  'chalk',
  'armSleeve',
] as const;

// 태그 원천 — 사용자가 직접 고른 태그(user)와 Phase 1 비전 LLM 자동 감지 태그(auto)의 성과를
// 분리 측정하기 위해 Phase 0부터 형식을 심어 둔다(ADR-027 D7). Phase 0의 실제 값은 항상 'user'다.
export const GEAR_SOURCES = ['user', 'auto'] as const;

// 링크 해석 종류 — 그 클릭이 제휴 딥링크로 열렸는지(deeplink) 추적 0개 검색 URL로 폴백했는지(search).
// 딥링크 하나를 오기입하면 8종 전부가 조용히 검색으로 떨어져 수수료는 0원인데 고지 라벨만 노출되는
// 최악의 상태가 되는데, 이 값이 그 사고를 감지하는 유일한 수단이다.
export const GEAR_LINK_KINDS = ['deeplink', 'search'] as const;

export class CreateGearClickDto {
  // Post.id 는 uuid 이므로 형식 검증만 한다. 게시물 실재 여부는 조회하지 않는다 —
  // 클릭 기록은 앱이 링크를 연 뒤 비차단으로 던지는 호출이라(ADR-027 D8) 왕복을 늘릴 이유가 없고,
  // postId 에 FK 도 걸지 않아(삭제된 게시물의 클릭 이력 보존) 참조 무결성 요구 자체가 없다.
  @IsUUID()
  postId!: string;

  @IsIn(GEAR_CATEGORIES)
  category!: string;

  @IsIn(GEAR_SOURCES)
  source!: string;

  @IsIn(GEAR_LINK_KINDS)
  kind!: string;
}
