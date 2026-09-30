(() => {
  const qa=window.__rc19LatencyQA;
  if(!qa)return {installed:false};
  qa.clear();const result=qa.read();delete window.__rc19LatencyQA;return result;
})()
