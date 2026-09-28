# Actual rc.13 WebM playback

Read-only actual user Chrome on fixed candidate `570f9c38506d1e426c33cf65b73836d32bf872c0`, app/SW `1.22.0-rc.13`. The existing signed-in account and current listed WebM sample were used. Names, IDs, URLs, tokens and original media bytes were not exported. Volume/output settings and source media were untouched.

The native original Range route presented its first decoded frame at observer1.276s and reached natural EOF3.938s with40 decoded frames and no MediaError. A trusted native slider press/release at50% sought to1.969s and presented1.875s, then trusted Space resumed to EOF with80 total frames. At90%, seeked3.5442s and presented3.5s; a second Space resumed the final suffix to natural EOF. These presentation offsets fit this sample's approximately100ms frame interval. Audio decoding/audibility is not inferred from video progress or the zero audio counter.

Startup, middle and end records retain their exact passive observers. The expressions were copied byte-for-byte from the preceding rc.12 verification, without changing product routing, timers or media state. The recorded seek inputs are trusted browser events, while diagnostic sampling only reads aggregate current state and frame events. Observer elapsed time is not a network p95 or field-performance measurement.

Normal close removes the src attribute and source children, resets readyState0, clears selected/Q1 owners and confirms retirement settled. All root temporary observers were cleared and their remote object groups released. This short current sample does not prove broad WebM codecs, full long-duration playback, native background return, devices or unchanged-source integrity for all Q0 reads. The separately supported Q0 same-size replacement gap is being addressed; this run did not mutate the source to create that race.

`verify-records.cjs` checks saved aggregate observations and exact observer hashes. It does not replay a browser or convert a saved assertion into independent new playback evidence.
