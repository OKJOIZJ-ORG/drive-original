'use strict';
// Explicit root-only entry. Import has no private/device/browser/network effects.
const path=require('node:path');
async function execute(privateFile,resultName){require('./verify-preparation.cjs').verify();return require('./android-latency-partition.cjs').execute(path.resolve(privateFile),resultName);}
module.exports={execute};if(require.main===module){if(!process.argv[2]){console.error('PRIVATE_INPUT_REQUIRED');process.exitCode=1;}else execute(process.argv[2],process.argv[3]).catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'PREPARATION_FAILED');process.exitCode=1;});}
