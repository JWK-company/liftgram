// @plm SRS-081  CSV 읽기 — RFC 4180(따옴표·"" 이스케이프·따옴표 안 줄바꿈) · BOM · CRLF/LF/CR · 구분자 자동(`,`·`;`).
// 원본 내용은 어디에도 남기지 않는다 — 오류는 줄 번호와 이유만(SAD-025 제약).

export type CsvDelimiter = ',' | ';';

export interface CsvRow {
  /** 원본 파일의 줄 번호(1부터 · 행이 시작한 줄) — 깨진 행 안내용 */
  line: number;
  cells: string[];
}

export interface CsvParseResult {
  delimiter: CsvDelimiter;
  rows: CsvRow[];
  /** 마지막 따옴표가 닫히지 않았다(파일이 잘렸다) — 그 행은 rows 에 넣지 않는다 */
  unterminatedQuoteLine: number | null;
}

/** 첫 줄(따옴표 밖)에서 `;` 가 `,` 보다 많으면 세미콜론 파일로 본다. */
export function detectDelimiter(text: string): CsvDelimiter {
  let commas = 0;
  let semis = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === '\n' || ch === '\r') break;
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
    }
  }
  return semis > commas ? ';' : ',';
}

/** BOM 을 떼고 구분자를 정해 행으로 나눈다. 빈 줄(셀 하나가 빈 문자열)은 건너뛴다. */
export function parseCsv(input: string, opts: { delimiter?: CsvDelimiter } = {}): CsvParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = opts.delimiter ?? detectDelimiter(text);
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuote = false;
  let line = 1;
  let rowLine = 1;
  let quoteStartLine = 0;

  const endRow = () => {
    cells.push(cell);
    if (!(cells.length === 1 && cells[0].trim() === '')) rows.push({ line: rowLine, cells });
    cells = [];
    cell = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuote = false;
      } else {
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      quoteStartLine = line;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else cell += ch;
  }
  if (inQuote) return { delimiter, rows, unterminatedQuoteLine: quoteStartLine };
  if (cell !== '' || cells.length > 0) endRow();
  return { delimiter, rows, unterminatedQuoteLine: null };
}
