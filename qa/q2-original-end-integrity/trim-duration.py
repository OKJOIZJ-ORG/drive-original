from pathlib import Path
p=Path('qa/q2-original-end-integrity/pipeline.mjs');s=p.read_text().replace('      onEncodedPacket(packet, meta) {','      onEncodedPacket(packet, meta) {\n        if(packet.timestamp+packet.duration>windowInfo.sourceEndTimestamp) packet.sideData.q1DecodeDuration=windowInfo.sourceEndTimestamp-packet.timestamp;');p.write_text(s)
