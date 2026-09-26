// 샘플 매니페스트 자체를 검증한다. 실제 파일 존재는 브라우저 체크(네트워크 404 확인)로
// 보고, 여기서는 node:fs 없이 잡을 수 있는 매니페스트 실수(중복 경로, 잘못된 폴더 접두어)만
// 본다.
import { describe, expect, it } from "vitest";
import { SAMPLE_FILE_PATHS, SAMPLE_IDS } from "./samples";

describe("samples.ts 매니페스트", () => {
  it("파일 경로에 중복이 없다", () => {
    const paths = SAMPLE_IDS.map((id) => SAMPLE_FILE_PATHS[id]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("킷별 id가 실제로 그 킷 폴더 경로를 가리킨다", () => {
    for (const id of SAMPLE_IDS) {
      if (id.startsWith("uzu")) expect(SAMPLE_FILE_PATHS[id]).toMatch(/^uzu\//);
      if (id.startsWith("freesoundSimmons") || id.startsWith("freesoundCr78")) {
        expect(SAMPLE_FILE_PATHS[id]).toMatch(/^freesound\//);
      }
    }
  });

  it("새 킷 폴더(uzu/freesound) 원샷이 매니페스트에 포함돼 있다", () => {
    expect(SAMPLE_IDS.some((id) => id.startsWith("uzu"))).toBe(true);
    expect(SAMPLE_IDS.some((id) => id.startsWith("freesoundSimmons"))).toBe(true);
    expect(SAMPLE_IDS.some((id) => id.startsWith("freesoundCr78"))).toBe(true);
  });
});
