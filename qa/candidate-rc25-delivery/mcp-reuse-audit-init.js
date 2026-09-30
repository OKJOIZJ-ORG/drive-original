window.__mcpReuseDeliveryStarted=performance.now();
window.__mcpReuseDeliveryErrors=[];
addEventListener('error',()=>{if(window.__mcpReuseDeliveryErrors.length<64)window.__mcpReuseDeliveryErrors.push('PAGE_ERROR');});
addEventListener('unhandledrejection',()=>{if(window.__mcpReuseDeliveryErrors.length<64)window.__mcpReuseDeliveryErrors.push('UNHANDLED_REJECTION');});
