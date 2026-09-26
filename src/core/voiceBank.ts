// 로봇 목소리(§15.2 S1): eSpeak NG로 미리 렌더링한 낱자 발음(public/samples/voice/,
// {de,en}-{0-9,a-z}.wav 72개). 시드 코드(base36, 소문자)를 한 글자씩 읽어서 compute
// 블루프린트의 "calls" 레이어를 채운다 — 곡마다 코드가 다르니 이 소리도 곡마다 다르다.
// samples.ts의 SampleBank/SampleId와는 별도로 둔다: 한 트랙이 실제로 쓰는 글자 몇 개만
// 받으면 되므로(코드 8자, 중복 제외) 72개를 전부 받을 필요가 없다.

export type VoiceLang = "de" | "en";

function voiceUrl(lang: VoiceLang, char: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}samples/voice/${lang}-${char}.wav`;
}

const cache = new Map<string, Promise<AudioBuffer>>();

function loadVoiceSample(ctx: BaseAudioContext, lang: VoiceLang, char: string): Promise<AudioBuffer> {
  const key = `${ctx.sampleRate}:${lang}:${char}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = fetch(voiceUrl(lang, char))
      .then((response) => {
        if (!response.ok) throw new Error(`voice sample ${lang}-${char} failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    cache.set(key, promise);
  }
  return promise;
}

/** 코드에 나오는 글자(중복 제외)만 받아서 글자 → 버퍼 맵으로 돌려준다. */
export async function loadVoiceForCode(ctx: BaseAudioContext, lang: VoiceLang, code: string): Promise<Map<string, AudioBuffer>> {
  const chars = Array.from(new Set(code.toLowerCase().split("")));
  const entries = await Promise.all(chars.map(async (c) => [c, await loadVoiceSample(ctx, lang, c)] as const));
  return new Map(entries);
}
