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
  return /[a-zA-Z0-9_\-\/:\.\*]/.test(c);
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
        throw new TaggedUrnError(ErrorCodes.INVALID_TAG_FORMAT, `incomplete tag '${currentKey}'`);
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
      if (needsQuoting(value)) {
        return `${key}=${quoteValue(value)}`;
      } else {
        return `${key}=${value}`;
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
   * Check if this URN matches another based on tag compatibility
   *
   * IMPORTANT: Both URNs must have the same prefix. Comparing URNs with
   * different prefixes is a programming error and will throw an error.
   *
   * A URN matches a request if:
   * - Both have the same prefix
   * - For each tag in the request: URN has same value, wildcard (*), or missing tag
   * - For each tag in the URN: if request is missing that tag, that's fine (URN is more specific)
   * Missing tags are treated as wildcards (less specific, can handle any value).
   *
   * @param {TaggedUrn} request - The request URN to match against
   * @returns {boolean} Whether this URN matches the request
   * @throws {TaggedUrnError} If prefixes don't match
   */
  matches(request) {
    if (!request) {
      throw new TaggedUrnError(ErrorCodes.INVALID_FORMAT, 'cannot match against null request');
    }

    // First check prefix - must match exactly
    if (this.prefix !== request.prefix) {
      throw new TaggedUrnError(
        ErrorCodes.PREFIX_MISMATCH,
        `Cannot compare URNs with different prefixes: '${this.prefix}' vs '${request.prefix}'`
      );
    }

    // Check all tags that the request specifies
    for (const [requestKey, requestValue] of Object.entries(request.tags)) {
      const urnValue = this.tags[requestKey];

      if (urnValue === undefined) {
        // Missing tag in URN is treated as wildcard - can handle any value
        continue;
      }

      if (urnValue === '*') {
        // URN has wildcard - can handle any value
        continue;
      }

      if (requestValue === '*') {
        // Request accepts any value - URN's specific value matches
        continue;
      }

      if (urnValue !== requestValue) {
        // URN has specific value that doesn't match request's specific value
        return false;
      }
    }

    // If URN has additional specific tags that request doesn't specify, that's fine
    // The URN is just more specific than needed
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
   *
   * @returns {number} The number of non-wildcard tags
   */
  specificity() {
    return Object.values(this.tags).filter(value => value !== '*').length;
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
   * the same types of requests (considering wildcards and missing tags as wildcards)
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

      if (v1 !== undefined && v2 !== undefined) {
        // Both have the tag - they must match or one must be wildcard
        if (v1 !== '*' && v2 !== '*' && v1 !== v2) {
          return false;
        }
      }
      // If only one has the tag, it's compatible (missing tag is wildcard)
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

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TaggedUrn,
    TaggedUrnBuilder,
    UrnMatcher,
    TaggedUrnError,
    ErrorCodes
  };
}

if (typeof window !== 'undefined') {
  window.TaggedUrn = TaggedUrn;
  window.TaggedUrnBuilder = TaggedUrnBuilder;
  window.UrnMatcher = UrnMatcher;
  window.TaggedUrnError = TaggedUrnError;
  window.TaggedUrnErrorCodes = ErrorCodes;
}
