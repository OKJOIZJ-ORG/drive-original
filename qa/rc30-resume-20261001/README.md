# rc30 source and Android preparation

Exact source: `aa46bd083ce8c21f55cf7d9a4759f0d6709188c2`, `1.22.0-rc.30`. These additive tools contain no actual rc30 browser/device/update result and perform no network or device work when built or locally verified.

`build-source-proof.cjs` reads only the fixed Git commit's app/SW/version and `sw.js` `SHELL_FILES`, maps the root alias to index.html and hashes the 40 distinct committed shell assets. It derives the frozen rc29 proof factory without changing runtime logic except the owned `drive-original.qa.rc30-update-baseline` key. The expression retains closed-player, settled Q1 retirement, online token, loaded account, foreground, controller, single-current-shell, public hash, cached hash and final registration guards. It installs only the owned `__resumeSwProof` closure and consumes/removes its own optional update baseline. It reads public app/SW/version and shell cache when root explicitly executes it; it never refills cache or changes product/account/media state. `sourcebinding.json` contains the exact expected shell hashes and canonical JSON manifest hash. No current working-tree or hint fallback is used.

Source expression SHA256: `16638995b9660f9d38cabb2d762791d38d47ca6857ad07ba0d8a649cebe631b5`. Shell manifest SHA256: `288505e2a27714060e330cc43e8b0b555d5b99d15454344a0b5792aa1b8df6fd`. Generated verification covers immutable hashes/factory equivalence, successful mocked proof/baseline cleanup and rejected version/player/retirement/auth/visibility/controller/public/cache/registration states: 12 passed, zero actual requests. It proves generated behavior, not hosted bytes or executing worker script identity.

`build-android-binding.cjs` derives `android-ui-common-rc30.cjs` from the frozen canonical common28 helper and `android-normal-update-source-cache.cjs` from frozen 169/170 rc29 preparation. The derivative accepts common29/30 connection identities but the normal update unit strictly requires initial document29. Its initial public app/SW/version reads must match the newly hosted immutable30 hashes. An existing29 document can legitimately have a new30 controller/cache during normal update; this preparation does not require old29 network bytes or claim to hash the old executing worker. The initial29 Git binding is historical context from `10f1dd2ee9550866933e693dbf41c62e1fb2daad`, not newly observed source proof. The unit then uses trusted normal update UI, preserves private account/writer/projection/cache in the existing browser-local baseline, and checks exact post-update document/controller30, new30 public hashes and all41 shell requests/40 distinct assets. Cleanup retains the old owned-listener/baseline discipline. The common helper's existing canonical ADB, MCP and Playwright dependencies remain referenced. No device producer was run and no result file exists. Static/Git/syntax and generated transition verification: 13 passed, including document29 with hosted30 admission, wrong initial document rejection and mismatched hosted bytes rejection; zero actual requests/device actions.

```powershell
node qa/rc30-resume-20261001/build-source-proof.cjs
node qa/rc30-resume-20261001/verify-source-binding.cjs
node qa/rc30-resume-20261001/build-android-binding.cjs
node qa/rc30-resume-20261001/verify-android-binding.cjs
```

Root owns authorized actual browser/device execution, source delivery and acceptance decisions. Rebuilding or syntax-checking these tools supplies no actual update, device, corpus or performance acceptance.
