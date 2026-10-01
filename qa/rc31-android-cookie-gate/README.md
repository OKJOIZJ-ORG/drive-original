# QA-AU-06 — Android scoped blocked-third-party-cookie gate, preparation only

Prepared for immutable source31 `4a484e6f839d2e6c3eb83503acb08147362cb011` / `1.22.0-rc.31`. No actual browser, ADB, network, cookie command, private target read, or candidate delivery was performed by this unit. Source31 public delivery and normal device qualification must precede root execution; current delivery state belongs to root's actual record.

`gate.cjs`, `android-adapter.cjs`, `normal-replay.cjs` and `root-execute.cjs` import without device/network/private-read side effects. Root's explicit `execute(privateFile)` reads the private record locally, validates it through the frozen v3 validator and connects the frozen native helper/observer callback to the maintained Android official-MCP bootstrap and authorized USB/ADB dedicated CDP session. No automatic replay is installed. The result is stored only here. Never read or print that private record during preparation.

Actual route: official MCP tool inventory → existing Android candidate account/tab pin → official `new_page` with no `isolatedContext` → exact new page in the original browser context → dedicated page session/main-frame receipt → `Network.enable` → only `Network.setCookieControls({enableThirdPartyCookieRestriction:true})` → ordinary reload → exact public three-source hashes/current40 cached files/root alias/controller + private same-account comparison/existing token → native normal folder/card playback/progress/seek/close. The driver preserves failure when the installed runtime rejects the command. It never tries a PC personal debug socket, a permissive false setting, profile preferences, synthetic cookies, copied auth, or new OAuth grant.

The currently exposed official MCP metadata has `new_page`, with omitted `isolatedContext` using the existing browser context; generic CDP dispatch is not exposed. `toolCapabilities()` rechecks actual Android MCP inventory at execution. `Network.setCookieControls` recognition is **prepared**, not verified against the connected Android runtime. A successful dedicated native session command establishes installed command/parameter recognition; it does not by itself establish app behavior. Official Chromium implementation scope/detach evidence remains in `../rc29-third-party-cookie-preparation/README.md` and `scope-assessment.json`; no new upstream research claim is made here.

The prepared replay callback receives `{page,evaluate,adb,end,physicalScreen,originalAccountMatches,ownerReceipt}`. It uses existing private target identity only for private comparison/normal folder/card discovery, native OS input, and read-only source/owner observation. Folder markup uses `button.folder-row > span.folder-name`, not a `data-folder-id` selector. It navigates the exact private path through native taps, searches the exact private name through frozen v3 restricted ASCII `inputCommand` and native OS input, opens the normally rendered exact card, observes startup/progress, pauses normally, seeks50 through the native slider, observes an independent target frame, rechecks metadata and closes normally. No direct navigation/player function or query/files/state injection; unsupported ASCII names have no synthetic fallback. It returns only:

```js
{
 normalNativeInput: true, noGoogleIframe: true, existingValidToken: true,
 sameAccount: true, exactSource31: true, originalBytePathQualified: true,
 routes: [{ route: 'q1', presentedFrames: 2, progressed: true,
   seekTargetFrame: true, closedSettled: true,
   exactPageMainFrame: true, noIndependentCookieDependentMediaTarget: true }]
}
```

`originalBytePathQualified` requires actual pinned original-source read/owner proof, not an attempted Q0 route or configuration. `presentedFrames`, progress and post-seek target frame require independent presentation observations. One actual Q1 TS representative may establish original-byte and derived-presentation paths; no all-format or additional Q0 first-frame gate is added. Missing proof stays incomplete. The gate strips callback extras before recording; raw URLs, cookie headers, IDs, names, account values and tokens must never be exported by the callback either.

Separate same-origin SW/transmux worker targets are expected, permitted and never asserted absent. `cookie-target-scope.json` traces fixed31 page range loading → same-origin SW → cross-origin Bearer upstream and same-origin worker scripts. No media/metadata path adds `credentials:include` or copies Cookie headers. The callback checks the installed runtime's ordinary `Request.credentials === 'same-origin'` default without issuing a request, API cross-origin and worker same-origin. This supports the precise `noIndependentCookieDependentMediaTarget` receipt; it does not assert that the page override propagated to independent service-worker/OOPIF/popup targets. Source31 identity and real media behavior are still needed.

Four-minute work deadline is handed to every callback; runtime bootstrap/source/reload operations have their own finite timeouts. Cleanup gets an additional short settlement window. Finally it closes only the owned player, awaits retirement, detaches only its dedicated session (removing its override), closes only the task-created tab through official MCP, verifies original tab/account still intact, disconnects only owned connections/ADB forward. Existing tabs/profile/cache/auth remain. New-tab login/grant/2FA, ambiguous target ownership, independent frame/cookie-dependent media target, unsupported command and unconfirmed cleanup are retained boundaries. No generic route-wide propagation to service workers/OOPIF/popup targets is asserted.

The v3 physical-coordinate mapping is qualified for portrait. Landscape causes `NATIVE_PORTRAIT_REQUIRED` without changing rotation settings. A name outside restricted ASCII causes `NATIVE_ASCII_SEARCH_UNSUPPORTED`; an exact target unavailable after native search causes `TARGET_NOT_IN_NORMAL_RENDER_WINDOW`. No synthetic search or injected population fallback is used. The installed `Network.setCookieControls` command, new-tab naturally resumed existing login, actual input geometry and independent presentation remain runtime unknowns. Root must not execute concurrently with another Android owner.

Root-only actual command, after source31 delivery/device owner release:

```powershell
node qa/rc31-android-cookie-gate/root-execute.cjs <root-private-input-absolute-path>
```

Local verification: `node --test qa/rc31-android-cookie-gate/gate.test.cjs qa/rc31-android-cookie-gate/normal-replay.test.cjs` (13 checks) and syntax checks. These are mock/import/source checks, not physical Android acceptance or privacy-setting proof.
