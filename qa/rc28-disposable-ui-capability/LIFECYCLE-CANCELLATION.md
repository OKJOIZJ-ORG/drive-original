# Addendum: document lifecycle cancellation

Independent review identified that source URL/controller equality alone does not
exclude a same-document BFCache return. The original local-results.json and
README.md remain unchanged historical implementation evidence.

Activation now installs one lease-owned `pagehide` listener and one
`beforeunload` listener, both using its existing close callback. Close removes
both together with the account-abort listener and all issued permit listeners.
Explicit close, account abort, observed deadline expiry, invalid activation and
replacement all use this same teardown. There is no visibilitychange listener;
ordinary chooser/tab-focus transitions do not cancel the lease.

This retains the original no-background-timer policy: deadline expiry is checked
at admission/dispatch and that check closes the lease. It does not claim that
listeners are proactively removed by a wall-clock timer while the page is idle.
Pagehide/beforeunload proactively close before a BFCache or unload transition.

New synthetic tests dispatch pagehide and beforeunload after permit issuance,
assert zero PATCHes, send a pageshow with unchanged URL/controller, and confirm
the lease stays revoked. Listener-count tests compare existing app listeners
before/after activation, repeated close, abort, checked expiry, failed activation
and replacement; an old lease handle cannot remove its replacement's listeners.

Focused final: `node --test tests/disposable-mutations.test.js tests/mutations.test.js tests/account-state.test.js`:
89/89 PASS (56 scoped cases plus 33 existing mutation/appData cases).
`git diff --check` passed. App/static was not rerun for this narrow lifecycle
change; the earlier 162/162 result applies to the previous local source snapshot.
No stage, commit, deploy, version change, browser/device/account actions occurred.
