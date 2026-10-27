// @plm SRS-081  가져오기 파일 → 파싱 결과(형식 자동 판별). Worker·메인 스레드가 같은 함수를 부른다.
import { parseCsv } from './csv';
import { emptyResult, type ParseResult } from './common';
import { isHevyHeader, parseHevy } from './formats/hevy';
import { isStrongHeader, parseStrong } from './formats/strong';

/** 텍스트(UTF-8 로 읽은 파일 내용) → 파싱 결과. 원본 내용은 결과에 싣지 않는다(이름·숫자·메모만 구조로). */
export function parseImportFile(text: string): ParseResult {
  const csv = parseCsv(text);
  if (csv.rows.length === 0) return emptyResult('empty');
  const header = csv.rows[0].cells;
  let res: ParseResult;
  if (isHevyHeader(header)) res = parseHevy(csv.rows);
  else if (isStrongHeader(header)) res = parseStrong(csv.rows, csv.delimiter);
  else return emptyResult('unknown_format');
  if (csv.unterminatedQuoteLine != null) res.issues.push({ line: csv.unterminatedQuoteLine, reason: 'unterminated_quote' });
  if (res.fatal == null && res.rowCount === 0) return { ...res, fatal: 'empty' };
  return res;
}

/** 파싱 결과 안의 서로 다른 종목 이름(처음 나온 순서) — 종목 맞추기 단계의 입력 */
export function distinctExerciseNames(res: ParseResult): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of res.workouts)
    for (const e of w.exercises)
      if (!seen.has(e.name)) {
        seen.add(e.name);
        out.push(e.name);
      }
  return out;
}
