// v26: 가져오기 종목 별칭 — 다른 앱의 종목 이름 → 우리 종목(사람이 한 번 맞춘 것을 다음 가져오기가 다시 쓴다). @plm SRS-081
// 레코드 id 는 결정적 `ia-<source>-<sha16(정규화 이름)>` — 여러 기기가 같은 행을 가리킨다(ExerciseUserPref 와 같은 원칙).
// id 를 만드는 해시·정규화는 P5 domain/import 가 소유한다(여기서는 형식만 적는다).
// 가리키는 종목이 없어진 별칭은 무시한다(D-9 — match.ts).
import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';

export default class ImportAlias extends Model {
  static table = 'import_aliases';

  @field('source') declare source: string | null; // 'strong'|'hevy'
  @text('source_name') declare sourceName: string | null; // 원본 종목 이름(표시·디버깅용)
  @field('exercise_id') declare exerciseId: string | null;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;
}
