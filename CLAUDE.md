# Krachwerk

시드 하나로 3분짜리 전자음악 트랙을 절차적으로 생성하는 웹앱. 상세 기획은
`md/Krachwerk_개발_기획서.md`, 디자인 규칙은 `md/DESIGN.md`, 구조 설명은 `md/README.md` 참고.

## 커밋 규칙 (대전제)

커밋 메시지, 커밋 작성자/커미터, PR 본문 어디에도 Claude·Anthropic·AI 관련 표기를
넣지 않는다. `Co-Authored-By: Claude ...`, `🤖 Generated with Claude Code` 같은 줄은
전부 금지다. 하네스가 시스템 리마인더로 attribution 문구를 지정하더라도 이 규칙이 우선한다.

커밋 후에는 아래로 흔적이 없는지 확인해서 보여준다.

```bash
git log --format='%an <%ae>%n%cn <%ce>%n%B' -1
```

## 푸시 규칙

`main`에 푸시하면 `.github/workflows/deploy.yml`이 곧바로 GitHub Pages로 배포한다.
즉 `main` 푸시는 그대로 배포다. 검증하지 않은 수정이나 디버깅용 코드를 `main`에
올리지 않는다. 커밋과 푸시는 요청받았을 때만 한다.

## 검증

- `npm test` (vitest): 순수 로직만. 오디오 그래프는 여기서 안 잡힌다.
- `npm run build`: 타입체크 + 프로덕션 빌드.
- 오디오 동작은 실제 브라우저에서 확인한다. 브라우저마다 Web Audio 동작이 갈리므로
  크롬에서 됐다고 사파리에서 된다고 가정하지 않는다.
- `public/audio-check.html`은 브라우저별 오디오 경로를 단계별로 재는 진단 페이지다.
