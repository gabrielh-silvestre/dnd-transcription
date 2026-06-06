# Runbook — CLI de Transcricao (`transcribe`)

Documento operacional para executar, retomar e diagnosticar a CLI de transcricao deste
repositorio. Escrito para quem **opera** a ferramenta (rodar jobs, retomar falhas,
resolver erros), nao para quem altera o codigo.

- **Componente principal:** `transcribe` — segmenta uma midia, transcreve os chunks em
  paralelo via um provider e consolida um `transcript.md`.
- **Componente auxiliar:** `wiki` — manutencao do code-wiki em `docs/wiki/` (ver apendice).
- **Ultima revisao:** 2026-06-06 (verificado contra o codigo em `src/cli/` e validado ponta a
  ponta com o provider `fake`: sucesso total, falha parcial, guardas de `--resume` e retomada
  apos interrupcao).

Para arquitetura e detalhes de design, ver `docs/wiki/pages/` (links na secao
[Referencias](#17-referencias)). Este runbook foca em **como rodar e o que fazer quando algo falha**.

---

## Indice

1. [Visao geral do fluxo](#1-visao-geral-do-fluxo)
2. [Pre-requisitos](#2-pre-requisitos)
3. [Anatomia da invocacao](#3-anatomia-da-invocacao)
4. [Referencia de flags](#4-referencia-de-flags)
5. [Resolucao de `--input`](#5-resolucao-de---input)
6. [Providers e variaveis de ambiente](#6-providers-e-variaveis-de-ambiente)
7. [Limite de tamanho de chunk (providers OpenAI)](#7-limite-de-tamanho-de-chunk-providers-openai)
8. [Concorrencia e carga no provider](#8-concorrencia-e-carga-no-provider)
9. [Layout de saida e artefatos](#9-layout-de-saida-e-artefatos)
10. [Procedimentos operacionais](#10-procedimentos-operacionais)
11. [Exit codes](#11-exit-codes)
12. [Verificacao pos-execucao](#12-verificacao-pos-execucao)
13. [Semantica de `--resume`](#13-semantica-de---resume)
14. [Troubleshooting](#14-troubleshooting)
15. [Recuperacao e rollback](#15-recuperacao-e-rollback)
16. [Apendice: CLI `wiki`](#16-apendice-cli-wiki)
17. [Referencias](#17-referencias)

---

## 1. Visao geral do fluxo

```
midia (.mkv/.mp4/...)
   │
   ├─ ffprobe   → mede a duracao total
   ├─ ffmpeg    → corta em chunks WAV PCM 16-bit mono 16 kHz  →  chunks/NNNN.wav
   │             grava manifest.json (ordem) e job-state.json (estado)
   │
   ├─ provider  → transcreve os chunks PENDENTES em paralelo  →  transcripts/NNNN.md
   │             (fake | openai-whisper | openai-transcription)
   │
   └─ merge     → concatena os markdown na ordem do manifesto →  transcript.md
                 (somente no caminho 100% bem-sucedido)
```

- O job e **resumivel**: cada passo persiste estado em `job-state.json`/`manifest.json`.
- Multiplos `--input` rodam como um **lote**, cada arquivo em seu proprio subdiretorio.
- O resultado e comunicado por **exit code** (`0` sucesso, `2` parcial, `1` fatal).

---

## 2. Pre-requisitos

| Requisito | Detalhe | Como verificar |
|-----------|---------|----------------|
| **Node.js >= 22.12.0** | Exigido por `commander@15` (`package.json` → `engines`); o README e o `package.json` concordam em >=22.12.0, sendo o `package.json` a fonte autoritativa. | `node --version` |
| **ffmpeg no PATH** | Usado para cortar os chunks. | `ffmpeg -version` |
| **ffprobe no PATH** | Usado para medir a duracao. | `ffprobe -version` |
| **Dependencias instaladas** | `commander`, `openai`. | `npm install` |

> Sem `ffmpeg`/`ffprobe` no PATH, a etapa de segmentacao falha com **erro fatal (exit 1)**.

Instalacao inicial:

```bash
npm install
mkdir -p .ignore/raw   # diretorio de entrada conveniente (ignorado pelo Git)
```

---

## 3. Anatomia da invocacao

A forma canonica passa pelo npm script, que **compila e executa**:

```bash
npm run transcribe -- <flags do CLI>
```

- O `--` separa as flags do `npm` das flags do **CLI**. Tudo apos `--` vai para o `transcribe`.
- `npm run transcribe` roda `npm run build --silent` (recompila `dist/`) e depois
  `node dist/src/cli/main.js` (`package.json` → `scripts.transcribe`).
- O exit code do processo reflete o resultado do job — leia com `echo $?`.

**Atalho para operacao repetida** (evita recompilar a cada chamada):

```bash
npm run build                       # uma vez
node dist/src/cli/main.js <flags>   # quantas vezes quiser
```

Ajuda embutida (lista as flags e sai com exit `0`):

```bash
npm run transcribe -- --help
```

---

## 4. Referencia de flags

Fonte: `src/cli/cli-argument-parser.ts`.

| Flag | Obrigatoria | Tipo | Default | Descricao |
|------|:-----------:|------|---------|-----------|
| `--input <arquivo>` | **Sim** (≥1) | string, **repetivel** | — | Arquivo de entrada. Repita uma vez por arquivo para rodar em lote. |
| `--output <diretorio>` | **Sim** | string | — | Diretorio raiz de saida do job. Criado se nao existir. |
| `--chunk-duration-seconds <s>` | **Sim** | inteiro > 0 | — | Duracao de cada chunk em segundos. |
| `--concurrency <n>` | **Sim** | inteiro > 0 | — | Transcricoes simultaneas de chunks **por arquivo**. |
| `--provider <nome>` | **Sim** | string | — | `fake`, `openai-whisper` ou `openai-transcription`. |
| `--cleanup-policy <p>` | **Sim** | `on-success` \| `keep` | — | `on-success` apaga os `.wav` no sucesso total; `keep` mantem tudo. |
| `--file-concurrency <n>` | Nao | inteiro > 0 | `1` | Quantos arquivos sao processados em paralelo. |
| `--resume` | Nao | flag | `false` | Retoma um job existente a partir do estado persistido. |
| `--help` | Nao | flag | — | Mostra o uso e sai (exit `0`). |

Notas operacionais:

- **`--cleanup-policy` e obrigatoria** — nao ha valor padrao; omiti-la falha com
  `Flag obrigatoria ausente: --cleanup-policy`.
- **Nao existe `--version`**, nem flags `--language`/`--model`/`--prompt`: idioma, modelo e
  prompt sao definidos por **variaveis de ambiente** (secao 6).
- O nome do provider so e validado quando o binding e criado: um valor fora da lista falha
  com `Provedor '<x>' nao esta implementado nesta V1.` (exit 1).
- Inteiros invalidos (`0`, negativos, nao-numericos) falham com
  `Flag <flag> deve ser um inteiro positivo.`
- Se `--output` apontar para um caminho que **existe e nao e diretorio**, a CLI falha com
  `--output deve ser um diretorio.`

---

## 5. Resolucao de `--input`

Regra de `src/cli/input-path-resolver.ts` (aplicada a cada `--input`):

| Forma do valor | Resultado |
|----------------|-----------|
| Caminho absoluto (`/home/.../a.mkv`) | usado como esta |
| Contem diretorio (`./videos/a.mkv`, `sub/a.mkv`) | usado como esta (relativo ao CWD) |
| Apenas o nome do arquivo (`sessao.mkv`) | resolvido para `.ignore/raw/sessao.mkv` |

Depois disso todos os caminhos sao absolutizados. Inputs **duplicados sao deduplicados**
(o mesmo caminho repetido conta uma vez so).

---

## 6. Providers e variaveis de ambiente

### Carregamento de `.env`

`src/shared/env-file.ts`:

- A CLI carrega `.env` do **diretorio atual** automaticamente.
- Variaveis **ja exportadas no shell vencem** (o `.env` nao sobrescreve o ambiente).
- Sem arquivo `.env`, segue normalmente (ausencia nao e erro).
- Suporta `export KEY=...`, valores com aspas simples/duplas e comentarios `#`. Uma linha
  malformada (sem `=`, chave invalida) e **erro fatal**.

### `fake` — offline, sem rede (smoke test / CI)

Nenhuma API key. Gera markdown deterministico. Util para validar o pipeline ponta a ponta.

| Variavel | Default | Efeito |
|----------|---------|--------|
| `FAKE_TRANSCRIBER_LATENCY_MS` | `10` | Latencia sintetica por chunk (ms). |
| `FAKE_TRANSCRIBER_FAIL_CHUNKS` | — | Lista CSV de indices (1-based) que devem **falhar** — ex.: `2,5`. Util para ensaiar falha parcial (P6). |

> **Atencao ao `--resume`:** ambas as variaveis entram no `transcriberSignature` do `fake`.
> Muda-las (inclusive **remover** `FAKE_TRANSCRIBER_FAIL_CHUNKS`) **invalida a retomada** com
> `Snapshot de resume incompativel` (exit 1). Detalhes e ensaios em P6 e na secao 13.

### `openai-whisper` — OpenAI, modelo fixo

Travado em `whisper-1` com `response_format: json`.

| Variavel | Obrigatoria | Efeito |
|----------|:-----------:|--------|
| `OPENAI_API_KEY` | **Sim** | Credencial da OpenAI. |
| `OPENAI_WHISPER_LANGUAGE` | Nao | Idioma (normalizado para minusculas). |
| `OPENAI_WHISPER_PROMPT` | Nao | Prompt estatico aplicado a todos os chunks. |

> Alterar `language` ou `prompt` **invalida o `--resume`** (muda a assinatura do transcritor).

### `openai-transcription` — OpenAI ou Azure, modelo escolhivel

| Variavel | Obrigatoria | Efeito |
|----------|:-----------:|--------|
| `OPENAI_TRANSCRIPTION_MODEL` | **Sim** | Um de: `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`. |
| `OPENAI_TRANSCRIPTION_BACKEND` | Nao | `openai` (default) ou `azure`. |
| `OPENAI_TRANSCRIPTION_LANGUAGE` | Nao | Idioma (minusculas). |
| `OPENAI_TRANSCRIPTION_PROMPT` | Nao | Prompt estatico. |

Backend `openai` exige tambem:

| Variavel | Obrigatoria |
|----------|:-----------:|
| `OPENAI_API_KEY` | **Sim** |

Backend `azure` exige tambem:

| Variavel | Obrigatoria | Observacao |
|----------|:-----------:|------------|
| `AZURE_OPENAI_API_KEY` | **Sim** | |
| `AZURE_OPENAI_ENDPOINT` | **Sim** | Barra final e removida. |
| `OPENAI_API_VERSION` | **Sim** | Ex.: `2025-03-01-preview`. |
| `AZURE_OPENAI_DEPLOYMENT` | Nao | So necessario se o deployment difere do nome do modelo. |

---

## 7. Limite de tamanho de chunk (providers OpenAI)

Antes de qualquer chamada de API, os providers OpenAI fazem um **preflight** que estima o
tamanho do `.wav` do chunk e rejeita durações que estourem o limite de upload
(`src/infrastructure/providers/openai-audio-provider-shared.ts`).

- Formato canonico: WAV PCM 16-bit mono 16 kHz = **32.000 bytes/segundo** (+44 bytes de header).
- Limite de upload: **25.000.000 bytes (25 MB)**.
- **Maximo pratico: `--chunk-duration-seconds 781`** (≈ 13 minutos). Acima disso o preflight
  falha com `chunk-duration-seconds atual excede o limite estimado de upload...` (exit 1).

> O provider `fake` **nao** aplica esse limite — use chunks grandes a vontade em testes offline.

Recomendacao operacional: `--chunk-duration-seconds 600` (10 min) e uma margem segura para
os providers OpenAI.

---

## 8. Concorrencia e carga no provider

Dois niveis de paralelismo se multiplicam:

```
chamadas simultaneas ao provider  ≈  --file-concurrency  ×  --concurrency
```

- `--concurrency` — chunks em voo **por arquivo**.
- `--file-concurrency` — arquivos em voo (default `1`, igual a carga da versao single-file).
- Se o produto **passar de 16**, a CLI emite um **aviso suave** (nunca fatal) sobre risco de
  erros `429` (thundering herd). Fonte: `SOFT_CONCURRENCY_WARN_THRESHOLD` em
  `src/application/run-batch-transcription-use-case.ts`.

Comece conservador (ex.: `--concurrency 2 --file-concurrency 2` = 4 em voo) e suba conforme os
limites de rate do seu provider permitirem.

---

## 9. Layout de saida e artefatos

O layout **depende da quantidade de `--input`**:

| Entradas | Layout |
|----------|--------|
| 1 arquivo | `<output>/transcript.md` (flat, retrocompativel) |
| 2+ arquivos | `<output>/<slug>-<hash>/transcript.md` por arquivo + `<output>/batch-index.json` |

- `<slug>` = nome base sanitizado (minusculas, nao-alfanumerico vira `-`).
- `<hash>` = primeiros 8 hex do `sha256` do caminho absoluto — evita colisao entre arquivos de
  mesmo nome. Fonte: `deriveJobSubdir` em `src/shared/paths.ts`.
- `batch-index.json` (so com 2+) mapeia cada input para `subdir`, `exitCode` e `status`.

Artefatos dentro de cada raiz de job:

| Artefato | Conteudo |
|----------|----------|
| `manifest.json` | Manifesto ordenado por `index`, com `startMs`, `endMs`, `chunkPath`. |
| `job-state.json` | Estado autoritativo do job e de cada chunk. |
| `chunks/NNNN.wav` | Audio intermediario (PCM 16-bit mono 16 kHz). |
| `transcripts/NNNN.md` | Markdown parcial por chunk. |
| `transcript.md` | Consolidado final — **so existe no sucesso 100%**. |

O diretorio de saida (e `chunks/`, `transcripts/`) e **criado automaticamente**
(`file-job-store.ts:70-72`).

---

## 10. Procedimentos operacionais

### P1 — Smoke test offline (provider `fake`)

Valida o pipeline inteiro sem rede nem custo. Use para confirmar ffmpeg/Node/build.

```bash
mkdir -p .ignore/raw
# coloque um arquivo de midia em .ignore/raw/sample.mkv

npm run transcribe -- \
  --input sample.mkv \
  --output ./tmp/job-fake \
  --chunk-duration-seconds 600 \
  --concurrency 4 \
  --provider fake \
  --cleanup-policy keep

echo "exit=$?"        # espere 0
```

### P2 — Transcricao single-file (`openai-whisper`)

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_WHISPER_LANGUAGE="pt"          # opcional
export OPENAI_WHISPER_PROMPT="glossario do dominio"   # opcional

npm run transcribe -- \
  --input "2026-04-09 20-38-18.mkv" \
  --output ./tmp/whisper-job \
  --chunk-duration-seconds 600 \
  --concurrency 2 \
  --provider openai-whisper \
  --cleanup-policy on-success
```

Alternativa com `.env` (em vez de `export`):

```bash
cat > .env <<'EOF'
OPENAI_API_KEY=sk-...
OPENAI_WHISPER_LANGUAGE=pt
OPENAI_WHISPER_PROMPT=glossario do dominio
EOF
```

### P3 — Lote multi-file

```bash
npm run transcribe -- \
  --input sessao1.mkv \
  --input sessao2.mkv \
  --input sessao3.mkv \
  --output ./tmp/batch \
  --chunk-duration-seconds 600 \
  --concurrency 2 \
  --file-concurrency 2 \
  --provider openai-whisper \
  --cleanup-policy on-success

cat ./tmp/batch/batch-index.json   # localiza o subdir de cada arquivo
```

`--resume` se aplica **por arquivo**: arquivos com artefatos compativeis retomam, arquivos
novos comecam do zero, e um arquivo com input alterado falha fatalmente **sem derrubar os demais**.

### P4 — Retomar um job parcial (`--resume`)

Use quando um job anterior terminou com **exit 2** (falha parcial) ou foi interrompido
(estado `running`). **Mantenha exatamente as mesmas flags _e_ variaveis de ambiente** do job
original — qualquer mudanca no `transcriberSignature` (idioma, prompt, ou as `FAKE_TRANSCRIBER_*`
no `fake`) faz a retomada ser rejeitada com exit 1 (secao 13):

```bash
npm run transcribe -- \
  --input sample.mkv \
  --output ./tmp/job-fake \
  --chunk-duration-seconds 600 \
  --concurrency 4 \
  --provider fake \
  --cleanup-policy on-success \
  --resume
```

Apenas os chunks `failed` (e `running` orfaos) sao reprocessados; os `succeeded` sao mantidos.
Detalhes em [Semantica de `--resume`](#13-semantica-de---resume); para um ensaio reproduzivel
com o `fake`, veja P6.

### P5 — Azure OpenAI (`openai-transcription`)

```bash
export OPENAI_TRANSCRIPTION_BACKEND="azure"
export OPENAI_TRANSCRIPTION_MODEL="gpt-4o-transcribe"
export AZURE_OPENAI_API_KEY="azure-key"
export AZURE_OPENAI_ENDPOINT="https://exemplo.openai.azure.com"
export OPENAI_API_VERSION="2025-03-01-preview"
export AZURE_OPENAI_DEPLOYMENT="transcribe-prod"   # opcional

npm run transcribe -- \
  --input "2026-04-09 20-38-18.mkv" \
  --output ./tmp/azure-job \
  --chunk-duration-seconds 600 \
  --concurrency 2 \
  --provider openai-transcription \
  --cleanup-policy keep
```

### P6 — Ensaiar falha parcial e resume com o `fake`

> **Importante (verificado nesta sessao):** no `fake`, a *causa* da falha
> (`FAKE_TRANSCRIBER_FAIL_CHUNKS`) faz parte do `transcriberSignature`. Por isso voce **nao cura**
> um chunk failed apenas removendo a variavel na retomada — isso muda a assinatura e a retomada e
> **rejeitada (exit 1)**. "Curar" uma falha apenas retomando e o comportamento de um **provider
> real** cuja falha foi transiente (rede, 429, 5xx) e nao entra na assinatura.

Compile uma vez e use o binario (o `timeout` do P6b nao pode competir com o tempo de build):

```bash
npm run build
```

**P6a — Falha parcial deterministica e a guarda de assinatura**

```bash
DIR=./tmp/job-partial; rm -rf "$DIR"

# 1) Falha o chunk 2 -> exit 2, partial_failed, sem transcript.md
FAKE_TRANSCRIBER_FAIL_CHUNKS=2 node dist/src/cli/main.js \
  --input sample.mkv --output "$DIR" \
  --chunk-duration-seconds 10 --concurrency 4 \
  --provider fake --cleanup-policy keep; echo "exit=$?"   # 2

# 2) Retoma com a MESMA env -> snapshot bate, reprocessa SO o chunk 0002,
#    mas a falha e deterministica -> exit 2 de novo
FAKE_TRANSCRIBER_FAIL_CHUNKS=2 node dist/src/cli/main.js \
  --input sample.mkv --output "$DIR" \
  --chunk-duration-seconds 10 --concurrency 4 \
  --provider fake --cleanup-policy keep --resume; echo "exit=$?"   # 2

# 3) Retoma SEM a env -> assinatura mudou -> REJEITADO
node dist/src/cli/main.js \
  --input sample.mkv --output "$DIR" \
  --chunk-duration-seconds 10 --concurrency 4 \
  --provider fake --cleanup-policy keep --resume; echo "exit=$?"
#   1  -> errorSummary "Snapshot de resume incompativel: transcriberSignature"
```

**P6b — Resume feliz apos interrupcao** (o caminho que realmente completa com o `fake`)

Interrompa o job no meio da transcricao mantendo a assinatura e retome com a mesma config:

```bash
DIR=./tmp/job-interrupt; rm -rf "$DIR"

# 1) Latencia alta + interrupcao por timeout -> o job fica em `running`
FAKE_TRANSCRIBER_LATENCY_MS=4000 timeout 2 node dist/src/cli/main.js \
  --input sample.mkv --output "$DIR" \
  --chunk-duration-seconds 10 --concurrency 1 \
  --provider fake --cleanup-policy keep; echo "exit=$?"   # 124 (interrompido), status=running

# 2) Retoma com a MESMA latencia (assinatura identica) -> completa
FAKE_TRANSCRIBER_LATENCY_MS=4000 node dist/src/cli/main.js \
  --input sample.mkv --output "$DIR" \
  --chunk-duration-seconds 10 --concurrency 4 \
  --provider fake --cleanup-policy keep --resume; echo "exit=$?"   # 0 -> transcript.md gerado
```

---

## 11. Exit codes

Fonte: `RunTranscriptionJobUseCase` / agregacao em `RunBatchTranscriptionUseCase`.

| Code | Significado | Acao tipica |
|:----:|-------------|-------------|
| `0` | Sucesso total — `transcript.md` gerado. | Nenhuma. |
| `2` | Falha parcial **reaproveitavel** — um ou mais chunks falharam. | Rode de novo com `--resume` (P4). |
| `1` | Erro fatal ou uso invalido (flag faltando, provider invalido, env ausente, ffmpeg ausente, snapshot incompativel, chunk acima do limite). | Corrija a causa e rode de novo. |

**Agregacao em lote** (multiplos `--input`): qualquer arquivo com `1` ⇒ lote retorna `1`;
sem fatais, mas com algum `2` ⇒ lote retorna `2`; todos `0` ⇒ `0`. O `batch-index.json`
registra o exit code individual de cada arquivo.

Leia o codigo com `echo $?` logo apos a execucao.

---

## 12. Verificacao pos-execucao

Checklist rapido de sucesso:

```bash
echo $?                                  # 0 = sucesso total

# single-file:
test -f ./tmp/job-fake/transcript.md && echo "OK: transcript final existe"

# multi-file:
cat ./tmp/batch/batch-index.json          # confira status/exitCode por arquivo
```

- `transcript.md` **so e escrito no sucesso 100%** — sua ausencia indica exit 1 ou 2.
- Em `job-state.json`, o `status` do job de sucesso e `succeeded`.
- Com `--cleanup-policy on-success`, o diretorio `chunks/` fica vazio apos sucesso; com `keep`,
  os `.wav` permanecem para inspecao.

---

## 13. Semantica de `--resume`

### Snapshot de compatibilidade

`--resume` so prossegue se o **snapshot** do job persistido bater com a invocacao atual.
Campos comparados (qualquer divergencia ⇒ exit 1):

`resolvedInputPath`, `inputSizeBytes`, `inputMtimeMs`, `provider`, `transcriberSignature`,
`chunkDurationSeconds`.

> Consequencia pratica: trocar o arquivo de entrada, o provider, o `--chunk-duration-seconds`,
> ou qualquer entrada que componha o `transcriberSignature` **invalida a retomada (exit 1)**.
> Isso inclui **variaveis de ambiente**: `OPENAI_*_LANGUAGE`/`OPENAI_*_PROMPT`/backend nos
> providers OpenAI, e `FAKE_TRANSCRIBER_LATENCY_MS`/`FAKE_TRANSCRIBER_FAIL_CHUNKS` no `fake`.
> **Regra de ouro: retome com exatamente as mesmas flags _e_ variaveis de ambiente do job original.**

### Estados resumiveis

| Estado do job | Resume |
|---------------|--------|
| `ready`, `partial_failed`, `running` | Continua — reconcilia os chunks e reprocessa os pendentes. |
| `succeeded` | No-op valido (retorna sucesso sem refazer nada). |
| `created`, `segmenting`, `fatal_error` | **Nao** resumivel ⇒ exit 1. |

> Um job interrompido (Ctrl-C, `kill`, timeout) **durante a transcricao** fica em `running` e
> **e** resumivel (verificado empiricamente). So `created`/`segmenting` (interrompido antes de a
> segmentacao terminar) e `fatal_error` exigem recomeco do zero (secao 15). Fonte:
> `prepareResume` em `src/application/run-transcription-job-use-case.ts` rejeita apenas esses tres.

Reconciliacao de chunks na retomada: `succeeded` permanece; `failed` volta a `pending`
(preservando `attempts`/`errorSummary`); `running` sem `finishedAt` volta a `pending`.

### Matriz artefatos × `--resume` (comportamento real via CLI)

| Destino tem artefatos? | `--resume`? | Resultado |
|:----------------------:|:-----------:|-----------|
| Nao | Nao | Job novo do zero. |
| Nao | **Sim** | Job novo do zero — o orquestrador de lote desativa o resume quando nao ha o que retomar. |
| Sim | Nao | **Erro fatal**: `outputDir ja contem artefatos de job. Use --resume...` (exit 1). |
| Sim | **Sim** | Retoma (sujeito ao snapshot acima). |

> Nuance de implementacao: o use case isolado faria *fail-fast* tambem no caso
> "`--resume` sem artefatos", mas o wrapper de lote
> (`RunBatchTranscriptionUseCase`, `effectiveResume = resume && hasPersistedJobArtifacts`)
> neutraliza esse caso. **Via CLI, `--resume` sem artefatos sempre inicia um job limpo.**

---

## 14. Troubleshooting

| Sintoma / mensagem | Causa provavel | Acao |
|--------------------|----------------|------|
| `Flag obrigatoria ausente: --<x>` | Faltou uma flag obrigatoria (inclusive `--cleanup-policy`). | Adicione a flag (secao 4). |
| `Flag <x> deve ser um inteiro positivo.` | Valor `0`, negativo ou nao-numerico. | Use inteiro > 0. |
| `Flag --cleanup-policy deve ser 'on-success' ou 'keep'.` | Valor invalido. | Use um dos dois. |
| `Flag desconhecida: --<x>` | Flag inexistente / erro de digitacao. | Veja `--help`. |
| `Provedor '<x>' nao esta implementado nesta V1.` | `--provider` fora da lista. | Use `fake`, `openai-whisper` ou `openai-transcription`. |
| `OPENAI_API_KEY e obrigatoria...` | Key ausente no ambiente e no `.env`. | `export OPENAI_API_KEY=...` ou coloque no `.env`. |
| `OPENAI_TRANSCRIPTION_MODEL deve ser um de: ...` | Modelo nao suportado. | Use `whisper-1`, `gpt-4o-transcribe` ou `gpt-4o-mini-transcribe`. |
| `AZURE_OPENAI_ENDPOINT/...e obrigatoria quando ...=azure` | Faltou config do backend Azure. | Defina as 3 obrigatorias do Azure (secao 6). |
| `chunk-duration-seconds atual excede o limite estimado de upload...` | Chunk > 25 MB nos providers OpenAI. | Use `--chunk-duration-seconds` ≤ 781 (secao 7). |
| `--output deve ser um diretorio.` | O caminho existe e e um arquivo. | Aponte para um diretorio. |
| Erro de spawn / `ffmpeg`/`ffprobe` nao encontrado | Binarios fora do PATH. | Instale ffmpeg e garanta no PATH (secao 2). |
| Job termina com **exit 2** | Falha parcial de chunks (rede, rate limit, provider). | Rode com `--resume` (P4). |
| `outputDir ja contem artefatos de job...` | Reexecucao sobre destino ja usado sem `--resume`. | Adicione `--resume` ou use outro `--output`. |
| `Job em estado <segmenting/fatal_error> nao pode ser retomado.` | Job morreu antes de um estado resumivel. | Limpe o destino e recomece (secao 15). |
| Aviso `file-concurrency x concurrency alto...` | Produto > 16 (aviso, **nao** fatal). | Reduza a concorrencia se aparecerem `429`. |
| `Snapshot de resume incompativel: <campo>` | Mudou input/provider/chunk-duration ou uma env que compoe a assinatura (`language`/`prompt`; `FAKE_TRANSCRIBER_*`). | Retome com as mesmas flags **e** envs, ou recomece do zero (secao 15). |
| `Job em estado running...` retoma sozinho | Job interrompido (Ctrl-C/kill/timeout) durante a transcricao. | `running` e resumivel: rode de novo com `--resume` e a mesma assinatura (P6b). |

---

## 15. Recuperacao e rollback

- **Recomecar do zero:** apague a raiz do job e rode sem `--resume`.
  ```bash
  rm -rf ./tmp/job-fake        # single-file: a raiz inteira
  rm -rf ./tmp/batch/<slug>-<hash>   # multi-file: apenas o subdir do arquivo
  ```
- **Retomar em vez de recomecar:** prefira `--resume` (P4) para nao reprocessar chunks que ja
  tiveram sucesso (economiza tempo e custo de API).
- **Diagnostico antes de limpar:** rode com `--cleanup-policy keep` para preservar os `.wav` e os
  `transcripts/NNNN.md` parciais; inspecione `job-state.json` para ver o `status`/`errorSummary`
  de cada chunk.
- **Job preso em `segmenting`/`fatal_error`:** nao e resumivel — apague a raiz do job e reexecute.

---

## 16. Apendice: CLI `wiki`

Ferramenta separada para manter o code-wiki em `docs/wiki/` (documenta o **codigo**, nao as
transcricoes). Fonte: `src/wiki/cli/wiki-argument-parser.ts`.

```bash
npm run wiki -- init                       # cria a estrutura inicial do wiki
npm run wiki -- refresh                     # regenera toda a evidencia deterministica
npm run wiki -- ingest --source <caminho>   # ingere fontes (repetivel) na evidencia
npm run wiki -- query --query "<termos>"     # consulta paginas (--limit <n>, default 5)
npm run wiki -- lint                        # valida a saude do wiki
```

- Todos os subcomandos aceitam `--root <diretorio>` (default `docs/wiki`).
- `ingest` exige ao menos um `--source`; `query` exige `--query` nao vazio.
- Use `ingest` apos mudancas relevantes em `src/`, `tests/`, `README.md`, `AGENTS.md`,
  `CLAUDE.md` ou `.omx/plans/`. Use `refresh` para regenerar tudo.

---

## 17. Referencias

Codigo-fonte (fonte da verdade deste runbook):

- `src/cli/cli-argument-parser.ts` — flags, defaults e validacoes.
- `src/cli/transcription-cli-application.ts` — composicao, carga de `.env`, dispatch.
- `src/cli/input-path-resolver.ts` — resolucao de `--input`.
- `src/cli/default-transcriber-binding-factory.ts` — selecao de provider.
- `src/infrastructure/providers/` — configs e preflight de upload dos providers.
- `src/application/run-batch-transcription-use-case.ts` — lote, concorrencia, agregacao de exit codes.
- `src/shared/paths.ts` / `src/shared/chunk-audio-format.ts` — layout de saida e formato de audio.

Documentacao de arquitetura (code-wiki):

- `docs/wiki/pages/transcription-job.md` — fluxo ponta a ponta.
- `docs/wiki/pages/resume-semantics.md` — semantica de `--resume`.
- `docs/wiki/pages/provider-adapters.md` — matriz de providers e assinaturas.
- `docs/wiki/pages/architecture.md` — mapa de camadas.
- `README.md` — visao geral e exemplos.
