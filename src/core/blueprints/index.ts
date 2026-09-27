// 블루프린트 id → 실제 Blueprint 데이터 조회의 한곳(§13.1). open 5종은 기존 legacy.ts의
// blueprintById를 그대로 쓰고, 스타일별 블루프린트는 여기서 늘려간다(§11 단계 8~10에서
// delroy.ts/peggy.ts/fred.ts가 채워진다).
import type { Blueprint, BlueprintId } from "../blueprint";
import type { Pattern } from "../pattern";
import { blueprintById, type OpenBlueprintId } from "./legacy";
import { computeK, metropolisK } from "./kraftwerkK";
import { applyDIntroVariant, beachDemo, dBlueprintIdFor, fourFloorJam, shuffle12, tapeJam } from "./delroy";
import { applyPFormVariant, clubHouse, pBlueprintIdFor, slowJam } from "./peggy";
import { applyFFormVariant, fBlueprintIdFor, garageShuffle, halfStep, switchUp } from "./fred";

export { dBlueprintIdFor, pBlueprintIdFor, fBlueprintIdFor };

const OPEN_IDS: readonly OpenBlueprintId[] = ["compute", "metropolis", "classicBuild", "slowBurn", "doubleDrop"];

function isOpenId(id: BlueprintId): id is OpenBlueprintId {
  return (OPEN_IDS as readonly string[]).includes(id);
}

/** k 스타일 form(기수 12, 0~11) → computeK(0~5)/metropolisK(6~11). v2 blueprintIdFor의
 *  compute/metropolis 경계(§8.1)와 같은 자리다. */
export function kBlueprintIdFor(form: number): "computeK" | "metropolisK" {
  return form <= 5 ? "computeK" : "metropolisK";
}

/** 어떤 스타일이든 blueprintId 하나로 실제 Blueprint를 찾는다. d/p/f 블루프린트는 그
 *  스타일의 구현 단계(§11 단계 8~10)가 오기 전까진 default에서 에러를 던진다 — 아직
 *  존재하지 않는 블루프린트를 조용히 잘못된 값으로 대체하는 것보다 낫다. */
export function blueprintFor(id: BlueprintId): Blueprint {
  if (isOpenId(id)) return blueprintById(id);
  switch (id) {
    case "computeK":
      return computeK;
    case "metropolisK":
      return metropolisK;
    case "tapeJam":
      return tapeJam;
    case "fourFloorJam":
      return fourFloorJam;
    case "beachDemo":
      return beachDemo;
    case "shuffle12":
      return shuffle12;
    case "clubHouse":
      return clubHouse;
    case "slowJam":
      return slowJam;
    case "garageShuffle":
      return garageShuffle;
    case "halfStep":
      return halfStep;
    case "switchUp":
      return switchUp;
    default:
      throw new Error(`blueprintFor: 아직 구현되지 않은 블루프린트 id "${id}"`);
  }
}

/** blueprintFor(id) 결과에 style genome의 남은 form 비트로 구조 변형을 적용한다(창의성
 *  감사, 2026-09-27). open/k는 R9(고정 스냅샷) 때문에 절대 건드리지 않고 그대로 통과시킨다. */
export function resolvedBlueprintFor(pattern: Pattern): Blueprint {
  const blueprint = blueprintFor(pattern.blueprintId);
  if (!pattern.styleGenome) return blueprint;
  const form = pattern.styleGenome.form ?? 0;
  switch (pattern.styleGenome.style) {
    case "d":
      return applyDIntroVariant(blueprint, form);
    case "p":
      return applyPFormVariant(blueprint, form);
    case "f":
      return applyFFormVariant(blueprint, form);
    default:
      return blueprint;
  }
}
