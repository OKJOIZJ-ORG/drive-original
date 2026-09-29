"""Regenerable finite synthetic 72-second AVC+AAC/AC3 originals, no source media."""
import hashlib, json, pathlib, subprocess
p = pathlib.Path(__file__).resolve().parent
rows = []
for codec in ['aac', 'ac3']:
    name = f'synthetic-72s-{codec}.mp4'
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
        'testsrc2=size=320x180:rate=24:duration=72', '-f', 'lavfi', '-i',
        'aevalsrc=0.15*sin(2*PI*(440*t+2*t*t))|0.10*sin(2*PI*(880*t+3*t*t)):s=48000:d=72',
        '-c:v', 'libx264', '-threads', '1', '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-g', '24', '-bf', '0', '-color_range', 'tv', '-colorspace', 'bt709',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', codec,
        '-b:a', '384k' if codec == 'ac3' else '192k', '-movflags', '+faststart', '-y', str(p/name)]
    if not (p/name).exists():
        subprocess.run(command, check=True)
    data = (p/name).read_bytes()
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams',
        '-show_format', '-of', 'json', str(p/name)]))
    rows.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
        'command': command, 'duration': probe['format']['duration'], 'streams': [
            {k:s.get(k) for k in ['codec_name','codec_type','duration','width','height',
            'sample_rate','channels','pix_fmt','color_range','color_space','color_transfer','color_primaries']}
            for s in probe['streams']]})
(p/'fixture-provenance.json').write_text(json.dumps({'ffmpeg':subprocess.check_output(
    ['ffmpeg','-version']).decode().splitlines()[0], 'fixtures':rows}, indent=2)+'\n')
