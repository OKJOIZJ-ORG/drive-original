from pathlib import Path
p=Path('qa/q2-original-end-integrity/pipeline.mjs');s=p.read_text().replace('packet.sideData.q1DecodeDuration=windowInfo.sourceEndTimestamp-packet.timestamp;', '{packet.sideData.q1DecodeDuration=windowInfo.sourceEndTimestamp-packet.timestamp;packet.duration=windowInfo.sourceEndTimestamp-packet.timestamp;}');p.write_text(s)
