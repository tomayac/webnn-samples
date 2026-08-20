'use strict';

// A minimal, deterministic container format for the many small `.npy` weight
// files that make up one model.
//
// The Cross-Origin Storage API is keyed by the hash of a single file, but a
// model in this repository is a directory of individual per-tensor `.npy`
// files — `face_landmark_nhwc/weights/` alone is 20 of them, and
// `resnet50v2_nchw/weights/` is 259. A demo always loads every file in the
// directory it points at, so the directory, not the tensor, is the unit worth
// content-addressing: one hash per model+layout instead of thousands of
// sub-kilobyte cache entries.
//
// Packing is byte-for-byte deterministic — files are always ordered by name and
// the index is serialized with a fixed key order — which is what lets
// `weight_bundles.js` hard-code the expected hash of each bundle. The browser
// assembles the bundle from whatever the network gave it and can then verify
// those bytes against the hard-coded hash before storing them.
//
// Layout:
//   magic     8 bytes    'COSWBNP1'
//   indexLen  4 bytes    uint32, little-endian
//   index     indexLen bytes, UTF-8 JSON: {"files":[{"name":…,"size":…},…]}
//   data      the file contents, concatenated in index order
//
// This module is deliberately free of DOM and network dependencies so that
// `tools/generate_weight_bundles.mjs` can import it under Node.js and produce
// exactly the same bytes the browser does.

const MAGIC = 'COSWBNP1';
const MAGIC_LENGTH = 8;
const INDEX_LENGTH_OFFSET = MAGIC_LENGTH;
const INDEX_OFFSET = MAGIC_LENGTH + 4;

/**
 * Pack named byte arrays into a single deterministic bundle.
 * @param {Map<String, Uint8Array>} files Weight file name to its bytes.
 * @return {Uint8Array} The bundle bytes.
 */
export function packBundle(files) {
  const fileNames = [...files.keys()].sort();
  const index = {
    files: fileNames.map((fileName) => ({
      name: fileName,
      size: files.get(fileName).byteLength,
    })),
  };
  const indexBytes = new TextEncoder().encode(JSON.stringify(index));
  const dataLength = fileNames.reduce(
      (total, fileName) => total + files.get(fileName).byteLength, 0);

  const bundle = new Uint8Array(
      INDEX_OFFSET + indexBytes.byteLength + dataLength);
  bundle.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(bundle.buffer).setUint32(
      INDEX_LENGTH_OFFSET, indexBytes.byteLength, /* littleEndian */ true);
  bundle.set(indexBytes, INDEX_OFFSET);

  let offset = INDEX_OFFSET + indexBytes.byteLength;
  // eslint-disable-next-line no-unused-vars
  for (const fileName of fileNames) {
    bundle.set(files.get(fileName), offset);
    offset += files.get(fileName).byteLength;
  }
  return bundle;
}

/**
 * Unpack a bundle produced by `packBundle()`.
 * @param {ArrayBuffer} arrayBuffer The bundle bytes.
 * @return {Map<String, ArrayBuffer>} Weight file name to its bytes. Each buffer
 *     is a copy, so it is a standalone, correctly aligned buffer that a typed
 *     array constructor can wrap directly.
 */
export function unpackBundle(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const magic = new TextDecoder().decode(bytes.subarray(0, MAGIC_LENGTH));
  if (magic !== MAGIC) {
    throw new Error(`Not a weight bundle: unexpected magic '${magic}'.`);
  }
  const indexLength = new DataView(arrayBuffer).getUint32(
      INDEX_LENGTH_OFFSET, /* littleEndian */ true);
  const index = JSON.parse(new TextDecoder().decode(
      bytes.subarray(INDEX_OFFSET, INDEX_OFFSET + indexLength)));

  const files = new Map();
  let offset = INDEX_OFFSET + indexLength;
  // eslint-disable-next-line no-unused-vars
  for (const {name, size} of index.files) {
    files.set(name, arrayBuffer.slice(offset, offset + size));
    offset += size;
  }
  return files;
}

/**
 * Hash bytes the way the Cross-Origin Storage API expects them: a lowercase hex
 * digest paired with the name of the Web Crypto algorithm that produced it.
 * @param {BufferSource} bytes The bytes to hash.
 * @param {String} algorithm A Web Crypto digest algorithm name.
 * @return {Promise<{algorithm: String, value: String}>} A COS hash object.
 */
export async function hashBytes(bytes, algorithm = 'SHA-256') {
  const digest = await crypto.subtle.digest(algorithm, bytes);
  const value = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  return {algorithm, value};
}
