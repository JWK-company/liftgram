// v26: 다른 앱(Strong·Hevy) 기록 가져오기 묶음 — 묶음 단위로 되돌린다(ADR-043 · SRS-082). 계정과 함께 동기된다. @plm SRS-081 SRS-082
// 원래 파일 이름은 저장하지 않는다 — 표시용 40자 라벨만(D-16).
// status 로 「끝나지 않은 묶음」을 부팅 때 알아보고 정리한다(D-6): 쓰기 시작에 writing, 끝에 done.
import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';

export type ImportSource = 'strong' | 'hevy';
/** null 은 done 으로 읽는다(D-6). */
export type ImportBatchStatus = 'writing' | 'done' | 'undone';

export default class ImportBatch extends Model {
  static table = 'import_batches';

  @field('source') declare source: ImportSource | null;
  @text('file_label') declare fileLabel: string | null; // 표시용 40자 이하
  @field('workout_count') declare workoutCount: number | null;
  @field('set_count') declare setCount: number | null;
  @field('status') declare status: ImportBatchStatus | null; // null = done
  @field('undone_at') declare undoneAt: number | null;
  @field('weight_unit') declare weightUnit: 'kg' | 'lb' | null; // 가져올 때 고른 단위(같은 해석 재현)
  @field('tz_offset_min') declare tzOffsetMin: number | null; // 가져올 때 해석한 시간대(D-7)
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;
}
