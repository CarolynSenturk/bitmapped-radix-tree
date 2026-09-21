/**
 * A compressed bitmapped radix tree for fixed-length binary keys.
 *
 * Each node stores a bitmask of which child slots are present and a compact
 * array of the children that exist. This keeps cache lines dense when a node
 * has only a few children, which is the common case for sparse key sets.
 *
 * Keys are fixed-length Uint8Array values. All keys must have the same length,
 * which is captured from the first inserted key.
 */
export class BitmappedRadixTree {
  /**
   * @param {number} [keyLength] Optional fixed key length in bytes. If omitted,
   *   the length is inferred from the first inserted key.
   */
  constructor(keyLength) {
    /**
     * @type {number | undefined}
     */
    this.keyLength = keyLength;
    /**
     * Root node. The root represents the empty prefix.
     * @type {{
     *   bitmap: number,
     *   children: Array<{nibble: number, node: object, value: Uint8Array | null}>
     * }}
     */
    this.root = {
      bitmap: 0,
      children: [],
    };
    /**
     * Number of key-value pairs stored.
     * @type {number}
     */
    this.size = 0;
  }

  /**
   * Insert a key-value pair.
   *
   * @param {Uint8Array} key
   * @param {Uint8Array} value
   * @returns {this}
   */
  insert(key, value) {
    this._validateKey(key);
    if (value == null) {
      throw new TypeError('value must be a Uint8Array');
    }
    if (!(value instanceof Uint8Array)) {
      throw new TypeError('value must be a Uint8Array');
    }

    if (this.keyLength === undefined) {
      this.keyLength = key.length;
    }

    if (this.size === 0) {
      this.root = this._createNode();
    }

    let node = this.root;
    let depth = 0;

    while (depth < this.keyLength * 2) {
      const nibble = this._getNibble(key, depth);
      const childIndex = this._findChild(node, nibble);

      if (childIndex === -1) {
        const child = this._createNode();
        node.bitmap |= 1 << nibble;
        node.children.splice(
          this._lowerBound(node.children, nibble),
          0,
          { nibble, node: child },
        );
        node = child;
      } else {
        node = node.children[childIndex].node;
      }
      depth++;
    }

    const existed = node.value !== null;
    node.value = value;
    if (!existed) {
      this.size++;
    }
    return this;
  }

  /**
   * Retrieve a value by key.
   *
   * @param {Uint8Array} key
   * @returns {Uint8Array | null} The stored value or null if not found.
   */
  get(key) {
    if (!(key instanceof Uint8Array)) {
      throw new TypeError('key must be a Uint8Array');
    }
    if (this.keyLength === undefined || key.length !== this.keyLength) {
      return null;
    }

    let node = this.root;
    let depth = 0;

    while (depth < this.keyLength * 2) {
      const nibble = this._getNibble(key, depth);
      const childIndex = this._findChild(node, nibble);
      if (childIndex === -1) {
        return null;
      }
      node = node.children[childIndex].node;
      depth++;
    }

    return node.value;
  }

  /**
   * Remove a key and its value.
   *
   * @param {Uint8Array} key
   * @returns {boolean} true if a key was removed, false if it was not present.
   */
  delete(key) {
    if (!(key instanceof Uint8Array)) {
      throw new TypeError('key must be a Uint8Array');
    }
    if (this.keyLength === undefined || key.length !== this.keyLength) {
      return false;
    }

    const path = [];
    let node = this.root;
    let depth = 0;

    while (depth < this.keyLength * 2) {
      const nibble = this._getNibble(key, depth);
      const childIndex = this._findChild(node, nibble);
      if (childIndex === -1) {
        return false;
      }
      path.push({ parent: node, childIndex, nibble });
      node = node.children[childIndex].node;
      depth++;
    }

    if (node.value === null) {
      return false;
    }

    node.value = null;
    this.size--;

    // Prune empty nodes from the leaf upward.
    for (let i = path.length - 1; i >= 0; i--) {
      const { parent, childIndex } = path[i];
      const child = parent.children[childIndex].node;
      if (child.value !== null || child.bitmap !== 0) {
        break;
      }
      parent.bitmap &= ~(1 << path[i].nibble);
      parent.children.splice(childIndex, 1);
    }

    if (this.size === 0) {
      this.root = this._createNode();
    }

    return true;
  }

  /**
   * Return all keys in lexicographic order (byte-wise).
   *
   * @returns {Uint8Array[]}
   */
  keys() {
    const result = [];
    this._collect(this.root, [], result);
    return result;
  }

  /**
   * Return all values in the same order as keys().
   *
   * @returns {Uint8Array[]}
   */
  values() {
    const result = [];
    this._collect(this.root, [], result, true);
    return result;
  }

  /**
   * @param {Uint8Array} key
   */
  _validateKey(key) {
    if (!(key instanceof Uint8Array)) {
      throw new TypeError('key must be a Uint8Array');
    }
    if (key.length === 0) {
      throw new RangeError('key must have length at least 1');
    }
    if (this.keyLength !== undefined && key.length !== this.keyLength) {
      throw new RangeError(
        `key length ${key.length} does not match tree key length ${this.keyLength}`,
      );
    }
  }

  /**
   * @param {Uint8Array} key
   * @param {number} depth Nibble index (0 to keyLength*2 - 1).
   * @returns {number} Nibble value 0-15.
   */
  _getNibble(key, depth) {
    const byte = key[depth >> 1];
    return (depth & 1) === 0 ? byte >> 4 : byte & 0x0f;
  }

  /**
   * @returns {object} A fresh empty node.
   */
  _createNode() {
    return {
      bitmap: 0,
      children: [],
      value: null,
    };
  }

  /**
   * Find a child index for a nibble using the bitmap as a fast filter.
   *
   * @param {object} node
   * @param {number} nibble
   * @returns {number} Child index or -1.
   */
  _findChild(node, nibble) {
    const mask = 1 << nibble;
    if ((node.bitmap & mask) === 0) {
      return -1;
    }
    // The children array is sorted by nibble. Count how many lower nibbles
    // are present in the bitmap to get the index.
    const lowerMask = mask - 1;
    const lowerBits = node.bitmap & lowerMask;
    let index = 0;
    let bits = lowerBits;
    while (bits !== 0) {
      bits &= bits - 1;
      index++;
    }
    return index;
  }

  /**
   * Lower bound insertion index for children sorted by nibble.
   *
   * @param {Array<{nibble: number, node: object}>} children
   * @param {number} nibble
   * @returns {number}
   */
  _lowerBound(children, nibble) {
    let lo = 0;
    let hi = children.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (children[mid].nibble < nibble) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Recursively collect keys (or values) in lexicographic order.
   *
   * @param {object} node
   * @param {number[]} prefix Nibble path from the root.
   * @param {(Uint8Array)[]} result
   * @param {boolean} [collectValues]
   */
  _collect(node, prefix, result, collectValues = false) {
    if (node.value !== null) {
      const key = new Uint8Array(this.keyLength);
      for (let i = 0; i < prefix.length; i++) {
        const byteIndex = i >> 1;
        if ((i & 1) === 0) {
          key[byteIndex] = prefix[i] << 4;
        } else {
          key[byteIndex] |= prefix[i];
        }
      }
      result.push(collectValues ? node.value : key);
    }

    for (const child of node.children) {
      prefix.push(child.nibble);
      this._collect(child.node, prefix, result, collectValues);
      prefix.pop();
    }
  }
}
