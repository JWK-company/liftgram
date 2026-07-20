// @plm SRS-039  착용장비 클릭 집계 · 제휴 설정 조회 · admin 통계 (SAD-020 · ADR-027).
// Phase 0(ADR-027 D1)은 수수료를 벌지 않는다. 이 단계가 남기는 유일한 자산은 클릭 데이터이며,
// 그 수치가 Phase 1(비전 LLM 자동 감지·제휴 정산) 투자 판단의 근거가 된다.
// 제휴 딥링크·활성 스위치는 서버 env에만 둔다 — EXPO_PUBLIC_* 로 앱에 주입하면 react-native-web
// 번들에 평문으로 굳어 회수가 불가능해지고, 링크 교체에 앱 재배포가 필요해진다(ADR-027 D2).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGearClickDto, GEAR_CATEGORIES } from './dto/gear.dto';

type GearCategory = (typeof GEAR_CATEGORIES)[number];

// 앱의 app/src/domain/gear.ts GearAffiliateConfig 와 동형이어야 하는 응답 계약.
// 파트너 태그·서브아이디 같은 '조립 재료'는 절대 포함하지 않는다 — 앱이 링크를 만들 수 없게 하는 것이 설계 의도다.
export interface GearAffiliateConfigView {
  enabled: boolean;
  links?: Partial<Record<GearCategory, string>>;
}

export interface GearCategoryStat {
  category: string;
  count: number;
  deeplink: number;
  search: number;
}

export interface GearStats {
  from: string; // 집계 시작(ISO) — 이 시각 이후 클릭만 포함
  to: string; // 집계 기준 시각(ISO)
  days: number;
  total: number;
  byCategory: GearCategoryStat[];
  byKind: { deeplink: number; search: number };
  bySource: { user: number; auto: number };
  // 특정 사용자에 클릭이 몰리는 이상 패턴 식별용(부정 클릭 방어).
  topUsers: { userId: string; count: number }[];
}

// 중복 억제 시간창. 동일 (사용자, 게시물, 카테고리) 클릭이 이 창 안에 이미 있으면 새로 적재하지 않는다.
// 쿠팡 파트너스 운영정책은 "다른 회원의 미디어에 게재된 광고를 반복 클릭"하는 행위를 A등급 제재
// (수익 몰수·계정 해지) 대상으로 규정한다. liftgram 은 사용자끼리 서로의 피드를 보는 구조라
// 친분 있는 사용자들이 서로의 게시물 링크를 반복해 누르는 패턴이 자연 발생하고, 우리 의도와 무관하게
// 부정 클릭으로 판정될 소지가 있다. @nestjs/throttler 가 미설치라 이 서버측 억제가 유일한 방어 수단이다.
// 10분: 같은 장비를 다시 눌러보는 정상 재방문(수 초~수 분)은 전부 흡수하면서, 며칠에 걸친 반복 관심은
// 별개 클릭으로 살려 KPI 신호를 죽이지 않는 균형점. 값을 늘리면 방어는 세지되 진짜 관심이 과소집계된다.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

// 딥링크 문자열 상한. 파트너스 단축 딥링크(link.coupang.com/a/…)는 수십 자에 불과하므로,
// 이 길이를 넘는 값은 오설정이거나 주입 시도다. 앱 도메인의 허용 길이(2048)와 같은 값으로 맞춘다.
const MAX_LINK_LEN = 2048;

const STATS_DEFAULT_DAYS = 30;
const STATS_MAX_DAYS = 365;
const STATS_TOP_USERS = 10;

@Injectable()
export class GearService {
  private readonly log = new Logger(GearService.name);
  // 부팅 시 1회 파싱 — 매 요청 JSON.parse 를 피하고, 오설정을 서버 시작 로그에서 바로 보게 한다.
  private readonly affiliate: GearAffiliateConfigView;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.affiliate = this.readAffiliateConfig(config);
  }

  // env → 제휴 설정. 어떤 형태 이상에도 예외 없이 { enabled: false } 로 수렴한다 —
  // env 오타 하나로 서버가 부팅에 실패하면 제휴와 무관한 전 기능이 함께 죽는다.
  private readAffiliateConfig(config: ConfigService): GearAffiliateConfigView {
    // === 'true' 엄격 비교. 'yes'·'1'·'TRUE' 는 전부 비활성으로 본다 —
    // 광고 노출 스위치는 '켜려는 의도가 명확할 때만' 켜져야 한다(미등록 매체 광고 노출 = A등급 제재).
    const enabled = config.get<string>('GEAR_AFFILIATE_ENABLED') === 'true';
    const links = this.parseLinks(config.get<string>('GEAR_AFFILIATE_LINKS'));
    if (enabled && !links) {
      this.log.warn('GEAR_AFFILIATE_ENABLED=true 이지만 GEAR_AFFILIATE_LINKS 가 비어 있음 — 전 카테고리가 검색 URL로 폴백합니다.');
    }
    // links 는 enabled 와 무관하게 그대로 실어 보낸다. enabled=false 인데 딥링크가 남아 있는
    // 오설정 조합은 앱 도메인의 불변식(딥링크가 하나라도 있으면 고지 필요)이 이미 안전하게 처리하며,
    // 서버가 임의로 숨기면 그 오설정이 은폐되어 활성화 시점에 미검증 상태로 켜진다.
    return links ? { enabled, links } : { enabled };
  }

  // GEAR_AFFILIATE_LINKS = 카테고리→딥링크 JSON 문자열. 원문을 그대로 반환하지 않고
  // 8종 화이트리스트로 재구성한다 — env 에 섞여 들어간 임의 키(파트너 태그·메모·오타 카테고리)가
  // 클라이언트로 새어 나가지 않게 하는 것이 목적이다.
  private parseLinks(raw: string | undefined): Partial<Record<GearCategory, string>> | undefined {
    if (!raw || raw.trim().length === 0) return undefined; // 미설정 = Phase 0 정상 상태
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 파싱 실패를 던지지 않고 삼킨 뒤 비활성으로 수렴 — 다만 로그로는 반드시 남긴다(무증상 실패 방지).
      this.log.error('GEAR_AFFILIATE_LINKS 파싱 실패 — 제휴 링크 없이 동작합니다(검색 URL 폴백).');
      return undefined;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.log.error('GEAR_AFFILIATE_LINKS 는 카테고리→URL 객체여야 합니다 — 제휴 링크 없이 동작합니다.');
      return undefined;
    }
    const bag = parsed as Record<string, unknown>;
    const out: Partial<Record<GearCategory, string>> = {};
    let found = 0;
    for (const c of GEAR_CATEGORIES) {
      // 프로토타입 체인 조회 금지 — own property 만 본다. JSON.parse 결과라 현재는 안전하지만
      // 조회 방식 자체를 안전한 쪽으로 고정해 둔다.
      if (!Object.prototype.hasOwnProperty.call(bag, c)) continue;
      const v = bag[c];
      if (typeof v !== 'string') continue;
      const url = v.trim();
      if (url.length === 0 || url.length > MAX_LINK_LEN) continue;
      // 값은 여기서 끝. 파싱·재조립·파라미터 추가 어떤 가공도 하지 않는다 —
      // 운영정책 4.1 1) 이 '광고의 링크·형태에 대한 별도의 조작 행위'를 A등급 제재로 금지한다.
      // 링크는 파트너스 공식 링크 생성기/Deeplink API로 사람이 사전 생성한 것만 넣는다(운영 규약).
      // 호스트 검증은 앱 도메인(isAllowedAffiliateUrl)이 담당한다 — 서버가 여기서 추가로 걸러내면
      // 정상 딥링크가 조용히 사라져 원인 추적이 불가능해진다.
      out[c] = url;
      found += 1;
    }
    return found > 0 ? out : undefined;
  }

  // 제휴 설정 조회. env 미설정 상태가 곧 Phase 0 이며, 그때 반환은 { enabled: false } 하나다.
  // 매 호출 새 객체로 복사해 반환한다 — 내부 상태가 호출부 실수로 변형되지 않게.
  getConfig(): GearAffiliateConfigView {
    const { enabled, links } = this.affiliate;
    return links ? { enabled, links: { ...links } } : { enabled };
  }

  // 클릭 1건 기록. 반환은 항상 { ok: true } — 앱은 링크를 먼저 연 뒤 비차단으로 호출하므로(ADR-027 D8)
  // 중복 억제로 적재를 건너뛰었는지 여부가 클라이언트 동작을 바꾸지 않는다.
  async recordClick(userId: string, dto: CreateGearClickDto): Promise<{ ok: true }> {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    // (userId, postId, category, createdAt) 인덱스를 그대로 타는 질의.
    const recent = await this.prisma.gearClick.findFirst({
      where: {
        userId,
        postId: dto.postId,
        category: dto.category,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return { ok: true }; // 시간창 내 반복 — 적재 생략(집계 부풀림·부정 클릭 판정 방어)
    await this.prisma.gearClick.create({
      data: {
        userId,
        postId: dto.postId,
        category: dto.category,
        source: dto.source,
        kind: dto.kind,
      },
    });
    return { ok: true };
  }

  // admin 통계. 카테고리별 클릭 수와 kind 분포를 한 번의 groupBy 로 산출한다 —
  // (category, kind, source) 조합은 최대 8×2×2=32행이라 애플리케이션 측 집계가 가장 단순하고 안전하다.
  async stats(daysRaw: string | undefined, topRaw: string | undefined): Promise<GearStats> {
    const days = clampInt(daysRaw, STATS_DEFAULT_DAYS, 1, STATS_MAX_DAYS);
    const top = clampInt(topRaw, STATS_TOP_USERS, 1, 100);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.gearClick.groupBy({
      by: ['category', 'kind', 'source'],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
    });

    const byCategory = new Map<string, GearCategoryStat>();
    const byKind = { deeplink: 0, search: 0 };
    const bySource = { user: 0, auto: 0 };
    let total = 0;
    for (const r of rows) {
      const n = r._count._all;
      total += n;
      // 카테고리는 화이트리스트 8종이지만, 과거 데이터·수기 삽입으로 8종 밖 값이 있어도
      // 집계에서 조용히 사라지지 않도록 Map 으로 받는다(이상 징후는 보여야 한다).
      const cur = byCategory.get(r.category) ?? { category: r.category, count: 0, deeplink: 0, search: 0 };
      cur.count += n;
      if (r.kind === 'deeplink') {
        cur.deeplink += n;
        byKind.deeplink += n;
      } else if (r.kind === 'search') {
        cur.search += n;
        byKind.search += n;
      }
      byCategory.set(r.category, cur);
      if (r.source === 'user') bySource.user += n;
      else if (r.source === 'auto') bySource.auto += n;
    }

    // 사용자별 상위 — 부정 클릭 판정(반복 클릭) 대비 이상 패턴 가시화.
    const heavy = await this.prisma.gearClick.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: top,
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      total,
      byCategory: [...byCategory.values()].sort((a, b) => b.count - a.count),
      byKind,
      bySource,
      topUsers: heavy.map((h) => ({ userId: h.userId, count: h._count._all })),
    };
  }
}

// 쿼리스트링 정수 파싱 — 서버 관례상 @Query 는 string 으로 받아 여기서 정규화한다.
// NaN·음수·과대값을 전부 기본값·범위로 수렴시켜 잘못된 쿼리 하나가 전 기간 스캔을 유발하지 않게 한다.
function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
