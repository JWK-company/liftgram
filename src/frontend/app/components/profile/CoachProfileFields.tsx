"use client";
// 코치 소개·태그(SPEC-050 P1b) — 프로필 편집 시트에서 코칭 의향을 켰을 때만 보인다.
//
// 값은 **서버 프로필에만** 있다(남이 보는 코치 카드 — 프로필·초대 링크·범위 시트). 기기 설정에 사본을 두지 않는다.
// 소개는 칸을 떠날 때(바뀐 것만) · 태그는 누를 때마다 저장. 서버 저장이 실패하면 토스트로 알리고 칸을 되돌린다.
import { useRef, useState } from "react";
import { COACH_TAGS, MAX_COACH_BIO, MAX_COACH_TAGS } from "@/lib/coaching";
import { errorText } from "@/lib/errorText";
import { t, type TransKey } from "@/lib/i18n";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { AppText } from "../ui/primitives";

export function CoachProfileFields() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  // 칸은 시트를 열 때(이 조각이 그려질 때) 서버 값으로 한 번 채우고, 그 뒤로는 화면 값이 원본이다 —
  // 늦게 도착한 옛 「내 정보」 응답이 방금 고른 태그를 덮지 않게(e2e 에서 밟았다).
  const [bio, setBio] = useState(user?.coachBio ?? "");
  const [tags, setTags] = useState<string[]>(user?.coachTags ?? []);
  // 태그 — 작업이 실제로 돌 때 최신 값(tagsRef)을 읽어 보내고, 실패하면 마지막으로 서버가 확인한 값으로 되돌린다.
  //        소개 — 실패해도 칸이 보낸 값 그대로일 때만 되돌린다(저장 중 새로 친 글자는 그대로 둔다).
  const savedBio = useRef(user?.coachBio ?? "");
  const bioRef = useRef(user?.coachBio ?? "");
  const tagsRef = useRef<string[]>(user?.coachTags ?? []);
  /** 서버가 마지막으로 확인한 태그 */
  const confirmedTags = useRef<string[]>(user?.coachTags ?? []);
  /** 저장은 한 줄로 — 빨리 연달아 눌러도 마지막 상태까지 순서대로 쓴다 */
  const queue = useRef<Promise<void>>(Promise.resolve());

  if (!user) return null;

  function fail(e: unknown) {
    const msg = errorText(e, "");
    toast(msg ? `${t("coaching.profile.saveFailed")} — ${msg}` : t("coaching.profile.saveFailed"), "error");
  }

  function enqueue(job: () => Promise<void>) {
    queue.current = queue.current.then(job, job);
  }

  function sameTags(a: string[], b: string[]) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }

  function saveBio() {
    const next = bio.trim();
    if (next === savedBio.current) return;
    const before = savedBio.current;
    savedBio.current = next;
    enqueue(async () => {
      try {
        await updateProfile({ coachBio: next, setCoachBio: true });
      } catch (e) {
        // 뒤에 줄 선 저장이 savedBio 를 이미 바꿨으면 그쪽이 원본 — 내 실패만 무르기
        if (savedBio.current === next) savedBio.current = before;
        if (bioRef.current.trim() === next) {
          bioRef.current = before;
          setBio(before);
        }
        fail(e);
      }
    });
  }

  function toggleTag(tag: string) {
    const cur = tagsRef.current;
    const on = cur.includes(tag);
    if (!on && cur.length >= MAX_COACH_TAGS) return;
    const next = on ? cur.filter((x) => x !== tag) : [...cur, tag];
    tagsRef.current = next;
    setTags(next);
    enqueue(async () => {
      const send = tagsRef.current;
      // 앞 작업이 이미 같은 값을 보냈으면(연달아 누름) 건너뛴다
      if (sameTags(send, confirmedTags.current)) return;
      try {
        await updateProfile({ coachTags: send, setCoachTags: true });
        confirmedTags.current = send;
      } catch (e) {
        tagsRef.current = confirmedTags.current;
        setTags(confirmedTags.current);
        fail(e);
      }
    });
  }

  return (
    <div className="mt-[var(--spacing-md)]" data-testid="coach-profile-fields">
      <label htmlFor="coach-bio" className="block">
        <AppText variant="label" color="textMuted">
          {t("coaching.profile.bioLabel")}
        </AppText>
      </label>
      <input
        id="coach-bio"
        data-testid="coach-bio"
        value={bio}
        maxLength={MAX_COACH_BIO}
        onChange={(e) => {
          bioRef.current = e.target.value;
          setBio(e.target.value);
        }}
        onBlur={saveBio}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={t("coaching.profile.bioPlaceholder")}
        className="mt-[var(--spacing-xs)] min-h-11 w-full rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) px-[var(--spacing-md)] py-[var(--spacing-sm)] text-(--color-ink) text-[length:var(--text-md)] outline-none placeholder:text-(--color-ink3) focus:border-(--color-brand) focus:ring-(--color-brand) focus:ring-1"
      />
      <AppText variant="caption" color="textFaint" className="mt-[2px] block text-right">
        {`${[...bio].length}/${MAX_COACH_BIO}`}
      </AppText>

      <AppText variant="label" color="textMuted" className="mt-[var(--spacing-sm)] block">
        {t("coaching.profile.tagsLabel")}
      </AppText>
      <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-xs)]">
        {COACH_TAGS.map((tag) => {
          const on = tags.includes(tag);
          const full = !on && tags.length >= MAX_COACH_TAGS;
          return (
            <button
              key={tag}
              type="button"
              data-testid={`coach-tag-${tag}`}
              aria-pressed={on}
              disabled={full}
              onClick={() => toggleTag(tag)}
              style={{
                backgroundColor: on ? "var(--color-coaching-soft)" : "var(--color-surface-alt)",
                borderColor: on ? "var(--color-coaching)" : "var(--color-line)",
                color: on ? "var(--color-coaching-ink)" : "var(--color-ink2)",
              }}
              className={`min-h-11 rounded-[var(--radius-pill)] border px-[var(--spacing-md)] text-[length:var(--text-sm)] ${on ? "font-bold" : ""} ${full ? "opacity-40" : ""}`}
            >
              {t(`coaching.tag.${tag}` as TransKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
