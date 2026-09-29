// Compare original parameter sets without parsing or rewriting picture payloads.
// TS uses the equivalent guard in the preferred-source demuxer before Annex B
// packets are exposed. ISO packets use their declared NAL length field here.
export function createAvcPacketGuard(config, iso) {
  if (!iso) return () => {};
  const fail = () => { throw new Error('GENERAL_AVC_CONFIG_UNQUALIFIED'); };
  const d = config.description && new Uint8Array(config.description.buffer ?? config.description,
    config.description.byteOffset ?? 0, config.description.byteLength);
  if (!d || d.length < 7 || d[0] !== 1) fail();
  const width = (d[4] & 3) + 1, sets = new Map([[7, []], [8, []]]);
  if (width === 3) fail();
  let at = 6;
  for (const type of [7, 8]) {
    const count = type === 7 ? d[5] & 31 : d[at++];
    if (!count || count > 64) fail();
    for (let i = 0; i < count; i++) {
      if (at + 2 > d.length) fail();
      const size = d[at] * 256 + d[at + 1]; at += 2;
      if (!size || at + size > d.length) fail();
      sets.get(type).push(d.subarray(at, at + size)); at += size;
    }
  }
  return packet => {
    const bytes = packet.data; let at = 0, units = 0;
    while (at < bytes.length) {
      if (at + width > bytes.length || ++units > 4096) fail();
      let size = 0; for (let i = 0; i < width; i++) size = size * 256 + bytes[at++];
      if (!size || at + size > bytes.length) fail();
      const candidates = sets.get(bytes[at] & 31);
      if (candidates && !candidates.some(unit => unit.length === size && unit.every((v, i) => v === bytes[at + i]))) {
        throw new Error('GENERAL_CONFIG_CHANGED');
      }
      at += size;
    }
  };
}
