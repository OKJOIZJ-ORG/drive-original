(() => {
  const qa=window.__rc18LatencyQA;
  if(!qa)return {installed:false};
  qa.clear();const result=qa.read();delete window.__rc18LatencyQA;return result;
})()
