'use strict';
// No origin-local state, credentials, query or hash is sent to the destination.
const destination = 'https://drive-original.jyw-drive.workers.dev/';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
function openCurrentApp() { if (navigator.onLine) location.replace(destination); }
addEventListener('online', openCurrentApp);
openCurrentApp();
