from pathlib import Path
import struct
p=Path(__file__).resolve().parent;b=bytearray((p/'edit-duration.mp4').read_bytes());at=b.index(b'elst')-4;struct.pack_into('>I',b,at+16,0);(p/'candidate-short-sample.mp4').write_bytes(b)
