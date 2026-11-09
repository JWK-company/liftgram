// 크리에이터 루틴·운동 팁 큐레이션 보조 — 공식 YouTube Data API(search.list · type=video)로 후보 영상의 id·채널·제목만 출력한다(SPEC-047).
//
// 쓰는 법: YOUTUBE_API_KEY=… node scripts/youtube-search.mjs "<검색어>" [개수(기본 10, 최대 50)]
// 앱 런타임은 이 스크립트를 쓰지 않는다 — 사람이 후보를 고르는 데만 쓴다. 영상·음성·자막은 내려받지 않는다(ADR-045).
// 호출 1번 = 할당량 100 단위(하루 기본 10,000) — 고른 후보의 설명란은 scripts/youtube-describe.mjs(1 단위)로 읽는다.
const key = process.env.YOUTUBE_API_KEY;
const q = process.argv[2];
const n = Math.min(50, Math.max(1, Number(process.argv[3] ?? 10) || 10));
if (!key || !q) {
  console.error("YOUTUBE_API_KEY 와 검색어를 주세요");
  process.exit(1);
}
const url =
  "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video" +
  `&maxResults=${n}&relevanceLanguage=ko&regionCode=KR&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
const res = await fetch(url);
if (!res.ok) {
  // 오류 본문에 키가 섞여 나오지 않게 가린다(코드 리뷰 REV-089)
  console.error(`Data API ${res.status}: ${(await res.text()).slice(0, 300).replaceAll(key, "***")}`);
  process.exit(1);
}
const body = await res.json();
const decodeHtml = (s) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
for (const it of body.items ?? []) {
  console.log(`${it.id.videoId} | ${decodeHtml(it.snippet.channelTitle)} | ${decodeHtml(it.snippet.title)}`);
}
