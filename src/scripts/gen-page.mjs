// @plm SRS-006  화면 제너레이터 — 앱 셸 convention을 지킨 화면을 한 번에 만든다
//
// ─────────────────────────────────────────────────────────────────────────────
// 사용:  make gen-page NAME=posts [MODULE=posts]      MODULE은 api의 경로 세그먼트(복수형)
//
// 만드는 것 — 전부 **web 안**이다(ADR-010: 화면은 web, 도메인은 api):
//   frontend/app/<name>/page.tsx           RSC — 서버에서 api를 직접 호출해 초기 데이터를 확정
//   frontend/app/<name>/loading.tsx        Suspense 경계(셸이 소유하는 로딩 convention 그대로)
//   frontend/app/<name>/error.tsx          에러 바운더리 — 사용자 문구로 치환, 스택은 로그로만
//   frontend/app/<name>/<Name>Client.tsx   상호작용이 필요한 부분만 클라이언트로
//
// MODULE을 주면 그 도메인의 목록 화면을(api의 `/api/<MODULE>` 호출), 없으면 빈 화면을 만든다.
// 도메인 자체는 `make gen NAME=<단수형>` 이 api 쪽에 만든다 — 이 스크립트는 화면만 만든다.
//
// 지키는 convention(문서가 아니라 코드로):
//   · 서버 데이터를 전역 스토어에 넣지 않는다 — 첫 값은 RSC props, 이후 변화만 클라이언트가 관리
//   · 서버(RSC)는 api를 직접 부르고(apiFetch), 브라우저는 상대 경로로 web의 프록시를 부른다
//   · 상태 3종은 components/States를 쓴다(화면마다 다시 만들지 않는다)
//   · 색은 --color-* 토큰만, testid를 붙여 e2e가 잡을 수 있게
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const WEB = "frontend";
const raw = (process.argv[2] ?? "").trim().toLowerCase();
const moduleName = (process.argv[3] ?? process.env.MODULE ?? "").trim().toLowerCase();

if (!/^[a-z][a-z0-9-]*$/.test(raw)) {
  console.error("이름은 소문자·숫자·하이픈만.  예: make gen-page NAME=posts MODULE=posts");
  process.exit(1);
}
const Name = raw
  .split("-")
  .map((p) => p[0].toUpperCase() + p.slice(1))
  .join("");
// MODULE은 **services의 키 그대로** 받는다 — 레퍼런스는 `exercise`, gen이 만든 모듈은 `posts`처럼 복수다.
const plural = moduleName;
const made = [];

function write(rel, body) {
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    console.log(`    · 건너뜀: ${rel} (이미 있음)`);
    return;
  }
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  made.push(rel);
}

// ── page.tsx (RSC) ──────────────────────────────────────────────────────────
const pageBody = moduleName
  ? [
      `  // 서버에서는 프록시를 거치지 않고 api를 직접 부른다 — 왕복 한 번이 짧다.`,
      `  const { items, nextCursor } = await apiFetch<List>(\`/api/${plural}?limit=20\`);`,
      `  return (`,
      `    <${Name}Client`,
      `      // 목록에 더 보여줄 필드가 있으면 여기서 함께 넘긴다(직렬화 가능한 형태로).`,
      `      initialItems={items.map((i) => ({ name: i.name }))}`,
      `      initialCursor={nextCursor}`,
      `    />`,
      `  );`,
    ].join("\n")
  : `  return <${Name}Client />;`;

write(
  `${WEB}/app/${raw}/page.tsx`,
  [
    `// @plm SRS-006  ${Name} 화면 — RSC가 초기 데이터를 확정해 클라이언트에 넘긴다`,
    `//`,
    `// 데이터 패턴: 여기(서버)에서 api를 직접 호출하고 직렬화 가능한 형태로 props에 담는다.`,
    `// 자기 프록시(/api/*)를 자기 서버에 fetch 하지 않는다 — 왕복 한 번이 통째로 낭비다.`,
    moduleName ? `import { apiFetch } from "@/lib/api";` : null,
    `import ${Name}Client from "./${Name}Client";`,
    ``,
    `export const dynamic = "force-dynamic";`,
    ``,
    moduleName ? `/** api가 주는 목록 모양. 여러 화면이 함께 쓰게 되면 contracts로 올린다. */` : null,
    moduleName ? `type List = { items: { name: string }[]; nextCursor: string | null };` : null,
    moduleName ? `` : null,
    `export default async function Page() {`,
    pageBody,
    `}`,
    ``,
  ]
    .filter((l) => l !== null)
    .join("\n"),
);

// ── loading.tsx ─────────────────────────────────────────────────────────────
write(
  `${WEB}/app/${raw}/loading.tsx`,
  [
    `// @plm SRS-007  로딩 — 셸의 Suspense 경계가 이 파일을 쓴다(화면마다 스피너를 만들지 않는다)`,
    `import { Loading } from "../components/States";`,
    ``,
    `export default function LoadingPage() {`,
    `  return <Loading label="${Name} 불러오는 중" />;`,
    `}`,
    ``,
  ].join("\n"),
);

// ── error.tsx ───────────────────────────────────────────────────────────────
write(
  `${WEB}/app/${raw}/error.tsx`,
  [
    `"use client";`,
    `// @plm SRS-007  오류 경계 — 사용자에게는 문구를, 개발자에게는 로그를`,
    `import { ErrorState } from "../components/States";`,
    ``,
    `export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {`,
    `  // 스택은 화면에 노출하지 않는다. 서버 로그의 x-request-id로 추적한다.`,
    `  return <ErrorState message={error.message} onRetry={reset} />;`,
    `}`,
    ``,
  ].join("\n"),
);

// ── <Name>Client.tsx ────────────────────────────────────────────────────────
const clientListBody = [
  `/** 목록 항목 — 필요한 필드를 여기와 page.tsx에서 함께 넓힌다. */`,
  `type Item = { name: string };`,
  ``,
  `export default function ${Name}Client({`,
  `  initialItems,`,
  `  initialCursor,`,
  `}: {`,
  `  initialItems: Item[];`,
  `  initialCursor: string | null;`,
  `}) {`,
  `  // 첫 값은 서버가 줬다. 여기서는 그 뒤의 변화만 관리한다(전역 스토어를 쓰지 않는 이유).`,
  `  const [items, setItems] = useState<Item[]>(initialItems);`,
  `  const [cursor, setCursor] = useState<string | null>(initialCursor);`,
  `  const [busy, setBusy] = useState(false);`,
  `  const [err, setErr] = useState<string | null>(null);`,
  `  const toast = useToast();`,
  ``,
  `  async function loadMore() {`,
  `    if (!cursor) return;`,
  `    setBusy(true);`,
  `    try {`,
  "      const r = await fetch(`/api/" + plural + '?cursor=${cursor}&limit=20`, { cache: "no-store" });',
  "      if (!r.ok) throw new Error((await r.json()).detail ?? `HTTP ${r.status}`);",
  `      const j = await r.json();`,
  `      setItems((prev) => [...prev, ...j.items]);`,
  `      setCursor(j.nextCursor);`,
  `    } catch (e) {`,
  `      const detail = String(e instanceof Error ? e.message : e);`,
  `      setErr(detail);`,
  `      toast(detail, "error");`,
  `    } finally {`,
  `      setBusy(false);`,
  `    }`,
  `  }`,
  ``,
  `  if (err) return <ErrorState message={err} onRetry={() => setErr(null)} />;`,
  `  if (items.length === 0) return <Empty title="아직 없습니다" hint="첫 항목을 만들어 보세요" />;`,
  ``,
  `  return (`,
  `    <section className="rounded-xl border border-(--color-line) bg-(--color-card) p-4">`,
  `      <p className="mb-3 text-xs font-semibold text-(--color-ink3)">`,
  `        ${Name} ({items.length})`,
  `      </p>`,
  `      <ul data-testid="${raw}-list" className="divide-y divide-(--color-line)">`,
  `        {items.map((i) => (`,
  `          <li key={i.name} className="flex items-center justify-between py-2 text-sm">`,
  `            <span>{i.name}</span>`,
  `          </li>`,
  `        ))}`,
  `      </ul>`,
  `      {cursor ? (`,
  `        <button`,
  `          type="button"`,
  `          data-testid="${raw}-more"`,
  `          disabled={busy}`,
  `          onClick={loadMore}`,
  `          className="mt-3 rounded-lg border border-(--color-line) px-3 py-2 text-sm disabled:opacity-50"`,
  `        >`,
  `          더 보기`,
  `        </button>`,
  `      ) : null}`,
  `    </section>`,
  `  );`,
  `}`,
].join("\n");

const clientEmptyBody = [
  `export default function ${Name}Client() {`,
  `  const toast = useToast();`,
  ``,
  `  // 데이터가 붙기 전의 자리. services 호출은 page.tsx(서버)에서 하고 결과를 props로 받는다.`,
  `  return (`,
  `    <section className="rounded-xl border border-(--color-line) bg-(--color-card) p-4">`,
  `      <p data-testid="${raw}-title" className="font-semibold">`,
  `        ${Name}`,
  `      </p>`,
  `      <p className="mt-2 text-sm text-(--color-ink2)">`,
  `        빈 화면입니다. page.tsx에서 services를 호출해 props로 내려보내세요.`,
  `      </p>`,
  `      <button`,
  `        type="button"`,
  `        data-testid="${raw}-action"`,
  `        onClick={() => toast("여기에 동작을 붙이세요")}`,
  `        className="mt-4 rounded-lg bg-(--color-brand) px-4 py-2 text-sm font-semibold text-white"`,
  `      >`,
  `        눌러보기`,
  `      </button>`,
  `    </section>`,
  `  );`,
  `}`,
].join("\n");

write(
  `${WEB}/app/${raw}/${Name}Client.tsx`,
  [
    `"use client";`,
    `// @plm SRS-006  ${Name} 상호작용 — 서버 데이터를 화면 상태로 받아 유지한다`,
    `//`,
    `// 규칙(이 템플릿의 R2): 서버에서 온 데이터를 **전역 스토어에 넣지 않는다.**`,
    `// 첫 값은 서버가 props로 주고, 이후 변화만 여기서 관리한다.`,
    moduleName ? `import { useState } from "react";` : null,
    moduleName ? `import { Empty, ErrorState } from "../components/States";` : null,
    `import { useToast } from "../components/Toast";`,
    ``,
    moduleName ? clientListBody : clientEmptyBody,
    ``,
  ]
    .filter((l) => l !== null)
    .join("\n"),
);

// 생성물이 곧바로 lint·format을 통과해야 한다 — 사람이 손보게 만들면 convention이 흐려진다.
if (made.length) {
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync("bunx", ["biome", "check", "--write", `${WEB}/app/${raw}`], { cwd: root, stdio: "ignore" });
  } catch {
    console.log("    (자동 포맷 건너뜀 — bunx biome를 찾지 못했습니다)");
  }
}

console.log(`\n  ${Name} 화면 생성`);
for (const f of made) console.log(`    + ${f}`);
console.log(`
  다음 순서:
    1) 앱 셸 내비에 링크를 추가한다(frontend/app/layout.tsx)
    2) make dev 로 확인 — /${raw}
    3) e2e를 붙인다면 testid(${moduleName ? `${raw}-list, ${raw}-more` : `${raw}-title, ${raw}-action`})를 쓰세요
`);
