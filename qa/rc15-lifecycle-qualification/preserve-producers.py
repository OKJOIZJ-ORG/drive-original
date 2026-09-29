"""Recover exact QA-only producers for retained attempts; SHA must match each report."""
import hashlib, json, pathlib
p = pathlib.Path(__file__).resolve().parent
final = (p/'producer-frame-join.cjs').read_text()
begin = final.index(' const seek=')
end = final.index(' const close=', begin)
prejoin = """ const seek=async fraction=>page.evaluate(async fraction=>{const v=el.videoPlayer;v.pause();const target=playerTimeline().duration*fraction,prior=q1Playback?.player?.stats()?.generation??0;let callback,timer;window.qaSeekFrames=[];window.qaFailedSeek=null;const presented=new Promise((resolve,reject)=>{const frame=(_,m)=>{qaSeekFrames.push({mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,elementTime:v.currentTime,seeking:v.seeking});if(qaSeekFrames.length>8)qaSeekFrames.shift();if(!v.seeking&&Math.abs(m.mediaTime-target)<=1/24+.004&&(!q1Playback||q1Playback.player.stats().generation>prior)){clearTimeout(timer);resolve({mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,target,time:playerTimeline().currentTime,generation:q1Playback?.player?.stats()?.generation??null});}else callback=v.requestVideoFrameCallback(frame);};callback=v.requestVideoFrameCallback(frame);timer=setTimeout(()=>{v.cancelVideoFrameCallback(callback);window.qaFailedSeek={target,prior,frames:qaSeekFrames,time:v.currentTime,seeking:v.seeking,paused:v.paused,readyState:v.readyState,error:v.error?.code,totalFrames:v.getVideoPlaybackQuality().totalVideoFrames};reject(Error('QA_SEEK_FRAME_TIMEOUT'));},20000);});setPlayerCurrentTime(v,target,'qa-lifecycle');return presented;},fraction);
"""
instrumented = (final[:begin]+prejoin+final[end:]).replace('report.failureObservation??=await', 'report.failureObservation=await')
simple = instrumented.replace("['discriminator','q0-discriminator','cycles','long']", "['discriminator','cycles','long']")
simple = simple.replace("if(mode==='cycles'||mode==='q0-discriminator'){", "if(mode==='cycles'){")
simple = simple.replace("i<=(mode==='q0-discriminator'?12:50);i++){const route=mode==='q0-discriminator'?'q0':['q1','q2','q0'][(i-1)%3]", "i<=50;i++){const route=['q1','q2','q0'][(i-1)%3]")
simple = simple.replace("}report.network=t.network;}catch(e){report.failureObservation=await t.read();report.failedSeek=await t.page.evaluate(()=>window.qaFailedSeek);report.failureNetwork=t.network;report.failureEngineErrors=t.engineErrors;await sample('failure-live');throw e;}finally{await t.context.close();}", "}report.network=t.network;}finally{await t.context.close();}")
simple = simple.replace('let callback,timer;window.qaSeekFrames=[];window.qaFailedSeek=null;const presented=', 'let callback,timer;const presented=')
simple = simple.replace('const frame=(_,m)=>{qaSeekFrames.push({mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,elementTime:v.currentTime,seeking:v.seeking});if(qaSeekFrames.length>8)qaSeekFrames.shift();if(!v.seeking', 'const frame=(_,m)=>{if(!v.seeking')
simple = simple.replace("v.cancelVideoFrameCallback(callback);window.qaFailedSeek={target,prior,frames:qaSeekFrames,time:v.currentTime,seeking:v.seeking,paused:v.paused,readyState:v.readyState,error:v.error?.code,totalFrames:v.getVideoPlaybackQuality().totalVideoFrames};reject(Error('QA_SEEK_FRAME_TIMEOUT'));", "v.cancelVideoFrameCallback(callback);reject(Error('QA_SEEK_FRAME_TIMEOUT'));")
initial = simple.replace('PLAYBACK_MODE.RANGE','PLAYBACK_MODE.ORIGINAL_RANGE').replace('PLAYBACK_MODE.REPACKAGED','PLAYBACK_MODE.ORIGINAL_REMUX')
rows = [('producer-initial-cold.cjs', initial, 'discriminator-2026-09-29T23-03-10-729Z.json'),
        ('producer-first-cycle-failure.cjs', simple, 'cycles-2026-09-29T23-03-53-055Z.json'),
        ('producer-frame-order-discriminator.cjs', instrumented, 'q0-discriminator-2026-09-29T23-05-40-999Z.json')]
for name, code, report in rows:
    data = code.encode()
    expected = json.loads((p/report).read_text())['harness']['qualify.cjs']
    actual = hashlib.sha256(data).hexdigest()
    assert expected == actual, (name, expected, actual)
    (p/name).write_bytes(data)
    print(name, actual)
