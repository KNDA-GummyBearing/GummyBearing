// [V10 EQUIPMENT IMAGE FIX 2026-10-22]
// 사용자 제공 12개 PNG 원본. 공정별 설비 모양은 고정하고 테마·상태만 선택한다.
// DE/NDE는 이 설명용 그림 안의 표시 위치이며 실제 설비 도면 좌표가 아니다.
const SETS = {
  sinter: { set: '01', DE: [78.1, 47.3], NDE: [41.9, 47.3] },
  steel: { set: '02', DE: [78.8, 57.9], NDE: [65.7, 57.2] },
};
const STATES = { 정상: 'normal', 주의: 'warning', 경보: 'alarm' };

export function getFanImage(equipment, mode, status) {
  const model = SETS[equipment.process];
  if (!model || !STATES[status] || !['light', 'dark'].includes(mode)) {
    throw new Error('지원하지 않는 설비 이미지 조합입니다.');
  }
  return {
    ...model,
    ratio: '1672 / 941',
    src: `assets/fan-states/fan${model.set}_${mode}_${STATES[status]}.png`,
  };
}

// 새 PNG 디코딩이 끝난 뒤 교체한다. 빠른 상태/테마 전환 시 오래된 요청이
// 나중에 도착해 최신 그림을 덮지 않게 하고, 같은 경로는 다시 로딩하지 않는다.
const requested = new WeakMap();
export function setFanImage(element, src) {
  if (requested.get(element) === src) return;
  requested.set(element, src);
  const image = new Image();
  image.src = src;
  const apply = () => {
    if (element.isConnected && requested.get(element) === src) element.src = src;
  };
  image.decode().then(apply, apply);
}
