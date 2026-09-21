# Bitmapped Radix Tree

A zero-dependency TypeScript library that stores fixed-length binary keys in a compressed radix tree using bitmap child indicators for cache-efficient lookups.

## Usage

```javascript
import { BitmappedRadixTree } from 'bitmapped-radix-tree';

const tree = new BitmappedRadixTree();
const key = new Uint8Array([0x12, 0x34]);
const value = new Uint8Array([1, 2, 3]);

tree.insert(key, value);
console.log(tree.get(key)); // Uint8Array [1, 2, 3]
```

Keys and values are always `Uint8Array` instances. The key length is fixed: it is either passed to the constructor or inferred from the first inserted key. Inserting a key of a different length throws a `RangeError`.

## Why this exists

A standard binary trie uses one node per bit, which can require many pointer traversals for long keys. This radix tree uses one node per 4-bit nibble, halving the depth compared with a bitwise trie while still keeping branching simple. The bitmap in each node makes child lookup a bit-test and population count rather than a linear scan, which keeps lookups fast even when a node has many children.

The trade-off is that keys are fixed length. That constraint allows the implementation to avoid storing length information in every node and to traverse directly to the terminal node without checking for premature ends. If you need variable-length keys, this is not the right structure.

## Awkward edge

Deletion prunes empty internal nodes. If you delete all keys, the root is reset to a fresh empty node, so the tree can be reused. Calling `get` or `delete` with a key whose length does not match the tree returns `null` or `false` rather than throwing, because those operations are queries, not insertions.

## Exports

- `BitmappedRadixTree` from `src/core.js`, also re-exported from `src/index.js`
