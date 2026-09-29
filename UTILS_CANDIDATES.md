# Utils candidates

Generic, non-AUT-specific helpers written in this repo that don't belong here —
they duplicate, or should be added alongside, functionality in `@controlium/utils`.
Logged here instead of just left inline so they get pulled out and added upstream
rather than forgotten. Add new candidates as they turn up.

## Landed in `@controlium/utils`

### `Utils.describeValue(value: unknown): string` — done 2026-09-29

Added to `src/utils/utils.ts`. Behaves as originally proposed below, and is
now wired into `Utils.assertType`'s error message (`Is [${Utils.describeValue(value)}]`
instead of the old `Is [${typeof value}]`) so every `assertType` failure
across every consumer is more debuggable for free.

Once `@controlium/framework`'s `API_AUTWrapper.ts` next bumps its
`@controlium/utils` dependency, its private `describeValue` should be deleted
in favour of `Utils.describeValue` — see [[project_controlium_framework]].

### `Utils.errorMessage(err: unknown): string` — done 2026-09-29

Added to `src/utils/utils.ts`, same shape as originally proposed below. Also
rolled out across every unsafe `(err as Error).message` cast found package-wide
in `@controlium/utils` itself (`APIUtils.ts`, `jsonUtils.ts`, `mock.ts`,
`detokeniser.ts`, `utils.ts`) — each of those was a live instance of the exact
masking-`TypeError` bug this helper exists to prevent. `logger.ts` gets a
private duplicate of the same logic instead of importing `Utils.errorMessage`,
because `Logger` sits below `Utils` in the module dependency graph (`Utils`
imports `Log`) and importing back would create a cycle.

`@controlium/framework`'s `API_AUTWrapper.ts` should switch its private
`errorMessage` over to `Utils.errorMessage` on its next dependency bump.

## Already exist in `@controlium/utils` — do not reimplement

Found while writing the above and reviewing `src/API_AUTWrapper.ts` for what's
actually generic. These already covered functionality this repo had
duplicated locally without checking first:

- **`Utils.assertType(value, expectedType, funcName, paramName)`** — logged
  type-assertion helper, including a `'function'` case in `AssertTypeMap`.
  Very close to a hand-rolled `requireFunction()` in this repo. Not adopted
  directly here yet because (a) calling it and then failing again ourselves
  double-logs the same failure, and (b) its message only shows `typeof value`,
  not the value's content — see `describeValue` above, which would close that
  gap. Once `describeValue` lands, reconsider whether `requireFunction` can be
  deleted in favour of `assertType` outright.
- **`Utils.timeoutPromise(promise, { timeoutMS, friendlyName })`** — races a
  promise against a timeout, with `Utils.promiseCount` tracking for
  end-of-test "did everything settle" checks. `src/API_AUTWrapper.ts`'s
  `invokeHandler` used to hand-roll the identical `Promise.race` + `setTimeout`
  + `clearTimeout` logic; now delegates to this directly (fixed 2026-09-29).

## Process going forward

Before writing a private helper in this repo that doesn't reference anything
AUT/test-framework-specific (no `Log`, no `appName`, no HTTP/transaction
concepts — just "given some input, produce some output"), check
`@controlium/utils` first (`Utils`, `JsonUtils`, `StringUtils`, `Logger`,
`APIUtils`, `Mock`). If it's not there and the helper really is generic, add
an entry to this file rather than just leaving it buried as a private
function — and consider whether it should go straight into `@controlium/utils`
instead of living here at all.
