// @plm SRS-090  오픈소스 고지 — MIT 리소스의 저작권·허락 고지를 앱 안에 함께 둔다(ADR-044)
import type { Metadata } from "next";
import { LegalPage } from "../components/legal/LegalPage";

export const metadata: Metadata = { title: "오픈소스 고지 · Liftgram" };

const MUSCLEMAP_MIT = `MIT License

Copyright (c) 2026 Melih Colpan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export default function LicensesPage() {
  return (
    <LegalPage title="오픈소스 고지" effective="2026년 10월 28일">
      <p>Liftgram 은 아래 오픈소스 리소스를 써서 만들었습니다.</p>

      <h2>근육 지도 그림 — MuscleMap</h2>
      <p>
        통계·요약·루틴 카드의 근육 그림은{" "}
        <a className="underline" href="https://github.com/melihcolpan/MuscleMap" rel="noopener noreferrer">
          MuscleMap
        </a>{" "}
        (Melih Colpan)의 경로 데이터를 바탕으로 했습니다. 세부 구역을 빼고 앱의 근육 구역에 맞춰 묶은 것
        말고는 그림을 바꾸지 않았습니다.
      </p>
      <pre
        data-testid="license-musclemap"
        className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-(--color-surface-alt) p-[var(--spacing-md)] font-mono text-xs text-(--color-ink2)"
      >
        {MUSCLEMAP_MIT}
      </pre>

      <h2>종목 사진 — free-exercise-db</h2>
      <p>
        일부 종목 상세의 사진은{" "}
        <a className="underline" href="https://github.com/yuhonas/free-exercise-db" rel="noopener noreferrer">
          free-exercise-db
        </a>{" "}
        의 퍼블릭 도메인(Unlicense) 자료입니다.
      </p>
    </LegalPage>
  );
}
