async function(version){
  if(top!==self||location.origin!=='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev')throw Error('QA_ORIGIN_REQUIRED');
  if(!window.__rc28NormalUpdateJournal)throw Error('QA_JOURNAL_NOT_INSTALLED');return window.__rc28NormalUpdateJournal.cacheParity(version);
}
