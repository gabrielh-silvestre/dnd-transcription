# Requisitos: Pipeline de Transcricao de Audio

## Objetivo

Construir um script em TypeScript que receba arquivos `.mkv` longos, separe o conteudo em partes menores, processe essas partes em paralelo por meio de uma camada de transcricao desacoplada e gere:

1. `N` arquivos `.md`, um por parte processada.
2. Um arquivo `.md` final consolidado na ordem cronologica correta.

## Verdades que precisam ser reais ao final

- O pipeline aceita ao menos um arquivo `.mkv` como entrada via CLI.
- A etapa de fracionamento funciona com arquivos de longa duracao, inclusive acima de 3 horas.
- A transcricao e acionada por uma interface/porta substituivel, sem acoplamento do orquestrador a um provedor especifico.
- O processamento paralelo respeita um limite configuravel de concorrencia.
- Cada parte gera um artefato persistido com indice e metadados suficientes para recomposicao ordenada.
- A consolidacao final nao depende da ordem de termino das tarefas paralelas.
- O fluxo falha de forma observavel, com erros por parte e contexto suficiente para retentativa.
- O suporte a arquivos acima de 3 horas possui verificacao dedicada, nao apenas smoke tests curtos.

## Requisitos funcionais

- Ler `inputPath`, `outputDir`, `chunkDurationSeconds`, `concurrency`, `provider`, `cleanupPolicy` e a flag booleana `resume`.
- Sem `--resume`, a CLI deve falhar ao encontrar `outputDir` com artefatos de job existentes, evitando reaproveitamento implicito.
- Inspecionar o arquivo de entrada e gerar um manifesto de partes com `index`, `startMs`, `endMs` e `chunkPath`.
- Criar arquivos intermediarios de audio prontos para transcricao.
- Executar transcricoes em paralelo usando um adaptador de provedor.
- Persistir uma saida markdown por parte, com nome ordenavel por indice.
- Persistir `job-state.json` com status global do job e status por chunk.
- Persistir no estado do job um snapshot de compatibilidade contendo, no minimo, `resolvedInputPath`, `inputSizeBytes`, `inputMtimeMs`, `provider` e `chunkDurationSeconds`.
- Registrar por chunk, no minimo: `status`, `attempts`, `errorSummary`, `markdownPath`, `startedAt`, `finishedAt`.
- Permitir retomada somente com `--resume`, validando compatibilidade do job persistido contra o snapshot e reexecutando apenas chunks `pending` ou `failed`.
- Durante `--resume`, qualquer chunk persistido como `running` sem `finishedAt` deve ser rebaixado para `pending` antes da nova execucao.
- Juntar as saidas em um unico markdown final pela ordem do manifesto somente quando 100% dos chunks estiverem em `succeeded`.
- Encerrar com `exit code 0` em sucesso total, `exit code 2` em falha parcial com estado persistido reaproveitavel e `exit code 1` em erro fatal antes de o job ficar consistente.

## Requisitos de arquitetura

- O nucleo do pipeline deve depender de um contrato `Transcriber`.
- O provedor deve ser selecionavel por configuracao/CLI.
- A extracao e divisao de audio devem ficar em um adaptador de infraestrutura separado do orquestrador.
- O formato de entrada do transcritor deve ser estavel dentro do sistema, para reduzir variacao entre provedores.
- O mecanismo de merge deve depender do manifesto persistido, nao do estado em memoria.
- A CLI deve expor duracoes em segundos, enquanto o dominio e os manifestos devem normalizar todos os tempos para milissegundos.
- `job-state.json` deve definir a maquina de estados autoritativa do job e dos chunks, sem enums implicitos na implementacao.

## Requisitos nao funcionais

- Suportar processamento de arquivos grandes sem carregar o conteudo inteiro em memoria.
- Permitir retomada manual ou automatizada a partir de artefatos persistidos.
- Produzir logs legiveis por etapa: probe, split, transcribe, merge.
- Manter a estrutura suficientemente simples para introduzir novos provedores sem tocar no fluxo principal.
- Validar explicitamente o caminho de longa duracao com um input sintetico acima de 3 horas, evitando depender de fixture gigante versionada.
- Tornar deterministica a retomada, rejeitando qualquer reaproveitamento de artefatos com configuracao incompativel.

## Decisoes de projeto para V1

- Usar `ffmpeg`/`ffprobe` como dependencia de sistema para probe e segmentacao.
- Padronizar os chunks intermediarios como audio `.wav` PCM 16-bit, mono, `16000 Hz`, desacoplando o pipeline do formato original `.mkv`.
- Usar chunks de duracao fixa na V1; overlap e deduplicacao ficam fora do escopo inicial.
- Persistir um `manifest.json` no diretorio de trabalho do job.
- Persistir um `job-state.json` no diretorio de trabalho do job.
- Exigir `--resume` explicito para reaproveitar um job existente; a V1 nao faz auto-resume por inferencia de `outputDir`.
- Gerar markdown parcial com cabecalho minimo contendo indice e janela temporal.
- Reter chunks intermediarios durante a execucao e, por padrao, limpa-los apenas apos merge final bem-sucedido quando `cleanupPolicy=on-success`; `cleanupPolicy=keep` preserva tudo para auditoria.
- Considerar `fatal_error` qualquer falha em validacao de CLI, incompatibilidade de resume, leitura/escrita de estado, probe, segmentacao ou merge final.
- Considerar `partial_failed` apenas quando o job esta consistente, o manifesto existe, e houve falha em um ou mais chunks transcricionais reaproveitaveis.

## Fora de escopo inicial

- Diarizacao de falantes.
- Deteccao automatica de silencios para cortes semanticos.
- Deduplicacao entre chunks com overlap.
- Banco de dados ou fila externa.
- Interface web.

## Premissas e dependencias externas

- O ambiente de execucao tera Node.js e TypeScript.
- `ffmpeg` e `ffprobe` estarao disponiveis no PATH.
- Cada provedor/adaptador cuidara de suas credenciais e limites.
- O budget operacional de chunks intermediarios em `.wav` deve assumir aproximadamente `115 MB/hora` de audio em `16000 Hz`, mono, PCM 16-bit.
