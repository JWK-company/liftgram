// @plm SRS-001  카탈로그 배포 — 서버 카탈로그를 기기의 로컬 저장소로 내려받는다
//
// ─────────────────────────────────────────────────────────────────────────────
// 읽기 정본은 **로컬**이다(ADR-002 · ADR-032). 화면은 이 파일이 채워 둔 로컬 저장소를 읽고,
// 서버는 그 저장소를 세우고 갱신하는 **배포 채널**로만 관여한다. 그래서 헬스장에서 네트워크가
// 없어도 목록·검색·필터가 그대로 동작한다.
//
// 왜 시드를 번들에 넣지 않나: app(네이티브 앱)은 카탈로그를 앱 번들에 담아도 되지만, 웹에서는
// 336종 + 큐레이션이 첫 로딩에 얹힌다. 서버에서 받으면 번들이 가볍고, 카탈로그를 늘릴 때
// 앱을 다시 배포하지 않아도 된다.
//
// 멱등하다: 개정 번호가 그대로면 아무것도 하지 않고, 바뀌었으면 달라진 행만 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { type Exercise as ContractExercise, ExerciseService, routes } from "@app/contracts";
import { EQUIPMENT_KEY, toDomainKind, toDomainLoadMode, toMuscles } from "@/lib/contractMap";

/** 마지막으로 받아 둔 개정 번호. 같으면 다시 받지 않는다. */
const REVISION_KEY = "liftgram.catalog.revision";

/** 한 번에 받는 개수 — 계약의 상한과 같다. 336종이면 한 번에 끝난다. */
const PAGE = 500;

export type CatalogSyncResult =
  | { status: "up-to-date"; count: number }
  | { status: "synced"; count: number; written: number }
  | { status: "offline"; count: number };

function api() {
  return createClient(ExerciseService, createConnectTransport({ baseUrl: routes.apiPrefix }));
}

function revisionKey(rev: { count: bigint; updatedAt?: { seconds: bigint; nanos: number } } | undefined) {
  if (!rev) return "";
  return `${rev.count}:${rev.updatedAt?.seconds ?? 0}.${rev.updatedAt?.nanos ?? 0}`;
}

/**
 * 서버 카탈로그를 로컬 저장소에 맞춘다.
 *
 * 네트워크가 없으면 **조용히 포기한다** — 로컬에 이미 카탈로그가 있으면 그대로 쓰면 되고,
 * 없더라도 화면이 오류로 죽는 것보다 빈 목록에서 다시 시도하는 편이 낫다.
 */
export async function syncCatalogToLocal(): Promise<CatalogSyncResult> {
  // 로컬 저장소는 브라우저에만 있다 — 서버 렌더 시점에 끌어오지 않도록 동적 import.
  const { database } = await import("@app/core/db");
  const { Exercise } = await import("@app/core/db/models/index");
  const collection = database.get("exercises");

  const localCount = await collection.query().fetchCount();

  let first: Awaited<ReturnType<ReturnType<typeof api>["pullCatalog"]>>;
  try {
    // 첫 페이지를 1건만 받아 개정 번호부터 본다 — 바뀌지 않았으면 336종을 헛되이 받지 않는다.
    first = await api().pullCatalog({ limit: 1 });
  } catch {
    return { status: "offline", count: localCount };
  }

  const serverRev = revisionKey(first.revision);
  const knownRev = typeof localStorage !== "undefined" ? localStorage.getItem(REVISION_KEY) : null;
  const serverCount = Number(first.revision?.count ?? 0);

  // 개정 번호가 같아도 **로컬이 서버보다 적으면** 다시 받는다.
  // 받다가 끊겼거나 저장이 덜 내려간 경우가 있어서다 — 그때 개정 번호만 믿으면 반쪽 카탈로그가
  // 영원히 고쳐지지 않는다(실측: 개정은 339인데 로컬은 337이었다).
  // 로컬이 더 많은 것은 정상이다 — 사용자가 만든 커스텀 종목은 서버 카탈로그에 없다.
  if (serverRev && serverRev === knownRev && localCount >= serverCount && localCount > 0) {
    return { status: "up-to-date", count: localCount };
  }

  // ── 전량 받기 ──
  const items: ContractExercise[] = [];
  let cursor = "";
  for (;;) {
    const page = await api().pullCatalog({ cursor, limit: PAGE });
    items.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  // ── 로컬에 반영 ──
  // 이미 있는 종목은 갱신하고 없는 것만 만든다. **커스텀 종목은 건드리지 않는다** —
  // 서버 카탈로그에 없는 행이라고 지우면 사용자가 만든 종목이 사라진다.
  const existing = await collection.query().fetch();
  const byId = new Map(existing.map((e) => [e.id, e]));

  const ops: unknown[] = [];
  let written = 0;

  for (const it of items) {
    const apply = (rec: Record<string, unknown>) => {
      rec.nameKo = it.nameKo;
      rec.nameEn = it.nameEn || null;
      rec.primaryMuscles = toMuscles(it.primaryMuscles);
      rec.secondaryMuscles = toMuscles(it.secondaryMuscles);
      rec.equipment = EQUIPMENT_KEY[it.equipment] ?? "other";
      rec.kind = toDomainKind(it.kind);
      rec.loadMode = toDomainLoadMode(it.loadMode);
      rec.substituteIds = it.substituteIds;
      rec.imageUrl = it.imageUrl || null;
      rec.isCustom = it.isCustom;
      rec.isArchived = false;
    };

    const found = byId.get(it.id);
    if (found) {
      ops.push(found.prepareUpdate((rec) => apply(rec as unknown as Record<string, unknown>)));
    } else {
      ops.push(
        collection.prepareCreate((rec) => {
          // 서버가 준 id를 그대로 쓴다 — 시드 종목은 `seed-<슬러그>` 결정적 id라
          // app의 로컬 DB와 같은 행을 가리킨다(나중에 기록을 이을 때 갈라지지 않는다).
          (rec._raw as unknown as { id: string }).id = it.id;
          apply(rec as unknown as Record<string, unknown>);
        }),
      );
    }
    written++;
  }

  if (ops.length > 0) {
    await database.write(async () => {
      await database.batch(...(ops as Parameters<typeof database.batch>));
    });
  }

  // 받은 것을 **디스크까지** 내려쓴다. 여기서 안 하면 곧바로 새로고침했을 때 되돌아간다
  // (LokiJS는 메모리에 쓰고 주기적으로 내려쓴다 — 실측으로 로컬이 0종이 됐다).
  const { flushLocalDb } = await import("@/lib/localDb");
  await flushLocalDb();

  if (typeof localStorage !== "undefined" && serverRev) localStorage.setItem(REVISION_KEY, serverRev);

  void Exercise; // 모델 클래스를 번들에 남긴다(컬렉션이 이름으로 찾으므로 트리셰이킹 방지)
  return { status: "synced", count: await collection.query().fetchCount(), written };
}
