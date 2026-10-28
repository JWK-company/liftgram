// @plm SRS-092  크리에이터 루틴 큐레이션 보조 — 공식 YouTube Data API(videos.list · part=snippet)로 영상 제목·채널·설명란을 읽어 출력한다.
//
// 쓰는 법: YOUTUBE_API_KEY=… node scripts/youtube-describe.mjs <videoId> [videoId…]   (src/.env 에 두면 bun 이 읽는다)
// 앱 런타임은 이 스크립트를 쓰지 않는다 — 사람이 읽고 루틴을 정리하는 데만 쓴다. 영상·음성·자막은 내려받지 않는다(ADR-045).
// 호출 1번 = 할당량 1 단위(하루 기본 10,000).
const key = process.env.YOUTUBE_API_KEY;
const ids = process.argv.slice(2);
if (!key || !ids.length) {
  console.error("YOUTUBE_API_KEY 와 videoId 를 주세요");
  process.exit(1);
}
const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.map(encodeURIComponent).join(",")}&key=${encodeURIComponent(key)}`;
const res = await fetch(url);
if (!res.ok) {
  console.error(`Data API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const body = await res.json();
for (const v of body.items ?? []) {
  const s = v.snippet;
  console.log(`\n=== ${v.id} · ${s.channelTitle} · ${s.title}`);
  console.log(`게시 ${s.publishedAt?.slice(0, 10)} · https://www.youtube.com/watch?v=${v.id}`);
  console.log(s.description);
}
const found = new Set((body.items ?? []).map((v) => v.id));
for (const id of ids) if (!found.has(id)) console.log(`\n=== ${id} · 찾지 못함(삭제·비공개?)`);
