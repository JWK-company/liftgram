package org.tarae.liftgram;

import com.getcapacitor.BridgeActivity;

// 앱 시작 화면 — 매니페스트의 .MainActivity(org.tarae.liftgram 기준)가 이 클래스를 찾는다.
// 빠져 있으면 아이콘을 눌러도 곧바로 꺼진다(ClassNotFoundException · 2026-11-03 실기기에서 발견).
// 플러그인(@capacitor/* · liftgram-native)은 cap sync 가 capacitor.plugins.json 으로 자동 등록한다.
public class MainActivity extends BridgeActivity {}
