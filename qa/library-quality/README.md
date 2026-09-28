# Library and dialog quality audit

Synthetic before/after audit for the four scoped library/dialog fixes. Before serves the three changed product files directly from saved rc.12 `eb8b6a5`; after serves the local changes. No account, Drive API writes, personal media, playback, audio settings, commit or deployment were used.

Run with `AUDIT_PHASE=before` and `AUDIT_SOURCE_REF=eb8b6a5` for the fixed before source; `AUDIT_PHASE=after` without `AUDIT_SOURCE_REF` for local changes. The same driver adds assertions and long-name/reduced-motion scenes in after mode. Add `--probe` for selection-exit and short-landscape geometry. Chrome is anonymous/headless, service workers are blocked, and all external requests are aborted. These are browser emulation results, not physical Android/iOS proof.

Evidence is archived in `before/` and `after/`: exact `producer.cjs`, results with producer/product SHA-256, geometry probes, and viewport screenshots. Original exploratory evidence remains in `audit/`. Before has 36 scenes; after has 44, all with zero axe WCAG AA violations, page errors or horizontal overflow. After also checks trusted Tab/Enter/Space exclusive selection, preserved state after search rerender, conditional focus restoration, and access to cancel buttons in both long-name dialogs with reduced motion. Automated checks do not establish complete accessibility.

| Priority | Before: observed evidence | After: implemented and checked |
| --- | --- | --- |
| P2 | Move picker declares a listbox with button options, but ArrowDown does not move focus and selected rows have no accessible selection state. Empty results violate required listbox children. | Labeled native button group and exclusive `aria-pressed` state, preserving native Tab/Enter/Space. No empty-list ARIA violation. |
| P2 | Active selection control white 13px text on #0a84ff is 3.64:1. Delete/move filename blue on dark gray is about 3.8:1. | Existing `--action-blue` and `--action-blue-text` tokens; both contrast findings pass axe. |
| P2 | Selection cancel briefly leaves focus inside hidden toolbar; after 150ms the browser blurs to document body. | Entry gets focus only when the hidden toolbar owned focus; an existing search-input focus stays there. |
| P2 | At 844x390, a normal one-line move filename has clientHeight 23 versus scrollHeight 39; folder list has clientHeight 32 versus scrollHeight 175. Screenshot shows compressed content. | Filename clientHeight and scrollHeight both 39; bounded folder list clientHeight164/scrollHeight175. Dialog body scrolls without child compression, folder group is keyboard focusable. |

The dialog body now owns long-filename scrolling, so content can extend below the visible body on a short screen; Tab scrolls the focused action into view. Existing bounded folder-list scrolling remains independent. Focused existing product checks passed: bulk-action target text and shell controls/selection binding (2/2), plus app syntax and diff whitespace checks. Root owns independent review, complete product checks, versioning and integration.

The native search input clears itself on the first Escape; a second Escape closes the move dialog. This is not recorded as a defect. Dialog cancellation returns focus to its opening action. Browser-chrome traversal during settings Tab cycling was not treated as focus escape without evidence of an outside page control receiving focus. Candidate restrictions on general Drive writes are intentional policy.

Primary semantics reference: [WAI-ARIA APG listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) defines arrow navigation and selected state for a listbox. Native button semantics avoid imposing that unused interaction model on the current folder picker.
