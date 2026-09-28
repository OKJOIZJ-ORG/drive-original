'use strict';
const {createHash}=require('node:crypto');
const INPUT_SHA256='8dda58e2b0b36e977428846d6bd2c2c9a27d932f430e45afb283c2bf8d378605';
const CATCH='try{V=xe(T.initSegment,A).initSegment}catch{G("SESSION_INIT_INVALID")}';
const IMPORT='import"./mux-mp4.min.js";';
const SAR_CODES=Object.freeze(['SAR_INIT_INPUT','SAR_TRACK_ID','SAR_PARAMETER_INPUT','SAR_SPS_INVALID','SAR_GEOMETRY_RANGE','SAR_ASPECT_UNPROVEN','SAR_BOX_TRUNCATED','SAR_BOX_LIMIT','SAR_BOX_SIZE','SAR_BOX_UNPROVEN','SAR_BOX_COUNT','SAR_MATRIX_UNPROVEN','SAR_FULL_BOX','SAR_AVCC_HEADER','SAR_AVCC_COUNT','SAR_AVCC_LENGTH','SAR_PARAMETER_MISMATCH','SAR_AVCC_TRAILING','SAR_TRACK_COUNT','SAR_TRACK_HEADER','SAR_TRACK_IDENTITY','SAR_HANDLER','SAR_DATA_REFERENCE','SAR_NONEMPTY_SAMPLE_TABLE','SAR_SAMPLE_COUNT','SAR_SAMPLE_ENTRY','SAR_AUDIO_GEOMETRY','SAR_GEOMETRY_MISMATCH','SAR_BITRATE_BOX','SAR_PASP_MISMATCH','SAR_TREX_IDENTITY']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function once(text,needle,replacement){
  if(text.split(needle).length!==2)throw new Error('REPLACEMENT_COUNT');
  return text.replace(needle,replacement);
}
function transform(input,candidateOrigin){
  if(!Buffer.isBuffer(input)||sha(input)!==INPUT_SHA256)throw new Error('WORKER_SOURCE_SHA');
  const url=new URL(candidateOrigin);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('CANDIDATE_ORIGIN');
  const source=input.toString('utf8');
  const replacement='try{V=xe(T.initSegment,A).initSegment}catch(error){G('+JSON.stringify(SAR_CODES)+'.includes(error?.message)?error.message:"SESSION_INIT_INVALID")}';
  const output=Buffer.from(once(once(source,CATCH,replacement),IMPORT,'import'+JSON.stringify(url.origin+'/media/mux-mp4.min.js')+';'));
  return {output,provenance:{sourceCommit:'eb8b6a528ee6598f648f2b98628d611050cb5aa2',inputSHA256:INPUT_SHA256,outputSHA256:sha(output),outputBytes:output.length,candidateOrigin:url.origin,replacements:{initCatch:1,muxImport:1},scope:'QA-only error-code preservation; protocol, clock, media and terminal cleanup paths unchanged'}};
}
module.exports={transform,once,INPUT_SHA256,CATCH,IMPORT,SAR_CODES};
if(require.main===module){
  const fs=require('node:fs'),path=require('node:path');
  const result=transform(fs.readFileSync(path.join(__dirname,'../../media/transmux-worker.mjs')),process.argv[2]);
  fs.writeFileSync(path.join(__dirname,'worker.generated.mjs'),result.output);
  fs.writeFileSync(path.join(__dirname,'provenance.json'),JSON.stringify(result.provenance,null,2)+'\n');
  console.log(JSON.stringify(result.provenance));
}
