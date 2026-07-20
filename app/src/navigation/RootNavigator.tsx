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
import ConversationsScreen from '../features/social/ConversationsScreen';
import ConversationScreen from '../features/social/ConversationScreen';
import CommentsScreen from '../features/social/CommentsScreen';
import UserProfileScreen from '../features/social/UserProfileScreen';
import NotificationsScreen from '../features/social/NotificationsScreen';
import NewGroupScreen from '../features/social/NewGroupScreen';
import ModerationQueueScreen from '../features/social/ModerationQueueScreen';
import ExploreScreen from '../features/social/ExploreScreen';
import HashtagScreen from '../features/social/HashtagScreen';
import BlockedUsersScreen from '../features/social/BlockedUsersScreen';
import FollowListScreen from '../features/social/FollowListScreen';
import BookmarksScreen from '../features/social/BookmarksScreen';
import NearbyGymsScreen from '../features/gyms/NearbyGymsScreen';
import MyGearScreen from '../features/gear/MyGearScreen'; // @plm SRS-042
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
      <Stack.Screen name="Conversations" component={ConversationsScreen} options={{ title: t('dm.title') }} />
      <Stack.Screen name="Conversation" component={ConversationScreen} options={{ title: t('dm.title') }} />
      <Stack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: t('group.title'), presentation: 'modal' }} />
      <Stack.Screen name="Comments" component={CommentsScreen} options={{ title: t('comments.title'), presentation: 'modal' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: t('profile.userTitle') }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('notif.title') }} />
      <Stack.Screen name="ModerationQueue" component={ModerationQueueScreen} options={{ title: t('moderation.title') }} />
      <Stack.Screen name="Explore" component={ExploreScreen} options={{ title: t('explore.title') }} />
      <Stack.Screen name="Hashtag" component={HashtagScreen} options={{ title: t('hashtag.title') }} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ title: t('block.title') }} />
      <Stack.Screen name="FollowList" component={FollowListScreen} options={{ title: t('follow.followersTitle') }} />
      <Stack.Screen name="Bookmarks" component={BookmarksScreen} options={{ title: t('bookmark.title') }} />
      <Stack.Screen name="NearbyGyms" component={NearbyGymsScreen} options={{ title: t('gyms.title') }} />
      <Stack.Screen name="MyGear" component={MyGearScreen} options={{ title: t('gear.myGearTitle') }} />
    </Stack.Navigator>
  );
}
