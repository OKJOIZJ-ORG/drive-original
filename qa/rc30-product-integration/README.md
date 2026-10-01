# rc30 local integration

The test producer is byte-identical to the frozen rc29 product-suite producer.
It enumerates maintained product suites, records governed input SHA256 before
and after, retains its local log hash, and fails on nonzero exit or input drift.
`product-tests.json` reports 724/724 passing after the short true-EOF TS fix,
the full-reset pendingPlay fix and version30 alignment. This is local evidence;
no actual account, device, hosted source or production acceptance is claimed.

The separately owned `../rc30-ts-short-eof/` evidence records 141 canonical
checks, fixed29 failure/new-core success and native synthetic decoder/byte
preservation. Generated synthetic TS/MP4 and routine logs stay local and are
not part of the safe staging list. Root owns review and actual follow-up.

Run only after a relevant governed input change:

```powershell
node qa/rc30-product-integration/run-product-tests.cjs
```
