// Babel config for Expo SDK 56 + WatermelonDB (ADR-001 RN, ADR-003 WatermelonDB).
// WatermelonDB models use legacy decorators -> @babel/plugin-proposal-decorators must
// run with { legacy: true }. Keep this list minimal; reanimated/module-resolver are
// intentionally NOT used in Phase 0 (see app/README.md "Phase 0 scope").
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      // WatermelonDB 모델은 `@field('x') name!: T` 패턴(데코레이터 + 미초기화 필드)을 쓴다.
      // class-fields가 spec(define) 모드면 데코레이터가 설치한 accessor를 덮어써 빌드/런타임이 깨진다.
      // loose([[Set]]) 모드로 강제해야 동작한다. (세 플러그인 loose는 서로 일치해야 함)
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
    ],
  };
};
