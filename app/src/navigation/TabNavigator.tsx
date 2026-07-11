import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { TabParamList } from './types';
import { colors } from '../theme';
import WorkoutTabScreen from '../features/routines/WorkoutTabScreen';
import FeedTabScreen from '../features/social/FeedTabScreen';
import HistoryTabScreen from '../features/analytics/HistoryTabScreen';
import CalendarTabScreen from '../features/analytics/CalendarTabScreen';
import StatsTabScreen from '../features/analytics/StatsTabScreen';
import ProfileTabScreen from '../features/profile/ProfileTabScreen';
import FeedbackTabScreen from '../features/feedback/FeedbackTabScreen';
import { serverApi } from '../sync/serverApi';
import { onAuthChange } from '../state/authSignal';
import { useT } from '../i18n';

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  WorkoutTab: 'barbell',
  FeedTab: 'people',
  HistoryTab: 'time',
  CalendarTab: 'calendar',
  StatsTab: 'stats-chart',
  ProfileTab: 'person',
  FeedbackTab: 'chatbox-ellipses',
};

// 현재 로그인 사용자가 coworker/admin이면 개발 피드백 탭을 노출한다.
// 실제 인가는 서버 /feedback(RolesGuard)이 강제 — 이 게이팅은 UX 노출 제어일 뿐.
function useFeedbackTabVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () => {
      serverApi
        .isLoggedIn()
        .then((logged) => (logged ? serverApi.me() : null))
        .then((me) => {
          if (active) setVisible(!!me && (me.role === 'coworker' || me.role === 'admin'));
        })
        .catch(() => active && setVisible(false));
    };
    check();
    const unsub = onAuthChange(check); // 로그인/로그아웃 시 즉시 재평가
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check(); // 포그라운드 복귀 시(역할 변경 반영)
    });
    return () => {
      active = false;
      unsub();
      sub.remove();
    };
  }, []);
  return visible;
}

export function TabNavigator() {
  const { t } = useT();
  const showFeedback = useFeedbackTabVisible();
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
      <Tab.Screen name="CalendarTab" component={CalendarTabScreen} options={{ title: t('nav.calendar') }} />
      <Tab.Screen name="StatsTab" component={StatsTabScreen} options={{ title: t('nav.stats') }} />
      <Tab.Screen name="ProfileTab" component={ProfileTabScreen} options={{ title: t('nav.profile') }} />
      {showFeedback ? (
        <Tab.Screen name="FeedbackTab" component={FeedbackTabScreen} options={{ title: t('nav.feedback') }} />
      ) : null}
    </Tab.Navigator>
  );
}
