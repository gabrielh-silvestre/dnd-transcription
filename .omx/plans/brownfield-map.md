# Brownfield Map

## Estado atual do repositorio

- Repositorio inicializado hoje, sem codigo de aplicacao.
- Arquivos presentes:
  - `AGENTS.md`
  - `.omx/hud-config.json`
  - `.omx/state/hooks.json`

## Consequencias praticas

- O trabalho e essencialmente greenfield.
- Nao ha package manager definido ainda.
- Nao ha convencoes locais de lint, test runner ou layout de `src/`.
- Nao existe implementacao previa de transcricao, processamento de midia ou CLI.

## Superficie a introduzir

- Bootstrap de projeto TypeScript para CLI Node.
- Camada de dominio com contratos de transcricao e manifesto.
- Adaptador de infraestrutura para `ffmpeg`/`ffprobe`.
- Adaptadores de provedores de transcricao.
- Orquestrador para paralelismo, persistencia de estado e merge final.
- Testes unitarios e um caminho de smoke test com provedor fake.

## Riscos do estado atual

- Toda decisao estrutural tomada agora vira padrao do repositorio.
- Como nao existe baseline de testes, a primeira onda precisa incluir verificacao minima desde o inicio.
- Como o projeto depende de binarios externos, o contrato de ambiente precisa ser explicitado logo na CLI e na documentacao.
