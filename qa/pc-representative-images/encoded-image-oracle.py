"""Inspect two bounded private originals; emit format facts, never pixels or IDs."""
import argparse, hashlib, json, time
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--private-input', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
private_root = Path(__file__).resolve().parents[1] / 'v2-state-recovery-backup'
capsule = Path(args.private_input).resolve()
if capsule.parent != private_root.resolve():
    raise ValueError('PRIVATE_SCOPE')
data = json.loads(capsule.read_text(encoding='utf-8'))
rows = data['inputs']
if not 1 <= len(rows) <= 3:
    raise ValueError('ORACLE_COUNT')
receipt = {'schema': 'pc-private-encoded-image-oracle/1', 'rows': [],
           'passed': False, 'rawPixelsExported': False, 'rawIdentifiersExported': False,
           'physicalTimingOrAlphaAcceptance': 'UNKNOWN'}
started = time.monotonic()
with Path(args.out).open('x', encoding='utf-8') as output:
    try:
        for row in rows:
            path = Path(row['privatePath']).resolve()
            if path.parent != private_root.resolve() or not 0 < path.stat().st_size <= 2097152:
                raise ValueError('ORACLE_BOUND')
            encoded = path.read_bytes()
            if hashlib.sha256(encoded).hexdigest() != row['sha'] or hashlib.md5(encoded).hexdigest() != row['md5']:
                raise ValueError('ORACLE_BYTES')
            with Image.open(path) as image:
                count, width, height = image.n_frames, image.width, image.height
                if count > 512 or width * height * count > 256000000:
                    raise ValueError('ORACLE_DECODE_BOUND')
                delays, center_pixels, transparent_frames = [], set(), 0
                loop = image.info.get('loop')
                for frame in range(count):
                    if time.monotonic() - started > 30:
                        raise ValueError('ORACLE_DEADLINE')
                    image.seek(frame)
                    rgba = image.convert('RGBA')
                    delays.append(image.info.get('duration'))
                    center_pixels.add(hashlib.sha256(bytes(rgba.getpixel((width // 2, height // 2)))).digest())
                    transparent_frames += int(rgba.getchannel('A').getextrema()[0] < 255)
                    rgba.close()
                receipt['rows'].append({'formatHint': row['stem'], 'actualFormat': image.format,
                    'bytes': len(encoded), 'checksumVerified': row['checksumVerified'],
                    'freshBeforeAfter': row['freshBeforeAfter'], 'frames': count,
                    'width': width, 'height': height, 'animated': count > 1,
                    'delaysMs': delays, 'loop': loop, 'transparentFrames': transparent_frames,
                    'distinctEncodedCenterPixels': len(center_pixels), 'encodedBytesUnchanged': True})
        receipt['passed'] = True
    except Exception as exc:
        receipt['failure'] = str(exc) if isinstance(exc, ValueError) and str(exc).startswith('ORACLE_') else 'ORACLE_TOOL_ERROR'
    finally:
        receipt['elapsedMs'] = round((time.monotonic() - started) * 1000)
        output.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
raise SystemExit(0 if receipt['passed'] else 1)
