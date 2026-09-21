import test from 'node:test';
import assert from 'node:assert/strict';
import { BitmappedRadixTree } from '../src/core.js';

function key(bytes) {
  return new Uint8Array(bytes);
}

function val(bytes) {
  return new Uint8Array(bytes);
}

test('insert and get return stored value', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x12, 0x34]), val([1, 2, 3]));
  assert.deepEqual(tree.get(key([0x12, 0x34])), val([1, 2, 3]));
});

test('get missing key returns null', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x12, 0x34]), val([1]));
  assert.equal(tree.get(key([0x12, 0x35])), null);
  assert.equal(tree.get(key([0x12])), null);
});

test('insert overwrites existing value', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0xab]), val([1]));
  tree.insert(key([0xab]), val([2]));
  assert.deepEqual(tree.get(key([0xab])), val([2]));
  assert.equal(tree.size, 1);
});

test('fixed key length is enforced after first insert', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x01, 0x02]), val([1]));
  assert.throws(() => tree.insert(key([0x01]), val([2])), RangeError);
  assert.throws(() => tree.insert(key([0x01, 0x02, 0x03]), val([3])), RangeError);
});

test('constructor accepts explicit key length', () => {
  const tree = new BitmappedRadixTree(1);
  assert.throws(() => tree.insert(key([0x01, 0x02]), val([1])), RangeError);
  tree.insert(key([0x01]), val([1]));
  assert.deepEqual(tree.get(key([0x01])), val([1]));
});

test('keys are returned in lexicographic order', () => {
  const tree = new BitmappedRadixTree();
  const keys = [
    key([0x00, 0xff]),
    key([0x01, 0x00]),
    key([0x01, 0x01]),
    key([0xff, 0x00]),
  ];
  // Insert out of order.
  tree.insert(keys[3], val([1]));
  tree.insert(keys[1], val([1]));
  tree.insert(keys[0], val([1]));
  tree.insert(keys[2], val([1]));

  const result = tree.keys();
  assert.equal(result.length, 4);
  assert.deepEqual(result[0], keys[0]);
  assert.deepEqual(result[1], keys[1]);
  assert.deepEqual(result[2], keys[2]);
  assert.deepEqual(result[3], keys[3]);
});

test('values are returned in same order as keys', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x02]), val([2]));
  tree.insert(key([0x01]), val([1]));
  tree.insert(key([0x03]), val([3]));

  const values = tree.values();
  assert.deepEqual(values[0], val([1]));
  assert.deepEqual(values[1], val([2]));
  assert.deepEqual(values[2], val([3]));
});

test('delete removes existing key', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x10, 0x20]), val([1]));
  tree.insert(key([0x10, 0x21]), val([2]));

  assert.equal(tree.delete(key([0x10, 0x20])), true);
  assert.equal(tree.get(key([0x10, 0x20])), null);
  assert.deepEqual(tree.get(key([0x10, 0x21])), val([2]));
  assert.equal(tree.size, 1);
});

test('delete missing key returns false', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x01]), val([1]));
  assert.equal(tree.delete(key([0x02])), false);
  assert.equal(tree.size, 1);
});

test('delete prunes empty branches', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x01, 0x02]), val([1]));
  assert.equal(tree.delete(key([0x01, 0x02])), true);
  assert.equal(tree.root.bitmap, 0);
  assert.equal(tree.root.children.length, 0);
  assert.equal(tree.size, 0);
});

test('tree remains usable after deleting all keys', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0xaa]), val([1]));
  tree.insert(key([0xbb]), val([2]));
  tree.delete(key([0xaa]));
  tree.delete(key([0xbb]));
  assert.equal(tree.size, 0);
  tree.insert(key([0xcc]), val([3]));
  assert.deepEqual(tree.get(key([0xcc])), val([3]));
});

test('large key length works', () => {
  const tree = new BitmappedRadixTree();
  const bigKey = new Uint8Array(64);
  bigKey[63] = 0xff;
  tree.insert(bigKey, val([1]));
  assert.deepEqual(tree.get(bigKey), val([1]));
});

test('invalid key types throw TypeError', () => {
  const tree = new BitmappedRadixTree();
  assert.throws(() => tree.insert([0x01], val([1])), TypeError);
  assert.throws(() => tree.get('not a key'), TypeError);
  assert.throws(() => tree.delete(null), TypeError);
});

test('invalid value type throws TypeError', () => {
  const tree = new BitmappedRadixTree();
  assert.throws(() => tree.insert(key([0x01]), [1]), TypeError);
  assert.throws(() => tree.insert(key([0x01]), null), TypeError);
});

test('empty key throws RangeError', () => {
  const tree = new BitmappedRadixTree();
  assert.throws(() => tree.insert(new Uint8Array(0), val([1])), RangeError);
});

test('insert after explicit key length with wrong length throws', () => {
  const tree = new BitmappedRadixTree(2);
  assert.throws(() => tree.insert(key([0x01]), val([1])), RangeError);
  assert.throws(() => tree.insert(key([0x01, 0x02, 0x03]), val([1])), RangeError);
});

test('get with wrong key length returns null', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x01, 0x02]), val([1]));
  assert.equal(tree.get(key([0x01])), null);
  assert.equal(tree.get(key([0x01, 0x02, 0x03])), null);
});

test('delete with wrong key length returns false', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x01, 0x02]), val([1]));
  assert.equal(tree.delete(key([0x01])), false);
  assert.equal(tree.delete(key([0x01, 0x02, 0x03])), false);
});

test('multiple keys sharing prefixes do not interfere', () => {
  const tree = new BitmappedRadixTree();
  tree.insert(key([0x12, 0x34]), val([1]));
  tree.insert(key([0x12, 0x35]), val([2]));
  tree.insert(key([0x12, 0x36]), val([3]));
  tree.insert(key([0x13, 0x00]), val([4]));

  assert.deepEqual(tree.get(key([0x12, 0x34])), val([1]));
  assert.deepEqual(tree.get(key([0x12, 0x35])), val([2]));
  assert.deepEqual(tree.get(key([0x12, 0x36])), val([3]));
  assert.deepEqual(tree.get(key([0x13, 0x00])), val([4]));
  assert.equal(tree.size, 4);
});

test('all 256 one-byte keys can be stored', () => {
  const tree = new BitmappedRadixTree(1);
  for (let i = 0; i < 256; i++) {
    tree.insert(key([i]), val([i]));
  }
  for (let i = 0; i < 256; i++) {
    assert.deepEqual(tree.get(key([i])), val([i]));
  }
  assert.equal(tree.size, 256);
  const keys = tree.keys();
  assert.equal(keys.length, 256);
  assert.deepEqual(keys[0], key([0]));
  assert.deepEqual(keys[255], key([255]));
});
