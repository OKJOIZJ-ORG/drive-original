from pathlib import Path
for p in [Path('qa/q2-original-end-integrity/pipeline.mjs'),Path('media/audio-general-pipeline.mjs')]:
 s=p.read_text().replace("!videoConfig.colorSpace?.matrix || !videoConfig.colorSpace.primaries || !videoConfig.colorSpace.transfer\n      || typeof videoConfig.colorSpace.fullRange !== 'boolean'","!videoConfig.colorSpace?.matrix || typeof videoConfig.colorSpace.fullRange !== 'boolean'");p.write_text(s)
