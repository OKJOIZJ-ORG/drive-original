# V2-07A public browser-bundle transport

This isolated Worker serves reviewed, public JavaScript bytes to the one candidate
origin. It has no Worker bindings, cookies, secrets, account state, request
logging, Drive access, or private-manifest input. Any method, Origin, pathname or
query outside the exact allowlist receives an empty `404` without CORS.

`bounded-adapter` is the normal one-artifact deployment input. It is expected to
contain the reviewed final adapter composite, including root inventory and
selection code only when that composite deliberately embeds them. Do not also add
the component bundles in that case. `root-inventory` and
`representative-selector` are available only for a reviewed deployment that still
needs them independently.

After the final adapter bytes exist and have been reviewed, generate the local
deployment payload and redacted manifest:

```powershell
node qa/v2-07a-browser-transport/build-transport.mjs --artifact bounded-adapter=PATH_TO_REVIEWED_PUBLIC_ADAPTER.mjs
node --test qa/v2-07a-browser-transport/transport.test.mjs
```

The build creates `generated-bundles.mjs` and `manifest.redacted.json` in this
directory. The path is `/v2-07a/<role>-<sha256>.js`; the manifest contains only
role, path, SHA-256 and byte length. The reviewed generated registry and manifest
are committed with the transport so a clean checkout has the exact deployable
module. Rebuild and review both whenever the adapter bytes change; do not deploy
until their staged hash, byte length, tests, and Wrangler dry-run all match.

The Worker intentionally accepts GET and HEAD only. A valid HEAD response has the
same exact `Content-Length` as GET and no body. It sends exact-Origin CORS,
`no-store`, `nosniff`, and no credentials header.
