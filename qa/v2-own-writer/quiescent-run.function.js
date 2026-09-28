async function (factory, facade, backupText, swProof, journalKey) {
  return this(async remainingMs => {
    let job;
    try {
      job = facade.call(factory, JSON.parse(backupText), swProof, journalKey);
      await job.run(Math.min(54_000, Math.max(1, remainingMs - 1000)));
      return job.poll();
    } catch (cause) {
      const code = ['invalid_backup', 'stale_owner', 'candidate_changed', 'invalid_contract'].includes(cause?.code)
        ? cause.code : cause?.message === 'OWN_WRITER_PREFLIGHT_REJECTED' ? 'facade_preflight' : 'construction_failed';
      let poll;
      try { poll = job?.poll(); } catch { /* Preserve unknown counts after a job exists. */ }
      return { ...(poll ?? (job ? { done: true, countsUnknown: true } : { done: true, gets: 0, posts: 0 })), constructionFailed: !job,
        summary: { passed: false, failure: code } };
    } finally { job?.clear(); }
  });
}
