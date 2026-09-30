async function(){
  if(location.hostname!=='127.0.0.1'||APP_VERSION!=='1.22.0-rc.24'||state.authAccountKey||state.selected||q0Playback||q1Playback||!navigator.serviceWorker.controller)throw Error('QA_INITIAL24_REQUIRED');
  const response=await fetch('/__qa_switch25',{method:'POST',body:'SWITCH_24_TO_25',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(response.status!==200)throw Error('QA_SWITCH_REJECTED');const result=await response.json();if(result.switched!==true)throw Error('QA_SWITCH_RESULT');return result;
}
