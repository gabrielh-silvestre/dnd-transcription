# dnd-transcription

CLI em TypeScript para fracionar arquivos `.mkv` longos em chunks `.wav`, transcrever os chunks em paralelo por meio de uma porta `Transcriber` substituivel e consolidar a saida em markdown ordenado cronologicamente.

## Requisitos

- Node.js 20+
- `ffmpeg` e `ffprobe` disponiveis no `PATH`

## Diretorio de entrada recomendado

- Coloque videos/audios brutos em `.ignore/raw/`
- Esse diretorio e ignorado pelo Git
- Se `--input` receber apenas o nome do arquivo (ex.: `sessao.mkv`), a CLI resolve automaticamente para `.ignore/raw/sessao.mkv`

## Uso

### Provider fake

```bash
npm install
mkdir -p .ignore/raw
npm run transcribe -- \
  --input sample.mkv \
  --output ./tmp/job-01 \
  --chunk-duration-seconds 600 \
  --concurrency 4 \
  --provider fake \
  --cleanup-policy on-success
```

### Provider openai-whisper

Variaveis de ambiente suportadas:

- `OPENAI_API_KEY` obrigatoria
- `OPENAI_WHISPER_LANGUAGE` opcional
- `OPENAI_WHISPER_PROMPT` opcional

A CLI carrega `.env` automaticamente a partir do diretorio atual, sem sobrescrever variaveis ja exportadas no shell.

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_WHISPER_LANGUAGE="pt"
export OPENAI_WHISPER_PROMPT="glossario do dominio"

npm run transcribe -- \
  --input "2026-04-09 20-38-18.mkv" \
  --output ./tmp/openai-whisper-job \
  --chunk-duration-seconds 600 \
  --concurrency 2 \
  --provider openai-whisper \
  --cleanup-policy keep
```

Ou com `.env`:

```bash
cat > .env <<'EOF'
OPENAI_API_KEY=sk-...
OPENAI_WHISPER_LANGUAGE=pt
OPENAI_WHISPER_PROMPT=glossario do dominio
EOF

npm run transcribe -- \
  --input "2026-04-09 20-38-18.mkv" \
  --output ./tmp/openai-whisper-job \
  --chunk-duration-seconds 600 \
  --concurrency 2 \
  --provider openai-whisper \
  --cleanup-policy keep
```

### Provider openai-transcription

Use este provider quando precisar escolher o modelo de transcricao ou usar Azure OpenAI.

Variaveis de ambiente suportadas:

- `OPENAI_TRANSCRIPTION_MODEL` obrigatoria
- `OPENAI_TRANSCRIPTION_BACKEND` opcional: `openai` (default) ou `azure`
- `OPENAI_TRANSCRIPTION_LANGUAGE` opcional
- `OPENAI_TRANSCRIPTION_PROMPT` opcional

Para backend `openai`:

- `OPENAI_API_KEY` obrigatoria

Para backend `azure`:

- `AZURE_OPENAI_API_KEY` obrigatoria
- `AZURE_OPENAI_ENDPOINT` obrigatoria
- `OPENAI_API_VERSION` obrigatoria
- `AZURE_OPENAI_DEPLOYMENT` opcional

Exemplo com OpenAI direto:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_TRANSCRIPTION_MODEL="gpt-4o-mini-transcribe"
export OPENAI_TRANSCRIPTION_LANGUAGE="pt"
export OPENAI_TRANSCRIPTION_PROMPT="glossario do dominio"

npm run transcribe -- \
  --input "2026-04-09 20-38-18.mkv" \
  --output ./tmp/openai-transcription-job \
  --chunk-duration-seconds 600 \
  --concurrency 2 \
  --provider openai-transcription \
  --cleanup-policy keep
```

Exemplo com Azure OpenAI:

```bash
export OPENAI_TRANSCRIPTION_BACKEND="azure"
export OPENAI_TRANSCRIPTION_MODEL="gpt-4o-transcribe"
export AZURE_OPENAI_API_KEY="azure-key"
export AZURE_OPENAI_ENDPOINT="https://example-resource.azure.openai.com"
export OPENAI_API_VERSION="2025-03-01-preview"
export AZURE_OPENAI_DEPLOYMENT="transcribe-prod"

npm run transcribe -- \
  --input "2026-04-09 20-38-18.mkv" \
  --output ./tmp/openai-transcription-job \
  --chunk-duration-seconds 600 \
  --concurrency 2 \
  --provider openai-transcription \
  --cleanup-policy keep
```

Se o nome do deployment no Azure for igual ao nome do modelo, `AZURE_OPENAI_DEPLOYMENT` pode ficar ausente.

Para retomar um job parcial:

```bash
npm run transcribe -- \
  --input sample.mkv \
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
- `--resume` valida snapshot de compatibilidade com `resolvedInputPath`, `inputSizeBytes`, `inputMtimeMs`, `provider`, `transcriberSignature` e `chunkDurationSeconds`
- Chunks `failed` e `running` orfaos sao rebaixados para `pending` durante a retomada
- `exit code 0` indica sucesso total
- `exit code 2` indica falha parcial reaproveitavel
- `exit code 1` indica erro fatal ou uso invalido

## Notas do provider openai-whisper

- O provider desta fase e travado em `whisper-1` com `response_format: "json"`
- O wrapper da OpenAI devolve somente o shape normalizado `{ text: string }` para o transcriber
- O preflight rejeita `chunk-duration-seconds` cujo WAV PCM 16-bit mono `16000 Hz` exceda o limite operacional de upload do provider
- `OPENAI_WHISPER_PROMPT` e estatico para todos os chunks desta execucao; prompt chaining dinamico fica fora do escopo desta fase
- Trocar `language` ou `prompt` invalida `--resume`, porque a assinatura do transcritor muda

## Notas do provider openai-transcription

- O provider aceita `whisper-1`, `gpt-4o-transcribe` e `gpt-4o-mini-transcribe`
- O backend pode ser `openai` ou `azure`
- O wrapper continua devolvendo somente `{ text: string }`
- No Azure, a assinatura do `--resume` considera backend, modelo, endpoint, API version e deployment
- `AZURE_OPENAI_DEPLOYMENT` existe para cenarios em que o nome do deployment nao e igual ao nome do modelo
- O preflight de chunk segue o mesmo limite operacional de upload usado pelo provider `openai-whisper`

## Scripts

- `npm run build`
- `npm test`
- `npm run verify:long-input`

## Extensao de provedores

O orquestrador depende apenas do contrato [`Transcriber`](./src/domain/ports/transcriber.ts). Para adicionar um provedor real:

1. implemente a interface em `src/infrastructure/providers/`
2. conecte a selecao do provedor em [`main.ts`](./src/cli/main.ts)
3. exponha uma `signature` estavel para a compatibilidade de `--resume`
4. mantenha a mesma entrada estavel (`audioPath`, `chunkIndex`, `startMs`, `endMs`)
