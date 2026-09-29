import pathlib,subprocess,json,hashlib,array,math,sys
p=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def run(*a):return subprocess.check_output(a)
def probe(f):return json.loads(run('ffprobe','-v','error','-show_streams','-show_packets','-show_data_hash','sha256','-of','json',str(f)))
def pcm(f):
 a=array.array('f');a.frombytes(run('ffmpeg','-v','error','-i',str(f),'-map','0:a:0','-f','f32le','-acodec','pcm_f32le','-'));return a
case=sys.argv[1] if len(sys.argv)>1 else 'eac3';assert case in ['eac3','ac3','sar'];src=p/'../q2-audio-compatibility/eac3-source-build/synthetic-avc-eac3-stereo.mp4' if case=='eac3' else p/'../q2-audio-compatibility/synthetic-avc-ac3.mp4';out=p/f'output-{case}.mp4';src=p/'synthetic-avc-ac3-sar.mp4' if case=='sar' else src;a=probe(src);b=probe(out)
vs=lambda q:[v for v in q['packets'] if v['codec_type']=='video']; av,bv=vs(a),vs(b)
fields=['codec_name','profile','width','height','coded_width','coded_height','sample_aspect_ratio','display_aspect_ratio','pix_fmt','level','color_range','color_space','color_transfer','color_primaries','chroma_location','extradata_hash']
asv=[s for s in a['streams'] if s['codec_type']=='video'][0];bsv=[s for s in b['streams'] if s['codec_type']=='video'][0]
checks={'videoPacketCount':len(av)==len(bv)==144,'videoEncodedPayload':all(x['data_hash']==y['data_hash'] for x,y in zip(av,bv)),'videoParameters':all(asv.get(k)==bsv.get(k) for k in fields)}
timing={k:max(abs(float(x[k])-float(y[k])) for x,y in zip(av,bv)) for k in ['pts_time','dts_time','duration_time']};checks['videoClock']=all(v<=1/12288 for v in timing.values())
def frames(f):
 s=run('ffmpeg','-v','error','-i',str(f),'-map','0:v:0','-f','framemd5','-').decode();return [l.split(',')[-1].strip() for l in s.splitlines() if l and not l.startswith('#')]
af,bf=frames(src),frames(out);checks['decodedVideoPixels']=af==bf and len(af)==144
x,y=pcm(src),pcm(out);channels=[]
asa=[s for s in a['streams'] if s['codec_type']=='audio'][0];bsa=[s for s in b['streams'] if s['codec_type']=='audio'][0]
offset=round((float(asa['start_time'])-float(bsa['start_time']))*48000)
y=y[2*offset:2*(offset+len(x)//2)]
for ch in range(2):
 # Fixed timestamp-aligned comparison, plus independently searched residual sample lag.
 def mse(lag,stride=1,start=4800,stop=240000):
  stop=min(stop,len(x)//2,len(y)//2-max(lag,0)); total=n=power=0
  for i in range(max(start,-lag),stop,stride):
   xx=x[2*i+ch]; yy=y[2*(i+lag)+ch];total+=(xx-yy)**2;power+=xx*xx;n+=1
  return total/n,power/n,n
 lag=min(range(-480,481),key=lambda d:mse(d,16)[0]);err,power,n=mse(lag);zero=mse(0); full=mse(0,start=0,stop=len(x)//2)
 channels.append({'channel':ch,'bestResidualLagSamples':lag,'bestResidualLagSeconds':lag/48000,'snrDb':10*math.log10(power/err),'alignedSnrDb':10*math.log10(zero[1]/zero[0]),'fullPresentationSnrDb':10*math.log10(full[1]/full[0]),'fullPresentationFramesCompared':full[2],'rmse':math.sqrt(err),'samplesCompared':n,'sourceRms':math.sqrt(power)})
asa=[s for s in a['streams'] if s['codec_type']=='audio'][0];bsa=[s for s in b['streams'] if s['codec_type']=='audio'][0]
checks['audioTransformed']=asa['codec_name']==('ac3' if case=='sar' else case) and bsa['codec_name']=='opus';checks['audioRateChannels']=asa['sample_rate']==bsa['sample_rate']=='48000' and asa['channels']==bsa['channels']==2
checks['audioSignal']=all(c['fullPresentationSnrDb']>30 and abs(c['bestResidualLagSamples'])<=1 for c in channels)
report={'checks':checks,'passed':sum(checks.values()),'failed':sum(not v for v in checks.values()),'sourceSha256':sha(src.read_bytes()),'outputSha256':sha(out.read_bytes()),'videoPacketCount':len(av),'decodedFrames':len(af),'videoTimingMaxSeconds':timing,'videoParameters':{k:{'source':asv.get(k),'output':bsv.get(k)} for k in fields},'audio':{'source':{k:asa.get(k) for k in ['codec_name','sample_rate','channels','channel_layout','start_time','duration']},'output':{k:bsa.get(k) for k in ['codec_name','sample_rate','channels','channel_layout','start_time','duration']},'outputPrerollFramesRemovedByPresentationClock':offset,'comparisonWindowSeconds':[0,6],'sourceDecodedFrames':len(x)//2,'outputDecodedFrames':len(y)//2,'channels':channels},'oracle':run('ffmpeg','-version').decode().splitlines()[0]}
(p/f'oracle-{case}-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if report['failed']: raise SystemExit(1)
