import Link from "next/link";

export default function NotFound() {
  return (
    <main data-testid="not-found" className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">없는 주소입니다</h1>
      <p className="text-muted">주소를 확인하거나 요약 화면으로 돌아가세요.</p>
      <Link className="underline" href="/">
        요약으로
      </Link>
    </main>
  );
}
