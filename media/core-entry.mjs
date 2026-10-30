// One canonical implementation, already tested under qa/. Only these pure
// browser primitives are bundled; QA drivers, fixtures and records never ship.
export {probeTsSeek} from '../qa/v2-07b-ts-q1/ts-seek.mjs';
export {createSeekBootstrap} from '../qa/v2-07b-ts-q1/seek-bootstrap.mjs';
export {createBufferWindow} from '../qa/v2-07b-ts-q1/buffer-window.mjs';
export {createWorkerClient} from '../qa/v2-07b-ts-q1/worker-client.mjs';

// Local browser diagnostics only. Browser messages can embed URLs and file
// identities; retain only closed-vocabulary tokens and bounded numeric state.
const MEDIA_ERROR_TOKENS=new Set(['PIPELINE_ERROR_DECODE','PIPELINE_ERROR_NETWORK','PIPELINE_ERROR_INITIALIZATION_FAILED',
  'PIPELINE_ERROR_COULD_NOT_RENDER','PIPELINE_ERROR_EXTERNAL_RENDERER_FAILED','PIPELINE_ERROR_READ','PIPELINE_ERROR_INVALID_STATE',
  'DEMUXER_ERROR_COULD_NOT_OPEN','DEMUXER_ERROR_COULD_NOT_PARSE','DEMUXER_ERROR_NO_SUPPORTED_STREAMS',
  'DECODER_ERROR_NOT_SUPPORTED','DECODER_ERROR_DECODE','CHUNK_DEMUXER_ERROR_APPEND_FAILED','MEDIA_ERR_DECODE','MEDIA_ERR_SRC_NOT_SUPPORTED']);
const MEDIA_OPERATIONS=new Set(['idle','append','remove','seek','source-wait']);
export function sanitizeBrowserMediaError({event,video,buffer,source,operation='idle'}){
  const error=video?.error,tokens=typeof error?.message==='string'?error.message.slice(0,1024).match(/\b[A-Z][A-Z0-9_]{2,79}\b/g)||[]:[];
  const target=event?.target;
  return {event:event?.type==='sourceclose'?'sourceclose':event?.type==='abort'?'abort':'error',
    target:target&&target===video?'video':target&&target===buffer?'buffer':target&&target===source?'source':'unknown',
    code:Number.isInteger(error?.code)&&error.code>=1&&error.code<=4?error.code:null,
    token:tokens.find(token=>MEDIA_ERROR_TOKENS.has(token))||null,operation:MEDIA_OPERATIONS.has(operation)?operation:'idle',
    time:Number.isFinite(video?.currentTime)?video.currentTime:null,
    readyState:Number.isInteger(video?.readyState)&&video.readyState>=0&&video.readyState<=4?video.readyState:null};
}
