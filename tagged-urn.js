// Tagged URN JavaScript Implementation
// Follows the exact same rules as Rust, Go, and Objective-C implementations

/**
 * Error types for Tagged URN operations
 */
class TaggedUrnError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TaggedUrnError';
    this.code = code;
  }
}

// Error codes
const ErrorCodes = {
  INVALID_FORMAT: 1,
  EMPTY_TAG: 2,
  INVALID_CHARACTER: 3,
  INVALID_TAG_FORMAT: 4,
  MISSING_PREFIX: 5,
  DUPLICATE_KEY: 6,
  NUMERIC_KEY: 7,
  UNTERMINATED_QUOTE: 8,
  INVALID_ESCAPE_SEQUENCE: 9,
  EMPTY_PREFIX: 10,
  PREFIX_MISMATCH: 11
};

// Parser states for state machine
const ParseState = {
  EXPECTING_KEY: 0,
  IN_KEY: 1,
  EXPECTING_VALUE: 2,
  IN_UNQUOTED_VALUE: 3,
  IN_QUOTED_VALUE: 4,
  IN_QUOTED_VALUE_ESCAPE: 5,
  EXPECTING_SEMI_OR_END: 6
};

/**
 * Check if a character is valid for a key
 */
function isValidKeyChar(c) {
  return /[a-zA-Z0-9_\-\/:\.]/.test(c);
}

/**
 * Check if a character is valid for an unquoted value
 */
function isValidUnquotedValueChar(c) {
  return /[a-zA-Z0-9_\-\/:\.\*\?\!]/.test(c);
}

/**
 * Check if a value needs quoting for serialization
 */
function needsQuoting(value) {
  for (const c of value) {
    if (c === ';' || c === '=' || c === '"' || c === '\\' || c === ' ' || c.toUpperCase() !== c.toLowerCase() && c === c.toUpperCase()) {
      return true;
    }
  }
  return false;
}

/**
 * Quote a value for serialization
 */
function quoteValue(value) {
  let result = '"';
  for (const c of value) {
    if (c === '"' || c === '\\') {
      result += '\\';
    }
    result += c;
  }
  result += '"';
  return result;
}

/**
 * Check if instance value matches pattern constraint
 *
 * Full cross-product truth table:
 * | Instance | Pattern | Match? | Reason |
 * |----------|---------|--------|--------|
 * | (none)   | (none)  | OK     | No constraint either side |
 * | (none)   | K=?     | OK     | Pattern doesn't care |
 * | (none)   | K=!     | OK     | Pattern wants absent, it is |
 * | (none)   | K=*     | NO     | Pattern wants present |
 * | (none)   | K=v     | NO     | Pattern wants exact value |
 * | K=?      | (any)   | OK     | Instance doesn't care |
 * | K=!      | (none)  | OK     | Symmetric: absent |
 * | K=!      | K=?     | OK     | Pattern doesn't care |
 * | K=!      | K=!     | OK     | Both want absent |
 * | K=!      | K=*     | NO     | Conflict: absent vs present |
 * | K=!      | K=v     | NO     | Conflict: absent vs value |
 * | K=*      | (none)  | OK     | Pattern has no constraint |
 * | K=*      | K=?     | OK     | Pattern doesn't care |
 * | K=*      | K=!     | NO     | Conflict: present vs absent |
 * | K=*      | K=*     | OK     | Both accept any presence |
 * | K=*      | K=v     | OK     | Instance accepts any, v is fine |
 * | K=v      | (none)  | OK     | Pattern has no constraint |
 * | K=v      | K=?     | OK     | Pattern doesn't care |
 * | K=v      | K=!     | NO     | Conflict: value vs absent |
 * | K=v      | K=*     | OK     | Pattern wants any, v satisfies |
 * | K=v      | K=v     | OK     | Exact match |
 * | K=v      | K=w     | NO     | Value mismatch (v≠w) |
 */
function valuesMatch(inst, patt) {
  // Pattern has no constraint (no entry or explicit ?)
  if (patt === undefined || patt === '?') {
    return true;
  }

  // Instance doesn't care (explicit ?)
  if (inst === '?') {
    return true;
  }

  // Pattern: must-not-have (!)
  if (patt === '!') {
    if (inst === undefined) {
      return true; // Instance absent, pattern wants absent
    }
    if (inst === '!') {
      return true; // Both say absent
    }
    return false; // Instance has value, pattern wants absent
  }

  // Instance: must-not-have conflicts with pattern wanting value
  if (inst === '!') {
    return false; // Conflict: absent vs value or present
  }

  // Pattern: must-have-any (*)
  if (patt === '*') {
    if (inst === undefined) {
      return false; // Instance missing, pattern wants present
    }
    return true; // Instance has value, pattern wants any
  }

  // Pattern: exact value
  if (inst === undefined) {
    return false; // Instance missing, pattern wants value
  }
  if (inst === '*') {
    return true; // Instance accepts any, pattern's value is fine
  }
  return inst === patt; // Both have values, must match exactly
}

/**
 * Check if two pattern values are compatible (could match the same instance)
 */
function valuesCompatible(v1, v2) {
  // Either missing or ? means no constraint - compatible with anything
  if (v1 === undefined || v2 === undefined) {
    return true;
  }
  if (v1 === '?' || v2 === '?') {
    return true;
  }

  // Both are ! - compatible (both want absent)
  if (v1 === '!' && v2 === '!') {
    return true;
  }

  // One is ! and other is value or * - NOT compatible
  if (v1 === '!' || v2 === '!') {
    return false;
  }

  // Both are * - compatible
  if (v1 === '*' && v2 === '*') {
    return true;
  }

  // One is * and other is value - compatible (value matches *)
  if (v1 === '*' || v2 === '*') {
    return true;
  }

  // Both are specific values - must be equal
  return v1 === v2;
}

/**
 * Tagged URN implementation with flat, ordered tags and configurable prefix
 */
class TaggedUrn {
  /**
   * Create a new TaggedUrn
   * @param {string} prefix - The prefix for this URN
   * @param {Object} tags - Initial tags (will not be re-normalized in constructor)
   * @param {boolean} skipNormalization - If true, skip key normalization (internal use)
   */
  constructor(prefix, tags = {}, skipNormalization = false) {
    this.prefix = prefix.toLowerCase();
    this.tags = {};
    if (skipNormalization) {
      this.tags = { ...tags };
    } else {
      for (const [key, value] of Object.entries(tags)) {
        this.tags[key.toLowerCase()] = value;
      }
    }
  }

  /**
   * Create a Tagged URN from string representation
   * Format: prefix:key1=value1;key2=value2;... or prefix:key1="value with spaces";key2=simple
   *
   * Case handling:
   * - Prefix: Normalized to lowercase
   * - Keys: Always normalized to lowercase
   * - Unquoted values: Normalized to lowercase
   * - Quoted values: Case preserved exactly as specified
   *
   * @param {string} s - The Tagged URN string
   * @returns {TaggedUrn} The parsed Tagged URN
   * @throws {TaggedUrnError} If parsing fails
   */
  static fromString(s) {
    if (!s || typeof s !== 'string') {
      throw new TaggedUrnError(ErrorCodes.INVALID_FORMAT, 'Tagged URN cannot be empty');
    }

    // Find the prefix (everything before the first colon)
    const colonPos = s.indexOf(':');
    if (colonPos === -1) {
      throw new TaggedUrnError(ErrorCodes.MISSING_PREFIX, "Tagged URN must have a prefix followed by ':'");
    }

    if (colonPos === 0) {
      throw new TaggedUrnError(ErrorCodes.EMPTY_PREFIX, 'Tagged URN prefix cannot be empty');
    }

    const prefix = s.slice(0, colonPos).toLowerCase();
    const tagsPart = s.slice(colonPos + 1);
    const tags = {};

    // Handle empty tagged URN (prefix: with no tags or just semicolon)
    if (tagsPart === '' || tagsPart === ';') {
      return new TaggedUrn(prefix, tags, true);
    }

    let state = ParseState.EXPECTING_KEY;
    let currentKey = '';
    let currentValue = '';
    const chars = [...tagsPart];
    let pos = 0;

    const finishTag = () => {
      if (currentKey === '') {
        throw new TaggedUrnError(ErrorCodes.EMPTY_TAG, 'empty key');
      }
      if (currentValue === '') {
        throw new TaggedUrnError(ErrorCodes.EMPTY_TAG, `empty value for key '${currentKey}'`);
      }

      // Check for duplicate keys
      if (tags.hasOwnProperty(currentKey)) {
        throw new TaggedUrnError(ErrorCodes.DUPLICATE_KEY, `Duplicate tag key: ${currentKey}`);
      }

      // Validate key cannot be purely numeric
      if (/^\d+$/.test(currentKey)) {
        throw new TaggedUrnError(ErrorCodes.NUMERIC_KEY, `Tag key cannot be purely numeric: ${currentKey}`);
      }

      tags[currentKey] = currentValue;
      currentKey = '';
      currentValue = '';
    };

    while (pos < chars.length) {
      const c = chars[pos];

      switch (state) {
        case ParseState.EXPECTING_KEY:
          if (c === ';') {
            // Empty segment, skip
            pos++;
            continue;
          } else if (isValidKeyChar(c)) {
            currentKey += c.toLowerCase();
            state = ParseState.IN_KEY;
          } else {
            throw new TaggedUrnError(ErrorCodes.INVALID_CHARACTER, `invalid character '${c}' at position ${pos}`);
          }
          break;

        case ParseState.IN_KEY:
          if (c === '=') {
            if (currentKey === '') {
              throw new TaggedUrnError(ErrorCodes.EMPTY_TAG, 'empty key');
            }
            state = ParseState.EXPECTING_VALUE;
          } else if (c === ';') {
            // Value-less tag: treat as wildcard
            if (currentKey === '') {
              throw new TaggedUrnError(ErrorCodes.EMPTY_TAG, 'empty key');
            }
            currentValue = '*';
            finishTag();
            state = ParseState.EXPECTING_KEY;
          } else if (isValidKeyChar(c)) {
            currentKey += c.toLowerCase();
          } else {
            throw new TaggedUrnError(ErrorCodes.INVALID_CHARACTER, `invalid character '${c}' in key at position ${pos}`);
          }
          break;

        case ParseState.EXPECTING_VALUE:
          if (c === '"') {
            state = ParseState.IN_QUOTED_VALUE;
          } else if (c === ';') {
            throw new TaggedUrnError(ErrorCodes.EMPTY_TAG, `empty value for key '${currentKey}'`);
          } else if (isValidUnquotedValueChar(c)) {
            currentValue += c.toLowerCase();
            state = ParseState.IN_UNQUOTED_VALUE;
          } else {
            throw new TaggedUrnError(ErrorCodes.INVALID_CHARACTER, `invalid character '${c}' in value at position ${pos}`);
          }
          break;

        case ParseState.IN_UNQUOTED_VALUE:
          if (c === ';') {
            finishTag();
            state = ParseState.EXPECTING_KEY;
          } else if (isValidUnquotedValueChar(c)) {
            currentValue += c.toLowerCase();
          } else {
            throw new TaggedUrnError(ErrorCodes.INVALID_CHARACTER, `invalid character '${c}' in unquoted value at position ${pos}`);
          }
          break;

        case ParseState.IN_QUOTED_VALUE:
          if (c === '"') {
            state = ParseState.EXPECTING_SEMI_OR_END;
          } else if (c === '\\') {
            state = ParseState.IN_QUOTED_VALUE_ESCAPE;
          } else {
            // Any character allowed in quoted value, preserve case
            currentValue += c;
          }
          break;

        case ParseState.IN_QUOTED_VALUE_ESCAPE:
          if (c === '"' || c === '\\') {
            currentValue += c;
            state = ParseState.IN_QUOTED_VALUE;
          } else {
            throw new TaggedUrnError(ErrorCodes.INVALID_ESCAPE_SEQUENCE, `invalid escape sequence at position ${pos} (only \\" and \\\\ allowed)`);
          }
          break;

        case ParseState.EXPECTING_SEMI_OR_END:
          if (c === ';') {
            finishTag();
            state = ParseState.EXPECTING_KEY;
          } else {
            throw new TaggedUrnError(ErrorCodes.INVALID_CHARACTER, `expected ';' or end after quoted value, got '${c}' at position ${pos}`);
          }
          break;
      }

      pos++;
    }

    // Handle end of input
    switch (state) {
      case ParseState.IN_UNQUOTED_VALUE:
      case ParseState.EXPECTING_SEMI_OR_END:
        finishTag();
        break;
      case ParseState.EXPECTING_KEY:
        // Valid - trailing semicolon or empty input after prefix
        break;
      case ParseState.IN_QUOTED_VALUE:
      case ParseState.IN_QUOTED_VALUE_ESCAPE:
        throw new TaggedUrnError(ErrorCodes.UNTERMINATED_QUOTE, `unterminated quote at position ${pos}`);
      case ParseState.IN_KEY:
        // Value-less tag at end: treat as wildcard
        if (currentKey === '') {
          throw new TaggedUrnError(ErrorCodes.EMPTY_TAG, 'empty key');
        }
        currentValue = '*';
        finishTag();
        break;
      case ParseState.EXPECTING_VALUE:
        throw new TaggedUrnError(ErrorCodes.EMPTY_TAG, `empty value for key '${currentKey}'`);
    }

    return new TaggedUrn(prefix, tags, true);
  }

  /**
   * Create an empty Tagged URN with the specified prefix (required)
   * @param {string} prefix - The prefix to use
   * @returns {TaggedUrn} An empty TaggedUrn instance
   */
  static empty(prefix) {
    return new TaggedUrn(prefix, {}, true);
  }

  /**
   * Get the prefix of this tagged URN
   * @returns {string} The prefix
   */
  getPrefix() {
    return this.prefix;
  }

  /**
   * Get the canonical string representation of this tagged URN
   * Uses the stored prefix
   * Tags are sorted alphabetically for consistent representation
   * No trailing semicolon in canonical form
   * Values are quoted only when necessary (smart quoting)
   * Special value serialization:
   * - * (must-have-any): serialized as value-less tag (just the key)
   * - ? (unspecified): serialized as key=?
   * - ! (must-not-have): serialized as key=!
   *
   * @returns {string} The canonical string representation
   */
  toString() {
    if (Object.keys(this.tags).length === 0) {
      return `${this.prefix}:`;
    }

    // Sort keys for canonical representation
    const sortedKeys = Object.keys(this.tags).sort();

    // Build tag string with smart quoting
    const tagParts = sortedKeys.map(key => {
      const value = this.tags[key];
      switch (value) {
        case '*':
          // Valueless sugar: key
          return key;
        case '?':
          // Explicit: key=?
          return `${key}=?`;
        case '!':
          // Explicit: key=!
          return `${key}=!`;
        default:
          if (needsQuoting(value)) {
            return `${key}=${quoteValue(value)}`;
          } else {
            return `${key}=${value}`;
          }
      }
    });

    return `${this.prefix}:${tagParts.join(';')}`;
  }

  /**
   * Get the value of a specific tag
   * Key is normalized to lowercase for lookup
   *
   * @param {string} key - The tag key
   * @returns {string|undefined} The tag value or undefined if not found
   */
  getTag(key) {
    return this.tags[key.toLowerCase()];
  }

  /**
   * Check if this URN has a specific tag with a specific value
   * Key is normalized to lowercase; value comparison is case-sensitive
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value to check
   * @returns {boolean} Whether the tag exists with the specified value
   */
  hasTag(key, value) {
    const tagValue = this.tags[key.toLowerCase()];
    return tagValue !== undefined && tagValue === value;
  }

  /**
   * Create a new tagged URN with an added or updated tag
   * Key is normalized to lowercase; value is preserved as-is
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {TaggedUrn} A new TaggedUrn instance with the tag added/updated
   */
  withTag(key, value) {
    const newTags = { ...this.tags };
    newTags[key.toLowerCase()] = value;
    return new TaggedUrn(this.prefix, newTags, true);
  }

  /**
   * Create a new tagged URN with a tag removed
   * Key is normalized to lowercase for case-insensitive removal
   *
   * @param {string} key - The tag key to remove
   * @returns {TaggedUrn} A new TaggedUrn instance with the tag removed
   */
  withoutTag(key) {
    const newTags = { ...this.tags };
    delete newTags[key.toLowerCase()];
    return new TaggedUrn(this.prefix, newTags, true);
  }

  /**
   * Check if this URN (instance) matches a pattern based on tag compatibility
   *
   * IMPORTANT: Both URNs must have the same prefix. Comparing URNs with
   * different prefixes is a programming error and will throw an error.
   *
   * Per-tag matching semantics:
   * | Pattern Form | Interpretation              | Instance Missing | Instance = v | Instance = x≠v |
   * |--------------|-----------------------------|--------------------|--------------|----------------|
   * | (no entry)   | no constraint               | OK match           | OK match     | OK match       |
   * | K=?          | no constraint (explicit)    | OK                 | OK           | OK             |
   * | K=!          | must-not-have               | OK                 | NO           | NO             |
   * | K=*          | must-have, any value        | NO                 | OK           | OK             |
   * | K=v          | must-have, exact value      | NO                 | OK           | NO             |
   *
   * Special values work symmetrically on both instance and pattern sides.
   *
   * @param {TaggedUrn} pattern - The pattern URN to match against
   * @returns {boolean} Whether this URN matches the pattern
   * @throws {TaggedUrnError} If prefixes don't match
   */
  matches(pattern) {
    if (!pattern) {
      throw new TaggedUrnError(ErrorCodes.INVALID_FORMAT, 'cannot match against null pattern');
    }

    // First check prefix - must match exactly
    if (this.prefix !== pattern.prefix) {
      throw new TaggedUrnError(
        ErrorCodes.PREFIX_MISMATCH,
        `Cannot compare URNs with different prefixes: '${this.prefix}' vs '${pattern.prefix}'`
      );
    }

    // Collect all keys from both instance and pattern
    const allKeys = new Set([...Object.keys(this.tags), ...Object.keys(pattern.tags)]);

    for (const key of allKeys) {
      const inst = this.tags[key];
      const patt = pattern.tags[key];

      if (!valuesMatch(inst, patt)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if this URN can handle a request
   *
   * @param {TaggedUrn} request - The requested URN
   * @returns {boolean} Whether this URN can handle the request
   * @throws {TaggedUrnError} If prefixes don't match
   */
  canHandle(request) {
    return this.matches(request);
  }

  /**
   * Calculate specificity score for URN matching
   * More specific URNs have higher scores and are preferred
   * Graded scoring:
   * - K=v (exact value): 3 points (most specific)
   * - K=* (must-have-any): 2 points
   * - K=! (must-not-have): 1 point
   * - K=? (unspecified): 0 points (least specific)
   *
   * @returns {number} The specificity score
   */
  specificity() {
    let score = 0;
    for (const value of Object.values(this.tags)) {
      switch (value) {
        case '?':
          score += 0;
          break;
        case '!':
          score += 1;
          break;
        case '*':
          score += 2;
          break;
        default:
          score += 3; // exact value
      }
    }
    return score;
  }

  /**
   * Get specificity as a tuple for tie-breaking
   * Returns [exact_count, must_have_any_count, must_not_count]
   * Compare tuples lexicographically when sum scores are equal
   *
   * @returns {number[]} The specificity tuple [exact, mustHaveAny, mustNot]
   */
  specificityTuple() {
    let exact = 0;
    let mustHaveAny = 0;
    let mustNot = 0;
    for (const value of Object.values(this.tags)) {
      switch (value) {
        case '?':
          // 0 points, not counted
          break;
        case '!':
          mustNot++;
          break;
        case '*':
          mustHaveAny++;
          break;
        default:
          exact++;
      }
    }
    return [exact, mustHaveAny, mustNot];
  }

  /**
   * Check if this URN is more specific than another
   *
   * @param {TaggedUrn} other - The other URN to compare with
   * @returns {boolean} Whether this URN is more specific
   * @throws {TaggedUrnError} If prefixes don't match
   */
  isMoreSpecificThan(other) {
    if (!other) {
      throw new TaggedUrnError(ErrorCodes.INVALID_FORMAT, 'cannot compare against null URN');
    }

    // First check prefix
    if (this.prefix !== other.prefix) {
      throw new TaggedUrnError(
        ErrorCodes.PREFIX_MISMATCH,
        `Cannot compare URNs with different prefixes: '${this.prefix}' vs '${other.prefix}'`
      );
    }

    // Then check if they're compatible
    if (!this.isCompatibleWith(other)) {
      return false;
    }

    return this.specificity() > other.specificity();
  }

  /**
   * Check if this URN is compatible with another
   *
   * Two URNs are compatible if they have the same prefix and can potentially match
   * the same instances (i.e., there exists at least one instance that both patterns accept)
   *
   * Compatibility rules:
   * - K=v and K=w (v≠w): NOT compatible (no instance can match both exact values)
   * - K=! and K=v/K=*: NOT compatible (one requires absent, other requires present)
   * - K=v and K=*: compatible (instance with K=v matches both)
   * - K=? is compatible with anything (no constraint)
   * - Missing entry is compatible with anything (no constraint)
   *
   * @param {TaggedUrn} other - The other URN to check compatibility with
   * @returns {boolean} Whether the URNs are compatible
   * @throws {TaggedUrnError} If prefixes don't match
   */
  isCompatibleWith(other) {
    if (!other) {
      throw new TaggedUrnError(ErrorCodes.INVALID_FORMAT, 'cannot check compatibility with null URN');
    }

    // First check prefix
    if (this.prefix !== other.prefix) {
      throw new TaggedUrnError(
        ErrorCodes.PREFIX_MISMATCH,
        `Cannot compare URNs with different prefixes: '${this.prefix}' vs '${other.prefix}'`
      );
    }

    // Get all unique tag keys from both URNs
    const allKeys = new Set([...Object.keys(this.tags), ...Object.keys(other.tags)]);

    for (const key of allKeys) {
      const v1 = this.tags[key];
      const v2 = other.tags[key];

      if (!valuesCompatible(v1, v2)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Create a new URN with a specific tag set to wildcard
   *
   * @param {string} key - The tag key to set to wildcard
   * @returns {TaggedUrn} A new TaggedUrn instance with the tag set to wildcard
   */
  withWildcardTag(key) {
    if (this.tags.hasOwnProperty(key.toLowerCase())) {
      return this.withTag(key, '*');
    }
    return this;
  }

  /**
   * Create a new URN with only specified tags
   *
   * @param {string[]} keys - Array of tag keys to include
   * @returns {TaggedUrn} A new TaggedUrn instance with only the specified tags
   */
  subset(keys) {
    const newTags = {};
    for (const key of keys) {
      const normalizedKey = key.toLowerCase();
      if (this.tags.hasOwnProperty(normalizedKey)) {
        newTags[normalizedKey] = this.tags[normalizedKey];
      }
    }
    return new TaggedUrn(this.prefix, newTags, true);
  }

  /**
   * Merge with another URN (other takes precedence for conflicts)
   * Both must have the same prefix
   *
   * @param {TaggedUrn} other - The URN to merge with
   * @returns {TaggedUrn} A new TaggedUrn instance with merged tags
   * @throws {TaggedUrnError} If prefixes don't match
   */
  merge(other) {
    if (!other) {
      throw new TaggedUrnError(ErrorCodes.INVALID_FORMAT, 'cannot merge with null URN');
    }

    if (this.prefix !== other.prefix) {
      throw new TaggedUrnError(
        ErrorCodes.PREFIX_MISMATCH,
        `Cannot merge URNs with different prefixes: '${this.prefix}' vs '${other.prefix}'`
      );
    }

    const newTags = { ...this.tags };
    Object.assign(newTags, other.tags);
    return new TaggedUrn(this.prefix, newTags, true);
  }

  /**
   * Check if this tagged URN is equal to another
   *
   * @param {TaggedUrn} other - The other tagged URN to compare with
   * @returns {boolean} Whether the tagged URNs are equal
   */
  equals(other) {
    if (!other || !(other instanceof TaggedUrn)) {
      return false;
    }

    if (this.prefix !== other.prefix) {
      return false;
    }

    const thisKeys = Object.keys(this.tags).sort();
    const otherKeys = Object.keys(other.tags).sort();

    if (thisKeys.length !== otherKeys.length) {
      return false;
    }

    for (let i = 0; i < thisKeys.length; i++) {
      if (thisKeys[i] !== otherKeys[i]) {
        return false;
      }
      if (this.tags[thisKeys[i]] !== other.tags[otherKeys[i]]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get a hash string for this tagged URN
   * Two equivalent tagged URNs will have the same hash
   *
   * @returns {string} A hash of the canonical string representation
   */
  hash() {
    // Simple hash function for the canonical string
    const canonical = this.toString();
    let hash = 0;
    for (let i = 0; i < canonical.length; i++) {
      const char = canonical.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}

/**
 * Tagged URN Builder for fluent construction
 */
class TaggedUrnBuilder {
  /**
   * Create a new builder with a specified prefix (required)
   * @param {string} prefix - The prefix to use
   */
  constructor(prefix) {
    this._prefix = prefix.toLowerCase();
    this.tags = {};
  }

  /**
   * Add or update a tag
   * Key is normalized to lowercase; value is preserved as-is
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {TaggedUrnBuilder} This builder instance for chaining
   */
  tag(key, value) {
    this.tags[key.toLowerCase()] = value;
    return this;
  }

  /**
   * Build the final TaggedUrn
   *
   * @returns {TaggedUrn} A new TaggedUrn instance
   * @throws {TaggedUrnError} If no tags have been added
   */
  build() {
    if (Object.keys(this.tags).length === 0) {
      throw new TaggedUrnError(ErrorCodes.INVALID_FORMAT, 'Tagged URN cannot be empty');
    }
    return new TaggedUrn(this._prefix, this.tags, true);
  }

  /**
   * Build the final TaggedUrn, allowing empty tags
   *
   * @returns {TaggedUrn} A new TaggedUrn instance
   */
  buildAllowEmpty() {
    return new TaggedUrn(this._prefix, this.tags, true);
  }
}

/**
 * URN Matcher utility class
 */
class UrnMatcher {
  /**
   * Find the most specific URN that can handle a request
   * All URNs must have the same prefix as the request
   *
   * @param {TaggedUrn[]} urns - Array of available URNs
   * @param {TaggedUrn} request - The request to match
   * @returns {TaggedUrn|null} The best matching URN or null if no match
   * @throws {TaggedUrnError} If prefixes don't match
   */
  static findBestMatch(urns, request) {
    let best = null;
    let bestSpecificity = -1;

    for (const urn of urns) {
      if (urn.canHandle(request)) {
        const specificity = urn.specificity();
        if (specificity > bestSpecificity) {
          best = urn;
          bestSpecificity = specificity;
        }
      }
    }

    return best;
  }

  /**
   * Find all URNs that can handle a request, sorted by specificity
   * All URNs must have the same prefix as the request
   *
   * @param {TaggedUrn[]} urns - Array of available URNs
   * @param {TaggedUrn} request - The request to match
   * @returns {TaggedUrn[]} Array of matching URNs sorted by specificity (most specific first)
   * @throws {TaggedUrnError} If prefixes don't match
   */
  static findAllMatches(urns, request) {
    const matches = [];
    for (const urn of urns) {
      if (urn.canHandle(request)) {
        matches.push(urn);
      }
    }

    // Sort by specificity (most specific first)
    matches.sort((a, b) => b.specificity() - a.specificity());

    return matches;
  }

  /**
   * Check if two URN sets are compatible
   * All URNs in both sets must have the same prefix
   *
   * @param {TaggedUrn[]} urns1 - First set of URNs
   * @param {TaggedUrn[]} urns2 - Second set of URNs
   * @returns {boolean} Whether any URNs from the two sets are compatible
   * @throws {TaggedUrnError} If prefixes don't match
   */
  static areCompatible(urns1, urns2) {
    for (const u1 of urns1) {
      for (const u2 of urns2) {
        if (u1.isCompatibleWith(u2)) {
          return true;
        }
      }
    }
    return false;
  }
}

// Export for CommonJS
module.exports = {
  TaggedUrn,
  TaggedUrnBuilder,
  UrnMatcher,
  TaggedUrnError,
  ErrorCodes
};
