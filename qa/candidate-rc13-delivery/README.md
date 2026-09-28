# Fixed rc.13 candidate delivery

Deployed source `570f9c38506d1e426c33cf65b73836d32bf872c0`, version `1.22.0-rc.13`, Worker version `9008980b-9a99-4e57-b36c-dfd987013baa`. This is the free candidate; production v1.21.0 is unchanged.

The existing delivery record passed19 public asset comparisons,17 cached responses, cold controlled anonymous shell, controlled offline return and four private404 routes. Its exact record SHA-256 is `6b6d5117ca21fae9548b59327ab742ae6e3d8a36de33dd90ac4c530b5406cf4b`; `pageErrors` is the numeric value0. This documentation unit did not repeat that audit. The actual-account-ready records are separate evidence and are not substituted for anonymous delivery results.

`redact-readback.cjs` reads the local Worker version record and emits `redacted-readback.json` with only the expected Worker version, binding names/types, public AUTH/diagnostics/write flags and secret-configured booleans. AUTH_ENABLED=true, AUTH_DIAGNOSTICS=true and CANDIDATE_DRIVE_WRITES_ENABLED=false are preserved. Secret binding presence does not prove validity or expose its value. Author/account/namespace identifiers, client ID values, other binding values and deployment logs are omitted. Do not include raw version-readback.json, deploy.log, deployment-readback.log or dry-run.log in the safe documentation unit.

The fixed deployed candidate is the385-test product unit. The later local privacy logging repair has a confirmed387/387 product log and is a distinct next unit; it is not part of this Worker/source or package. Delivery establishes shell identity/cache/private routes, not full auth, media, physical-device or hosted-log privacy qualification.
