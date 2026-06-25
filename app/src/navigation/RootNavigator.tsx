import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { colors } from '../theme';
import { TabNavigator } from './TabNavigator';
import ExerciseListScreen from '../features/exercises/ExerciseListScreen';
import ExerciseDetailScreen from '../features/exercises/ExerciseDetailScreen';
import ExerciseFormScreen from '../features/exercises/ExerciseFormScreen';
import RoutineEditorScreen from '../features/routines/RoutineEditorScreen';
import ActiveWorkoutScreen from '../features/session/ActiveWorkoutScreen';
import WorkoutSummaryScreen from '../features/session/WorkoutSummaryScreen';
import WorkoutDetailScreen from '../features/analytics/WorkoutDetailScreen';
import AuthScreen from '../features/profile/AuthScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} options={{ title: '운동 선택', presentation: 'modal' }} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={{ title: '운동 상세' }} />
      <Stack.Screen name="ExerciseForm" component={ExerciseFormScreen} options={{ title: '커스텀 운동', presentation: 'modal' }} />
      <Stack.Screen name="RoutineEditor" component={RoutineEditorScreen} options={{ title: '루틴' }} />
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: '세션 상세' }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: '로그인', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
