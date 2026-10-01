import {variant} from '../v2-07b-ts-q1/synthetic-variants.mjs';
const tick=(b,o)=>(b[o]&14)*536870912+b[o+1]*4194304+(b[o+2]&254)*16384+b[o+3]*128+(b[o+4]>>1);
// Public fixture only: preserve original complete PES bytes, finish after the
// final IDR plus zero/one P picture and bounded original AAC coverage.
export function shortEof(count=1){
  return variant(records=>{
    const videos=records.filter(r=>r.videoIndex!==undefined&&r.videoIndex<300+count);
    const end=Math.max(...videos.map(r=>tick(r.data,9)))+3000;
    return records.filter(r=>r.videoIndex!==undefined?r.videoIndex<300+count:tick(r.data,9)<end);
  }).bytes;
}
