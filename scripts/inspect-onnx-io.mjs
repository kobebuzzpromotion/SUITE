// Read ONNX protobuf metadata only. Does not load an inference runtime or execute a model.
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

function fields(bytes) {
  let offset = 0;
  function varint() {
    let result = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (offset >= bytes.length) throw new Error('Truncated varint');
      const value = bytes[offset++];
      result |= BigInt(value & 127) << shift;
      if (!(value & 128)) return result;
    }
    throw new Error('Invalid varint');
  }
  const result = [];
  while (offset < bytes.length) {
    const key = varint(), number = Number(key >> 3n), wire = Number(key & 7n);
    if (number < 1) throw new Error('Invalid field');
    if (wire === 0) { result.push({ number, value: varint() }); continue; }
    let size;
    if (wire === 1) size = 8;
    else if (wire === 5) size = 4;
    else if (wire === 2) {
      const length = varint();
      if (length > BigInt(bytes.length)) throw new Error('Invalid length');
      size = Number(length);
    } else throw new Error('Unsupported protobuf wire type');
    if (offset + size > bytes.length) throw new Error('Truncated field');
    result.push({ number, value: bytes.subarray(offset, offset + size) });
    offset += size;
  }
  return result;
}
const one = (list, number) => list.find(f => f.number === number)?.value;
function tensorInfo(bytes) {
  const info = fields(bytes);
  const type = fields(one(info, 2));
  const tensor = fields(one(type, 1));
  const shape = fields(one(tensor, 2)).filter(f => f.number === 1).map(f => {
    const dim = fields(f.value), fixed = one(dim, 1), symbol = one(dim, 2);
    return fixed !== undefined ? Number(fixed) : symbol?.toString('utf8') ?? null;
  });
  return { name: one(info, 1).toString('utf8'), elementType: Number(one(tensor, 1)), shape };
}
if (process.argv.length < 3) throw new Error('Usage: node scripts/inspect-onnx-io.mjs model.onnx [...]');
for (const path of process.argv.slice(2)) {
  if (statSync(path).size > 256 * 1024 * 1024) throw new Error('Metadata inspector limit: 256 MiB');
  const bytes = readFileSync(path);
  const graph = fields(one(fields(bytes), 7));
  // Older ONNX graphs list weights as inputs as well. They are not runtime feeds.
  const initializers = new Set(graph.filter(f => f.number === 5)
    .map(f => one(fields(f.value), 8)?.toString('utf8')));
  const declaredInputs = graph.filter(f => f.number === 11).map(f => tensorInfo(f.value));
  console.log(JSON.stringify({ path, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    initializerInputCount: declaredInputs.filter(t => initializers.has(t.name)).length,
    inputs: declaredInputs.filter(t => !initializers.has(t.name)),
    outputs: graph.filter(f => f.number === 12).map(f => tensorInfo(f.value)) }, null, 2));
}
