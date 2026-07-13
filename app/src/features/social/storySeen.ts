// 스토리 열람 상태(로컬) — 작성자별 '마지막으로 본 스토리 시각(ms)'. 서버에 seen 개념이 없어 로컬 KV로 추적.
// 인스타/카톡식 '안 본 스토리' 링: 그룹의 최신 스토리 시각 > 저장된 열람 시각이면 미열람(링 강조). (SRS-019)
import { getPref, setPref } from '../../sync/prefs';
import type { StoryGroup, StoryItem } from '../../sync/serverApi';

const KEY = 'story_seen_v1';
export type StorySeenMap = Record<string, number>;

export async function loadStorySeen(): Promise<StorySeenMap> {
  try {
    const raw = await getPref(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StorySeenMap) : {};
  } catch {
    return {};
  }
}

// 그룹의 최신 스토리(createdAt 최대) — 트레이 썸네일·미열람 판정 기준.
export function newestStory(g: StoryGroup): StoryItem | null {
  let best: StoryItem | null = null;
  let max = -1;
  for (const s of g.stories) {
    const t = Date.parse(s.createdAt);
    if (Number.isFinite(t) && t > max) {
      max = t;
      best = s;
    }
  }
  return best;
}

export function newestStoryMs(g: StoryGroup): number {
  const s = newestStory(g);
  return s ? Date.parse(s.createdAt) : 0;
}

export function groupHasUnseen(g: StoryGroup, seen: StorySeenMap): boolean {
  return newestStoryMs(g) > (seen[g.author.id] ?? 0);
}

// 그룹 열람 처리 → 최신 스토리 시각을 저장하고 갱신된 맵 반환(변화 없으면 기존 맵 그대로).
export async function markGroupSeen(g: StoryGroup, seen: StorySeenMap): Promise<StorySeenMap> {
  const ts = newestStoryMs(g);
  if (ts <= (seen[g.author.id] ?? 0)) return seen;
  const next = { ...seen, [g.author.id]: ts };
  try {
    await setPref(KEY, JSON.stringify(next));
  } catch {
    // 저장 실패 무시(플래그성 — 실패해도 앱 동작엔 영향 없음)
  }
  return next;
}
