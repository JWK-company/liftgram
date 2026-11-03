// SPEC-018 §8  바꾸기·재설치 1단계 「서버에 올라간 기록 N개」 — 이 기기의 끝난 운동 수
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Workout } from '../db/models';

export async function countFinishedWorkouts(): Promise<number> {
  return database.get<Workout>('workouts').query(Q.where('state', 'completed')).fetchCount();
}
