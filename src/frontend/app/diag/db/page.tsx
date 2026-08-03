"use client";
// @plm SRS-006  로컬 저장소 자가진단 — 이관해 온 WatermelonDB 계층이 이 스택에서 실제로 도는가
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 화면으로 두는가: 이 계층의 실패 모드가 **조용하기** 때문이다.
//
// 모델은 `@text('name_ko') nameKo!: string` 처럼 데코레이터로 접근자를 만든다. 번들러가
// class-fields를 define 의미로 내보내면 인스턴스에 own 프로퍼티가 생겨 **그 접근자를 가린다** —
// 그러면 저장은 되는데(원시 행은 채워짐) 읽으면 전부 undefined이고, 쓰기도 원시 행에 도달하지
// 못한다. 타입 검사도 통과하고 빌드도 성공한다. 화면이 "빈 데이터"로 보일 뿐이다.
//
// 그래서 **왕복을 실제로 해 보는** 진단을 남긴다. e2e(local-db.spec.ts)가 이 화면을 열어
// 판정을 확인하므로, 번들러 설정이 바뀌어 이 함정이 되살아나면 검증에서 걸린다.
//
// 흔적을 남기지 않는다 — 만든 레코드는 확인 후 지운다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

type Result = { ok: boolean; lines: string[] };

export default function LocalDbDiagnostics() {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const lines: string[] = [];
      let ok = true;
      const fail = (m: string) => {
        ok = false;
        lines.push(`✗ ${m}`);
      };
      const pass = (m: string) => lines.push(`✓ ${m}`);

      try {
        // 로컬 DB는 **브라우저에만** 있다(LokiJS + IndexedDB). 모듈 최상단에서 import하면
        // 서버 렌더 시점에 실행돼 터지므로 클라이언트에서 동적으로 불러온다.
        const { database } = await import("@app/core/db");
        const exercises = database.get("exercises");
        pass("DB 열림 (LokiJS + IndexedDB)");

        const probeName = `__diag ${Date.now()}`;
        let createdId = "";

        await database.write(async () => {
          const rec = await exercises.create((e) => {
            const r = e as unknown as Record<string, unknown>;
            r.nameKo = probeName;
            r.nameEn = null;
            r.primaryMuscles = ["chest"];
            r.secondaryMuscles = ["triceps"];
            r.equipment = "barbell";
            r.isCustom = true;
            r.substituteIds = [];
            r.isArchived = false;
          });
          createdId = rec.id;
        });

        const found = (await exercises.find(createdId)) as unknown as Record<string, unknown>;
        const raw = found._raw as Record<string, unknown>;

        // ① 접근자가 값을 돌려주는가 — 데코레이터가 설치됐는가
        found.nameKo === probeName ? pass("문자열 필드 왕복") : fail(`문자열 필드: ${String(found.nameKo)}`);

        // ② JSON 필드(직렬화 + sanitizer)
        JSON.stringify(found.primaryMuscles) === '["chest"]'
          ? pass("JSON 필드 왕복")
          : fail(`JSON 필드: ${JSON.stringify(found.primaryMuscles)}`);

        // ③ 쓰기가 **원시 행까지** 도달했는가 — 접근자만 살아 있고 setter가 죽은 경우를 잡는다
        raw.is_custom === true
          ? pass("setter가 원시 행에 도달")
          : fail(`원시 is_custom: ${String(raw.is_custom)}`);

        // ④ 쌓인 데코레이터(@readonly @date) — 가장 먼저 깨졌던 자리
        found.createdAt instanceof Date
          ? pass("@readonly @date 접근자")
          : fail(`createdAt: ${typeof found.createdAt}`);

        // ⑤ 스키마가 통째로 실려 왔는가.
        // 버전 숫자를 박지 않는다 — 스키마가 정당하게 올라갈 때마다 이 검사가 깨지면
        // 사람이 숫자만 고치게 되고, 그러면 검사가 의미를 잃는다. **테이블 구성**을 본다.
        const { mySchema } = await import("@app/core/db/schema");
        const tables = Object.keys(mySchema.tables);
        const 필수 = [
          "exercises",
          "routines",
          "routine_exercises",
          "workouts",
          "workout_exercises",
          "set_logs",
          "user_profiles",
        ];
        const 빠진것 = 필수.filter((t) => !tables.includes(t));
        빠진것.length === 0
          ? pass(`스키마 v${mySchema.version} · 테이블 ${tables.length}개`)
          : fail(`스키마에 빠진 테이블: ${빠진것.join(", ")}`);

        // 흔적 제거
        await database.write(async () => {
          await (await exercises.find(createdId)).destroyPermanently();
        });
        pass("진단 레코드 정리");

        // ⑥ 배포 + 저장소 계층 — 서버 카탈로그가 로컬로 내려오고 repository로 읽히는가.
        // 여기까지 통과하면 **화면이 오프라인에서도 목록을 보여줄 수 있다**는 뜻이다(ADR-002).
        // 멱등하다: 개정 번호가 그대로면 다시 받지 않는다.
        const { syncCatalogToLocal } = await import("@/lib/catalogSync");
        const synced = await syncCatalogToLocal();
        const { queryExercises } = await import("@app/core/data/exerciseRepository");
        const all = await queryExercises().fetch();
        all.length >= 336
          ? pass(`서버 배포 · repository — 로컬 카탈로그 ${all.length}종 (${synced.status})`)
          : fail(`로컬 카탈로그가 ${all.length}종뿐이다(336종 이상이어야 한다 · ${synced.status})`);

        // ⑦ 두 번째 호출은 내려받지 않는다 — 개정 번호로 걸러야 앱을 열 때마다 336종을 다시 받지 않는다.
        const again = await syncCatalogToLocal();
        again.status === "up-to-date"
          ? pass("개정 번호가 같으면 다시 받지 않는다")
          : fail(`두 번째 동기가 ${again.status} (up-to-date여야 한다)`);

        // ⑧ 저장소 필터가 로컬에서 도는가.
        //
        // 검색어(`search` 옵션)는 **여기서 검사하지 않는다.** 웹 어댑터(LokiJS)의 `Q.like`가
        // 한글을 걸러내지 못해 전건이 통과하기 때문이다 — app도 같은 이유로 그 옵션을 쓰지 않고
        // 검색만 JS로 거른다(ExerciseListScreen 주석 #10). 화면의 검색은 e2e가 확인한다.
        // flush 경로가 살아 있는가 — WatermelonDB가 공개 API를 주지 않아 어댑터 내부를 통해 부른다.
        // 내부 구조가 바뀌면 여기서 먼저 걸린다(안 그러면 "기록이 가끔 사라진다"로만 나타난다).
        const { flushLocalDb } = await import("@/lib/localDb");
        (await flushLocalDb())
          ? pass("디스크 flush 경로 살아 있음")
          : fail("flush 경로에 닿지 못했다 — 어댑터 내부 구조가 바뀌었을 수 있다");

        const 밴드 = await queryExercises({ equipment: "band" }).fetch();
        밴드.length > 0 && 밴드.length < all.length
          ? pass(`기구 필터(밴드) → ${밴드.length}종`)
          : fail(`기구 필터가 좁히지 못했다: ${밴드.length}/${all.length}종`);

        // ⑨ 대체운동 큐레이션이 id로 해소됐는가 — 배포가 요약이 아니라 전체 행을 실어 왔다는 증거
        const 벤치 = all.find((e) => (e as unknown as Record<string, unknown>).nameKo === "바벨 벤치프레스");
        const subs = (벤치 as unknown as Record<string, unknown> | undefined)?.substituteIds as
          | string[]
          | undefined;
        subs && subs.length > 0
          ? pass(`대체운동 해소 (바벨 벤치프레스 → ${subs.length}종)`)
          : fail("대체운동이 해소되지 않았다");
      } catch (e) {
        fail(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      }

      if (!cancelled) setResult({ ok, lines });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">로컬 저장소 자가진단</h1>
      <p className="text-sm text-(--color-ink3)">
        이관해 온 WatermelonDB 계층이 이 스택에서 실제로 왕복하는지 확인한다. 흔적은 남기지 않는다.
      </p>
      <p data-testid="db-verdict" className="text-lg font-semibold">
        {result === null ? "검사 중…" : result.ok ? "정상" : "실패"}
      </p>
      <pre
        data-testid="db-detail"
        className="overflow-x-auto rounded-xl border border-(--color-line) bg-(--color-card) p-4 text-sm"
      >
        {result === null ? "…" : result.lines.join("\n")}
      </pre>
    </div>
  );
}
