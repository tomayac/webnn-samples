// Regenerates `common/weight_bundles.js` from the `test-data` submodule.
//
// Every directory of weight files becomes one Cross-Origin Storage entry: its
// files are packed with `common/cos_bundle.js` — the very same code the browser
// runs — and the resulting bundle is hashed. The browser can then assemble the
// bundle from the network and check it against the hash recorded here before
// sharing it with other origins.
//
// Run it after the `test-data` submodule moves:
//
//   git submodule update --init test-data
//   npm run generate-weight-bundles
//
// Bundles are discovered by scanning the demos for `/test-data/models/…`
// literals and then walking those paths for directories that directly contain
// files, so a new model is picked up automatically. Nesting is handled by that
// walk rather than assumed: `fast_style_transfer_nchw/weights/` holds a
// directory per style, and each style is a model in its own right that the demo
// loads on its own, so each becomes its own bundle.

import {createHash} from 'node:crypto';
import {mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {packBundle} from '../common/cos_bundle.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DATA = join(ROOT, 'test-data');
const OUTPUT = join(ROOT, 'common', 'weight_bundles.js');
const FILE_LISTS = join(ROOT, 'common', 'weight_bundles');
const ALGORITHM = 'SHA-256';
const SKIP_DIRECTORIES = ['node_modules', 'test-data', '.git'];

// Matches the `'/test-data/models/…'` string literals the model classes build
// their weight URLs from.
const WEIGHTS_PATH = /'\/test-data\/(models\/[^']+?)\/?'/g;

/**
 * Turn a bundle key into a flat module file name.
 * @param {String} key The bundle key.
 * @return {String} The module's base name.
 */
function moduleName(key) {
  return key.replace(/^models\//, '').replace(/\//g, '__');
}

/**
 * Find the path prefixes the demos reference.
 * @return {Promise<Array<String>>} Paths relative to `test-data`, e.g.
 *     `models/face_landmark_nhwc/weights`.
 */
async function findReferencedPaths() {
  const paths = new Set();
  const walk = async (directory) => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.includes(entry.name)) {
          await walk(path);
        }
      } else if (entry.name.endsWith('.js')) {
        const source = await readFile(path, 'utf8');
        for (const [, referenced] of source.matchAll(WEIGHTS_PATH)) {
          // Some models point straight at a single file, such as
          // `models/lenet_nchw/weights/lenet.bin`. The bundle is the directory
          // that holds it either way.
          paths.add(referenced.includes('.') ?
              dirname(referenced) : referenced);
        }
      }
    }
  };
  await walk(ROOT);
  return [...paths].sort();
}

/**
 * Collect the bundles under a referenced path: every directory at or below it
 * that directly contains files.
 * @param {String} path A path relative to `test-data`.
 * @return {Promise<Map<String, Array<String>>>} Bundle key to its file names.
 */
async function findBundles(path) {
  const bundles = new Map();
  const walk = async (key) => {
    let entries;
    try {
      entries = await readdir(join(TEST_DATA, key), {withFileTypes: true});
    } catch (error) {
      console.warn(`Skipping ${key}: ${error.message}`);
      return;
    }
    const names = entries
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
    if (names.length) {
      bundles.set(key, names);
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await walk(`${key}/${entry.name}`);
      }
    }
  };
  await walk(path);
  return bundles;
}

/**
 * Pack a bundle's files and hash the result.
 * @param {String} key The bundle key.
 * @param {Array<String>} names The file names in the bundle.
 * @return {Promise<Object>} The manifest entry.
 */
async function buildBundle(key, names) {
  const files = new Map();
  for (const name of names) {
    files.set(name, new Uint8Array(
        await readFile(join(TEST_DATA, key, name))));
  }
  const bundle = packBundle(files);
  const value = createHash(ALGORITHM.replace('-', '').toLowerCase())
      .update(bundle)
      .digest('hex');
  return {
    hash: {algorithm: ALGORITHM, value},
    bytes: bundle.byteLength,
    files: names,
  };
}

const bundles = {};
for (const path of await findReferencedPaths()) {
  for (const [key, names] of await findBundles(path)) {
    bundles[key] = await buildBundle(key, names);
    console.log(
        `${key}: ${names.length} files, ` +
        `${(bundles[key].bytes / 1024 / 1024).toFixed(1)} MB, ` +
        `${bundles[key].hash.value}`);
  }
}

// The file names are split into a module per bundle, dynamically imported only
// when a bundle has to be rebuilt from the network. Together they are over 100
// kB of names, and the common case — the bundle is already in Cross-Origin
// Storage — needs only the hash, because the bundle carries its own index.
await rm(FILE_LISTS, {recursive: true, force: true});
await mkdir(FILE_LISTS, {recursive: true});

for (const [key, entry] of Object.entries(bundles)) {
  const names = entry.files.map((name) => `  '${name}',`).join('\n');
  await writeFile(join(FILE_LISTS, `${moduleName(key)}.js`), `'use strict';

/* eslint-disable max-len */

// Generated by 'npm run generate-weight-bundles'. Do not edit by hand.
// The files packed into the '${key}' bundle, in bundle order.

export const FILES = [
${names}
];
`);
}

const body = Object.entries(bundles).map(([key, entry]) => `  '${key}': {
    hash: {
      algorithm: '${entry.hash.algorithm}',
      value:
        '${entry.hash.value}',
    },
    bytes: ${entry.bytes},
    fileCount: ${entry.files.length},
    files: () => import('./weight_bundles/${moduleName(key)}.js'),
  },`).join('\n');

await writeFile(OUTPUT, `'use strict';

/* eslint-disable max-len */

// Generated by 'npm run generate-weight-bundles'. Do not edit by hand.
//
// One entry per directory of weight files: the hash of the deterministic
// bundle that 'common/cos_bundle.js' packs its files into.
// 'common/cos_weights.js' uses the hash to look the model up in Cross-Origin
// Storage, and to verify the bytes it assembled from the network before
// storing them there.
//
// 'files()' lazily imports the bundle's file names, which are only needed when
// the bundle has to be rebuilt from the network — a stored bundle carries its
// own index.
//
// Regenerate after moving the 'test-data' submodule.

export const WEIGHT_BUNDLES = {
${body}
};
`);

console.log(
    `\nWrote ${Object.keys(bundles).length} bundles to ` +
    `${OUTPUT.slice(ROOT.length + 1)}.`);
