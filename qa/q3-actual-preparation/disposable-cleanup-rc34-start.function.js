async function(factory,facade,binding,plan,expected){
 const fail=()=>{throw Error('Q3_CLEANUP_ADMISSION');};
 if(globalThis.__q3Cleanup34||!globalThis.__resumeSwProof)fail();
 const currentTexts=()=>localStorage.getItem(plan.ledgerKey)===expected.ledgerText&&localStorage.getItem(plan.pointerKey)===expected.pointerText;
 if(!currentTexts())fail();
 const reboundLedger=JSON.stringify(plan.ledger),reboundPointer=JSON.stringify(plan.pointer);
 const storage={
  getItem(k){if(k===plan.ledgerKey)return reboundLedger;if(k===plan.pointerKey)return reboundPointer;fail();},
  setItem(k,v){if(k!==plan.ledgerKey)fail();localStorage.setItem(k,v);}
 };
 const options={recoveryRun:plan.ledger.run,recoveryStorage:storage};
 // A constructor-only preflight validates exact scope without writes.
 const preflight=facade(factory,binding,globalThis.__resumeSwProof,options);
 const before=preflight.summary();await preflight.clear();
 if(before.requests!==0||before.writes!==0||!before.sourceBound||!currentTexts())fail();
 const job=facade(factory,binding,globalThis.__resumeSwProof,options);
 try{
  // No await between this fresh source/account/storage fence and persistence.
  if(!job.summary().sourceBound||!currentTexts())fail();
  localStorage.setItem(plan.ledgerKey,reboundLedger);
  localStorage.setItem(plan.pointerKey,reboundPointer);
  if(localStorage.getItem(plan.ledgerKey)!==reboundLedger||localStorage.getItem(plan.pointerKey)!==reboundPointer)fail();
 }catch{
  // Restore only this executor's exact values, never overwrite a new writer.
  try{
   if(localStorage.getItem(plan.ledgerKey)===reboundLedger)localStorage.setItem(plan.ledgerKey,expected.ledgerText);
   if(localStorage.getItem(plan.pointerKey)===reboundPointer)localStorage.setItem(plan.pointerKey,expected.pointerText);
  }finally{await job.clear();}
  fail();
 }
 const holder={job,done:false,result:null,privateText:null,jobCleared:false,privateExportError:false,cleanupError:false};
 globalThis.__q3Cleanup34=holder;
 holder.operation=(async()=>{
  try{holder.result=await job.cleanup();
   try{holder.privateText=job.privateText();}catch{holder.privateExportError=true;holder.privateText=JSON.stringify({ledger:JSON.parse(localStorage.getItem(plan.ledgerKey)),pointer:{key:plan.pointerKey,value:localStorage.getItem(plan.pointerKey)}});}
  }catch{holder.result={passed:false,code:'executor_uncertain',rawExported:false};}
  finally{try{await job.clear();holder.jobCleared=true;}catch{holder.cleanupError=true;}holder.done=true;}
 })();
 return {started:true,source:binding.source,version:binding.version,preflightRequests:before.requests,preflightWrites:before.writes,sourceRebound:true,rawExported:false};
}
