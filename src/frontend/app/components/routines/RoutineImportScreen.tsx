"use client";
// 가져오기 화면 조립 — Phase 4 의 받아 적기(VideoWatchRecorder)를 끼운다(서버 컴포넌트 page 에서 함수 prop 을 넘길 수 없어 여기서).
import RoutineImport from "./RoutineImport";
import VideoWatchRecorder from "./VideoWatchRecorder";

export default function RoutineImportScreen() {
  // [원본] return <RoutineImport />;
  // [개선] SPEC-054 Phase 4 — 받아 적기를 끼운다
  return <RoutineImport renderWatch={(p) => <VideoWatchRecorder {...p} />} />;
}
