# dnd-transcription

CLI em TypeScript para fracionar arquivos `.mkv` longos em chunks `.wav`, transcrever os chunks em paralelo por meio de uma porta `Transcriber` substituivel e consolidar a saida em markdown ordenado cronologicamente.

> **Operacao:** para um runbook passo a passo (procedimentos, exit codes, troubleshooting e recuperacao), veja [`docs/runbook.md`](./docs/runbook.md).

## Requisitos

- Node.js >=22.12.0 (exigido pelo `commander@15`; ver `package.json` -> `engines`)
- `ffmpeg` e `ffprobe` disponiveis no `PATH`

## Diretorio de entrada recomendado

- Coloque videos/audios brutos em `.ignore/raw/`
- Esse diretorio e ignorado pelo Git
- Se `--input` receber apenas o nome do arquivo (ex.: `sessao.mkv`), a CLI resolve automaticamente para `.ignore/raw/sessao.mkv`

## Uso

### Multiplos arquivos de entrada

Passe `--input` uma vez por arquivo para transcrever varios arquivos em uma unica invocacao:

```bash
npm run transcribe -- \
  --input sessao1.mkv \
  --input sessao2.mkv \
  --input sessao3.mkv \
  --output ./tmp/batch \
  --provider openai-whisper \
  --file-concurrency 2
```

**Layout de saida (importante):**

| Entradas | Layout |
|----------|--------|
| 1 arquivo | `<output>/transcript.md` (flat, compativel com versoes anteriores) |
| 2+ arquivos | `<output>/<slug>-<hash>/transcript.md` por arquivo |

Com N >= 2, cada arquivo recebe seu proprio subdiretorio: o slug e o nome base sanitizado e o hash sao os 8 primeiros hex do sha256 do caminho absoluto resolvido, garantindo que arquivos com o mesmo nome nao colidam. Um mesmo arquivo que era executado sozinho (saindo em `<output>/transcript.md`) passara a sair em `<output>/<slug>-<hash>/transcript.md` ao receber um segundo `--input`.

**`<output>/batch-index.json`** (gerado apenas com N >= 2): mapeia cada caminho de entrada para seu subdiretorio, exit code e status, na ordem dos inputs — util para localizar saidas quando nomes de arquivo colidem.

**`--file-concurrency <n>` (default 1):** quantos arquivos sao transcritos em paralelo. O total de chamadas simultaneas ao provider e aproximadamente `file-concurrency × concurrency` (onde `--concurrency` e a concorrencia por-arquivo de chunks). O default 1 mantem a mesma carga no provider que a versao anterior. Um aviso suave (nunca fatal) e registrado quando `file-concurrency × concurrency > 16`.

**Retomada em lote:** `--resume` se aplica por arquivo — arquivos com artefatos previos compativeis retomam, arquivos novos comecam do zero, e um arquivo cujo input mudou (snapshot incompativel) falha fatalmente sem afetar os demais.

**Exit codes em lote:** qualquer falha fatal em algum arquivo => exit 1; sem fatais mas com falhas parciais => exit 2; tudo bem-sucedido => exit 0.

---

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

## Arquitetura final

- `src/cli/main.ts` e apenas o entrypoint Node e o wrapper programatico `runCli()`
- `src/cli/transcription-cli-application.ts` concentra parse, help, carga de `.env`, composicao de dependencias e dispatch do caso de uso
- `src/cli/default-transcriber-binding-factory.ts` resolve o provider default e cria `TranscriberBinding` lazy
- `src/application/run-transcription-job-use-case.ts` orquestra bootstrap, `--resume`, transcricao paralela, merge e cleanup
- `src/application/merge-transcripts-use-case.ts` consolida o markdown final a partir do manifesto persistido
- `src/domain/entities/job.ts` e `src/domain/entities/job-chunk.ts` sao as fronteiras autoritativas do ciclo de vida do job
- `src/domain/entities/chunk-manifest.ts` e o value object do manifesto persistido
- `src/infrastructure/storage/file-job-store.ts` usa `job-persistence-mapper.ts` e records tipados para manter `manifest.json` e `job-state.json` retrocompativeis
- `src/shared/` e parte dos adapters de provider permanecem como modulos funcionais por desenho; OO-iza-los agora nao traz ganho arquitetural claro

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

## Testing

- `npm test`: compila o projeto e roda a suite Jest completa sobre `dist/tests`
- `npm run test:unit`: compila e roda apenas os testes unitarios
- `npm run test:integration`: compila e roda apenas os testes de integracao
- `npm run test:file -- dist/tests/unit/parse-args.test.js`: compila e roda um arquivo especifico ja compilado em `dist/tests`
- `npm run verify:long-input`: check host-dependent separado da suite padrao

## Scripts

- `npm run build`
- `npm run transcribe -- --input <file.mkv> --output <dir> --provider <provider>`
- `npm run wiki -- <init|refresh|ingest|query|lint>`

## Code Wiki

O repositorio agora inclui um wiki repo-local em `docs/wiki/` para **documentar o codigo** e nao o conteudo gerado pelas transcricoes.

- `docs/wiki/schema.md` define o contrato de manutencao do wiki
- `docs/wiki/index.md` e o catalogo principal de paginas
- `docs/wiki/log.md` registra init, ingest, refresh e lint em ordem cronologica

Fluxo recomendado:

```bash
npm run wiki -- init
npm run wiki -- query --query "resume semantics"
npm run wiki -- ingest --source src/cli/main.ts
npm run wiki -- lint
```

Use `ingest` apos mudancas relevantes em `src/`, `tests/`, `README.md` ou `.omx/plans/`. Use `refresh` quando quiser regenerar o wiki inteiro a partir do estado atual do repositorio.

## Extensao de provedores

A camada de aplicacao depende de [`TranscriberBinding`](./src/domain/ports/transcriber-binding.ts), enquanto o transcriber real continua implementando [`Transcriber`](./src/domain/ports/transcriber.ts). Para adicionar um provedor real:

1. implemente a interface em `src/infrastructure/providers/`
2. conecte o binding lazy do provedor em [`default-transcriber-binding-factory.ts`](./src/cli/default-transcriber-binding-factory.ts)
3. preserve a composicao da CLI em [`transcription-cli-application.ts`](./src/cli/transcription-cli-application.ts) sem perder as seams de `CliDependencies`
4. exponha uma `signature` estavel para a compatibilidade de `--resume`
5. mantenha a mesma entrada estavel (`audioPath`, `chunkIndex`, `startMs`, `endMs`)
