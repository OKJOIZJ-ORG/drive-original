# rc31 second QA savepoint manifest

This exact-file curation manifest covers completed, explicitly approved QA leaves. It authorizes no directory or glob staging, execution, product change, publication, acceptance promotion, or private input read. Root owns staging and any later commit.

The inventory distinguishes frozen preparation/source, actual safe receipts and analyses, and provisional acceptance proposals. Historical preparation freezes remain unchanged. Only frozen output members were verified; historical/input references are not added. Already tracked files are omitted. Pending disposable stable-receipt and rc32 work are excluded.

Validation: 54 frozen output hashes and declared byte counts where present; 21 JSON documents parsed; 40 JavaScript syntax checks without execution (8 function fragments parsed as expressions, remaining files via node --check); three root-approved exact byte/SHA pins checked. Full product/media suites were not rerun.

Privacy: only explicitly approved safe files are inventoried. Protected state-recovery backups, private logs/readbacks, credentials, private account/media names or identifiers, private paths/URLs, original media bytes, captures/screenshots, ZIPs, node_modules, temporary and unlisted files are excluded. Legitimate token/account property names in producer source are retained. Public source paths/hashes, device descriptors and public tool-schema metadata are permitted fixed metadata. Private-derived actual evidence remains whitelisted numeric/boolean/enumerated data.

The manifest is the metadata envelope and is not self-hashed inside its inventory. This README is listed with its exact hash. Independently verify the manifest SHA before staging its exact path.
