# Disposable normal-controller capability — local implementation

This unit changes `app.js`; runtime general writes stay false. No actual account,
browser, device, media creation, deployment, version change, or commit occurred.
Passing these synthetic cases does not qualify actual normal bulk UI or G5.

## Root-owned activation contract

After creating and independently reading two valid synthetic media fixtures,
root must review the private persisted ledger at exactly
`drive-original.qa.disposable.<run>.recovery`. No namespace discovery supplies
authority. Keep this ledger and all actual IDs/account values out of public QA.

Use existing schema `1`, UUID v4 `run`, exact current `accountId`/`accountKey`,
`planned` rows `{id, role, sent:true}` persisted before creation submission, and
`created` rows `{id, role, metadata}` only after independent GET confirmation.
Media roles are `test-image-1`, `test-image-2`, `test-video-1`, `test-video-2`;
choose exactly two distinct IDs. Folder roles are `folder-a` / `folder-b`.
Each receipt metadata includes exact id, numeric string version, one parent,
boolean trashed, media/folder MIME, ownedByMe:true, absent driveId, and
`appProperties:{qaRun:run,qaRole:role}`. Media parents must be these created
folders. Fresh receipts must preserve actual server state, not caller guesses.

In the root-verified current candidate document, invoke the actual product API:

```js
const lease = activateDisposableDriveMutationLease({
  run: reviewedRun,
  fileIds: reviewedTwoMediaIds,
  targetIds: reviewedQaFolderIds,
  sourceVersion: APP_VERSION,
  durationMs: 120000
});
```

Only the exact two media IDs and one or two exact destinations are admitted.
The returned object exposes `close()` only. Root must always close it in its
own finally after normal UI execution or cancellation. Activation uses the
persisted receipts; it accepts no raw metadata, tokens, write switch or fetch
override. It requires the existing driveWrite grant and a non-null current
service-worker controller. It captures current account/session, token/revision,
controller, loaded APP_VERSION and document URL. Root independently verifies
served/cached/loaded source hashes; the product API does not hash its own script.

Keep the existing menu, bulk selection, confirmation and list update path.
The canonical controller captures intent, acquires the account lock, performs
fresh file/target GETs, and validates the scoped receipts. File version/parents
remain exact. A folder's fresh numeric version may advance from its receipt;
its exact identity/tags/ownership/parents and canAddChildren remain required.
Each touched QA folder also has one fresh complete bounded child-list GET:
pageSize3, no nextPageToken, incompleteSearch:false, at most the two leased media
IDs. Unknown children, duplicate IDs, incomplete or continued lists stop submit.
General enabled mutations receive no child-list requests.

Immediately before the canonical PATCH, a private WeakMap registers an opaque
one-use object carried by a private Symbol. driveFetch consumes it before any
possible send, checking exact URL/query/body/headers/signal, action/file/target,
current owner/source/token/controller, five-second dispatch deadline and lease
lifetime. It strips the Symbol before native fetch and forces redirect:error,
credentials:omit for scoped PATCH. No auth/rate-limit resend or expired-credential
refresh can dispatch this allowance. Abort, consumption, close and canonical
finally release permits and listeners. No folder PATCH, restore, upload, sharing,
DELETE, appData or arbitrary-ID allowance is introduced.

Every possible canonical submit retains the original journal and independent
GET confirmation. A confirmed tagged file GET updates only that known created
row's receipt so the next normal move/trash can compare the new version/parents.
Read-only journal recovery continues after lease expiry. Restore and recoverable
residual cleanup remain a separate exact disposable QA operation owned by root.

## Evidence and limitations

- `node --test tests/disposable-mutations.test.js tests/mutations.test.js tests/account-state.test.js`: 82/82 passed (49 new scoped cases, 33 existing mutation/appData cases).
- `node --test tests/app.test.js tests/static.test.js`: 162/162 passed.
- New checks exercise actual canonical app code with synthetic storage/HTTP;
  two-file move then trash and folder version advances, response loss/readback,
  and admission/owner/transport/reuse/abort/expiry deny cases are discriminated.
- No permanent deletion, broad Drive write flag, original-media writes or OAuth
  grant changes are authorized by this feature.
- The private reviewed creation ledger is an operational trust boundary, not a
  cryptographic creation attestation. Same-origin privileged code/DevTools can
  edit storage; source/root review remains necessary.
- Fresh metadata and child listing are observations, not an atomic server lock.
  External changes after those reads cannot be completely prevented by the Drive
  mutation protocol. Exact PATCH destinations never expand to those unknown IDs;
  independent GET establishes actual file outcome and preserves uncertainty.
- Actual candidate delivery, two-fixture creation and normal bulk UI, API/web/G
  comparison, and final recoverable residual inspection are still unperformed.

Guidance used: modern-web-guidance security retrieval (no new DOM sinks or
credential logging), [MDN AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal),
[MDN WeakMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap).
