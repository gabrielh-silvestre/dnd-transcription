---
name: "🐞 Bug report"
about: "Reporte um comportamento incorreto da CLI de transcrição ou do wiki"
title: "[bug]: "
labels:
  - bug
---

## O que aconteceu?

<!-- Descreva objetivamente o comportamento incorreto observado. -->

## Comportamento esperado

<!-- O que deveria ter acontecido. -->

## Passos para reproduzir

1. Comando: `npm run transcribe -- ...` (ou `npm run wiki -- ...`)
2. ...
3. ...

## Exit code observado

<!-- Leia com `echo $?`. Contrato do projeto: 0 = sucesso total, 2 = falha parcial reaproveitável, 1 = erro fatal / uso inválido. -->

## Ambiente

- Node.js (`node --version`): <!-- requisito do projeto: >=22.12.0 -->
- Sistema operacional:
- Provider: <!-- fake | openai-whisper | openai-transcription -->

## Evidência

<!-- Logs relevantes e, quando aplicável, trechos de manifest.json / job-state.json.
     ⚠️ Nunca cole segredos (ex.: OPENAI_API_KEY). -->
