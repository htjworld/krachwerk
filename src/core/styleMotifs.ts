// 260927 §13.4: 새 블루프린트(d/p/f) 전용 모티프. §6.1 드럼 경로 원칙 — 블루프린트는
// rateSteps[].density만 적고, 실제 중요도·세기표는 여기서 곡마다 만들어 rig.styleMaps로
// audioEngine.ts에 넘긴다. 실제 표(§7.3)는 단계 8~10에서 스타일별로 채운다 — 지금은 아직
// d/p/f 블루프린트 자체가 없어서(§11 단계 5) 빈 맵을 돌려줘도 안전하다.
import type { BlueprintId, LayerId } from "./blueprint";
import type { StyleGenome } from "./genome";

/** 마디 하나치 중요도·세기표. 길이 = 그 블루프린트의 stepsPerBar. */
export interface DrumMap {
  priority: readonly number[];
  velocity: readonly number[];
}

export function styleDrumMaps(_id: BlueprintId, _g: StyleGenome): Partial<Record<LayerId, DrumMap>> {
  return {};
}
