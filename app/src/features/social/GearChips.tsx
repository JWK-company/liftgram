// @plm SRS-040  피드 카드 착용장비 표시 — 사진 바깥 하단 카드 · 기본 접힘 · 조건부 고지 라벨 · 링크 열기 · 클릭 집계.
//
// 배치 제약(ADR-027 D4): 장비 칩을 사진 위에 겹쳐 그리지 않는다. 쿠팡 파트너스 운영정책(2026-06-08 시행)이
// 커버형 배너와 '이미지 등 컨텐츠를 가리는 방식의 클릭 유도'를 A등급 제재(수익 몰수·계정 해지)로 금지한다.
//
// 고지 라벨 위치(ADR-027 D6): 공정위 심사지침(2024-12-01)이 '제목 또는 첫 부분' 표기를 요구하고 끝부분 표기를
// 폐지했다. 따라서 라벨은 이 파일의 GearDisclosure 로 분리해 **게시물 첫 부분(작성자명 바로 아래)** 에 렌더하고,
// 칩 영역(카드 하단)에는 두지 않는다 — 칩 영역 상단은 게시물 기준으로 '끝부분'이다.
//
// 소비자 계약: URL 을 얻는 경로는 domain 의 resolveGearLink() 하나뿐이다. ok:false 면 링크를 열지 않는다.
// disclosureRendered 에는 반드시 **라벨 JSX 를 감싸는 그 조건식**을 넘긴다. requiresAffiliateDisclosure(cfg) 의
// 반환값을 그대로 되먹이면 게이트가 항진명제가 되어, 라벨 JSX 를 지워도 링크가 열린다.
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { useT } from '../../i18n';
import {
  AFFILIATE_DISCLOSURE_KO,
  gearLabelKey,
  normalizeGearTags,
  resolveGearLink,
  type GearAffiliateConfig,
  type GearTag,
} from '../../domain';

// 게시물 data 에서 장비 태그를 안전하게 꺼낸다.
// 서버 Post.data 는 @IsObject() 만 걸린 불투명 Json 이라 형태 보증이 없다 — 정규화를 반드시 경유한다.
// (post.data as {gear?: GearTag[]}).gear 를 그대로 map 하면 typecheck 는 통과하고 미지 카테고리가 흘러든다.
export function readGearTags(data: unknown): GearTag[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return [];
  return normalizeGearTags((data as { gear?: unknown }).gear);
}

// 대가성 고지 라벨 — 게시물 첫 부분 전용. 로케일 무관 한국어 고정(i18n 키를 만들지 않는다).
// 파트너스 가이드가 '추천·보증과 같은 언어로 기재'를 요구하고 위반 사례에 '영문·줄임말 기재'가 명시돼 있어,
// en 로케일 사용자에게 영문 고지가 렌더되면 그대로 위반이다.
export function GearDisclosure() {
  return (
    <View style={styles.disclosure}>
      <AppText variant="caption" color="warning" weight="medium">
        {AFFILIATE_DISCLOSURE_KO}
      </AppText>
    </View>
  );
}

export function GearChips({
  tags,
  cfg,
  disclosureRendered,
  onOpen,
}: {
  tags: GearTag[];
  cfg: GearAffiliateConfig | null | undefined;
  // 위 GearDisclosure 를 실제로 렌더한 조건식 그대로. 렌더 여부와 이 값이 갈리면 게이트가 무의미해진다.
  disclosureRendered: boolean;
  // 클릭 집계 훅(비차단). 링크를 연 뒤 호출된다.
  onOpen?: (category: GearTag['category'], kind: 'deeplink' | 'search') => void;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);

  if (tags.length === 0) return null;

  function open(tag: GearTag) {
    const r = resolveGearLink(tag.category, cfg, { disclosureRendered });
    // 고지가 필요한데 렌더되지 않았거나 미지 카테고리면 URL 자체가 없다 — 아무것도 열지 않는다.
    if (!r.ok) return;
    // 링크를 **먼저** 연다. 집계를 await 하면 웹(react-native-web)에서 사용자 제스처 컨텍스트가 끊겨
    // 팝업 차단에 걸린다(ADR-027 D8).
    Linking.openURL(r.url).catch(() => {});
    onOpen?.(tag.category, r.kind);
  }

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.summary} onPress={() => setExpanded((v) => !v)} hitSlop={6}>
        <Ionicons name="fitness-outline" size={14} color={colors.textMuted} />
        <AppText variant="caption" color="textMuted" style={{ marginLeft: 4, flex: 1 }}>
          {t('gear.wornCount', { count: tags.length })}
        </AppText>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textFaint}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.chips}>
          {tags.map((tag) => (
            <Pressable key={tag.category} style={styles.chip} onPress={() => open(tag)} hitSlop={4}>
              <AppText variant="caption" color="primary">
                {t(gearLabelKey(tag.category))}
              </AppText>
              <Ionicons name="open-outline" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  disclosure: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  wrap: { marginTop: spacing.sm },
  summary: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
});
