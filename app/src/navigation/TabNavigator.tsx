import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { TabParamList } from './types';
import { colors } from '../theme';
import WorkoutTabScreen from '../features/routines/WorkoutTabScreen';
import FeedTabScreen from '../features/social/FeedTabScreen';
import HistoryTabScreen from '../features/analytics/HistoryTabScreen';
import StatsTabScreen from '../features/analytics/StatsTabScreen';
import ProfileTabScreen from '../features/profile/ProfileTabScreen';
import { useT } from '../i18n';

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  WorkoutTab: 'barbell',
  FeedTab: 'people',
  HistoryTab: 'time',
  StatsTab: 'stats-chart',
  ProfileTab: 'person',
};

export function TabNavigator() {
  const { t } = useT();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="WorkoutTab" component={WorkoutTabScreen} options={{ title: t('nav.workout') }} />
      <Tab.Screen name="FeedTab" component={FeedTabScreen} options={{ title: t('nav.feed') }} />
      <Tab.Screen name="HistoryTab" component={HistoryTabScreen} options={{ title: t('nav.history') }} />
      <Tab.Screen name="StatsTab" component={StatsTabScreen} options={{ title: t('nav.stats') }} />
      <Tab.Screen name="ProfileTab" component={ProfileTabScreen} options={{ title: t('nav.profile') }} />
    </Tab.Navigator>
  );
}
