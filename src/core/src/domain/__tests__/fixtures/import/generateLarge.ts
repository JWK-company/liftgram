// @plm SRS-082  큰 시험 파일 생성기 — Strong 쉼표 형식, 값은 전부 지어낸 것(결정적 — 같은 인자면 같은 파일).
// 기본: 운동 1000개 × 종목 5 × 세트 2 = 1만 세트. 하루 한 번(2023-01-01 부터), 무게는 순번으로 만든다.

const NAMES = ['Bench Press (Barbell)', 'Squat (Barbell)', 'Deadlift (Barbell)', 'Lat Pulldown (Cable)', 'Bicep Curl (Dumbbell)'];

export interface LargeFile {
  text: string;
  workouts: number;
  sets: number;
  /** 작업 세트(전부 일반 세트) 볼륨 합 — kg 로 읽었을 때 */
  volume: number;
}

export function generateLargeStrongCsv(opts: { workouts?: number; exercisesPer?: number; setsPer?: number } = {}): LargeFile {
  const workouts = opts.workouts ?? 1000;
  const exercisesPer = opts.exercisesPer ?? 5;
  const setsPer = opts.setsPer ?? 2;
  const lines = ['Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'];
  let volume = 0;
  let sets = 0;
  const day0 = Date.UTC(2023, 0, 1);
  for (let w = 0; w < workouts; w++) {
    const d = new Date(day0 + w * 86_400_000);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} 18:${String(w % 60).padStart(2, '0')}:00`;
    for (let e = 0; e < exercisesPer; e++) {
      for (let s = 0; s < setsPer; s++) {
        const weight = 20 + ((w + e * 7 + s) % 80);
        const reps = 5 + ((w + s) % 6);
        volume += weight * reps;
        sets++;
        lines.push(`${date},"Session ${w + 1}",1h 2m,"${NAMES[e % NAMES.length]}",${s + 1},${weight},${reps},,0,,,`);
      }
    }
  }
  return { text: `${lines.join('\n')}\n`, workouts, sets, volume };
}
