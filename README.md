# Tagged URN - JavaScript Implementation

Production-ready JavaScript implementation of Tagged URN with strict validation and pattern matching.

## Features

- **Strict Rule Enforcement** - Follows exact same rules as Rust, Go, and Objective-C implementations
- **Case Insensitive** - All input normalized to lowercase (except quoted values)
- **Tag Order Independent** - Canonical alphabetical sorting
- **Special Pattern Values** - `*` (must-have-any), `?` (unspecified), `!` (must-not-have)
- **Value-less Tags** - Tags without values (`tag`) mean must-have-any (`tag=*`)
- **Extended Characters** - Support for `/` and `:` in tag components
- **Graded Specificity** - Exact values score higher than wildcards
- **Production Ready** - No fallbacks, fails hard on invalid input
- **Comprehensive Tests** - Full test suite verifying all rules

## Installation

```bash
npm install tagged-urn
```

## Quick Start

```javascript
const { TaggedUrn, TaggedUrnBuilder, UrnMatcher } = require('tagged-urn');

// Create from string
const urn = TaggedUrn.fromString('cap:op=generate;ext=pdf');
console.log(urn.toString()); // "cap:ext=pdf;op=generate"

// Use builder pattern
const built = new TaggedUrnBuilder()
  .tag('op', 'extract')
  .tag('target', 'metadata')
  .build();

// Matching
const request = TaggedUrn.fromString('cap:op=generate');
console.log(urn.conformsTo(request)); // true

// Find best match
const urns = [
  TaggedUrn.fromString('cap:op=*'),
  TaggedUrn.fromString('cap:op=generate'),
  TaggedUrn.fromString('cap:op=generate;ext=pdf')
];
const best = UrnMatcher.findBestMatch(urns, request);
console.log(best.toString()); // "cap:ext=pdf;op=generate" (most specific)
```

## API Reference

### TaggedUrn Class

#### Static Methods
- `TaggedUrn.fromString(s)` - Parse Tagged URN from string
  - Throws `TaggedUrnError` on invalid format

#### Instance Methods
- `toString()` - Get canonical string representation
- `getTag(key)` - Get tag value (case-insensitive)
- `hasTag(key, value)` - Check if tag exists with value
- `withTag(key, value)` - Add/update tag (returns new instance)
- `withoutTag(key)` - Remove tag (returns new instance)
- `conformsTo(pattern)` - Check if this URN conforms to a pattern
- `accepts(instance)` - Check if this URN (as pattern) accepts an instance
- `specificity()` - Get specificity score for matching
- `isMoreSpecificThan(other)` - Compare specificity
- `equals(other)` - Check equality

### TaggedUrnBuilder Class

Fluent builder for constructing Tagged URNs:

```javascript
const urn = new TaggedUrnBuilder()
  .tag('op', 'generate')
  .tag('format', 'json')
  .build();
```

### UrnMatcher Class

Utility for matching sets of Tagged URNs:

- `UrnMatcher.findBestMatch(urns, request)` - Find most specific match
- `UrnMatcher.findAllMatches(urns, request)` - Find all matches (sorted by specificity)
- `UrnMatcher.areCompatible(urns1, urns2)` - Check if URN sets are compatible

### Error Handling

```javascript
const { TaggedUrnError, ErrorCodes } = require('tagged-urn');

try {
  const urn = TaggedUrn.fromString('invalid:format');
} catch (error) {
  if (error instanceof TaggedUrnError) {
    console.log(`Error code: ${error.code}`);
    console.log(`Message: ${error.message}`);
  }
}
```

Error codes:
- `ErrorCodes.INVALID_FORMAT` - General format error
- `ErrorCodes.MISSING_CAP_PREFIX` - Missing "cap:" prefix
- `ErrorCodes.INVALID_CHARACTER` - Invalid characters in tags
- `ErrorCodes.DUPLICATE_KEY` - Duplicate tag keys
- `ErrorCodes.NUMERIC_KEY` - Pure numeric tag keys
- `ErrorCodes.EMPTY_TAG` - Empty tag components

## Rules

This implementation strictly follows the Tagged URN rules. See `RULES.md` for complete specification.

### Key Rules Summary:

1. **Case Insensitive** - `cap:OP=Generate` == `cap:op=generate`
2. **Order Independent** - `cap:a=1;b=2` == `cap:b=2;a=1`
3. **Prefix Required** - Must start with `cap:`
4. **Semicolon Separated** - Tags separated by `;`
5. **Optional Trailing `;`** - `cap:a=1;` == `cap:a=1`
6. **Canonical Form** - Lowercase, alphabetically sorted, no trailing `;`
7. **Special Values** - `*` (must-have-any), `?` (unspecified), `!` (must-not-have)
8. **Extended Characters** - `/` and `:` allowed in tag components
9. **No Duplicate Keys** - Fails hard on duplicates
10. **No Numeric Keys** - Pure numeric keys forbidden

### Matching Semantics:

| Pattern | Instance Missing | Instance=v | Instance=x≠v |
|---------|------------------|------------|--------------|
| (missing) or `?` | OK | OK | OK |
| `K=!` | OK | NO | NO |
| `K=*` | NO | OK | OK |
| `K=v` | NO | OK | NO |

## Testing

```bash
npm test
```

Runs comprehensive test suite covering all rules and edge cases.

## Browser Support

Works in both Node.js and browsers:

```html
<script src="tagged-urn.js"></script>
<script>
const urn = TaggedUrn.fromString('cap:op=generate');
console.log(urn.toString());
</script>
```

## Cross-Language Compatibility

This JavaScript implementation produces identical results to:
- [Rust implementation](https://github.com/filegrind/tagged-urn-rs)
- [Go implementation](https://github.com/filegrind/tagged-urn-go)
- [Objective-C implementation](https://github.com/filegrind/tagged-urn-objc)

All implementations pass the same test cases and follow identical rules.
