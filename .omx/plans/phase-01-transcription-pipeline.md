# Phase 01: Pipeline de Transcricao para MKV Longo

## Resultado esperado da fase

Entregar uma CLI em TypeScript capaz de dividir um `.mkv` em chunks de audio, transcrever os chunks em paralelo por meio de um adaptador substituivel e produzir `N` markdowns parciais mais um markdown final consolidado em ordem cronologica somente quando todos os chunks concluirem com sucesso.

## Estrutura alvo recomendada

```text
src/
  cli/
    main.ts
    parse-args.ts
  application/
    run-transcription-job.ts
    merge-transcripts.ts
  domain/
    entities/
      chunk-manifest.ts
      transcription-result.ts
      job-state.ts
    ports/
      transcriber.ts
      media-segmenter.ts
      job-store.ts
  infrastructure/
    media/
      ffmpeg-media-segmenter.ts
      ffprobe.ts
    providers/
      fake-transcriber.ts
      <provider-name>-transcriber.ts
    storage/
      file-job-store.ts
    concurrency/
      task-pool.ts
  shared/
    logger.ts
    paths.ts
    errors.ts
tests/
  unit/
  integration/
```

## Arquitetura proposta

- `run-transcription-job` coordena o fluxo ponta a ponta.
- `MediaSegmenter` e responsavel por converter, inspecionar e dividir o `.mkv` em chunks de audio.
- `Transcriber` encapsula a chamada ao provedor real.
- `JobStore` persiste manifesto, `job-state.json`, status e saidas markdown.
- O merge final le o manifesto persistido e reconstrui a ordem cronologica pelo `index`.
- A CLI recebe duracoes em segundos e o dominio converte tudo para milissegundos.
- O merge final so ocorre com 100% de sucesso; falha parcial encerra com estado persistido e sem consolidado final.
- A retomada so acontece com `--resume`; sem essa flag, `outputDir` ocupado e erro de operacao.

## Contratos principais

### `Transcriber`

- Entrada:
  - `chunkIndex`
  - `audioPath`
  - `startMs`
  - `endMs`
  - metadados opcionais do job
- Saida:
  - `chunkIndex`
  - `markdown`
  - metadados do provedor

### `MediaSegmenter`

- Entrada:
  - `inputPath`
  - `workingDir`
  - `chunkDurationMs`
- Saida:
  - `manifest.json` com lista ordenada de chunks

### `JobStore`

- Responsabilidades:
  - salvar manifesto
  - salvar e atualizar `job-state.json`
  - registrar status por chunk
  - gravar markdown parcial
  - localizar chunks pendentes e concluidos
  - gravar markdown final consolidado
  - expor o status global do job e o `exit code` correspondente
  - validar compatibilidade do estado persistido com a configuracao atual de `--resume`

## Contrato de retomada

- A superficie de CLI para retomada sera `--resume`.
- Sem `--resume`, a presenca de `manifest.json` ou `job-state.json` em `outputDir` encerra o processo com `exit code 1`.
- Com `--resume`, o orquestrador deve carregar o estado persistido e validar um snapshot de compatibilidade com:
  - `resolvedInputPath`
  - `inputSizeBytes`
  - `inputMtimeMs`
  - `provider`
  - `chunkDurationSeconds`
- Qualquer divergencia no snapshot encerra com `exit code 1` e nao reaproveita artefatos.
- O resume nao resegmenta nem recria chunks; ele apenas reconcilia o estado e volta a orquestrar os chunks pendentes.
- Durante o bootstrap do resume, chunks em `running` sem `finishedAt` sao convertidos para `pending` e recebem nota de recuperacao.

## Maquina de estados autoritativa

### Estado global do job

- Estados permitidos:
  - `created`
  - `segmenting`
  - `ready`
  - `running`
  - `partial_failed`
  - `succeeded`
  - `fatal_error`
- Transicoes validas:
  - `created -> segmenting`
  - `segmenting -> ready`
  - `ready -> running`
  - `running -> succeeded`
  - `running -> partial_failed`
  - `partial_failed -> running` apenas com `--resume`
  - `created -> fatal_error`
  - `segmenting -> fatal_error`
  - `ready -> fatal_error`
  - `running -> fatal_error`
- Semantica de `exit code`:
  - `0` apenas para `succeeded`
  - `2` apenas para `partial_failed`
  - `1` para `fatal_error` e para qualquer tentativa de operacao invalida antes de o job ficar reaproveitavel

### Estado por chunk

- Estados permitidos:
  - `pending`
  - `running`
  - `succeeded`
  - `failed`
- Transicoes validas:
  - `pending -> running`
  - `running -> succeeded`
  - `running -> failed`
  - `failed -> pending` apenas durante `--resume`
  - `running -> pending` apenas na recuperacao de execucao interrompida
- Regras:
  - `succeeded` e terminal
  - `failed` e reaproveitavel
  - chunks marcados como `running` no disco nao podem ser mantidos assim apos recuperar o job

## Ondas e slices

### Slice 1: Bootstrap do projeto e contratos centrais

- Arquivos provaveis:
  - `package.json`
  - `tsconfig.json`
  - `src/domain/ports/transcriber.ts`
  - `src/domain/ports/media-segmenter.ts`
  - `src/domain/ports/job-store.ts`
  - `src/domain/entities/chunk-manifest.ts`
  - `src/domain/entities/job-state.ts`
  - `src/application/run-transcription-job.ts`
  - `src/cli/main.ts`
- O que deve fazer:
  - inicializar o projeto TypeScript para CLI
  - definir entidades e portas do dominio
  - definir formato do manifesto, de `job-state.json` e convencoes de nomes de arquivos
  - definir a semantica de tempo: CLI em segundos, dominio e manifesto em milissegundos
  - definir semantica de conclusao: sem merge final em falha parcial, `exit code 0/1/2`
  - definir contrato de resume explicito com `--resume` e snapshot de compatibilidade
  - definir a maquina de estados autoritativa do job e dos chunks
  - criar fluxo minimo da CLI e validacao de argumentos
- Verificacao:
  - compilacao TypeScript sem erros
  - teste unitario para serializacao e ordenacao do manifesto
  - teste unitario para schema e transicoes de `job-state.json`
  - teste unitario para conversao `chunkDurationSeconds -> chunkDurationMs`
  - teste unitario validando que resume exige `--resume` explicito e rejeita snapshot incompativel
- Pronto quando:
  - a CLI aceita configuracao valida, rejeita unidades ambiguas, exige `--resume` explicito para reaproveitamento e instancia dependencias por contrato
- Depends on:
  - nenhuma dependencia previa

### Slice 2: Segmentacao de midia e persistencia de job

- Arquivos provaveis:
  - `src/infrastructure/media/ffprobe.ts`
  - `src/infrastructure/media/ffmpeg-media-segmenter.ts`
  - `src/infrastructure/storage/file-job-store.ts`
  - `src/shared/paths.ts`
  - `tests/integration/ffmpeg-media-segmenter.test.ts`
- O que deve fazer:
  - inspecionar duracao do `.mkv`
  - gerar chunks `.wav` em disco sem carregar o arquivo inteiro em memoria
  - persistir `manifest.json`, `job-state.json` e layout de diretorios do job
  - persistir snapshot de compatibilidade do job junto do estado inicial
  - garantir nomes ordenaveis, por exemplo `0001.md`, `0002.md`
- Verificacao:
  - smoke test com fixture curta validando quantidade e ordem dos chunks
  - teste de longa duracao gerando input sintetico acima de 3 horas via `ffmpeg` e validando manifesto, contagem de chunks e ultima janela temporal
  - validacao de que o manifesto preserva `index`, `startMs` e `endMs`
  - teste garantindo que `outputDir` ocupado sem `--resume` falha antes de reutilizar artefatos
- Pronto quando:
  - um arquivo curto e um input sintetico acima de 3 horas sao segmentados e o manifesto persistido representa fielmente os chunks gerados
- Depends on:
  - Slice 1

### Slice 3: Orquestracao paralela e adaptador de transcricao

- Arquivos provaveis:
  - `src/infrastructure/concurrency/task-pool.ts`
  - `src/infrastructure/providers/fake-transcriber.ts`
  - `src/infrastructure/providers/<provider>.ts`
  - `src/application/run-transcription-job.ts`
  - `tests/unit/task-pool.test.ts`
  - `tests/integration/transcription-orchestrator.test.ts`
- O que deve fazer:
  - executar chunks pendentes com concorrencia configuravel
  - isolar o provedor real atras da interface `Transcriber`
  - gravar markdown parcial logo apos cada chunk concluido
  - registrar falhas por chunk sem perder o contexto do job
  - retomar um job lendo `job-state.json`, reconciliando `running -> pending` e selecionando apenas chunks `pending` ou `failed`
- Verificacao:
  - teste com `fake-transcriber` garantindo execucao paralela controlada
  - teste de resiliencia validando reexecucao de chunks falhos
  - teste de `exit code 2` e ausencia de consolidado final em falha parcial
  - teste de resume rejeitando mismatch de `inputPath`, `provider` ou `chunkDurationSeconds`
  - teste de recuperacao de chunk `running` orfao para `pending`
- Pronto quando:
  - a troca do provedor exige apenas trocar o binding ou configuracao, sem alterar o fluxo principal, e a retomada tem semantica deterministica
- Depends on:
  - Slice 1
  - Slice 2

### Slice 4: Merge final, UX da CLI e documentacao operacional

- Arquivos provaveis:
  - `src/application/merge-transcripts.ts`
  - `src/cli/parse-args.ts`
  - `README.md`
  - `tests/integration/merge-transcripts.test.ts`
- O que deve fazer:
  - ler os markdowns parciais na ordem do manifesto
  - produzir um markdown final unico apenas quando todos os chunks estiverem em `succeeded`
  - expor opcoes de CLI claras para `input`, `output`, `chunk-duration-seconds`, `concurrency`, `provider`, `cleanup-policy`
  - documentar dependencias de ambiente, budget de disco e pontos de extensao para novos provedores
- Verificacao:
  - teste de merge garantindo ordenacao correta, independente da ordem de conclusao dos chunks
  - smoke test end-to-end usando provedor fake
  - smoke test end-to-end de retomada apos falha parcial
  - teste garantindo limpeza em `cleanupPolicy=on-success` e retencao em `cleanupPolicy=keep`
- Pronto quando:
  - o fluxo completo gera `N` markdowns e um consolidado final deterministicamente ordenado apenas no caminho 100% bem-sucedido
- Depends on:
  - Slice 2
  - Slice 3

## Decisoes de implementacao que reduzem risco

- Persistir estado por job desde o inicio, em vez de depender apenas de memoria.
- Comecar com um `fake-transcriber` para provar o pipeline antes de integrar provedores externos.
- Usar uma fila de concorrencia simples e explicita, nao processamento ad hoc com `Promise.all` sem limite.
- Basear o merge no manifesto, nao em `mtime` nem em ordem de arquivos no filesystem.
- Tratar o suporte a `>3h` como criterio de validacao explicito, nao como inferencia a partir de fixtures curtas.

## Riscos e mitigacoes

- Corte de sentencas entre chunks:
  - aceitar duracao fixa na V1 e medir a qualidade antes de introduzir overlap.
- Variacao de formato aceito por provedores:
  - padronizar chunk intermediario e deixar adaptadores converterem apenas se necessario.
- Falha parcial em jobs longos:
  - persistir status por chunk em `job-state.json`, bloquear merge final e sair com `exit code 2`.
- Ambiguidade no reaproveitamento de `outputDir`:
  - exigir `--resume` explicito e validar snapshot de compatibilidade antes de reutilizar qualquer artefato.
- Dependencia de binarios externos:
  - validar `ffmpeg` e `ffprobe` logo no inicio da CLI.
- Crescimento de disco com `.wav` intermediario:
  - fixar `16000 Hz`, mono, PCM 16-bit e documentar `cleanupPolicy`.

## Handoff para execucao

- Executar as slices em ordem.
- Nao integrar provedor externo antes de o fluxo completo funcionar com `fake-transcriber`.
- Qualquer novo provedor deve implementar somente `Transcriber` e ser registrado em uma factory ou binding central.
