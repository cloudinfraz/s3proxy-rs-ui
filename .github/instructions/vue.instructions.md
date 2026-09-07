---
name: "Vue Guidelines"
description: "Use when writing, reviewing, or refactoring Vue 3 single-file components. Covers Composition API, TypeScript, templates, Pinia integration, accessibility, state, and required unit tests."
applyTo: "**/*.vue"
---

# Vue Guidelines

- Use Vue 3 Single-File Components with `<script setup lang="ts">` and the Composition API. Do not introduce the Options API into new components.
- Keep components focused on one responsibility. Extract reusable behavior into typed composables named `useX` and reusable presentation into child components.
- Type props and emits with `defineProps` and `defineEmits`. Treat props as immutable and emit semantic events instead of mutating parent-owned state.
- Use `withDefaults` only for optional props. Avoid shared mutable object or array defaults.
- Prefer `computed` for derived state and `ref` or `reactive` for source state. Do not use watchers when the value can be derived declaratively.
- Keep watchers narrow, declare cleanup for side effects, and choose `flush` behavior deliberately when DOM timing matters.
- Avoid destructuring reactive objects in ways that lose reactivity; use `toRefs` or `toRef` when destructuring is necessary.
- Use stable, domain-derived `:key` values in `v-for`. Never use an array index when items can be inserted, removed, or reordered.
- Avoid combining `v-if` and `v-for` on the same element. Filter with a computed value or move the condition to a wrapper.
- Keep templates declarative: move complex expressions and business rules into computed values or functions with clear names.
- Use semantic HTML first. Label controls, preserve keyboard operation and focus visibility, and use ARIA only when native semantics are insufficient.
- Represent loading, empty, error, and success states explicitly. Cancel or ignore stale asynchronous work when a component unmounts or inputs change.
- Keep application-wide state minimal. Prefer local state, then provide/inject for scoped dependencies, and use the project's established store only for genuinely shared state.
- Scope component styles when isolation is intended, reuse design tokens, and avoid deep selectors unless integrating a third-party component requires them.
- Add or update a colocated unit test for every new or behaviorally changed Vue component. A component change is incomplete without tests for the affected behavior.
- Test templates through rendered behavior with Vitest and Vue Test Utils, including conditional branches, lists, slots, user input, emitted events, and loading, empty, error, and success states that the component supports. Do not assert implementation details or rely only on snapshots.
- Test component and Pinia integration with a fresh Pinia instance per test. Verify that store state is rendered, user actions dispatch the expected store action, and resulting state or errors update the template correctly; do not mock Pinia so heavily that the integration is bypassed.
- Use Playwright in addition to unit tests for critical browser workflows; end-to-end coverage does not replace component unit tests.
- Follow the repository's package manager and pinned-version policy. Do not add Vue libraries or tooling unless Vue is intentionally adopted by the project.