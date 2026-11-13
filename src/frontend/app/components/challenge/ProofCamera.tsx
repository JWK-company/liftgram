"use client";
// 인증 카메라(SPEC-064 Phase 3a · SRS-119) — 운동 중에 앱 카메라로만 찍는다.
//
//   · 파일 입력(갤러리)은 없다 — getUserMedia 의 뒤 카메라 화면을 canvas 로 떠서 보낸다.
//   · 열 때 서버가 지시(손 모양 · 기구)를 하나 준다(3분 · 한 번만). 시간이 지나면 새 지시를 받아 다시 찍는다.
//   · 긴 변 1280px JPEG 로 줄여 binary 로 올린다(서버가 다시 인코딩하고 EXIF 를 지운다).
//   · 권한이 없거나 카메라가 없으면 까닭별 안내 — 옛 안드로이드 앱(1.8.0 전)은 카메라 권한이 없어 업데이트를 권한다.
import type { ProofInfo, Summary } from "@app/contracts";
import { Code, ConnectError } from "@connectrpc/connect";
import { useCallback, useEffect, useRef, useState } from "react";
import { challengeClient, challengeUploadClient, promptText } from "@/lib/challengeClient";
import { errorText } from "@/lib/errorText";
import { t } from "@/lib/i18n";
import { nativeOS } from "@/lib/native";
import { useToast } from "../Toast";
import { actionBoxClass, Button } from "../ui/Button";
import { Overlay } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

const MAX_EDGE = 1280;
const QUALITY = 0.82;
/** 카메라 권한을 가진 첫 안드로이드 앱 versionCode(1.8.0) */
export const CAMERA_VERSION_CODE = 16;
/** 지시 유효 시간(서버 PromptTTL 과 같다) */
const PROMPT_TTL_MS = 180_000;
/** 끝 이 초 안에는 셔터를 막는다 — 사진을 보내는 동안 만료되지 않게 */
const SEND_MARGIN_S = 5;

type CamState =
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "denied" }
  | { kind: "nocamera" }
  | { kind: "oldapp" }
  | { kind: "error"; message: string };

/**
 * 안드로이드 앱의 versionCode. 웹·iOS·알 수 없음(다리 일시 실패·응답 없음)은 null — 그때는 카메라를 먼저 켜 본다(REV-162 M-5).
 * 다리가 아예 없으면(1.0.x·1.1.x) 0 = 옛 앱.
 */
async function androidVersionCode(): Promise<number | null> {
  if (nativeOS() !== "android") return null;
  try {
    const { readShell } = await import("@/lib/appDistribution");
    const r = await Promise.race([
      readShell(),
      new Promise<null>((res) => window.setTimeout(() => res(null), 2000)),
    ]);
    if (r?.shell.kind !== "app") return null;
    if (r.shell.bridge === "missing") return 0;
    if (r.shell.bridge === "ready") return r.shell.versionCode ?? null;
    return null;
  } catch {
    return null;
  }
}

/** 미리보기(3:4 · object-cover)와 같은 가운데만 긴 변 1280 JPEG 로 — 화면 밖 부분이 올라가지 않게(REV-162 H-1) */
function grab(video: HTMLVideoElement): Promise<Blob | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return Promise.resolve(null);
  const want = 3 / 4; // 가로 / 세로
  let sw = vw;
  let sh = vh;
  if (vw / vh > want) sw = Math.round(vh * want);
  else sh = Math.round(vw / want);
  const sx = Math.round((vw - sw) / 2);
  const sy = Math.round((vh - sh) / 2);
  const k = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * k);
  canvas.height = Math.round(sh * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", QUALITY));
}

/** 서버가 판단한 거절(지시 만료·같은 사진 등) — 사진을 버리고 새 지시. 그 밖(망·한도·서버 오류)은 같은 사진으로 다시 올린다 */
function serverRejected(e: unknown): boolean {
  if (!(e instanceof ConnectError)) return false;
  return [
    Code.NotFound,
    Code.AlreadyExists,
    Code.InvalidArgument,
    Code.FailedPrecondition,
    Code.PermissionDenied,
    Code.Unauthenticated,
  ].includes(e.code);
}

export function ProofCamera({
  challenge,
  workoutId,
  onClose,
  onDone,
}: {
  challenge: Summary;
  workoutId: string;
  onClose: () => void;
  onDone: (p: ProofInfo) => void;
}) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<CamState>({ kind: "starting" });
  const [prompt, setPrompt] = useState<{ id: string; code: string; expires: number } | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const issueSeq = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // 올리지 못한 사진 — 망이 끊겼을 때 같은 사진·같은 지시로 다시 올린다(REV-162 M-2)
  const [shot, setShot] = useState<Blob | null>(null);
  const [camSeq, setCamSeq] = useState(0);

  const stop = useCallback(() => {
    for (const tr of streamRef.current?.getTracks() ?? []) tr.stop();
    streamRef.current = null;
  }, []);

  // 카메라 켜기(camSeq 가 바뀌면 다시 — 앱을 내렸다 돌아왔을 때·트랙이 끊겼을 때)
  // biome-ignore lint/correctness/useExhaustiveDependencies: camSeq 는 다시 켜는 신호
  useEffect(() => {
    let alive = true;
    setCam({ kind: "starting" });
    void (async () => {
      const vc = await androidVersionCode();
      if (vc !== null && vc < CAMERA_VERSION_CODE) {
        if (alive) setCam({ kind: "oldapp" });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        if (alive) setCam({ kind: "nocamera" });
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!alive) {
          for (const tr of s.getTracks()) tr.stop();
          return;
        }
        streamRef.current = s;
        // OS 가 카메라를 거둬 가면(전화·다른 앱) 다시 켠다 — 검은 화면으로 셔터가 눌리지 않게(REV-162 M-1)
        for (const tr of s.getVideoTracks()) {
          tr.addEventListener("ended", () => {
            if (alive && document.visibilityState === "visible") setCamSeq((n) => n + 1);
          });
        }
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => undefined);
        }
        setCam({ kind: "live" });
      } catch (e) {
        if (!alive) return;
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") setCam({ kind: "denied" });
        else if (name === "NotFoundError" || name === "OverconstrainedError") setCam({ kind: "nocamera" });
        else setCam({ kind: "error", message: t("challenge.camera.failed") });
      }
    })();
    return () => {
      alive = false;
      stop();
    };
  }, [stop, camSeq]);

  // 화면을 내리면 카메라를 끄고(표시등·배터리), 돌아오면 다시 켠다(REV-162 M-1)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        stop();
        setCam({ kind: "starting" });
      } else {
        setCamSeq((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stop]);

  // 지시 받기 — 연타해도 마지막 응답만(REV-162 L-1)
  const issue = useCallback(async () => {
    const my = ++issueSeq.current;
    setPromptError(null);
    setPrompt(null);
    setShot(null);
    setIssuing(true);
    try {
      const r = await challengeClient().issuePrompt({ challengeId: challenge.id, workoutId });
      if (my !== issueSeq.current) return;
      // 남은 시간은 기기 시계가 아니라 받은 순간부터 잰다(기기 시계가 틀려도 · REV-162 M-3).
      // 서버가 정한 길이(만료 − 지금)는 알 수 없어 정해진 3분을 쓴다.
      // [원본] const expires = r.expiresAt ? timestampDate(r.expiresAt).getTime() : Date.now() + 180_000;
      void r.expiresAt;
      setPrompt({ id: r.promptId, code: r.promptCode, expires: Date.now() + PROMPT_TTL_MS });
    } catch (e) {
      if (my === issueSeq.current) setPromptError(errorText(e));
    } finally {
      if (my === issueSeq.current) setIssuing(false);
    }
  }, [challenge.id, workoutId]);

  // 처음 켜질 때만 지시를 받는다 — 다시 켜질 때(앱 복귀)는 남은 지시를 그대로 쓴다
  const issuedOnce = useRef(false);
  useEffect(() => {
    if (cam.kind === "live" && !issuedOnce.current) {
      issuedOnce.current = true;
      void issue();
    }
  }, [cam.kind, issue]);

  // 남은 시간(1초마다)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const left = prompt ? Math.max(0, Math.ceil((prompt.expires - now) / 1000)) : 0;
  // 보내는 데 걸리는 시간 — 끝 몇 초 전에는 새 지시로(서버는 받은 순간으로 잰다)
  const expired = prompt !== null && left <= SEND_MARGIN_S;

  async function upload(blob: Blob) {
    if (!prompt || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const image = new Uint8Array(await blob.arrayBuffer());
      const r = await challengeUploadClient().uploadProof({
        promptId: prompt.id,
        image,
        source: nativeOS() ? "app" : "web",
      });
      if (!r.proof) throw new Error("no proof");
      stop();
      toast(
        r.proof.status === "suspect_dup" ? t("challenge.camera.doneSuspect") : t("challenge.camera.done"),
      );
      onDone(r.proof);
    } catch (e) {
      if (serverRejected(e)) {
        toast(errorText(e, t("challenge.camera.uploadFailed")), "error");
        // 서버가 거절했다 — 그 사진은 버리고 새 지시로
        void issue();
      } else {
        // 망·한도·서버 오류 — 지시는 아직 쓰지 않았다. 같은 사진을 두고 다시 올리게 한다
        setShot(blob);
        toast(t("challenge.camera.uploadRetry"), "error");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function shoot() {
    const v = videoRef.current;
    if (!v || !prompt || busyRef.current || expired) return;
    const blob = await grab(v);
    if (!blob) {
      toast(t("challenge.camera.failed"), "error");
      return;
    }
    await upload(blob);
  }

  // 올리는 중에는 닫지 않는다 — 닫힌 뒤에 「인증 완료」가 뜨지 않게(REV-162 L-2)
  const close = () => {
    if (!busyRef.current) onClose();
  };

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <Overlay onClose={close} testId="proof-camera" ariaLabel={t("challenge.camera.title")}>
      <AppText variant="heading">{t("challenge.camera.title")}</AppText>
      <AppText variant="caption" color="textMuted" className="block">
        {challenge.rule?.title}
      </AppText>
      <div className="relative mt-[var(--spacing-sm)] overflow-hidden rounded-[var(--radius-sm)] bg-black">
        {/* 화면만 보인다 — 파일을 고르는 입력은 두지 않는다(SRS-119) */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`block aspect-[3/4] w-full object-cover ${cam.kind === "live" ? "" : "invisible"}`}
          data-testid="proof-video"
        />
        {cam.kind !== "live" ? (
          <div className="absolute inset-0 flex items-center justify-center p-[var(--spacing-lg)] text-center text-[length:var(--text-sm)] text-white">
            <span data-testid={`proof-cam-${cam.kind}`} role="status">
              {cam.kind === "starting"
                ? t("challenge.camera.starting")
                : cam.kind === "denied"
                  ? nativeOS() === "ios"
                    ? t("challenge.camera.deniedIos")
                    : nativeOS() === "android"
                      ? t("challenge.camera.deniedAndroid")
                      : t("challenge.camera.deniedWeb")
                  : cam.kind === "nocamera"
                    ? t("challenge.camera.noCamera")
                    : cam.kind === "oldapp"
                      ? t("challenge.camera.oldApp")
                      : cam.message}
            </span>
          </div>
        ) : null}
        {cam.kind === "live" && prompt ? (
          <div
            className="absolute inset-x-0 top-0 bg-black/60 px-[var(--spacing-md)] py-[var(--spacing-sm)] text-white"
            data-testid="proof-prompt"
            data-code={prompt.code}
          >
            <span className="block font-semibold">{promptText(prompt.code)}</span>
            {/* 남은 시간은 매초 바뀌어 읽게 두지 않는다 — 1분·30초·만료 때만 알린다(REV-162 L-3) */}
            <span className="block text-[length:var(--text-xs)]" data-testid="proof-timer">
              {expired
                ? left > 0
                  ? t("challenge.camera.almost")
                  : t("challenge.camera.expired")
                : t("challenge.camera.left", { time: `${mm}:${ss}` })}
            </span>
            <span className="sr-only" aria-live="polite">
              {expired
                ? t("challenge.camera.expired")
                : left <= 60
                  ? t("challenge.camera.left", { time: left <= 30 ? "0:30" : "1:00" })
                  : ""}
            </span>
          </div>
        ) : null}
      </div>
      {promptError ? (
        <div
          className="mt-[var(--spacing-sm)] flex items-center justify-between gap-[var(--spacing-sm)]"
          role="alert"
        >
          <AppText variant="caption" color="danger" data-testid="proof-prompt-error">
            {promptError}
          </AppText>
          <button
            type="button"
            onClick={() => void issue()}
            disabled={issuing}
            className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : null}
      <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-sm)] block">
        {t("challenge.camera.hint")}
      </AppText>
      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <div className="flex-1">
          <Button
            title={t("common.cancel")}
            variant="secondary"
            onPress={close}
            disabled={busy}
            testId="proof-cancel"
          />
        </div>
        <div className="flex-1">
          {shot && !expired ? (
            // 망이 끊겨 못 올린 사진 — 그대로 다시 올리거나 다시 찍는다(REV-162 M-2)
            <div className="flex flex-col gap-[var(--spacing-xs)]">
              <Button
                title={t("challenge.camera.retryUpload")}
                onPress={() => void upload(shot)}
                loading={busy}
                testId="proof-retry-upload"
              />
              <Button
                title={t("challenge.camera.reshoot")}
                variant="secondary"
                onPress={() => setShot(null)}
                disabled={busy}
                testId="proof-reshoot"
              />
            </div>
          ) : expired ? (
            <Button
              title={t("challenge.camera.newPrompt")}
              onPress={() => void issue()}
              loading={issuing}
              testId="proof-new-prompt"
            />
          ) : (
            <Button
              title={t("challenge.camera.shoot")}
              onPress={() => void shoot()}
              disabled={cam.kind !== "live" || !prompt}
              loading={busy}
              testId="proof-shoot"
            />
          )}
        </div>
      </div>
    </Overlay>
  );
}
