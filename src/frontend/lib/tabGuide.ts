// 탭별 ? 사용법 안내(SPEC-058) — 대본 · 「봤다」 표식
//
// ─────────────────────────────────────────────────────────────────────────────
// 피드·운동·기록·분석 탭 머리의 ? 를 누르면 이 대본을 한 단계씩 보여 준다(GuideOverlay).
//   · targets 가 있으면 **실제 화면** 의 그 요소를 짚는다(둘레를 어둡게 + 링). 눌리지는 않는다 —
//     짚은 「빠른 운동 시작」을 눌러 진짜 운동이 생기면 안 되기 때문이다(booktarae 와 다른 점).
//   · targets 가 지금 화면에 없으면 **설명만** 가운데 띠로 보여 준다(빼지 않는다 — 「이런 기능이 있다」가 목적).
//   · practice 가 있으면 실제 화면 대신 **연습 블록**(PracticeBlock)을 띄운다. 기록이 남지 않는다.
// 순서는 탭마다 「주요 기능 → 눈으로 봐선 모르는 기능」(사용자 결정 id=1831).
//
// 문구를 core 사전에 넣지 않은 이유: 웹 i18n 은 ko 고정이고(lib/i18n.ts) 대본이 길다 — 영어를 붙일 때 옮긴다(REV-140 보류 11).
// 「봤다」 표식은 이 기기 사실이라 동기하지 않는다(coachMarks 와 같은 규칙).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import { HINT_SUPPRESSED_KEY } from "./coachMarks";

export type GuideTab = "workout" | "records" | "stats" | "feed";

export type PracticeKind =
  | "prevFill"
  | "setType"
  | "scheme"
  | "variant"
  | "done"
  | "longDone"
  | "rir"
  | "prFill"
  | "plate";

export type GuideStep = {
  title: string;
  body: string;
  /** 짚을 실제 요소의 data-testid 후보 — 앞에서부터 **보이는** 첫 것 */
  targets?: string[];
  /** 연습 블록 — 있으면 실제 화면 대신 연습 판 */
  practice?: PracticeKind;
};

export const GUIDE_TAB_LABEL: Record<GuideTab, string> = {
  workout: "운동",
  records: "기록",
  stats: "분석",
  feed: "피드",
};

export const GUIDE_SCRIPTS: Record<GuideTab, GuideStep[]> = {
  workout: [
    {
      title: "오늘 할 운동",
      body: "주간 스케줄에 오늘 루틴을 정해 두면 여기 바로 떠요. 누르면 그 루틴으로 운동을 시작해요.",
      targets: ["today-card", "next-card", "reco-card"],
    },
    {
      title: "빠른 운동 시작",
      body: "루틴 없이 빈 운동을 열어요. 종목을 하나씩 더해 가며 기록하면 돼요.",
      targets: ["btn-quick-start"],
    },
    {
      title: "주간 스케줄 · 블록 주기",
      body: "요일마다 루틴을 정하고, 「4주 + 1주 디로딩」 같은 훈련 주기를 고를 수 있어요. 디로딩 주에는 가볍게 하라고 알려 줘요.",
      targets: ["btn-edit-schedule", "entry-schedule"],
    },
    {
      title: "내 루틴",
      body: "루틴을 누르면 종목과 세트를 미리 볼 수 있어요. ⋯ 에서 고치기·복사·지우기, 「새 루틴」으로 직접 만들 수 있어요.",
      targets: ["routine-list", "btn-new-routine"],
    },
    {
      title: "프로그램 생성",
      body: "목표·주당 횟수·경험을 고르면 몇 주짜리 프로그램을 루틴으로 만들어 줘요.",
      targets: ["btn-program"],
    },
    {
      title: "종목 찾기",
      body: "돋보기에서 모든 종목을 찾아보고, 자극 부위·운동 방법·내 기록을 볼 수 있어요.",
      targets: ["home-exercises"],
    },
    {
      title: "여기부터 운동 중 화면 연습",
      body: "다음 단계부터는 운동 중 화면을 흉내 낸 연습 판이에요. 마음껏 눌러 보세요 — 아무것도 기록되지 않아요.",
    },
    {
      title: "이전 값 채우기",
      body: "「이전」 칸에는 지난번 이 세트의 무게×횟수가 보여요. 누르면 그대로 채워져요 — 같은 무게로 할 때 한 번에.",
      practice: "prevFill",
    },
    {
      title: "세트 종류 바꾸기",
      body: "세트 번호를 누르면 워밍업(W)·드롭(D)·실패(F)·탑(T)·백오프(B)로 바꿀 수 있어요. 워밍업은 볼륨·PR 에 들어가지 않아요.",
      practice: "setType",
    },
    {
      title: "세트 방식",
      body: "탑세트+백오프·5×5·피라미드처럼 세트 짜는 방식을 고르면 남은 세트 표를 다시 짜 줘요. 끝낸 세트는 그대로예요.",
      practice: "scheme",
    },
    {
      title: "조합 — 같은 종목, 다른 조건",
      body: "종목 이름 아래 「조합 ▾」에서 브랜드·부착물 등을 고르면 기록이 조합별로 따로 쌓여요. 「이전」 값도 그 조합 기록을 보여 줘요. 기구가 바뀌면 다른 종목이에요.",
      practice: "variant",
    },
    {
      title: "세트 완료와 휴식",
      body: "✓ 를 누르면 세트가 끝나고 휴식 시계가 흘러요. 세트 종류마다 휴식 시간을 따로 둘 수 있어요.",
      practice: "done",
    },
    {
      title: "슈퍼세트 — 길게 눌러 이 종목만",
      body: "슈퍼세트로 묶인 종목은 ✓ 한 번에 묶음 전체가 완료돼요. 이 종목만 끝내려면 ✓ 를 길게(0.5초) 누르세요.",
      practice: "longDone",
    },
    {
      title: "여유(RIR)",
      body: "세트를 마치고 「몇 개 더 할 수 있었나」를 적어요. 0 은 한계까지, 2 면 두 개 더 가능했다는 뜻이에요. 다음 무게를 정하는 근거가 돼요.",
      practice: "rir",
    },
    {
      title: "금색 PR — 누르면 채움",
      body: "종목 이름 아래 금색 PR 은 이 조합의 최고 기록이에요. 누르면 아직 안 한 첫 세트에 그 무게×횟수가 채워져요. 옆 ⓘ 는 그 기록을 보여 줘요.",
      practice: "prFill",
    },
    {
      title: "원판 한쪽 무게로 적기",
      body: "원판을 거는 머신은 한쪽 무게만 적을 수 있어요. 칸에는 적은 한쪽 값이 남고, 볼륨·PR 은 양쪽(×2)으로 계산해요.",
      practice: "plate",
    },
  ],
  records: [
    {
      title: "목록과 달력",
      body: "같은 운동 기록을 목록이나 달력으로 봐요. 위 칸에서 바꿔요.",
      targets: ["records-view"],
    },
    {
      title: "지난 운동",
      body: "운동을 누르면 세트별 기록을 볼 수 있어요. 잘못 적은 무게·횟수는 거기서 고칠 수 있어요.",
      targets: ["history-list"],
    },
    {
      title: "달력",
      body: "운동한 날에 점이 찍혀요. 날짜를 누르면 그날 운동이 아래에 나오고, 메모를 남길 수 있어요.",
      targets: ["calendar-grid"],
    },
    {
      title: "주간 목표 · 연속 기록",
      body: "한 주에 몇 번 운동할지 정해 두면 달성 여부와 연속 주를 세어 줘요.",
      targets: ["weekly-goal", "goal-row"],
    },
    {
      title: "한 달 자랑하기",
      body: "달력에서 이번 달 운동을 한 장으로 묶어 피드에 올릴 수 있어요.",
      targets: ["btn-brag-month"],
    },
  ],
  stats: [
    {
      title: "기간 고르기",
      body: "주·달·석 달 등 보고 싶은 기간을 골라요. 아래 숫자가 모두 그 기간 기준으로 바뀌어요.",
      targets: ["stats-period"],
    },
    {
      title: "요약 숫자",
      body: "운동 횟수·세트·볼륨을 보여 주고, 지난 같은 기간보다 늘었는지 줄었는지 화살표로 알려 줘요.",
      targets: ["stat-volume", "stat-delta"],
    },
    {
      title: "추정 1RM",
      body: "무게×횟수로 한 번에 들 수 있는 최대 무게를 추정해요(Epley 식). 종목마다 힘이 느는지 볼 수 있어요.",
      targets: ["stats-1rm"],
    },
    {
      title: "최근 PR",
      body: "최근에 세운 개인 최고 기록이에요. 누르면 그 운동 기록으로 가요.",
      targets: ["stats-recent-prs"],
    },
    {
      title: "근육 균형",
      body: "부위별로 얼마나 했는지 몸 지도로 보여 줘요. 덜 한 부위가 한눈에 보여 다음 루틴을 짜기 좋아요.",
      targets: ["muscle-balance-card"],
    },
  ],
  feed: [
    {
      title: "추천 · 팔로잉",
      body: "추천은 모두의 글, 팔로잉은 내가 팔로우한 사람의 글이에요.",
      targets: ["feed-tabs"],
    },
    {
      title: "찾기",
      body: "해시태그와 사람, 인기 글을 찾아요.",
      targets: ["feed-explore"],
    },
    {
      title: "사람",
      body: "이름으로 사람을 찾고, 팔로잉·팔로워를 보고, 메시지를 보낼 수 있어요.",
      targets: ["feed-people"],
    },
    {
      title: "메시지 · 알림",
      body: "1:1·단체 대화와, 좋아요·댓글·팔로우 알림이에요. 안 읽은 알림은 숫자로 보여요.",
      targets: ["feed-messages", "feed-notifications"],
    },
    {
      title: "글쓰기",
      body: "사진과 글에 마친 운동 기록을 붙여 올릴 수 있어요. 쓴 장비도 태그할 수 있어요.",
      targets: ["feed-compose"],
    },
    {
      title: "글 카드",
      body: "좋아요·댓글·저장을 할 수 있어요. 운동 기록이 붙은 글은 펼쳐서 세트까지 볼 수 있고, 불편한 글은 신고할 수 있어요.",
      targets: ["post-card"],
    },
  ],
};

// ── 「봤다」 표식 — ? 의 점 ───────────────────────────────────────────────────

const seenKey = (tab: GuideTab) => `liftgram.guide.${tab}`;
const EVENT = "liftgram-guide";
const seenThisRun = new Set<GuideTab>();

function read(k: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function isGuideSeen(tab: GuideTab): boolean {
  // e2e 기본 상태(첫 안내 끔)에서는 점도 그리지 않는다 — 머리 모양 시험이 흔들리지 않게
  return seenThisRun.has(tab) || read(seenKey(tab)) === "seen" || read(HINT_SUPPRESSED_KEY) != null;
}

export function markGuideSeen(tab: GuideTab): void {
  seenThisRun.add(tab);
  try {
    localStorage.setItem(seenKey(tab), "seen");
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** ? 의 점 — 처음 그린 뒤(hydration 뒤)에 판단한다. 첫 그림은 점 없음. */
export function useGuideUnseen(tab: GuideTab): [boolean, () => void] {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    const on = () => setUnseen(!isGuideSeen(tab));
    on();
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [tab]);
  const mark = useCallback(() => markGuideSeen(tab), [tab]);
  return [unseen, mark];
}
