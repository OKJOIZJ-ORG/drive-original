# Cookie gate attempt3 — narrow dormant-frame admission, actual unrun

Attempt2's retained actual report failed `FRAME_OWNER` at `owned-frame-receipt`, with all original baseline admissions true and all cleanup true. The old owner assertion ran before writing its receipt, so the failing predicate is unknown; this preparation does not assert which predicate failed.

Confirmed fixed31 source: index.html has exactly one hidden `#drivePreview` iframe with no `src`. `clearDrivePreview()` hides it, removes its media-session marker and returns a previous source to `about:blank`; only explicit Drive preview makes it visible and loads the Google preview URL. Thus the earlier blanket `noIndependentFrames` requirement was stricter than the requested absence of a cookie-dependent independent media target.

Additive attempt3 records owner receipt **before** assertion. It exports only known booleans and counts: page/task/context/main-frame/stability, aboutBlank/sameOrigin/crossGoogle/crossOther/unknown children, DOM iframe count and exact dormant-preview contract. No URLs, target/frame IDs, names, cookie headers or tokens are exported. The sole permitted nonempty frame tree is exactly one direct `about:blank` child corresponding to the sole known, hidden, src-less/aboutblank, session-free, inactive preview in source31. An empty DOM/tree is also accepted. Nonblank same-origin URLs are classified but rejected because fixed31 does not establish them as dormant compatibility documents. Cross-origin/unknown/nested/additional/visible/session-active frames remain rejected.

Main-frame ID is retained privately and must remain stable across ordinary reload and native replay. The same safe classification is recorded and checked after both. Separate SW/transmux worker targets remain permitted under the existing source31 cookie-dependency assessment; their privacy-override propagation is still not asserted. Actual Google preview/OOPIF activity is neither tested nor admitted here. Main-frame restriction and source/public/cache/account/native replay requirements are preserved.

Root-only retry after Android owner release:

```powershell
node qa/rc31-android-cookie-gate/root-execute-attempt3.cjs <root-private-input-absolute-path>
```

Default output is `actual-android-cookie-gate-attempt3-result.json`. Previous frozen producers, both actual reports and logs remain intact. Local source/fixture tests demonstrate exact dormant acceptance, cross-origin/nonblank rejection, nested/multiple-frame rejection, pre-assert receipt capture and post-reload stability. They do not establish the actual reason for attempt2's failure or actual installed cookie-command support.
