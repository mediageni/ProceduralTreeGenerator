const encoder = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
// Store-mode ZIP keeps the browser dependency-free and yields between models.
export async function makeZIP(files) {
  const local = [],
    central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name.replace(/[^a-zA-Z0-9._/-]/g, "_"));
    const bytes =
      typeof file.data === "string"
        ? encoder.encode(file.data)
        : file.data instanceof Blob
          ? new Uint8Array(await file.data.arrayBuffer())
          : new Uint8Array(file.data);
    const crc = crc32(bytes),
      header = new Uint8Array(30 + name.length),
      view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, bytes);
    const record = new Uint8Array(46 + name.length),
      rv = new DataView(record.buffer);
    rv.setUint32(0, 0x02014b50, true);
    rv.setUint16(4, 20, true);
    rv.setUint16(6, 20, true);
    rv.setUint16(8, 0x800, true);
    rv.setUint32(16, crc, true);
    rv.setUint32(20, bytes.length, true);
    rv.setUint32(24, bytes.length, true);
    rv.setUint16(28, name.length, true);
    rv.setUint32(42, offset, true);
    record.set(name, 46);
    central.push(record);
    offset += header.length + bytes.length;
  }
  const size = central.reduce((n, part) => n + part.length, 0),
    end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}
