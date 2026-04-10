# Execution Ledger

## 2026-04-10

- Implementado projeto Node/TypeScript greenfield para o pipeline de transcricao descrito em `.omx/plans/transcription-pipeline-requirements.md`.
- Adicionados contratos de dominio para `Transcriber`, `MediaSegmenter`, manifesto e `job-state.json` com maquina de estados explicita.
- Implementados `FFmpegMediaSegmenter`, `FileJobStore`, `FakeTranscriber`, pool de concorrencia, `resume` deterministico e merge final baseado no manifesto persistido.
- Adicionados testes unitarios e integrados cobrindo manifesto, parse de CLI, task pool, falha parcial, `--resume`, recuperacao de chunk `running` orfao e ordenacao final.
- Registrado script dedicado `npm run verify:long-input` para gerar e validar input sintetico acima de 3 horas; a execucao no host atual falhou por ausencia de `ffmpeg` no `PATH`.

## Evidencias

- `npm run build`
- `npm test`
- `npm run verify:long-input` -> falhou com `Comando externo nao encontrado no PATH: ffmpeg`
