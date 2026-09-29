from pathlib import Path
import subprocess,array,json,math
p=Path(__file__).resolve().parent
def arr(b):
 a=array.array('f');a.frombytes(b);return a
source=arr(subprocess.check_output(['ffmpeg','-v','error','-i',str(p/'../q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4'),'-map','0:a:0','-f','f32le','-']))
rows=[]
for name in ['baseline','bounded','compensated']:
 y=arr((p/f'capture-{name}.f32').read_bytes())
 def mse(offset):
  return sum((source[2*i]-y[2*(i+offset)])**2 for i in range(4800,12000,16))
 offset=min(range(-1024,8193),key=mse)
 power=sum(source[2*i]**2 for i in range(4800,12000,16));error=mse(offset)
 last=max((i for i in range(len(y)//2) if max(abs(y[2*i]),abs(y[2*i+1]))>1e-8),default=-1)
 end=offset+len(source)//2
 tail=y[end*2:];tail_peak=max(map(abs,tail),default=0)
 rows.append({'name':name,'captureFrames':len(y)//2,'bestOffsetFrames':offset,'sourceFrames':len(source)//2,'lastNonzeroFrameExclusive':last+1,'endRelativeToSourceFrames':last+1-offset,'excessFrames':last+1-end,'alignmentSnrDb':10*math.log10(power/error),'postSourcePeak':tail_peak,'finalSourceFrame':list(y[2*(end-1):2*end])})
report={'scope':'Actual Chrome MSE audio PCM captured by AudioWorklet at48kHz; graph terminates at MediaStreamDestination, never speakers','rows':rows}
baseline=arr((p/'capture-baseline.f32').read_bytes());compensated=arr((p/'capture-compensated.f32').read_bytes())
report['retainedSourceWindowEqualToUnclippedNativeOutput']=baseline[:len(source)]==compensated[:len(source)]
report['removedOnlyPostSourceWindow']=rows[2]['excessFrames']==0 and rows[2]['postSourcePeak']==0 and report['retainedSourceWindowEqualToUnclippedNativeOutput']
(p/'capture-oracle.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
