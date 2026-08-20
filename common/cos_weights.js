'use strict';

// Progressive enhancement: cache model weights in Cross-Origin Storage (COS).
//
// https://github.com/WICG/cross-origin-storage
//
// COS is a hash-addressed store that browsers share between origins, so a large
// model downloaded by one site can be reused by another instead of being
// re-fetched. It is keyed by the hash of a single file, while a model here is a
// directory of per-tensor `.npy` files, so this module works in terms of the
// deterministic per-directory bundles described in `cos_bundle.js`: one COS
// entry per model+layout.
//
// The first visit to a demo fetches the individual weight files exactly as
// before, packs them into a bundle, verifies the bundle against the hash
// hard-coded in `weight_bundles.js`, and writes it to COS. Any later visit —
// including from a different origin — gets the whole model back in a single
// read.
//
// Every failure path here falls back to the plain network fetch the demos used
// before. A browser without COS, a model missing from the manifest, a stale
// manifest, a full quota, or a user who declines the storage prompt must all
// end up with a working demo, just without the cache.

import {hashBytes, packBundle, unpackBundle} from './cos_bundle.js';
import {WEIGHT_BUNDLES} from './weight_bundles.js';

// Matches `…/test-data/<directory>/<file>`, capturing the directory key used by
// `WEIGHT_BUNDLES` and the file name within it. The leading origin varies
// (`weightsOrigin()` returns either `..` or the CloudFront host), so only the
// tail of the path is matched. The directory is captured greedily and however
// deep it happens to be, because the nesting differs per model — style transfer
// keeps a directory per style below `weights/`.
const WEIGHT_URL = /\/test-data\/(.+)\/([^/?#]+)(?:[?#].*)?$/;

// Bundle key to a promise for its unpacked contents, so that the many
// concurrent `buildConstantByNpy()` calls for one model share a single load.
const bundles = new Map();

/**
 * Whether the Cross-Origin Storage API is available.
 * @return {Boolean} True if COS can be used.
 */
export function isCrossOriginStorageAvailable() {
  return typeof navigator !== 'undefined' &&
      typeof navigator.crossOriginStorage?.requestFileHandle === 'function';
}

/**
 * Split a weight file URL into the bundle it belongs to and its name within
 * that bundle.
 * @param {String} url The URL a demo asked for.
 * @return {?{key: String, fileName: String, baseUrl: String}} Null if the URL
 *     is not a recognized weight file.
 */
function parseWeightUrl(url) {
  const match = WEIGHT_URL.exec(url);
  if (!match) {
    return null;
  }
  const [, key, fileName] = match;
  return {key, fileName, baseUrl: url.slice(0, url.lastIndexOf('/'))};
}

/**
 * Fetch every file of a bundle over the network, in parallel, the same way the
 * demos did before this cache existed.
 * @param {String} baseUrl The weights directory URL, without a trailing slash.
 * @param {Array<String>} fileNames The file names in the bundle.
 * @return {Promise<Map<String, ArrayBuffer>>} The fetched files.
 */
async function fetchBundleFiles(baseUrl, fileNames) {
  const buffers = await Promise.all(fileNames.map(async (fileName) => {
    const response = await fetch(`${baseUrl}/${fileName}`);
    if (!response.ok) {
      throw new Error(
          `Failed to fetch ${fileName}: ${response.status} ` +
          `${response.statusText}.`);
    }
    return response.arrayBuffer();
  }));
  return new Map(fileNames.map((fileName, i) => [fileName, buffers[i]]));
}

/**
 * Read a bundle back out of Cross-Origin Storage.
 * @param {{algorithm: String, value: String}} hash The bundle's hash.
 * @return {Promise<?Map<String, ArrayBuffer>>} The unpacked bundle, or null if
 *     it is not stored.
 */
async function readFromCrossOriginStorage(hash) {
  let handle;
  try {
    handle = await navigator.crossOriginStorage.requestFileHandle(hash);
  } catch (error) {
    // `NotFoundError` simply means the bundle has not been stored yet, and
    // `NotAllowedError` means a Permissions Policy or the user disallowed the
    // read. Both are ordinary cache misses as far as the demos are concerned.
    if (error.name !== 'NotFoundError' && error.name !== 'NotAllowedError') {
      console.warn('Cross-Origin Storage read failed.', error);
    }
    return null;
  }
  const blob = await handle.getFile();
  return unpackBundle(await blob.arrayBuffer());
}

/**
 * Write a bundle to Cross-Origin Storage, best effort. A failure to store is
 * never fatal: the caller already holds the bytes it needs.
 * @param {{algorithm: String, value: String}} hash The bundle's hash.
 * @param {Uint8Array} bundle The bundle bytes.
 * @return {Promise<Boolean>} True if the bundle was stored.
 */
async function writeToCrossOriginStorage(hash, bundle) {
  try {
    const handle = await navigator.crossOriginStorage.requestFileHandle(hash, {
      create: true,
      // These weights are public sample data, so let any origin reuse them.
      origins: '*',
    });
    const writableStream = await handle.createWritable();
    await writableStream.write(new Blob([bundle]));
    await writableStream.close();
    return true;
  } catch (error) {
    console.warn('Cross-Origin Storage write failed.', error);
    return false;
  }
}

/**
 * Load one bundle: from Cross-Origin Storage if it is there, otherwise from the
 * network, storing it on the way out.
 * @param {String} key The bundle key, e.g. `models/face_landmark_nhwc/weights`.
 * @param {String} baseUrl The weights directory URL, without a trailing slash.
 * @return {Promise<Map<String, ArrayBuffer>>} The bundle's files.
 */
async function loadBundle(key, baseUrl) {
  const {hash, fileCount, files} = WEIGHT_BUNDLES[key];

  const cached = await readFromCrossOriginStorage(hash);
  if (cached) {
    console.info(
        `Loaded ${key} from Cross-Origin Storage (${fileCount} weight ` +
        `files, ${hash.algorithm}:${hash.value}).`);
    return cached;
  }

  // Only a rebuild needs the file names, so they live in a module of their own.
  const {FILES} = await files();
  const fetched = await fetchBundleFiles(baseUrl, FILES);
  const bundle = packBundle(new Map(
      [...fetched].map(([name, buffer]) => [name, new Uint8Array(buffer)])));
  const actualHash = await hashBytes(bundle, hash.algorithm);

  if (actualHash.value !== hash.value) {
    // The manifest is out of date with respect to the weights being served —
    // most likely the `test-data` submodule moved without `npm run
    // generate-weight-bundles` being re-run. Storing under the wrong hash would
    // poison a store other origins share, so don't.
    console.warn(
        `Not caching ${key}: expected ${hash.algorithm}:${hash.value}, but ` +
        `the fetched weights hash to ${actualHash.value}. Re-run ` +
        `'npm run generate-weight-bundles'.`);
    return fetched;
  }

  if (await writeToCrossOriginStorage(hash, bundle)) {
    console.info(
        `Cached ${key} in Cross-Origin Storage (${fileCount} weight files, ` +
        `${bundle.byteLength} bytes, ${hash.algorithm}:${hash.value}).`);
  }
  return fetched;
}

/**
 * Get a weight file's bytes through the Cross-Origin Storage cache.
 * @param {String} url The weight file URL.
 * @return {Promise<?ArrayBuffer>} The file's bytes, or null if this URL is not
 *     cacheable and the caller should fetch it directly.
 */
export async function getCachedWeightBuffer(url) {
  if (!isCrossOriginStorageAvailable()) {
    return null;
  }
  const parsed = parseWeightUrl(url);
  if (!parsed || !WEIGHT_BUNDLES[parsed.key]) {
    return null;
  }
  const {key, fileName, baseUrl} = parsed;

  if (!bundles.has(key)) {
    bundles.set(key, loadBundle(key, baseUrl).catch((error) => {
      // Leave no rejected promise behind: the next call retries over the
      // network path instead of inheriting this failure.
      bundles.delete(key);
      throw error;
    }));
  }

  try {
    const files = await bundles.get(key);
    return files.get(fileName) ?? null;
  } catch (error) {
    console.warn(
        `Cross-Origin Storage cache unavailable for ${key}, falling back to ` +
        `the network.`, error);
    return null;
  }
}
