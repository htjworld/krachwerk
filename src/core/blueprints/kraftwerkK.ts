// computeK / metropolisK (§6.3 k-1/k-2): k(Kraftwerk) 스타일 코드 전용 블루프린트.
// v2 compute/metropolis 섹션 배열을 "그대로 복사"한다 — 실제로는 원본을 스프레드해서
// 옮기고 다음만 더한다:
//  - 맨 끝(마지막 end/tail 섹션 앞)에 codeRead 섹션 4마디: 로봇 목소리가 코드 전체를
//    한 마디에 4글자씩 8분음표(스텝 0·4·8·12)로 읽는다. 기본 코드 compute는 "calls" 큐가
//    있어도 한 마디에 최대 한 글자만 읽는다(audioEngine.ts의 "calls" 처리, barIndex당 한
//    번뿐) — 그래서 이 섹션 하나만으로 k와 기본 코드가 절대 같은 이벤트 목록을 못 낸다
//    (§5.5 유일성 증명 3). 4마디 고정이라 §8.2 길이 조정 대상이 아니다(1마디 섹션과 같은
//    취급 — buildArrangement가 bars===1일 때만 안 늘리므로, 여기선 대신 나중값 비율에서
//    차지하는 몫이 작도록 짧게 둔 것으로 충분하다. 정확히 4마디를 지키려는 게 아니라
//    "코드를 읽는 자리가 있다"는 것 자체가 요점이다).
//  - metropolisK는 pulseIntro·breakdown 두 곳에 calls 큐를 더한다(기본 metropolis엔 없다).
//  - 킷은 circuitK/skylineK(§7.2, 게놈 kit 6×6 프리셋). 보이스(timbre)·로봇 목소리
//    언어·음높이(voice)·시그니처(sig)는 styleGenome에서 뽑는다 — audioEngine.ts가
//    pattern.style==="k"일 때 그 필드들을 읽는다(§13.6).
//
// 드럼 계열(familyDrumHit)·조성(computeScale/metropolisScale)·리프·베이스는 v2 motifs.ts
// 함수를 그대로 재사용한다 — blueprintFamily(§6.1)가 "computeK"~"compute",
// "metropolisK"~"metropolis"를 같은 걸로 봐 주기 때문에 별도 구현이 필요 없다.
import type { Blueprint, BlueprintSection, LayerCue } from "../blueprint";
import { compute } from "./compute";
import { metropolis } from "./metropolis";

function codeReadSection(filterFrom: number, filterTo: number): BlueprintSection {
  return {
    id: "codeRead",
    bars: 4,
    intensity: 0.2,
    drumFamily: "none",
    cues: [{ layer: "calls", enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16 }] }],
    fill: [],
    filter: { from: filterFrom, to: filterTo },
  };
}

function insertBeforeLast(sections: readonly BlueprintSection[], extra: BlueprintSection): BlueprintSection[] {
  return [...sections.slice(0, -1), extra, sections[sections.length - 1]];
}

export const computeK: Blueprint = {
  ...compute,
  id: "computeK",
  style: "k",
  kitFamily: "circuitK",
  sections: insertBeforeLast(compute.sections, codeReadSection(2000, 1500)),
};

const CALLS_CUE: LayerCue = { layer: "calls", enterBar: 0, exitBarsBeforeEnd: 0, rateSteps: [{ atBar: 0, rate: 16 }] };

const metroWithCalls = metropolis.sections.map((s) =>
  s.id === "pulseIntro" || s.id === "breakdown" ? { ...s, cues: [...s.cues, CALLS_CUE] } : s
);

export const metropolisK: Blueprint = {
  ...metropolis,
  id: "metropolisK",
  style: "k",
  kitFamily: "skylineK",
  sections: insertBeforeLast(metroWithCalls, codeReadSection(1200, 800)),
};
