// Run only inside the retained, authorized CUA session. No browser/profile creation.
async function runPC38FrameQualified({tab,rpc,fs,crypto,root,helper,binding,input,resultName}) {
  const dir=root+'/qa/rc38-android-disposable-aac/',privateDir=root+'/qa/v2-state-recovery-backup/';
  if(!/^actual-pc-v2-[0-9a-f-]{36}\.json$/.test(resultName)||input.schema!=='rc38-pc-exact-created-context/1')throw Error('PC38_PREPARED_INPUT_REQUIRED');
  const out=dir+resultName,hash=v=>crypto.createHash('sha256').update(v).digest('hex');
  const report={schema:'rc38-pc-frame-qualified-aac/1',sourceCommit:binding.sourceCommit,version:binding.version,
    helperSHA256:hash(helper),startedAt:new Date().toISOString(),physicalNativeInput:false,controlledPCInput:true,
    productChanged:false,originalMediaWrites:false,providerMutations:false,wholeGoalPassed:false,steps:[]};
  await fs.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  let owned=false,operation='install',stop;
  const save=()=>fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
  const step=async(name,value)=>{operation=name;report.steps.push({name,at:Date.now(),value});await save();return value;};
  const call=async name=>rpc('window.__rc38PcActualAAC.'+name+'()');
  const poll=async(name,condition,ms,cleanup=false)=>{const until=Date.now()+ms;let r;do{r=await call(cleanup?'closed':'read');
    if(!cleanup&&(!r.fence||r.error||r.failed))throw Error('PC38_CURRENT_MEDIA_FAILED');
    if(condition(r))return step(name,r);await new Promise(resolve=>setTimeout(resolve,80));}while(Date.now()<until);
    await step(name+' deadline',r);throw Error('PC38_PHASE_BOUND');};
  const freshDOM=()=>tab.playwright.domSnapshot();
  const controls=async()=>{
    // Korean names/selectors were observed in the same retained page before this actor.
    const play=tab.playwright.getByRole('button',{name:'재생/일시정지 (Space / K)',exact:true});
    if(await play.isVisible())return;
    const korean=tab.playwright.getByRole('button',{name:'재생 제어 열기',exact:true});
    if(await korean.isVisible()){await korean.click();await freshDOM();}
    if(!await play.isVisible())throw Error('PC38_CONTROLS_UNAVAILABLE');};
  const close=async()=>{const r=await call('read');if(r.closed)return;if(!r.cleanupCurrent)throw Error('PC38_CLOSE_OWNER_CHANGED');
    if(r.dialog){await tab.playwright.getByRole('button',{name:'닫기',exact:true}).click();await freshDOM();}
    await controls();await tab.playwright.getByRole('button',{name:'플레이어 닫기',exact:true}).click();await freshDOM();};
  try {
    owned=true;await step('install prepared current observers',await rpc('('+helper+')('+JSON.stringify(input)+','+JSON.stringify(binding)+')'));input=null;
    await step('one exact metadata admission',await call('locate'));await step('ordinary app open',await call('open'));
    await poll('Q0 current presented frame',r=>r.current&&r.routeCurrent&&r.q0&&r.q0Pinned&&r.verified&&r.transport&&r.phases.find(p=>p.label==='q0')?.first?.good,15000);
    await controls();let r=await call('read');if(!r.paused){await tab.playwright.getByRole('button',{name:'재생/일시정지 (Space / K)',exact:true}).click();await freshDOM();}
    // Require a normal positive interior paused position before arming selection.
    await poll('ordinary interior pause',r=>r.paused&&Number.isFinite(r.mappedPresentedMediaTime)&&r.mappedPresentedMediaTime>0&&r.mappedPresentedMediaTime<5,3000);
    await step('native closed VideoFrame tuple',await call('captureNative'));
    await controls();await tab.playwright.locator('summary[aria-label="재생기 더보기"]').click();await freshDOM();
    await tab.playwright.getByRole('button',{name:'음성·자막',exact:true}).click();await freshDOM();
    await poll('current two-AAC default2 inventory',r=>r.dialog&&r.tracksCurrent&&r.tracksCleanup&&!r.switching&&r.defaultAudio===2&&r.audioValue===2&&r.selectedAudio===null&&r.audioOptions.length===2&&[2,3].every(id=>r.audioOptions.some(t=>t.id===id&&t.codec==='aac'&&t.route==='q1')),12000);
    await step('positive paused snapshot and original deadline armed',await call('selectionReady'));const selectedAt=Date.now();
    await step('same snapshot before controlled input',await call('preInputCheck'));
    await tab.playwright.getByRole('combobox',{name:'음성',exact:true}).selectOption('3');await freshDOM();
    await poll('current AAC3 frame and same-owner settled qualification',r=>r.current&&r.routeCurrent&&r.q1General&&!r.q0&&!r.switching&&r.verified&&r.transport&&r.phases.find(p=>p.label==='aac3')?.first?.good,Math.max(1,15000-(Date.now()-selectedAt)));
    const value=await call('verify');await step('fresh metadata current selected-track tuple and source config',value);
    report.integrationPassed=value.controlledPCSelection===true&&value.tuplePass===true&&value.originalMetadataUnchanged===true&&value.sourceConfigPreserved===true&&value.visibleGeometry===true&&value.pipelineAudio===3&&value.initialPosition?.passed===true;
    if(!report.integrationPassed)throw Error('PC38_TUPLE_CONFIG_METADATA_UNQUALIFIED');
    // Close the ordinary dialog to show the player and its controls in the proof view.
    if(value.dialog){await tab.playwright.getByRole('button',{name:'닫기',exact:true}).click();await freshDOM();}
    await controls();const screenshot=await tab.screenshot({fullPage:false});await fs.writeFile(dir+resultName.replace('.json','.png'),screenshot,{flag:'wx'});
    report.screenshot={file:'qa/rc38-android-disposable-aac/'+resultName.replace('.json','.png'),sha256:hash(screenshot)};
    report.completed=true;report.verdict='FINITE_CURRENT_PC_AAC3_SINGLE_START_PAUSED_FRAME_TUPLE_CONFIG_METADATA_ONLY';
  } catch(e) {
    report.completed=false;report.failure={operation,name:e?.name,code:/^PC38_[A-Z0-9_]+$/.test(e?.message)?e.message:'PC38_TOOL_EXCEPTION',messageSHA256:hash(String(e?.message||''))};
    const privateBytes=JSON.stringify({operation,message:e?.message,stack:e?.stack})+'\n';
    const receipt='rc38-pc-v2-'+crypto.randomUUID()+'-exception-private.json';await fs.writeFile(privateDir+receipt,privateBytes,{flag:'wx'});
    report.privateFailureReceipt={saved:true,bytes:Buffer.byteLength(privateBytes),sha256:hash(privateBytes)};
  } finally {
    input=null;try {if(owned){await close();await poll('normal media owners closed',r=>Object.values(r).every(v=>v===true),20000,true);stop=await call('stop');await step('all actor observers and private owners released',stop);}}
    catch(e){report.cleanupFailure={name:e?.name,messageSHA256:hash(String(e?.message||''))};}
    report.cleanupComplete=!!stop&&Object.values(stop).every(v=>v===true);report.completedAt=new Date().toISOString();await save();
  }
  return {completed:report.completed,integrationPassed:report.integrationPassed||false,verdict:report.verdict||null,failure:report.failure||null,cleanupComplete:report.cleanupComplete,screenshot:report.screenshot||null,result:out};
}
