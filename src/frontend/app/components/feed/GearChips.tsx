"use client";
// @plm SRS-040  카드의 착용장비 — app의 features/social/GearChips.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// ── 배치 제약(ADR-027 D4) ───────────────────────────────────────────────────
// 장비 칩을 **사진 위에 겹쳐 그리지 않는다.** 이미지를 가리는 클릭 유도는 제재 대상이다.
// 그래서 이 묶음은 언제나 사진 **바깥 아래**에 놓이고, 기본은 접혀 있다.
//
// ── 고지 라벨 위치(ADR-027 D6) ──────────────────────────────────────────────
// 대가성 고지는 게시물 **첫 부분**(작성자명 바로 아래)에 있어야 한다 — 끝부분 표기는 폐지됐다.
// 그래서 라벨은 `GearDisclosure`로 분리해 카드 위쪽에서 렌더하고, 칩 영역에는 두지 않는다.
//
// ── 링크를 여는 유일한 경로 ─────────────────────────────────────────────────
// URL은 도메인의 `resolveGearLink()`만 만든다. 이 함수는 **고지를 실제로 렌더했다는 사실**을
// 인자로 요구한다 — 그래서 `disclosureRendered`에는 라벨 JSX를 감싸는 **그 조건식 그대로**를 넘긴다.
// `requiresAffiliateDisclosure(cfg)`를 다시 계산해 넘기면 항진명제가 되어, 라벨을 지워도 링크가 열린다.
//
// ── 새 창을 먼저 연다 ───────────────────────────────────────────────────────
// 집계를 기다렸다 열면 사용자 제스처 컨텍스트가 끊겨 팝업 차단에 걸린다(ADR-027 D8).
// 열고 나서 집계를 부른다. 집계 실패는 아무것도 바꾸지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  AFFILIATE_DISCLOSURE_KO,
  gearLabelKey,
  normalizeGearTags,
  resolveGearLink,
  type GearAffiliateConfig,
  type GearTag,
} from "@app/core";
import type { GearTag as ProtoGearTag } from "@app/contracts";
import { GearCategory as GearCategoryEnum, GearSource, LinkKind } from "@app/contracts";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { gearClient } from "@/lib/gearClient";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

/** 계약 enum → 도메인 문자열. 이름은 도메인이 권위다(core의 GEAR_CATEGORIES). */
const CATEGORY_NAME: Partial<Record<GearCategoryEnum, GearTag["category"]>> = {
  [GearCategoryEnum.WRIST_WRAP]: "wristWrap",
  [GearCategoryEnum.STRAP]: "strap",
  [GearCategoryEnum.BELT]: "belt",
  [GearCategoryEnum.KNEE_SLEEVE]: "kneeSleeve",
  [GearCategoryEnum.GLOVES]: "gloves",
  [GearCategoryEnum.SHOES]: "shoes",
  [GearCategoryEnum.CHALK]: "chalk",
  [GearCategoryEnum.ARM_SLEEVE]: "armSleeve",
};

/**
 * 서버가 준 태그를 화면이 쓰는 모양으로 읽는다.
 *
 * **두 단계다**: ① 계약 enum(숫자)을 도메인 이름(문자열)으로 옮기고 ② 도메인 정규화를 거친다.
 * ①을 빠뜨리면 정규화가 전부 걸러 내 태그가 조용히 사라진다(실측으로 잡은 결함) —
 * 화이트리스트·중복·상한은 도메인 한 곳에서만 강제되므로, 그 앞에서 모양을 맞춰 줘야 한다.
 */
export function readGearTags(input: ProtoGearTag[] | undefined): GearTag[] {
  if (!input || input.length === 0) return [];
  const mapped = input.map((g) => ({
    category: CATEGORY_NAME[g.category],
    source: g.source === GearSource.AUTO ? "auto" : "user",
    brand: g.brand || undefined,
    note: g.note || undefined,
  }));
  return normalizeGearTags(mapped);
}

/**
 * 대가성 고지 — 게시물 첫 부분 전용. **한국어 고정**이다(i18n 키를 만들지 않는다).
 *
 * 파트너스 가이드가 "추천·보증과 같은 언어로 기재"를 요구하고 위반 사례에 영문·줄임말 기재가
 * 명시돼 있어, en 로케일 사용자에게 영문 고지가 렌더되면 그 자체가 위반이다.
 */
export function GearDisclosure() {
  return (
    <div
      data-testid="gear-disclosure"
      className="mt-[var(--spacing-sm)] rounded-[var(--radius-sm)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[var(--spacing-xs)]"
    >
      <AppText variant="caption" color="warning" className="font-medium!">
        {AFFILIATE_DISCLOSURE_KO}
      </AppText>
    </div>
  );
}

export function GearChips({
  postId,
  tags,
  cfg,
  disclosureRendered,
}: {
  postId: string;
  tags: GearTag[];
  cfg: GearAffiliateConfig | null | undefined;
  /** 위 `GearDisclosure`를 실제로 렌더한 **그 조건식**. 렌더 여부와 갈리면 게이트가 무의미해진다. */
  disclosureRendered: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (tags.length === 0) return null;

  function open(tag: GearTag) {
    const r = resolveGearLink(tag, cfg, { disclosureRendered });
    // 고지가 필요한데 렌더되지 않았거나 모르는 분류면 URL 자체가 없다 — 아무것도 열지 않는다.
    if (!r.ok) return;

    // **먼저 연다.** 집계를 기다리면 제스처 컨텍스트가 끊겨 팝업이 막힌다.
    window.open(r.url, "_blank", "noopener,noreferrer");
    void gearClient()
      .recordClick({
        postId,
        category: categoryEnum(tag.category),
        source: tag.source === "auto" ? GearSource.AUTO : GearSource.USER,
        kind: r.kind === "deeplink" ? LinkKind.DEEPLINK : LinkKind.SEARCH,
      })
      .catch(() => {});
  }

  return (
    <div className="mt-[var(--spacing-sm)]" data-testid="gear-chips">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        data-testid="gear-summary"
        className="flex w-full items-center py-[var(--spacing-xs)]"
      >
        <Icon name="fitness-outline" size={14} color="var(--color-ink2)" />
        <AppText variant="caption" color="textMuted" className="ml-[4px] flex-1 text-left">
          {t("gear.wornCount", { count: tags.length })}
        </AppText>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} color="var(--color-ink3)" />
      </button>

      {expanded ? (
        <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-xs)]">
          {tags.map((tag) => (
            <button
              key={tag.category}
              type="button"
              onClick={() => open(tag)}
              data-testid="gear-link"
              className="flex items-center rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[5px]"
            >
              <AppText variant="caption" color="primary">
                {tag.brand ? `${tag.brand} ${t(gearLabelKey(tag.category))}` : t(gearLabelKey(tag.category))}
              </AppText>
              <span className="ml-[4px] flex">
                <Icon name="open-outline" size={12} color="var(--color-brand)" />
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 도메인 문자열 → 계약 enum. 집계에만 쓴다(링크는 도메인이 만든다). */
function categoryEnum(c: GearTag["category"]): GearCategoryEnum {
  switch (c) {
    case "wristWrap":
      return GearCategoryEnum.WRIST_WRAP;
    case "strap":
      return GearCategoryEnum.STRAP;
    case "belt":
      return GearCategoryEnum.BELT;
    case "kneeSleeve":
      return GearCategoryEnum.KNEE_SLEEVE;
    case "gloves":
      return GearCategoryEnum.GLOVES;
    case "shoes":
      return GearCategoryEnum.SHOES;
    case "chalk":
      return GearCategoryEnum.CHALK;
    case "armSleeve":
      return GearCategoryEnum.ARM_SLEEVE;
  }
}
