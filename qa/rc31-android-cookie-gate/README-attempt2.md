# Cookie gate attempt2 — additive preparation, actual unrun

The preserved first attempt failed after original account pinning, before creating a tab or issuing any cookie command/media input. `originalTabAccountIntact` and owned-connection cleanup were true. It retains its original `GATE_FAILED` result; this document does not relabel it.

Confirmed local cause: first adapter passed `original.evaluate("() => ({...})")`. Installed Playwright1.63's `coreBundle.js` evaluates string expressions with `isFunction:false`; its injected UtilityScript does not invoke the resulting arrow function. The result is a function rather than the desired primitive object, and by-value serialization does not deliver that object. The next unguarded `baseline.accountPresent` access could therefore throw TypeError. The preceding account pin used a real function-valued argument and cleanup can still succeed, matching the observed first-attempt pattern. No authentication/privacy failure is inferred.

`android-adapter-attempt2.cjs` evaluates the primitive object expression directly, with a finite timeout. `gate-attempt2.cjs` records enumerated failure stages, an allowlisted error class and boolean-only original/source admission fields; it never exports underlying error text/stack, IDs, URLs, token data or arbitrary class names. An undefined baseline now fails `ORIGINAL_PREFLIGHT` with explicit `valueReturned:false/objectReturned:false` rather than throwing on property access. Restriction, exact owned page/session, native replay, existing account, source31 proof and cleanup contracts are unchanged. Frozen v1 files and actual first-attempt result/log remain untouched.

Root-only actual retry after Android owner release:

```powershell
node qa/rc31-android-cookie-gate/root-execute-attempt2.cjs <root-private-input-absolute-path>
```

Default output is `actual-android-cookie-gate-attempt2-result.json`. Existing `normal-replay.cjs` and its frozen v3 helpers are reused. The privacy override remains only `Network.setCookieControls({enableThirdPartyCookieRestriction:true})` on the task-created page's dedicated session, followed by ordinary reload. Unsupported runtime command remains a failure; no policy/PC-debug fallback.

Local checks: attempt2 tests cover installed string/function semantics, correct baseline invocation, undefined baseline, safe stage/error handling, normal gate admission, unsupported command scope and frozen-v1 preservation. Import/syntax tests are local preparation, not actual retry evidence. This unit performs no device/browser/network command or private target read.
