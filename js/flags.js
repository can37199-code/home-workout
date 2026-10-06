// 빌드 종류별 설정. 이 파일은 웹(GitHub Pages)용이고, 안드로이드 앱은 tools/build-native.mjs가 www/js/flags.js를 새로 쓴다.
// - ownerUnlocked: 결제 없이 모든 기능이 열린다 (웹은 개발자 개인용이라 켜 둔다. 테스트 메뉴의 "판매 모드 미리보기"로 잠시 끌 수 있다)
// - testMenu: 설정 맨 아래에 테스트 메뉴를 보여 준다 (출시용 빌드에서는 꺼진다)
export const FLAGS = { ownerUnlocked: true, testMenu: true };
