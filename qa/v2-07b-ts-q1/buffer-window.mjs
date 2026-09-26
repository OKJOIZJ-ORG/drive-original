// QA admission policy, not a universal MSE memory estimator or seek engine.
// Limits are seconds of exposed SourceBuffer timeline, not bytes/decoder heap.
const requireThat=(value,code)=>{if(!value)throw new Error(code);};
export function createBufferWindow({high=6,low=4,behind=6,removeStep=1}={}) {
  requireThat([high,low,behind,removeStep].every(Number.isFinite)&&low>0&&high>low&&behind>0
    &&removeStep>0&&removeStep<=behind,'BUFFER_WINDOW_OPTIONS');
  let waiting=false;
  return {
    plan(ranges,currentTime){
      requireThat(Number.isFinite(currentTime)&&currentTime>=0&&Array.isArray(ranges)&&ranges.length<=16,
        'BUFFER_WINDOW_SNAPSHOT');
      let previous=-1;
      for(const range of ranges){
        requireThat(Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)
          &&range[0]>=0&&range[0]<range[1]&&range[0]>previous,'BUFFER_WINDOW_RANGES');
        previous=range[1];
      }
      const start=ranges[0]?.[0]??null,end=ranges.at(-1)?.[1]??null;
      // All future islands count against admission; ignoring them can grow an
      // unbounded disconnected buffer. Gap/seek recovery is a separate owner.
      const ahead=end===null?0:Math.max(0,end-currentTime);
      waiting=waiting?ahead>low:ahead>=high;
      const cutoff=Math.min(currentTime-behind,end??0);
      return {wait:waiting,ahead,span:end===null?0:end-start,start,end,
        removeEnd:start!==null&&cutoff-start>=removeStep?cutoff:null};
    },
    limits:{high,low,behind,removeStep}
  };
}
