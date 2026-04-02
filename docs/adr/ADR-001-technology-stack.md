# ADR-001: Technology Stack for QA Framework

- **Status:** Accepted
- **Date:** 2026-04-01
- **Deciders:** QA team

---

## Context

We are building a three-layer QA framework (GraphQL API, Dashboard UI, Accessibility) for a Saleor Commerce instance hosted on Saleor Cloud. Key constraints that drive this decision:

- Saleor Dashboard is a React SPA that communicates exclusively via GraphQL (no REST endpoints).
- The Dashboard requires staff JWT authentication stored in `localStorage`.
- The Accessibility layer must scan auth-gated Dashboard pages (e.g. product creation form), meaning it must share authenticated browser state with the UI layer.
- The POC must be maintainable by a single developer: adding a new test should touch ≤ 2 files.
- All three layers must be executable from a single CI pipeline in under 10 minutes total.

---

## Decision

Use the following stack across all three layers:

| Concern | Choice |
|---|---|
| Test runner + browser automation | Playwright |
| GraphQL client | `graphql-request` |
| Accessibility scanning | `@axe-core/playwright` |
| Type generation from GraphQL schema | `graphql-codegen` |
| Language | TypeScript |
| Environment management | `dotenv` |
| CI platform | GitHub Actions |
| Assertions | Playwright built-in `expect` |

---

## Alternatives Considered

### Test Runner

| Option | Reason rejected |
|---|---|
| Cypress | No native multi-project config; `cy.request` is separate from browser context; `waitForResponse` for GraphQL is clunkier; weaker TypeScript story |
| WebdriverIO | Higher config overhead; separate service model per concern; inferior TypeScript support |

Playwright was retained because its `projects` configuration makes API, UI, and A11y first-class citizens in a single `playwright.config.ts`, and `waitForResponse` directly addresses the optimistic UI risk (asserting uncommitted server state) identified in the strategy.

### GraphQL Client

| Option | Reason rejected |
|---|---|
| Playwright `request` + raw `fetch` | Valid, but requires manual query string management and lacks typed variables |
| Apollo Client | Designed for React; brings cache state that conflicts with test isolation; 10× the setup complexity for no benefit in a test context |
| `urql` | Same class of problem as Apollo — client-oriented, not testing-oriented |

`graphql-request` is a thin, stateless HTTP wrapper. It accepts typed variables, integrates with `graphql-codegen`, and carries zero runtime state — which is exactly what test isolation requires.

### Accessibility Scanner

| Option | Reason rejected |
|---|---|
| Lighthouse CI | Separate CLI process; cannot reuse Playwright `storageState`; auth-gated pages require reimplementing login |
| Pa11y | Separate CLI tool; no Playwright integration; same auth-replication problem as Lighthouse CI |
| `@axe-core/webdriverio` | Requires introducing WebdriverIO as a second test runner |

`@axe-core/playwright` is the only option that runs inside the existing Playwright process. The A11y layer inherits `storageState` from the UI layer — no duplicate auth logic.

---

## Consequences

### Positive

- **Single toolchain:** one `playwright.config.ts`, one `package.json`, one CI job definition covers all three layers.
- **Shared auth state:** `storageState` flows from the API fixture (token creation) → UI layer → A11y layer. Auth is implemented once. *(Not yet active: `dependencies` will be restored in `playwright.config.ts` once a `setup` project creates `.auth/staff.json`. Currently removed to prevent the empty UI/A11y projects from triggering the full API suite.)*
- **Compile-time schema safety:** `graphql-codegen` regenerates types from Saleor's live schema. Breaking schema changes surface as TypeScript errors before tests run, not as runtime failures in CI.
- **Cross-layer data flow:** Playwright's `use` fixture chain passes API-created entity IDs (product IDs, checkout IDs) directly into UI and A11y tests without inter-process serialization. *(Deferred until UI tests are implemented.)*
- **`waitForResponse` for SPA safety:** Playwright's `page.waitForResponse` waits on the GraphQL mutation response before asserting, eliminating the optimistic UI false-positive risk.

### Negative / Trade-offs

- **`graphql-codegen` setup cost:** requires a `codegen.ts` config and a schema introspection step. Adds ~15 minutes of initial setup; pays back on first schema change.
- **Playwright browser binaries in CI:** ~300 MB download per CI run if not cached. Mitigated by caching `~/.cache/ms-playwright` in GitHub Actions.
- **No visual regression coverage:** Playwright screenshots exist but no baseline comparison tool (e.g. Percy, Chromatic) is included. Out of scope for this POC.

---

## References

- [QA_STRATEGY.md](../../QA_STRATEGY.md) — three-layer architecture, data ownership rules, priority order, and success metrics
- Playwright projects config: https://playwright.dev/docs/test-projects
- graphql-request: https://github.com/jasonkuhrt/graphql-request
- @axe-core/playwright: https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright
- graphql-codegen: https://the-guild.dev/graphql/codegen
