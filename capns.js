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
  MISSING_CAP_PREFIX: 5,
  DUPLICATE_KEY: 6,
  NUMERIC_KEY: 7,
  UNTERMINATED_QUOTE: 8,
  INVALID_ESCAPE_SEQUENCE: 9
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
 * Tagged URN implementation with flat, ordered tags
 */
class TaggedUrn {
  /**
   * Create a new TaggedUrn
   * Keys are normalized to lowercase; values are preserved as-is
   * @param {Object} tags - Initial tags (will not be re-normalized in constructor)
   * @param {boolean} skipNormalization - If true, skip key normalization (internal use)
   */
  constructor(tags = {}, skipNormalization = false) {
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
   * Format: cap:key1=value1;key2=value2;... or cap:key1="value with spaces";key2=simple
   *
   * Case handling:
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

    // Check for "cap:" prefix (case-insensitive)
    if (s.length < 4 || s.slice(0, 4).toLowerCase() !== 'cap:') {
      throw new TaggedUrnError(ErrorCodes.MISSING_CAP_PREFIX, "Tagged URN must start with 'cap:'");
    }

    const tagsPart = s.slice(4);
    const tags = {};

    // Handle empty tagged URN (cap: with no tags or just semicolon)
    if (tagsPart === '' || tagsPart === ';') {
      return new TaggedUrn(tags, true);
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

    return new TaggedUrn(tags, true);
  }

  /**
   * Get the canonical string representation of this tagged URN
   * Always includes "cap:" prefix
   * Tags are sorted alphabetically for consistent representation
   * No trailing semicolon in canonical form
   * Values are quoted only when necessary (smart quoting)
   *
   * @returns {string} The canonical string representation
   */
  toString() {
    if (Object.keys(this.tags).length === 0) {
      return 'cap:';
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

    return `cap:${tagParts.join(';')}`;
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
   * Check if this cap has a specific tag with a specific value
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
    return new TaggedUrn(newTags, true);
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
    return new TaggedUrn(newTags, true);
  }

  /**
   * Check if this cap matches another based on tag compatibility
   *
   * A cap matches a request if:
   * - For each tag in the request: cap has same value, wildcard (*), or missing tag
   * - For each tag in the cap: if request is missing that tag, that's fine (cap is more specific)
   * Missing tags are treated as wildcards (less specific, can handle any value).
   *
   * @param {TaggedUrn} request - The request cap to match against
   * @returns {boolean} Whether this cap matches the request
   */
  matches(request) {
    if (!request) {
      return true;
    }

    // Check all tags that the request specifies
    for (const [requestKey, requestValue] of Object.entries(request.tags)) {
      const capValue = this.tags[requestKey];

      if (capValue === undefined) {
        // Missing tag in cap is treated as wildcard - can handle any value
        continue;
      }

      if (capValue === '*') {
        // Cap has wildcard - can handle any value
        continue;
      }

      if (requestValue === '*') {
        // Request accepts any value - cap's specific value matches
        continue;
      }

      if (capValue !== requestValue) {
        // Cap has specific value that doesn't match request's specific value
        return false;
      }
    }

    // If cap has additional specific tags that request doesn't specify, that's fine
    // The cap is just more specific than needed
    return true;
  }

  /**
   * Check if this cap can handle a request
   *
   * @param {TaggedUrn} request - The requested cap
   * @returns {boolean} Whether this cap can handle the request
   */
  canHandle(request) {
    return this.matches(request);
  }

  /**
   * Calculate specificity score for cap matching
   * More specific caps have higher scores and are preferred
   *
   * @returns {number} The number of non-wildcard tags
   */
  specificity() {
    return Object.values(this.tags).filter(value => value !== '*').length;
  }

  /**
   * Check if this cap is more specific than another
   *
   * @param {TaggedUrn} other - The other cap to compare with
   * @returns {boolean} Whether this cap is more specific
   */
  isMoreSpecificThan(other) {
    if (!other) {
      return true;
    }

    // First check if they're compatible
    if (!this.isCompatibleWith(other)) {
      return false;
    }

    return this.specificity() > other.specificity();
  }

  /**
   * Check if this cap is compatible with another
   *
   * Two caps are compatible if they can potentially match
   * the same types of requests (considering wildcards and missing tags as wildcards)
   *
   * @param {TaggedUrn} other - The other cap to check compatibility with
   * @returns {boolean} Whether the caps are compatible
   */
  isCompatibleWith(other) {
    if (!other) {
      return true;
    }

    // Get all unique tag keys from both caps
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
   * Create a new cap with a specific tag set to wildcard
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
   * Create a new cap with only specified tags
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
    return new TaggedUrn(newTags, true);
  }

  /**
   * Merge with another cap (other takes precedence for conflicts)
   *
   * @param {TaggedUrn} other - The cap to merge with
   * @returns {TaggedUrn} A new TaggedUrn instance with merged tags
   */
  merge(other) {
    const newTags = { ...this.tags };
    if (other && other.tags) {
      Object.assign(newTags, other.tags);
    }
    return new TaggedUrn(newTags, true);
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
  constructor() {
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
    return new TaggedUrn(this.tags, true);
  }
}

/**
 * Cap Matcher utility class
 */
class CapMatcher {
  /**
   * Find the most specific cap that can handle a request
   *
   * @param {TaggedUrn[]} caps - Array of available caps
   * @param {TaggedUrn} request - The request to match
   * @returns {TaggedUrn|null} The best matching cap or null if no match
   */
  static findBestMatch(caps, request) {
    let best = null;
    let bestSpecificity = -1;

    for (const cap of caps) {
      if (cap.canHandle(request)) {
        const specificity = cap.specificity();
        if (specificity > bestSpecificity) {
          best = cap;
          bestSpecificity = specificity;
        }
      }
    }

    return best;
  }

  /**
   * Find all caps that can handle a request, sorted by specificity
   *
   * @param {TaggedUrn[]} caps - Array of available caps
   * @param {TaggedUrn} request - The request to match
   * @returns {TaggedUrn[]} Array of matching caps sorted by specificity (most specific first)
   */
  static findAllMatches(caps, request) {
    const matches = caps.filter(cap => cap.canHandle(request));

    // Sort by specificity (most specific first)
    matches.sort((a, b) => b.specificity() - a.specificity());

    return matches;
  }

  /**
   * Check if two cap sets are compatible
   *
   * @param {TaggedUrn[]} caps1 - First set of caps
   * @param {TaggedUrn[]} caps2 - Second set of caps
   * @returns {boolean} Whether any caps from the two sets are compatible
   */
  static areCompatible(caps1, caps2) {
    for (const c1 of caps1) {
      for (const c2 of caps2) {
        if (c1.isCompatibleWith(c2)) {
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
    CapMatcher,
    TaggedUrnError,
    ErrorCodes
  };
}

if (typeof window !== 'undefined') {
  window.TaggedUrn = TaggedUrn;
  window.TaggedUrnBuilder = TaggedUrnBuilder;
  window.CapMatcher = CapMatcher;
  window.TaggedUrnError = TaggedUrnError;
  window.TaggedUrnErrorCodes = ErrorCodes;
}
