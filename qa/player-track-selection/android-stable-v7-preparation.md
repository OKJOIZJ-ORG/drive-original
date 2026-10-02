# Additive v7 request-budget repair — preparation only

Actual v6 is preserved: receipt `e18548d607e396911a4fe16838586b4baa25dd9c4a7e64cce61c0292b6bd551a`; adjudication `007fe136b5c9765b1c72d53c3c54dddaa81193ffe12256c3432dc6c9e6ee0355`. It qualified the 45-second stable executing-SW admission, startup507 ms and exact selected AAC3 frame4775 ms; its first seek exceeded the QA provider256-request envelope. All cleanup including player retirement passed. Seek/subtitle results remain unknown.

The new provider changes only the global intercepted request ceiling from256 to512. Local assets, metadata, OPTIONS, download and media all count toward it. Exact target/origin admission, deny-unrelated behavior,24MiB media limit,15-second CDP RPC bound, fixture bytes and executable-source observations remain byte-identical. The v7 runner changes only its provider import, dependency manifest and fresh result name. No runtime/product/deployment changes, no retry loop.

Five local behavioral checks exercise the actual fulfillment handler: frozen256/257 boundary; mixed512/513 boundary with one rejection/no retry; independent24MiB ceiling; unrelated target denial; exact derivative-only source diff. Two syntax checks and preparation dependency hash verification passed. Existing12 stable/native/lifecycle checks are reused; they were not inflated by another run.

Root review/GO is required before this one fresh owned execution. Prior passed stages necessarily recur only to establish normal same-owner state:

```powershell
node qa/player-track-selection/android-runner-stable-v7.cjs --run 2c2b1244bee0f1a5e500318c83c6e126c5124e34 android-publication-proof.json android-actual-stable-v7-tablet-tracks-result.json
```

The45-second automatic idle/source/cache gate,180-second media bound, lifetime replacement fail-before-close capture, native popup path, three paused seeks and caption checks, retirement/external cleanup separation and tablet-only scope remain as documented in `android-stable-preparation.md`. No device/private-account/browser/network action occurred during this preparation.
