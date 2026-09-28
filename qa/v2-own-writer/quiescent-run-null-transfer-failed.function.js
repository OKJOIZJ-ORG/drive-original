async function (factory, facade, backup, swProof, journalKey) {
  return this(async remainingMs => {
    let job;
    try {
      job = facade.call(factory, backup, swProof, journalKey);
      await job.run(Math.min(54_000, Math.max(1, remainingMs - 1000)));
      return job.poll();
    } finally { job?.clear(); }
  });
}
