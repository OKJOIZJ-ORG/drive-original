# Fixed28 additive selection failure diagnostic

The delivered `qa/rc28-deeper-target-qualification` factory/provenance and its
13 PASS evidence are preserved. Root's actual cohort1 at00:41:22Z completed
one fresh full inventory (62 metadata GET /11,411,534 bytes /0 media), then
returned generic PROBE_FAILED with empty plan/references and no reserve. This
record does not identify a cause and must remain an actual failed observation.

Local serialized-parent reproduction confirms the missing generated
`normalizeProbeIdentity` lexical binding: build stripped the module import but
did not replace it, so the first plan identity throws ReferenceError. Module
tests still had the import and missed this integration defect. This matches the
actual inventory-complete/plan-empty boundary; the original live result lacked
exception detail and is not retrospectively relabeled as a confirmed stack.

This NEW producer restores that generated binding and leaves the private plan,
original metadata/media bounds, reserve, source28 pins, private target/folder
registry, facade and cleanup intact. It also adds `selectionStage` and
`failureDiagnostic` to safe output. Stages
distinguish maintained selector, cohort plan, safe references, private witness,
denominators and owner check. Diagnostic class/code/phase use fixed allowlists;
stack output contains at most4 allowlisted QA function names and integer lines.
No raw message, arbitrary code, raw stack, filenames, URLs, IDs, names, paths,
tokens or provider objects are exported. Exception codes outside the list remain
unclassified. Generated stack line numbers refer to this exact new factory.

Full generated-factory verification also found that old safeReferences retained
the real selector's private IDs in rare/ge4GiB mandatory strings/categories.
This new producer removes those identity tails and collapses arbitrary raw MIME
mismatch/unknown metadata to fixed labels. No private plan or category-count
denominator is changed. The prior actual failed before references and did not
emit those strings. The broken13 PASS factory remains preserved and must not
be rerun for acceptance; only this corrected derivative is the next producer.

Local real maintained-selector output matches the new plan's expected schema.
The real selector→plan→bounded ISO sparse/EBML probe flow passes synthetic checks.
Missing metadata locally yields INVALID_IDENTITY rather than generic PROBE_FAILED;
the prior safe actual inventory reported missingVersion0/missingSize0, no zero
size band and no blocked/unknown download capability. These observations reject
an unsupported missing-metadata guess. The serialized-parent ReferenceError is
a confirmed local defect. The corrected complete generated factory now performs
synthetic full inventory→real selector→plan→ISO sparse/EBML→final inventory with
no output canaries. Any further live failure keeps its safe class/code/stage.

Evaluate this directory's `factory.expression.js` once after root's accepted
current immutable public28 proof. Use the same private four-field context and
explicit `{cohort:1,mode:'probe'}`; poll/release normally. Root owns the one actual
discriminator and retains the prior failure. Do not automatically retry, waive
bounds or promote corpus/codec/HDR/playback acceptance. `await entry.target()`
and `await entry.navigationTarget()` retain the previous1GET coordinate-only APIs.
The diagnostic does not retain a full inventory across runs or export private
rows; another run still incurs the required bounded inventory cost.

Build and check locally with `node qa/rc28-deeper-selection-diagnostic/verify.mjs`.
No actual Drive/browser/product requests, product edits or staging occurred in
this diagnostic unit. All outputs stay in this new directory; root owns commit
and actual execution. No guidance CLI or external lookup was performed here.
