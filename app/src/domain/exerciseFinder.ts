// @plm SRS-031  종목 찾기 도우미(스무고개) 큐레이션 트리 — 부위별 '동작/자세' 세부 질문으로 종목을 좁힌다.
// 근육군·기구만으론 초보의 '내가 뭘 했는지' 문제를 못 풀어(같은 부위라도 밀기/당기기/스쿼트/힌지가 다름),
// 부위 아래 한 단계 '동작/자세' 질문을 큐레이션한다. 스키마 변경 없이 코드 데이터로 분류(성능·유지보수 단순).
import type { EquipmentType, MuscleGroup } from './types';

export interface FinderOption {
  key: string;
  labelKo: string;
  labelEn: string;
  names: string[]; // 이 동작/자세에 해당하는 종목(nameKo) — ExerciseListScreen이 이 집합으로 목록을 좁힌다.
}

// 부위별 '동작/자세' 세부 질문. 있으면 위저드 2단계에서 이걸 묻고 names로 좁힌다.
// 없는 부위(이두·전완·승모·전신)는 동작이 균일하므로 대신 기구로 좁힌다.
export const FINDER_TREE: Partial<Record<MuscleGroup, FinderOption[]>> = {
  chest: [
    { key: 'flat', labelKo: '평평하게 밀기', labelEn: 'Flat press', names: ['바벨 벤치프레스', '덤벨 벤치프레스', '체스트 프레스 머신', '스미스 벤치프레스', '푸시업'] },
    { key: 'incline', labelKo: '위로 기울여 밀기(인클라인)', labelEn: 'Incline press', names: ['인클라인 프레스', '인클라인 푸시업'] },
    { key: 'decline', labelKo: '아래로 밀기(디클라인·딥스)', labelEn: 'Decline / dips', names: ['디클라인 바벨 프레스', '디클라인 덤벨 프레스', '딥스'] },
    { key: 'fly', labelKo: '모으기(플라이)', labelEn: 'Fly / squeeze', names: ['덤벨 플라이', '인클라인 덤벨 플라이', '케이블 크로스오버', '로우 케이블 플라이', '펙 덱 플라이'] },
  ],
  back: [
    { key: 'vertical', labelKo: '위에서 아래로 당기기(풀업·랫풀다운)', labelEn: 'Vertical pull', names: ['랫 풀다운', '클로즈그립 풀다운', '풀업', '친업', '어시스트 풀업', '원암 랫풀다운'] },
    { key: 'row', labelKo: '앞으로 당기기(로우)', labelEn: 'Row', names: ['바벨 로우', '펜들레이 로우', '티바 로우', '덤벨 로우', '시티드 케이블 로우', '머신 로우', '하이 로우', '로우 로우', '체스트 서포티드 로우', '인버티드 로우'] },
    { key: 'deadlift', labelKo: '바닥에서 들기(데드리프트·힌지)', labelEn: 'Deadlift / hinge', names: ['데드리프트', '스모 데드리프트', '랙 풀', '굿모닝', '하이퍼익스텐션'] },
    { key: 'pullover', labelKo: '팔 펴서 당기기(풀오버)', labelEn: 'Pullover', names: ['덤벨 풀오버', '스트레이트암 풀다운'] },
  ],
  shoulders: [
    { key: 'press', labelKo: '위로 밀기(프레스)', labelEn: 'Press', names: ['오버헤드 프레스', '밀리터리 프레스', '덤벨 숄더 프레스', '아놀드 프레스', '숄더 프레스 머신', '랜드마인 프레스'] },
    { key: 'lateral', labelKo: '옆으로 들기(레터럴)', labelEn: 'Lateral raise', names: ['덤벨 레터럴 레이즈', '케이블 레터럴 레이즈', '머신 레터럴 레이즈', '업라이트 로우'] },
    { key: 'front', labelKo: '앞으로 들기(프론트)', labelEn: 'Front raise', names: ['프론트 레이즈'] },
    { key: 'rear', labelKo: '뒤쪽 어깨(리어 델트)', labelEn: 'Rear delt', names: ['덤벨 리어 델트 플라이', '리버스 펙 덱', '페이스 풀', '케이블 리어 델트 플라이'] },
  ],
  triceps: [
    { key: 'press', labelKo: '미는 동작(프레스·딥)', labelEn: 'Press / dip', names: ['클로즈 그립 벤치프레스', '벤치 딥스', '다이아몬드 푸시업', 'JM 프레스', '딥 머신', '어시스트 딥스'] },
    { key: 'extension', labelKo: '펴는 동작(익스텐션·푸시다운)', labelEn: 'Extension', names: ['트라이셉스 푸시다운', '로프 푸시다운', '오버헤드 트라이셉스 익스텐션', '케이블 오버헤드 익스텐션', '스컬 크러셔', '트라이셉스 킥백'] },
  ],
  quads: [
    { key: 'squat', labelKo: '앉았다 일어서기(스쿼트)', labelEn: 'Squat', names: ['바벨 스쿼트', '프론트 스쿼트', '하이바 스쿼트', '핵 스쿼트', '고블릿 스쿼트', '스미스 스쿼트', '시시 스쿼트', '펜듈럼 스쿼트', '벨트 스쿼트'] },
    { key: 'lunge', labelKo: '한 다리씩(런지·스텝업)', labelEn: 'Lunge / step-up', names: ['런지', '워킹 런지', '불가리안 스플릿 스쿼트', '스텝업'] },
    { key: 'press', labelKo: '밀기(레그 프레스)', labelEn: 'Leg press', names: ['레그 프레스'] },
    { key: 'extension', labelKo: '무릎 펴기(레그 익스텐션)', labelEn: 'Leg extension', names: ['레그 익스텐션'] },
  ],
  hamstrings: [
    { key: 'hinge', labelKo: '엉덩이 접기(데드리프트류)', labelEn: 'Hip hinge', names: ['루마니안 데드리프트', '스티프 레그 데드리프트'] },
    { key: 'curl', labelKo: '무릎 굽히기(레그 컬)', labelEn: 'Leg curl', names: ['라잉 레그 컬', '시티드 레그 컬', '레그 컬', '노르딕 컬'] },
  ],
  glutes: [
    { key: 'thrust', labelKo: '밀어올리기(힙 쓰러스트·브릿지)', labelEn: 'Thrust / bridge', names: ['힙 쓰러스트', '글루트 브릿지', '스미스 힙 쓰러스트'] },
    { key: 'abduction', labelKo: '다리 벌리기/모으기', labelEn: 'Abduction', names: ['힙 어브덕션 머신', '힙 어덕션 머신', '케이블 킥백'] },
    { key: 'swing', labelKo: '스윙', labelEn: 'Swing', names: ['케틀벨 스윙'] },
  ],
  calves: [
    { key: 'standing', labelKo: '서서(스탠딩)', labelEn: 'Standing', names: ['스탠딩 카프 레이즈', '레그 프레스 카프 레이즈', '덤벨 카프 레이즈'] },
    { key: 'seated', labelKo: '앉아서(시티드)', labelEn: 'Seated', names: ['시티드 카프 레이즈'] },
  ],
  abs: [
    { key: 'crunch', labelKo: '윗몸 말기(크런치)', labelEn: 'Crunch', names: ['크런치', '케이블 크런치', '디클라인 싯업', '앱 크런치 머신', '바이시클 크런치'] },
    { key: 'legraise', labelKo: '다리 들기(레그 레이즈)', labelEn: 'Leg raise', names: ['행잉 레그 레이즈', '리버스 크런치', '라잉 레그 레이즈'] },
    { key: 'twist', labelKo: '몸통 비틀기(트위스트)', labelEn: 'Rotation', names: ['러시안 트위스트', '케이블 우드촙'] },
    { key: 'plank', labelKo: '버티기(플랭크)', labelEn: 'Plank / hold', names: ['플랭크', '사이드 플랭크', '앱 휠 롤아웃', '마운틴 클라이머'] },
  ],
};

// 동작 세부질문이 없는 부위(이두·전완·승모·전신)에서 쓰는 기구 옵션. 흔한 것만.
export const FINDER_EQUIPMENTS: EquipmentType[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

export function muscleSubgroups(m: MuscleGroup): FinderOption[] | null {
  return FINDER_TREE[m] ?? null;
}
