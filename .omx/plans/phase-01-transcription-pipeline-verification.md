# Verification Map: Phase 01

## Objetivo da verificacao

Comprovar que o pipeline:

- divide corretamente arquivos longos em chunks ordenados
- processa chunks em paralelo com limite de concorrencia
- desacopla a camada de transcricao
- preserva a ordem cronologica na consolidacao final
- suporta explicitamente um input sintetico acima de 3 horas
- retoma jobs por estado persistido com semantica deterministica
- rejeita retomada implicita ou incompativel

## Matriz de verificacao por slice

### Slice 1

- Verificacoes:
  - `npm run build`
  - teste unitario para schema e ordenacao do manifesto
  - teste unitario para parse e validacao da CLI
  - teste unitario para schema e transicoes de `job-state.json`
  - teste unitario para conversao de `chunk-duration-seconds` para milissegundos
  - teste unitario para exigencia de `--resume` e validacao de snapshot de compatibilidade
- Evidencia esperada:
  - tipos do contrato impedem acoplamento acidental com um provedor concreto
  - a CLI rejeita configuracoes invalidas com mensagens claras
  - a unidade temporal da CLI fica inequivoca e consistente com o dominio
  - a semantica de retomada fica fechada antes da implementacao do orquestrador

### Slice 2

- Verificacoes:
  - teste de integracao do segmentador com fixture pequena `.mkv`
  - teste de integracao gerando um `.mkv` sintetico acima de 3 horas via `ffmpeg`
  - inspecao do `manifest.json` gerado
  - inspecao do `job-state.json` inicial gerado
  - validacao de nomes de chunks e monotonicidade de `startMs` e `endMs`
  - teste garantindo falha ao reutilizar `outputDir` ocupado sem `--resume`
- Evidencia esperada:
  - total de chunks esperado para a duracao de teste
  - o caso acima de 3 horas produz contagem de chunks e ultima janela temporal coerentes
  - todos os chunks apontam para arquivos existentes
  - o manifesto permanece ordenado por `index`
  - o snapshot persistido e suficiente para validacao de compatibilidade no resume

### Slice 3

- Verificacoes:
  - teste unitario da fila de concorrencia
  - teste de integracao do orquestrador com `fake-transcriber`
  - teste de retomada parcial reaproveitando chunks ja concluidos
  - teste de falha parcial validando `exit code 2`, persistencia do erro e ausencia de consolidado final
  - teste de resume rejeitando mismatch de `inputPath`, `provider` ou `chunkDurationSeconds`
  - teste de recuperacao de chunk `running` orfao para `pending`
- Evidencia esperada:
  - nunca existem mais execucoes simultaneas do que o limite configurado
  - cada chunk concluido gera um markdown parcial
  - chunks falhos podem ser reexecutados sem repetir tudo
  - o estado persistido identifica sem ambiguidade quais chunks faltam
  - o limite entre `fatal_error` e `partial_failed` fica provado por teste

### Slice 4

- Verificacoes:
  - teste de merge com parciais concluindo fora de ordem
  - smoke test end-to-end usando provedor fake
  - smoke test end-to-end de retomada apos falha parcial
  - teste de `cleanupPolicy` para `keep` e `on-success`
  - revisao manual do markdown final consolidado
- Evidencia esperada:
  - o arquivo final segue a ordem do manifesto
  - o output contem `N` markdowns parciais e `1` consolidado
  - nenhum consolidado final e produzido quando houver chunk faltando ou com erro
  - a documentacao explica como adicionar um novo provedor

## Comandos-alvo para a implementacao

```bash
npm run build
npm test
npm run verify:long-input
npm run transcribe -- --input ./fixtures/sample.mkv --output ./tmp/job-01 --provider fake --chunk-duration-seconds 600 --cleanup-policy on-success
```

## Criterios de aceite finais

- Um executor consegue implementar sem reinterpretar os requisitos centrais.
- O primeiro provedor real entra sem alterar a logica do orquestrador.
- O merge final e deterministico.
- O job pode ser retomado sem recomecar do zero apos falha parcial.
- O caminho `>3h` possui evidencia objetiva de verificacao.
- Falha parcial nao produz consolidado enganoso e retorna `exit code 2`.
- Resume implicito ou incompativel falha com `exit code 1` antes de tocar nos artefatos persistidos.
