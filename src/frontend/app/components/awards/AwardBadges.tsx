"use client";
// 프로필의 이달의 리프터 배지(SPEC-063). 받기 전에는 자리를 비우지 않는다(로드 전 []≠0개 · 다 받은 뒤 결정).
//   남의 프로필 = 공개 수상만(서버가 비공개·차단을 거른다) · 내 프로필 = 내 수상 전부(비공개로 돌린 것도 나에게는 보인다)
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { awardClient, monthLabel } from "@/lib/awardClient";
import { AwardBadgeList, categoryLabel } from "./parts";

type Item = { month: string; category: string; label: string };

function toItems(xs: { month: string; category: string }[]): Item[] {
  return xs.map((x) => ({
    month: x.month,
    category: x.category,
    label: t("awards.badge", { month: monthLabel(x.month), category: categoryLabel(x.category) }),
  }));
}

export function UserAwardBadges({ userId }: { userId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    let alive = true;
    setItems(null); // 다른 사람으로 바뀌면 앞 사람 배지를 남기지 않는다(REV-155 상태 8)
    awardClient()
      .getUserBadges({ userId })
      .then((r) => {
        if (alive) setItems(toItems(r.badges));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-[var(--spacing-md)]">
      <AwardBadgeList items={items} testId="profile-award-badges" />
    </div>
  );
}

export function MyAwardBadges() {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    let alive = true;
    awardClient()
      .listMyAwards({})
      .then((r) => {
        if (alive) setItems(toItems(r.awards));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-[var(--spacing-md)]">
      <AwardBadgeList items={items} testId="my-award-badges" />
    </div>
  );
}
