---
name: "TypeScript Guidelines"
description: "Use when writing, reviewing, or refactoring TypeScript or TSX. Covers strict typing, API boundaries, error handling, maintainability, and tests."
applyTo: "**/*.ts, **/*.tsx"
---

# TypeScript Guidelines

- Preserve the repository's strict compiler settings. Do not weaken `tsconfig` checks to make code compile.
- Prefer inferred local types and explicit types at public, exported, asynchronous, and external-data boundaries.
- Use `unknown` for untrusted values and narrow with type guards. Avoid `any`, non-null assertions, and unchecked type casts.
- Model domain states with discriminated unions and exhaustive `switch` statements. Do not encode mutually exclusive states with unrelated booleans.
- Prefer immutable data and pure transformations. Use `const`, `readonly`, and non-mutating array methods unless mutation is clearly simpler and locally contained.
- Keep functions small and single-purpose. Use descriptive names; avoid one-letter names outside conventional short callbacks.
- Use `import type` for type-only imports and named exports for reusable modules. Keep imports free of avoidable side effects.
- Treat API, storage, URL, and environment data as untrusted. Validate or narrow it at the boundary before passing typed values inward.
- Reuse generated OpenAPI types from `src/api/schema.d.ts`; do not manually duplicate generated request or response contracts.
- Handle promise failures deliberately. Do not leave floating promises, swallow errors, or expose sensitive response details in user-facing messages.
- Prefer platform and existing project APIs over new dependencies. Do not add a package when a small, readable standard-library solution exists.
- Add focused Vitest coverage for behavior, edge cases, and failure paths. Mock at external boundaries rather than mocking implementation details.
- Add unit tests for every new or behaviorally changed Pinia store. Cover initial state, getters, synchronous and asynchronous actions, state transitions, external dependency failures, and reset behavior where applicable; create a fresh Pinia instance for each test.
- Run `npm run lint`, `npm test`, and `npm run build` after relevant changes; add targeted Playwright coverage for user-visible workflows.
