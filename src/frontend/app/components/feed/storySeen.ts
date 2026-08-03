// @plm SRS-019  스토리 열람 표시 — app의 features/social/storySeen.ts를 웹으로
//
// 서버는 "누가 봤는지"를 모른다(계약 주석 참고). 기기에 남긴다 —
// **키 이름까지 app과 같다**(`story_seen_v1`): 같은 사람이 두 클라이언트를 오가도 표시가 이어지도록.
//
// 저장하는 값은 사람마다 **마지막으로 본 컷의 시각(ms)** 하나다. 컷 목록을 통째로 저장하면
// 스토리가 사라진 뒤에도 쓰레기가 남고, 용량이 계속 는다.
import { getPref, setPref } from "@/lib/prefs";
import type { StoryGroup } from "@app/contracts";

const KEY = "story_seen_v1";

export type StorySeenMap = Record<string, number>;

export function loadStorySeen(): StorySeenMap {
  try {
    const raw = getPref(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StorySeenMap) : {};
  } catch {
    // 저장된 값이 깨졌으면 "아무것도 안 봤다"로 시작한다 — 화면이 죽을 이유는 없다.
    return {};
  }
}

/** 그룹의 최신 컷 시각(ms). 그룹 안은 오래된 것부터라 마지막이 최신이다. */
export function newestMs(g: StoryGroup): number {
  const last = g.stories.at(-1);
  return last?.createdAt ? Number(last.createdAt.seconds) * 1000 : 0;
}

/** 안 본 컷이 있는가 — 강조 링을 그릴지 정한다. */
export function hasUnseen(g: StoryGroup, seen: StorySeenMap): boolean {
  const id = g.author?.id;
  if (!id) return false;
  return newestMs(g) > (seen[id] ?? 0);
}

/** 그룹을 열었다고 기록하고 **갱신된 맵**을 돌려준다(변화가 없으면 받은 맵 그대로). */
export function markSeen(g: StoryGroup, seen: StorySeenMap): StorySeenMap {
  const id = g.author?.id;
  if (!id) return seen;
  const ts = newestMs(g);
  if (ts <= (seen[id] ?? 0)) return seen;
  const next = { ...seen, [id]: ts };
  try {
    setPref(KEY, JSON.stringify(next));
  } catch {
    // 표시가 저장되지 않아도 스토리는 그대로 보인다 — 조용히 넘어간다.
  }
  return next;
}
