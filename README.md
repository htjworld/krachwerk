# Krachwerk

시드 하나로 크라프트베르크풍 전자음악 루프를 절차적으로 생성하는 웹앱. 같은 시드는
언제, 어디서 열어도 항상 같은 트랙을 재현한다. 서버 없이 브라우저 안에서만 생성,
재생, 다운로드가 이뤄진다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입체크 + 프로덕션 빌드 (dist/)
npm run preview  # 빌드 결과 미리보기
npm test         # vitest
```

## 어떻게 동작하나

- 시드 문자열을 FNV-1a로 해시해 mulberry32 PRNG의 시드로 쓴다. 드럼 레이어는 시드와
  무관하게 항상 동일하고, 스케일/보이스/멜로디는 시드마다 달라진다.
- 오디오는 Web Audio API(`OfflineAudioContext`)로 한 마디를 렌더링해 반복 재생하고,
  다운로드는 같은 버퍼를 이어붙여 WAV로 인코딩한다.
- 매트릭스 에디터에서 킥/리드 스텝을 토글하면 `pattern` 쿼리 파라미터로, 크로스헤어
  컨트롤(템포/톤)은 `crosshair` 쿼리 파라미터로 인코딩되어 링크 하나로 공유된다.
- 경로는 `/krachwerk/{seed}?pattern=...&crosshair=...` 형태이며, GitHub Pages의
  서버 라우팅 부재는 `public/404.html`의 spa-github-pages 리다이렉트로 우회한다.

## 스택

Vite, React, TypeScript. 런타임 의존성은 React뿐이고, 나머지는 전부 표준 Web API로
처리한다.

## 디자인

팔레트, 타이포그래피, 톤 원칙은 [`DESIGN.md`](./DESIGN.md) 참고.

## 배포

`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 테스트 실행 후 빌드하고
GitHub Pages로 배포한다.
