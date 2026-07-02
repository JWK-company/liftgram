import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { colors } from '../theme';
import { TabNavigator } from './TabNavigator';
import ExerciseListScreen from '../features/exercises/ExerciseListScreen';
import ExerciseDetailScreen from '../features/exercises/ExerciseDetailScreen';
import ExerciseFormScreen from '../features/exercises/ExerciseFormScreen';
import RoutineEditorScreen from '../features/routines/RoutineEditorScreen';
import ProgramGeneratorScreen from '../features/routines/ProgramGeneratorScreen';
import ActiveWorkoutScreen from '../features/session/ActiveWorkoutScreen';
import WorkoutSummaryScreen from '../features/session/WorkoutSummaryScreen';
import WorkoutDetailScreen from '../features/analytics/WorkoutDetailScreen';
import AuthScreen from '../features/profile/AuthScreen';
import DiscoverScreen from '../features/social/DiscoverScreen';
import { useT } from '../i18n';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { t } = useT();
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
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} options={{ title: t('nav.exerciseList'), presentation: 'modal' }} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={{ title: t('nav.exerciseDetail') }} />
      <Stack.Screen name="ExerciseForm" component={ExerciseFormScreen} options={{ title: t('nav.exerciseForm'), presentation: 'modal' }} />
      <Stack.Screen name="RoutineEditor" component={RoutineEditorScreen} options={{ title: t('nav.routineEditor') }} />
      <Stack.Screen name="ProgramGenerator" component={ProgramGeneratorScreen} options={{ title: t('program.title') }} />
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} options={{ title: t('nav.workoutDetail') }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: t('nav.auth'), presentation: 'modal' }} />
      <Stack.Screen name="Discover" component={DiscoverScreen} options={{ title: t('discover.title'), presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
