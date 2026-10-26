// @plm SRS-054  화면 이동 한 곳 — 클라이언트 이동(문서를 새로 받지 않는다)을 코드에서도 쓰게
//
// 셸의 LinkInterceptor 가 Next 라우터를 여기 꽂아 둔다. 꽂히기 전(아주 이른 순간)이나 라우터가 없는 곳에서는
// 예전처럼 문서 이동으로 떨어진다 — 이동 자체가 막히는 일은 없다.
type Router = { push: (href: string) => void; replace: (href: string) => void };
let router: Router | null = null;

export function setNavRouter(r: Router | null): void {
  router = r;
}

export function navigate(href: string, opts?: { replace?: boolean }): void {
  if (router) {
    if (opts?.replace) router.replace(href);
    else router.push(href);
    return;
  }
  if (opts?.replace) location.replace(href);
  else location.href = href;
}
