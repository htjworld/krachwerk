// public/samples 아래에 넣어둔 CC0/퍼블릭 도메인 원샷들. 출처와 라이선스는
// public/samples/CREDITS.txt 참고. 신스로는 안 나오는 질감(808 아날로그 드럼, 모루/브레이크
// 드럼 같은 금속 타격음)을 여기서 가져온다.
//
// 킷 확장(§15.3/§15.5): legacy 블루프린트는 코어(analog808) 외에 uzu-drumkit/Simmons 샘플로
// 킥·스네어·퍼커션을 통째로 바꿔 낄 수 있다. 코어 28개는 항상 로드하고(작고, 모든 킷이
// 공통으로 쓴다 — metal 롤 등), uzu/simmons는 실제로 그 킷을 쓰는 트랙만 받는다
// (`loadSampleBank(ctx, kit)`) — 전부 무조건 받으면 트랙마다 안 쓰는 샘플까지 매번
// 내려받아 첫 재생이 느려진다(§15.3). compute/metropolis는 아직 코어만 쓴다(§11 단계 6
// 결정: 킥 계열은 지금 킷 샘플을 그대로 재사용한다).

const CORE_SAMPLE_FILES = {
  kickTight: "808/kick-tight.wav",
  kickMid: "808/kick-mid.wav",
  kickLong: "808/kick-long.wav",
  snare: "808/snare.wav",
  snareTight: "808/snare-tight.wav",
  clap: "808/clap.wav",
  hatClosed: "808/hat-closed.wav",
  hatOpen: "808/hat-open.wav",
  hatOpenLong: "808/hat-open-long.wav",
  rim: "808/rim.wav",
  clave: "808/clave.wav",
  cowbell: "808/cowbell.wav",
  maraca: "808/maraca.wav",
  tomLow: "808/tom-low.wav",
  tomMid: "808/tom-mid.wav",
  tomHigh: "808/tom-high.wav",
  congaHigh: "808/conga-high.wav",
  cymbal: "808/cymbal.wav",
  anvil1: "metal/anvil-1.wav",
  anvil2: "metal/anvil-2.wav",
  brake1: "metal/brake-1.wav",
  brake2: "metal/brake-2.wav",
  logLow: "metal/logdrum-lo.wav",
  logHigh: "metal/logdrum-hi.wav",
  slapstick: "metal/slapstick.wav",
  ratchet: "metal/ratchet.wav",
  agogoHigh: "metal/agogo-hi.wav",
  agogoLow: "metal/agogo-lo.wav",
} as const;

// uzu-drumkit (Unlicense). misc-1..5는 시그니처 보조용이라 아직 안 쓴다(ponytail, §15.5).
const UZU_SAMPLE_FILES = {
  uzuBd1: "uzu/bd-1.wav",
  uzuBd2: "uzu/bd-2.wav",
  uzuBd3: "uzu/bd-3.wav",
  uzuBd4: "uzu/bd-4.wav",
  uzuBd5: "uzu/bd-5.wav",
  uzuBd6: "uzu/bd-6.wav",
  uzuBd7: "uzu/bd-7.wav",
  uzuBd8: "uzu/bd-8.wav",
  uzuSd1: "uzu/sd-1.wav",
  uzuSd2: "uzu/sd-2.wav",
  uzuSd3: "uzu/sd-3.wav",
  uzuSd4: "uzu/sd-4.wav",
  uzuSd5: "uzu/sd-5.wav",
  uzuHh1: "uzu/hh-1.wav",
  uzuHh2: "uzu/hh-2.wav",
  uzuHh3: "uzu/hh-3.wav",
  uzuHh4: "uzu/hh-4.wav",
  uzuHh5: "uzu/hh-5.wav",
  uzuOh1: "uzu/oh-1.wav",
  uzuOh2: "uzu/oh-2.wav",
  uzuOh3: "uzu/oh-3.wav",
  uzuOh4: "uzu/oh-4.wav",
  uzuCp1: "uzu/cp-1.wav",
  uzuCp2: "uzu/cp-2.wav",
  uzuRim1: "uzu/rim-1.wav",
  uzuRim2: "uzu/rim-2.wav",
  uzuCb1: "uzu/cb-1.wav",
  uzuRd1: "uzu/rd-1.wav",
  uzuCr1: "uzu/cr-1.wav",
  uzuCr2: "uzu/cr-2.wav",
  uzuHt1: "uzu/ht-1.wav",
  uzuMt1: "uzu/mt-1.wav",
  uzuLt1: "uzu/lt-1.wav",
  uzuSh1: "uzu/sh-1.wav",
  uzuTb1: "uzu/tb-1.wav",
} as const;

// Simmons(Freesound pack 26582, CC0) + CR-78(pack 39611, CC0) 원샷. 킥은 안 받았다
// (§15.6: 실제로 받은 12개 중 킥이 없었다) — legacy-simmons 킷은 킥만 uzu에서 빌린다.
const SIMMONS_SAMPLE_FILES = {
  freesoundSimmonsSnare1: "freesound/simmons-snare-1.wav",
  freesoundSimmonsSnare2: "freesound/simmons-snare-2.wav",
  freesoundSimmonsSnare3: "freesound/simmons-snare-3.wav",
  freesoundSimmonsHatClosed: "freesound/simmons-hat-closed.wav",
  freesoundSimmonsHatOpen: "freesound/simmons-hat-open.wav",
  freesoundSimmonsCymbal1: "freesound/simmons-cymbal-1.wav",
  freesoundSimmonsCymbal2: "freesound/simmons-cymbal-2.wav",
  freesoundSimmonsPerc: "freesound/simmons-perc.wav",
  freesoundSimmonsTom: "freesound/simmons-tom.wav",
  freesoundSimmonsNoise1: "freesound/simmons-noise-1.wav",
  freesoundSimmonsNoise2: "freesound/simmons-noise-2.wav",
  freesoundSimmonsNoise3: "freesound/simmons-noise-3.wav",
  freesoundCr78Snare: "freesound/cr78-snare.wav",
  freesoundCr78Tom: "freesound/cr78-tom.wav",
} as const;

const SAMPLE_FILES = { ...CORE_SAMPLE_FILES, ...UZU_SAMPLE_FILES, ...SIMMONS_SAMPLE_FILES } as const;
/** 테스트 전용: 매니페스트가 실제 파일과 맞는지 확인할 때만 쓴다(samples.test.ts). */
export const SAMPLE_FILE_PATHS: Readonly<Record<string, string>> = SAMPLE_FILES;

export type SampleId = keyof typeof SAMPLE_FILES;
export type SampleBank = Record<SampleId, AudioBuffer>;

export const SAMPLE_IDS = Object.keys(SAMPLE_FILES) as SampleId[];

const CORE_IDS = Object.keys(CORE_SAMPLE_FILES) as SampleId[];

/** legacy 블루프린트가 킥/스네어/퍼커션 세트를 통째로 바꿔 끼는 킷(§15.3/§15.5).
 *  compute/metropolis는 아직 안 쓴다(§11 단계 6: 킥 계열은 코어 샘플을 그대로 재사용). */
export type KitId = "legacy-uzu" | "legacy-simmons";

const KIT_MEMBERS: Record<KitId, SampleId[]> = {
  "legacy-uzu": Object.keys(UZU_SAMPLE_FILES) as SampleId[],
  // 심몬스 킷은 킥이 없어서(§15.6) uzu 킥을 같이 받는다.
  "legacy-simmons": [...(Object.keys(SIMMONS_SAMPLE_FILES) as SampleId[]), "uzuBd1", "uzuBd2", "uzuBd3", "uzuBd4"],
};

function sampleUrl(file: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}samples/${file}`;
}

// 디코딩 결과는 컨텍스트가 아니라 샘플레이트에만 묶인다. 출력 장치에 따라 렌더링
// 샘플레이트가 달라지므로(44.1k / 48k), 그리고 킷마다 받는 파일이 다르므로 (레이트, 킷)
// 쌍으로 캐시한다.
const banks = new Map<string, Promise<SampleBank>>();

/**
 * `kit`이 있으면 코어 28개 + 그 킷 전용 샘플만 네트워크로 받는다. 킷이 안 쓰는 나머지
 * SampleId는 코어 킥(`kickTight`)으로 채워서 `SampleBank`가 여전히 모든 키를 갖게 한다 —
 * track.ts가 킷별 풀에서만 id를 고르므로 이 채움값은 실제로 재생되지 않는다(§16.7).
 */
export function loadSampleBank(ctx: BaseAudioContext, kit: KitId | null = null): Promise<SampleBank> {
  const cacheKey = `${ctx.sampleRate}:${kit ?? "core"}`;
  let bank = banks.get(cacheKey);
  if (!bank) {
    const active = new Set<SampleId>(kit ? [...CORE_IDS, ...KIT_MEMBERS[kit]] : CORE_IDS);
    bank = Promise.all(
      SAMPLE_IDS.map(async (id) => {
        if (!active.has(id)) return null;
        const response = await fetch(sampleUrl(SAMPLE_FILES[id]));
        if (!response.ok) throw new Error(`sample ${id} failed: ${response.status}`);
        return [id, await ctx.decodeAudioData(await response.arrayBuffer())] as const;
      })
    )
      .then((entries) => {
        const loaded = Object.fromEntries(
          entries.filter((e): e is readonly [SampleId, AudioBuffer] => e !== null)
        ) as Partial<SampleBank>;
        const fallback = loaded.kickTight!;
        return Object.fromEntries(SAMPLE_IDS.map((id) => [id, loaded[id] ?? fallback])) as SampleBank;
      })
      .catch((error) => {
        banks.delete(cacheKey); // 네트워크 실패는 캐시하지 않는다.
        throw error;
      });
    banks.set(cacheKey, bank);
  }
  return bank;
}
