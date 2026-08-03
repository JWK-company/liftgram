"use client";
// @plm SRS-039  제휴 설정 — 화면마다 따로 읽지 않는다
//
// 카드는 피드·프로필·해시태그·저장함 어디에나 뜬다. 설정을 부모가 내려 주게 하면 한 군데를
// 빠뜨리는 순간 그 화면만 고지·링크 규칙이 달라진다 — 그건 규정 위반이 되는 종류의 차이다.
// 그래서 카드가 직접 읽되, **한 번 읽은 값은 모듈에 남겨** 카드 수만큼 요청이 나가지 않게 한다.
//
// 못 읽으면 null이다. 그때도 화면은 그대로 돈다 — 도메인이 null을 "제휴 없음"으로 보고
// 검색 링크로 폴백한다(고지도 필요 없어진다).
import type { GearAffiliateConfig } from "@app/core";
import { useEffect, useState } from "react";
import { gearClient } from "@/lib/gearClient";

let cached: GearAffiliateConfig | null = null;
let inflight: Promise<GearAffiliateConfig | null> | null = null;

function load(): Promise<GearAffiliateConfig | null> {
  if (cached) return Promise.resolve(cached);
  // 같은 화면의 카드 열 개가 동시에 물어도 요청은 하나다.
  if (!inflight) {
    inflight = gearClient()
      .getConfig({})
      .then((r) => {
        cached = { enabled: r.enabled, links: r.links };
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useGearConfig(): GearAffiliateConfig | null {
  const [cfg, setCfg] = useState<GearAffiliateConfig | null>(cached);

  useEffect(() => {
    if (cfg) return;
    let alive = true;
    void load().then((c) => {
      if (alive) setCfg(c);
    });
    return () => {
      alive = false;
    };
  }, [cfg]);

  return cfg;
}
