# dnd-transcription

CLI em TypeScript para fracionar arquivos `.mkv` longos em chunks `.wav`, transcrever os chunks em paralelo por meio de uma porta `Transcriber` substituivel e consolidar a saida em markdown ordenado cronologicamente.

## Requisitos

- Node.js 20+
- `ffmpeg` e `ffprobe` disponiveis no `PATH`

## Uso

```bash
npm install
npm run transcribe -- \
  --input ./fixtures/sample.mkv \
  --output ./tmp/job-01 \
  --chunk-duration-seconds 600 \
  --concurrency 4 \
  --provider fake \
  --cleanup-policy on-success
```

Para retomar um job parcial:

```bash
npm run transcribe -- \
  --input ./fixtures/sample.mkv \
  --output ./tmp/job-01 \
  --chunk-duration-seconds 600 \
  --concurrency 4 \
  --provider fake \
  --cleanup-policy keep \
  --resume
```

## Artefatos persistidos

- `manifest.json`: manifesto ordenado por `index`, com `startMs`, `endMs` e `chunkPath`
- `job-state.json`: estado autoritativo do job e dos chunks
- `chunks/*.wav`: audio intermediario padronizado em PCM 16-bit, mono, `16000 Hz`
- `transcripts/*.md`: markdown parcial por chunk
- `transcript.md`: consolidado final, apenas no caminho 100% bem-sucedido

## Semantica operacional

- Sem `--resume`, a CLI rejeita `outputDir` que ja contenha `manifest.json` ou `job-state.json`
- `--resume` valida snapshot de compatibilidade com `resolvedInputPath`, `inputSizeBytes`, `inputMtimeMs`, `provider` e `chunkDurationSeconds`
- Chunks `failed` e `running` orfaos sao rebaixados para `pending` durante a retomada
- `exit code 0` indica sucesso total
- `exit code 2` indica falha parcial reaproveitavel
- `exit code 1` indica erro fatal ou uso invalido

## Scripts

- `npm run build`
- `npm test`
- `npm run verify:long-input`

## Extensao de provedores

O orquestrador depende apenas do contrato [`Transcriber`](./src/domain/ports/transcriber.ts). Para adicionar um provedor real:

1. implemente a interface em `src/infrastructure/providers/`
2. conecte a selecao do provedor em [`main.ts`](./src/cli/main.ts)
3. mantenha a mesma entrada estavel (`audioPath`, `chunkIndex`, `startMs`, `endMs`)
