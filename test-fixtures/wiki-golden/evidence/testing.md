---
title: "Testing Evidence"
category: quality
summary: "Observed test layers, coverage goals, and raw test file inventory."
source_paths:
  - "tests"
  - "package.json"
  - "README.md"
---
# Testing Evidence

This file is deterministic evidence for the repository's testing posture.

## Current shape

- test files: 1

## Main test layers

- unit tests for parser, config normalization, task pool, persistence mappers, and provider wrappers
- integration tests for the orchestration flow, file job store, CLI wiring, and provider-specific CLI behavior
- optional host-dependent verification for long input scenarios through `npm run verify:long-input`

## Coverage goals

- preserve `manifest.json` and `job-state.json` schema
- preserve exit codes `0`, `1`, and `2`
- prove resume no-op behavior for already succeeded jobs
- keep provider tests mockable without real network access

## Relevant files

- `tests/unit/fixture.test.ts`
