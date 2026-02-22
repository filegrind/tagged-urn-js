// Tagged URN JavaScript Test Suite
// Tests mirror the Rust reference implementation (tagged-urn-rs) 1:1
// TEST501-TEST577 numbering shared across all language implementations

const {
  TaggedUrn,
  TaggedUrnBuilder,
  UrnMatcher,
  TaggedUrnError,
  ErrorCodes
} = require('./tagged-urn.js');

// Test assertion utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`Assertion failed: ${message}. Expected: ${b}, Actual: ${a}`);
  }
}

function assertThrows(fn, expectedErrorCode, message) {
  try {
    fn();
    throw new Error(`Expected error but function succeeded: ${message}`);
  } catch (error) {
    if (error instanceof TaggedUrnError && error.code === expectedErrorCode) {
      return; // Expected error
    }
    throw new Error(`Expected TaggedUrnError with code ${expectedErrorCode} but got: ${error.message}`);
  }
}

function assertThrowsAny(fn, message) {
  try {
    fn();
    throw new Error(`Expected error but function succeeded: ${message}`);
  } catch (error) {
    if (error instanceof TaggedUrnError) {
      return; // Expected error
    }
    throw new Error(`Expected TaggedUrnError but got: ${error.message}`);
  }
}

// ============================================================================
// PARSING AND CREATION TESTS (TEST501-TEST518)
// ============================================================================

// TEST501: Verify basic URN creation from string with multiple tags
function test501_tagged_urn_creation() {
  const urn = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');
  assertEqual(urn.getPrefix(), 'cap', 'Should get prefix');
  assertEqual(urn.getTag('op'), 'generate', 'Should get op tag');
  assertEqual(urn.getTag('target'), 'thumbnail', 'Should get target tag');
  assertEqual(urn.getTag('ext'), 'pdf', 'Should get ext tag');
}

// TEST502: Verify custom prefixes work and tags are sorted alphabetically
function test502_custom_prefix() {
  const urn = TaggedUrn.fromString('myapp:op=generate;ext=pdf');
  assertEqual(urn.getPrefix(), 'myapp', 'Should get custom prefix');
  assertEqual(urn.getTag('op'), 'generate', 'Should get op tag');
  assertEqual(urn.toString(), 'myapp:ext=pdf;op=generate', 'Should sort tags alphabetically');
}

// TEST503: Verify prefix is case-insensitive (CAP, cap, Cap all equal)
function test503_prefix_case_insensitive() {
  const urn1 = TaggedUrn.fromString('CAP:op=test');
  const urn2 = TaggedUrn.fromString('cap:op=test');
  const urn3 = TaggedUrn.fromString('Cap:op=test');

  assertEqual(urn1.getPrefix(), 'cap', 'Should normalize CAP to cap');
  assertEqual(urn2.getPrefix(), 'cap', 'Should normalize cap to cap');
  assertEqual(urn3.getPrefix(), 'cap', 'Should normalize Cap to cap');
  assert(urn1.equals(urn2), 'CAP and cap should be equal');
  assert(urn2.equals(urn3), 'cap and Cap should be equal');
}

// TEST504: Verify error when comparing URNs with different prefixes
function test504_prefix_mismatch_error() {
  const urn1 = TaggedUrn.fromString('cap:op=test');
  const urn2 = TaggedUrn.fromString('myapp:op=test');

  assertThrows(
    () => urn1.conformsTo(urn2),
    ErrorCodes.PREFIX_MISMATCH,
    'Should throw PREFIX_MISMATCH when comparing different prefixes'
  );
}

// TEST505: Verify builder pattern works with custom prefix
function test505_builder_with_prefix() {
  const urn = new TaggedUrnBuilder('custom')
    .tag('key', 'value')
    .build();

  assertEqual(urn.getPrefix(), 'custom', 'Should get custom prefix');
  assertEqual(urn.toString(), 'custom:key=value', 'Should build with custom prefix');
}

// TEST506: Verify unquoted values are normalized to lowercase
function test506_unquoted_values_lowercased() {
  const urn = TaggedUrn.fromString('cap:OP=Generate;EXT=PDF;Target=Thumbnail');

  // Keys are always lowercase
  assertEqual(urn.getTag('op'), 'generate', 'Should normalize op to lowercase');
  assertEqual(urn.getTag('ext'), 'pdf', 'Should normalize ext to lowercase');
  assertEqual(urn.getTag('target'), 'thumbnail', 'Should normalize target to lowercase');

  // Key lookup is case-insensitive
  assertEqual(urn.getTag('OP'), 'generate', 'Should lookup with uppercase key');
  assertEqual(urn.getTag('Op'), 'generate', 'Should lookup with mixed case key');

  // Normalized URN equals explicitly lowercase URN
  const urn2 = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');
  assertEqual(urn.toString(), urn2.toString(), 'Should produce same canonical form');
  assert(urn.equals(urn2), 'Should be equal after normalization');
}

// TEST507: Verify quoted values preserve their case exactly
function test507_quoted_values_preserve_case() {
  const urn = TaggedUrn.fromString('cap:key="Value With Spaces"');
  assertEqual(urn.getTag('key'), 'Value With Spaces', 'Should preserve quoted value case');

  // Key is still lowercase
  const urn2 = TaggedUrn.fromString('cap:KEY="Value With Spaces"');
  assertEqual(urn2.getTag('key'), 'Value With Spaces', 'Key should be lowercased');

  // Unquoted vs quoted case difference
  const unquoted = TaggedUrn.fromString('cap:key=UPPERCASE');
  const quoted = TaggedUrn.fromString('cap:key="UPPERCASE"');
  assertEqual(unquoted.getTag('key'), 'uppercase', 'Unquoted should be lowercased');
  assertEqual(quoted.getTag('key'), 'UPPERCASE', 'Quoted should preserve case');
  assert(!unquoted.equals(quoted), 'Different case values should NOT be equal');
}

// TEST508: Verify semicolons, equals, and spaces in quoted values are allowed
function test508_quoted_value_special_chars() {
  const urn = TaggedUrn.fromString('cap:key="value;with;semicolons"');
  assertEqual(urn.getTag('key'), 'value;with;semicolons', 'Should allow semicolons in quotes');

  const urn2 = TaggedUrn.fromString('cap:key="value=with=equals"');
  assertEqual(urn2.getTag('key'), 'value=with=equals', 'Should allow equals in quotes');

  const urn3 = TaggedUrn.fromString('cap:key="hello world"');
  assertEqual(urn3.getTag('key'), 'hello world', 'Should allow spaces in quotes');
}

// TEST509: Verify escape sequences in quoted values are parsed correctly
function test509_quoted_value_escape_sequences() {
  // Escaped quotes
  const urn = TaggedUrn.fromString('cap:key="value\\"quoted\\""');
  assertEqual(urn.getTag('key'), 'value"quoted"', 'Should parse escaped quotes');

  // Escaped backslashes
  const urn2 = TaggedUrn.fromString('cap:key="path\\\\file"');
  assertEqual(urn2.getTag('key'), 'path\\file', 'Should parse escaped backslashes');

  // Mixed escapes
  const urn3 = TaggedUrn.fromString('cap:key="say \\"hello\\\\world\\""');
  assertEqual(urn3.getTag('key'), 'say "hello\\world"', 'Should parse mixed escapes');
}

// TEST510: Verify mixing quoted and unquoted values in same URN
function test510_mixed_quoted_unquoted() {
  const urn = TaggedUrn.fromString('cap:a="Quoted";b=simple');
  assertEqual(urn.getTag('a'), 'Quoted', 'Quoted value should preserve case');
  assertEqual(urn.getTag('b'), 'simple', 'Unquoted value should be lowercase');
}

// TEST511: Verify error on unterminated quoted value
function test511_unterminated_quote_error() {
  assertThrows(
    () => TaggedUrn.fromString('cap:key="unterminated'),
    ErrorCodes.UNTERMINATED_QUOTE,
    'Should reject unterminated quote'
  );
}

// TEST512: Verify error on invalid escape sequences (only \\" and \\\\ allowed)
function test512_invalid_escape_sequence_error() {
  assertThrows(
    () => TaggedUrn.fromString('cap:key="bad\\n"'),
    ErrorCodes.INVALID_ESCAPE_SEQUENCE,
    'Should reject \\n escape'
  );

  assertThrows(
    () => TaggedUrn.fromString('cap:key="bad\\x"'),
    ErrorCodes.INVALID_ESCAPE_SEQUENCE,
    'Should reject \\x escape'
  );
}

// TEST513: Verify smart quoting: quotes only when necessary
function test513_serialization_smart_quoting() {
  // Simple lowercase value - no quoting needed
  const urn = new TaggedUrnBuilder('cap').tag('key', 'simple').build();
  assertEqual(urn.toString(), 'cap:key=simple', 'Simple value should not be quoted');

  // Value with spaces - needs quoting
  const urn2 = TaggedUrn.fromString('cap:key="has spaces"');
  assert(urn2.toString().includes('"'), 'Value with spaces should be quoted');

  // Value with semicolons - needs quoting
  const urn3 = TaggedUrn.fromString('cap:key="has;semi"');
  assert(urn3.toString().includes('"'), 'Value with semicolons should be quoted');

  // Value with uppercase - needs quoting to preserve
  const urn4 = TaggedUrn.fromString('cap:key="HasUpper"');
  assert(urn4.toString().includes('"'), 'Value with uppercase should be quoted');

  // Value with quotes - needs quoting and escaping
  const urn5 = TaggedUrn.fromString('cap:key="has\\"quote"');
  const s5 = urn5.toString();
  assert(s5.includes('\\"'), 'Value with quotes should be escaped');

  // Value with backslashes - needs quoting and escaping
  const urn6 = TaggedUrn.fromString('cap:key="path\\\\file"');
  const s6 = urn6.toString();
  assert(s6.includes('\\\\'), 'Value with backslashes should be escaped');
}

// TEST514: Verify simple URN round-trips correctly (parse -> serialize -> parse)
function test514_round_trip_simple() {
  const original = 'cap:ext=pdf;op=generate';
  const urn = TaggedUrn.fromString(original);
  const serialized = urn.toString();
  const reparsed = TaggedUrn.fromString(serialized);
  assert(urn.equals(reparsed), 'Should round-trip correctly');
}

// TEST515: Verify quoted values round-trip correctly
function test515_round_trip_quoted() {
  const original = 'cap:key="Value With Spaces"';
  const urn = TaggedUrn.fromString(original);
  const serialized = urn.toString();
  const reparsed = TaggedUrn.fromString(serialized);
  assert(urn.equals(reparsed), 'Should round-trip quoted values');
  assertEqual(reparsed.getTag('key'), 'Value With Spaces', 'Should preserve quoted value');
}

// TEST516: Verify escape sequences round-trip correctly
function test516_round_trip_escapes() {
  const original = 'cap:key="value\\"with\\\\escapes"';
  const urn = TaggedUrn.fromString(original);
  assertEqual(urn.getTag('key'), 'value"with\\escapes', 'Should parse escapes');
  const serialized = urn.toString();
  const reparsed = TaggedUrn.fromString(serialized);
  assert(urn.equals(reparsed), 'Should round-trip escapes');
}

// TEST517: Verify missing prefix causes error
function test517_prefix_required() {
  assertThrows(
    () => TaggedUrn.fromString('op=generate;ext=pdf'),
    ErrorCodes.MISSING_PREFIX,
    'Should require prefix'
  );

  assertThrows(
    () => TaggedUrn.fromString(':op=generate'),
    ErrorCodes.EMPTY_PREFIX,
    'Should reject empty prefix'
  );

  const urn = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assertEqual(urn.getTag('op'), 'generate', 'Should parse with valid prefix');

  // Case-insensitive prefix
  const urn2 = TaggedUrn.fromString('CAP:op=generate');
  assertEqual(urn2.getTag('op'), 'generate', 'Should parse with uppercase prefix');
}

// TEST518: Verify trailing semicolon is optional and doesn't affect equality
function test518_trailing_semicolon_equivalence() {
  const urn1 = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const urn2 = TaggedUrn.fromString('cap:op=generate;ext=pdf;');

  assert(urn1.equals(urn2), 'Should be equal with/without trailing semicolon');
  assertEqual(urn1.toString(), urn2.toString(), 'Should have same canonical form');
  assert(urn1.conformsTo(urn2), 'Should match each other');
  assert(urn2.conformsTo(urn1), 'Should match each other');
}

// ============================================================================
// CANONICAL FORM (TEST519)
// ============================================================================

// TEST519: Verify canonical form: alphabetically sorted tags, no trailing semicolon
function test519_canonical_string_format() {
  const urn = TaggedUrn.fromString('cap:op=generate;target=thumbnail;ext=pdf');
  assertEqual(urn.toString(), 'cap:ext=pdf;op=generate;target=thumbnail', 'Should be alphabetically sorted');
}

// ============================================================================
// TAG ACCESS AND MATCHING (TEST520-TEST522)
// ============================================================================

// TEST520: Verify hasTag and getTag methods work correctly
function test520_tag_matching() {
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');

  const request1 = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');
  assert(cap.conformsTo(request1), 'Should match exact request');

  const request2 = TaggedUrn.fromString('cap:op=generate');
  assert(cap.conformsTo(request2), 'Should match subset request');

  const request3 = TaggedUrn.fromString('cap:ext=*');
  assert(cap.conformsTo(request3), 'Should match wildcard request');

  const request4 = TaggedUrn.fromString('cap:op=extract');
  assert(!cap.conformsTo(request4), 'Should not match conflicting value');
}

// TEST521: Verify value matching is case-sensitive
function test521_matching_case_sensitive_values() {
  const cap1 = TaggedUrn.fromString('cap:OP=Generate;EXT=PDF;Target=Thumbnail');
  const cap2 = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');

  // Unquoted values are lowercased, so these should be equal
  assert(cap1.equals(cap2), 'URNs with unquoted case differences should be equal');
  assert(cap1.conformsTo(cap2), 'Should match case-insensitively');
  assert(cap2.conformsTo(cap1), 'Should match case-insensitively');

  // Case-insensitive tag lookup
  assertEqual(cap1.getTag('OP'), 'generate', 'Should lookup with uppercase key');
  assert(cap1.hasTag('op', 'generate'), 'hasTag should match with lowercase key');
  assert(cap1.hasTag('OP', 'generate'), 'hasTag should match with uppercase key');
}

// TEST522: Verify handling of missing tags in conformsTo semantics
function test522_missing_tag_handling() {
  const instance = TaggedUrn.fromString('cap:op=generate');

  // Pattern with tag that instance doesn't have: NO MATCH
  const pattern1 = TaggedUrn.fromString('cap:ext=pdf');
  assert(!instance.conformsTo(pattern1), 'Should NOT match when instance missing pattern-required tag');

  // Pattern missing tag = no constraint: MATCH
  const instance2 = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const pattern2 = TaggedUrn.fromString('cap:op=generate');
  assert(instance2.conformsTo(pattern2), 'Should match subset pattern');

  // ? means no constraint
  const pattern3 = TaggedUrn.fromString('cap:ext=?');
  assert(instance.conformsTo(pattern3), 'Pattern ext=? should match instance without ext');

  // * means must-have-any
  const pattern4 = TaggedUrn.fromString('cap:ext=*');
  assert(!instance.conformsTo(pattern4), 'Pattern ext=* should NOT match when instance missing ext');
}

// ============================================================================
// SPECIFICITY (TEST523)
// ============================================================================

// TEST523: Verify graded specificity scoring
function test523_specificity() {
  const cap1 = TaggedUrn.fromString('cap:general'); // * = 2
  const cap2 = TaggedUrn.fromString('cap:op=generate'); // exact = 3
  const cap3 = TaggedUrn.fromString('cap:op=*;ext=pdf'); // * + exact = 2 + 3 = 5
  const cap4 = TaggedUrn.fromString('cap:op=?'); // ? = 0
  const cap5 = TaggedUrn.fromString('cap:op=!'); // ! = 1

  assertEqual(cap1.specificity(), 2, '* should have specificity 2');
  assertEqual(cap2.specificity(), 3, 'exact should have specificity 3');
  assertEqual(cap3.specificity(), 5, '* + exact should have specificity 5');
  assertEqual(cap4.specificity(), 0, '? should have specificity 0');
  assertEqual(cap5.specificity(), 1, '! should have specificity 1');

  assert(cap2.isMoreSpecificThan(cap1), '3 > 2');
}

// ============================================================================
// BUILDER (TEST524-TEST525)
// ============================================================================

// TEST524: Verify builder creates correct URN
function test524_builder() {
  const cap = new TaggedUrnBuilder('cap')
    .tag('op', 'generate')
    .tag('target', 'thumbnail')
    .tag('ext', 'pdf')
    .tag('output', 'binary')
    .build();

  assertEqual(cap.getTag('op'), 'generate', 'Should build with op tag');
  assertEqual(cap.getTag('output'), 'binary', 'Should build with output tag');
}

// TEST525: Verify builder preserves case in quoted values
function test525_builder_preserves_case() {
  const urn = new TaggedUrnBuilder('cap')
    .tag('key', 'ValueWithCase')
    .build();
  assertEqual(urn.getTag('key'), 'ValueWithCase', 'Should preserve case in builder');
}

// ============================================================================
// COMPATIBILITY AND MATCHING (TEST526-TEST527)
// ============================================================================

// TEST526: Verify directional accepts for URN matching
function test526_compatibility() {
  // General pattern accepts specific instance
  const general = TaggedUrn.fromString('cap:op=generate');
  const specific = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(general.accepts(specific), 'General pattern accepts specific instance');
  assert(!specific.accepts(general), 'Specific does not accept general');

  // Wildcard pattern accepts any value
  const wildcard = TaggedUrn.fromString('cap:op=generate;format=*');
  const withFormat = TaggedUrn.fromString('cap:op=generate;format=json');
  assert(wildcard.accepts(withFormat), 'Wildcard accepts specific value');

  // Different op values: neither accepts the other
  const cap1 = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const cap3 = TaggedUrn.fromString('cap:image;op=extract');
  assert(!cap1.accepts(cap3), 'Different op should not accept');
  assert(!cap3.accepts(cap1), 'Different op should not accept (reverse)');
}

// TEST527: Verify UrnMatcher finds best match among candidates
function test527_best_match() {
  const caps = [
    TaggedUrn.fromString('cap:op=*'),
    TaggedUrn.fromString('cap:op=generate'),
    TaggedUrn.fromString('cap:op=generate;ext=pdf')
  ];

  const request = TaggedUrn.fromString('cap:op=generate');
  const best = UrnMatcher.findBestMatch(caps, request);
  assertEqual(best.toString(), 'cap:ext=pdf;op=generate', 'Should find most specific match');

  const matches = UrnMatcher.findAllMatches(caps, request);
  assertEqual(matches.length, 3, 'Should find all matches');
  assertEqual(matches[0].toString(), 'cap:ext=pdf;op=generate', 'Should sort by specificity');
}

// ============================================================================
// SET OPERATIONS (TEST528-TEST529)
// ============================================================================

// TEST528: Verify merge and subset operations
function test528_merge_and_subset() {
  // Merge
  const cap1 = TaggedUrn.fromString('cap:op=generate');
  const cap2 = TaggedUrn.fromString('cap:ext=pdf;output=binary');
  const merged = cap1.merge(cap2);
  assertEqual(merged.toString(), 'cap:ext=pdf;op=generate;output=binary', 'Should merge correctly');

  // Subset
  const subset = merged.subset(['type', 'ext']);
  assertEqual(subset.toString(), 'cap:ext=pdf', 'Should create subset correctly');
}

// TEST529: Verify error when merging URNs with different prefixes
function test529_merge_prefix_mismatch() {
  const urn1 = TaggedUrn.fromString('cap:op=test');
  const urn2 = TaggedUrn.fromString('myapp:op=test');

  assertThrows(
    () => urn1.merge(urn2),
    ErrorCodes.PREFIX_MISMATCH,
    'Should throw PREFIX_MISMATCH when merging different prefixes'
  );
}

// ============================================================================
// WILDCARDS (TEST530)
// ============================================================================

// TEST530: Verify wildcard value matching behavior
function test530_wildcard_tag() {
  const cap = TaggedUrn.fromString('cap:ext=pdf');
  const wildcarded = cap.withWildcardTag('ext');
  assertEqual(wildcarded.toString(), 'cap:ext', 'Should set wildcard (serializes as value-less)');
}

// ============================================================================
// EMPTY URNs (TEST531-TEST532)
// ============================================================================

// TEST531: Verify empty URN (no tags) is valid and matches everything
function test531_empty_tagged_urn() {
  const empty = TaggedUrn.fromString('cap:');
  assertEqual(Object.keys(empty.tags).length, 0, 'Should have no tags');
  assertEqual(empty.toString(), 'cap:', 'Should have correct string representation');

  const specific = TaggedUrn.fromString('cap:op=generate;ext=pdf');

  // Empty instance vs specific pattern: NO MATCH
  assert(!empty.conformsTo(specific), 'Empty instance should NOT match pattern with requirements');

  // Specific instance vs empty pattern: MATCH
  assert(specific.conformsTo(empty), 'Instance should match empty pattern');

  // Empty instance vs empty pattern: MATCH
  assert(empty.conformsTo(empty), 'Should match itself');
}

// TEST532: Verify empty URN works with custom prefix
function test532_empty_with_custom_prefix() {
  const empty = TaggedUrn.fromString('myapp:');
  assertEqual(empty.getPrefix(), 'myapp', 'Should get custom prefix');
  assertEqual(empty.toString(), 'myapp:', 'Should have correct string representation');
}

// ============================================================================
// CHARACTER SUPPORT AND VALIDATION (TEST533-TEST542)
// ============================================================================

// TEST533: Verify forward slashes and colons in tag components
function test533_extended_character_support() {
  const cap = TaggedUrn.fromString('cap:url=https://example_org/api;path=/some/file');
  assertEqual(cap.getTag('url'), 'https://example_org/api', 'Should support colons and slashes');
  assertEqual(cap.getTag('path'), '/some/file', 'Should support slashes');
}

// TEST534: Verify wildcard cannot be used as a key
function test534_wildcard_restrictions() {
  assertThrows(
    () => TaggedUrn.fromString('cap:*=value'),
    ErrorCodes.INVALID_CHARACTER,
    'Should reject wildcard in key'
  );

  const cap = TaggedUrn.fromString('cap:key=*');
  assertEqual(cap.getTag('key'), '*', 'Should accept wildcard in value');
}

// TEST535: Verify duplicate keys are rejected with error
function test535_duplicate_key_rejection() {
  assertThrows(
    () => TaggedUrn.fromString('cap:key=value1;key=value2'),
    ErrorCodes.DUPLICATE_KEY,
    'Should reject duplicate keys'
  );
}

// TEST536: Verify purely numeric keys are rejected
function test536_numeric_key_restriction() {
  assertThrows(
    () => TaggedUrn.fromString('cap:123=value'),
    ErrorCodes.NUMERIC_KEY,
    'Should reject numeric keys'
  );

  const mixedKey1 = TaggedUrn.fromString('cap:key123=value');
  assertEqual(mixedKey1.getTag('key123'), 'value', 'Should allow mixed alphanumeric keys');

  const mixedKey2 = TaggedUrn.fromString('cap:123key=value');
  assertEqual(mixedKey2.getTag('123key'), 'value', 'Should allow mixed alphanumeric keys');

  const numericValue = TaggedUrn.fromString('cap:key=123');
  assertEqual(numericValue.getTag('key'), '123', 'Should allow numeric values');
}

// TEST537: Verify empty values (key=) cause error
function test537_empty_value_error() {
  assertThrows(
    () => TaggedUrn.fromString('cap:key='),
    ErrorCodes.EMPTY_TAG,
    'Should reject empty value'
  );
  assertThrows(
    () => TaggedUrn.fromString('cap:key=;other=value'),
    ErrorCodes.EMPTY_TAG,
    'Should reject empty value mid-string'
  );
}

// TEST538: Verify hasTag value comparison is case-sensitive
function test538_has_tag_case_sensitive() {
  const urn = TaggedUrn.fromString('cap:key="Value"');

  // Exact case match works
  assert(urn.hasTag('key', 'Value'), 'Should match exact case');

  // Different case does not match
  assert(!urn.hasTag('key', 'value'), 'Should not match different case');
  assert(!urn.hasTag('key', 'VALUE'), 'Should not match different case');

  // Key lookup is case-insensitive
  assert(urn.hasTag('KEY', 'Value'), 'Key lookup should be case-insensitive');
  assert(urn.hasTag('Key', 'Value'), 'Key lookup should be case-insensitive');
}

// TEST539: Verify withTag preserves value case
function test539_with_tag_preserves_value() {
  const urn = TaggedUrn.empty('cap').withTag('key', 'ValueWithCase');
  assertEqual(urn.getTag('key'), 'ValueWithCase', 'Should preserve value case');
}

// TEST540: Verify withTag rejects empty value
function test540_with_tag_rejects_empty_value() {
  assertThrows(
    () => TaggedUrn.empty('cap').withTag('key', ''),
    ErrorCodes.EMPTY_TAG,
    'Should reject empty value in withTag'
  );
}

// TEST541: Verify builder rejects empty value
function test541_builder_rejects_empty_value() {
  assertThrows(
    () => new TaggedUrnBuilder('cap').tag('key', ''),
    ErrorCodes.EMPTY_TAG,
    'Should reject empty value in builder'
  );
}

// TEST542: Verify unquoted and quoted simple lowercase values are equivalent
function test542_semantic_equivalence() {
  const unquoted = TaggedUrn.fromString('cap:key=simple');
  const quoted = TaggedUrn.fromString('cap:key="simple"');
  assert(unquoted.equals(quoted), 'Unquoted and quoted lowercase should be equal');

  // Both serialize the same way (unquoted)
  assertEqual(unquoted.toString(), 'cap:key=simple', 'Unquoted should serialize as unquoted');
  assertEqual(quoted.toString(), 'cap:key=simple', 'Quoted lowercase should serialize as unquoted');
}

// ============================================================================
// MATCHING SEMANTICS CORE (TEST543-TEST552)
// ============================================================================

// TEST543: Instance and pattern have same tag/value - matches
function test543_matching_semantics_exact_match() {
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const request = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(cap.conformsTo(request), 'Exact match should succeed');
}

// TEST544: Pattern requires tag but instance doesn't have it - no match
function test544_matching_semantics_instance_missing_tag() {
  const instance = TaggedUrn.fromString('cap:op=generate');
  const pattern = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(!instance.conformsTo(pattern), 'Instance missing tag should NOT match');

  const patternOptional = TaggedUrn.fromString('cap:op=generate;ext=?');
  assert(instance.conformsTo(patternOptional), 'Pattern with ext=? should match instance without ext');
}

// TEST545: Instance has extra tag not in pattern - still matches
function test545_matching_semantics_extra_tag() {
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf;version=2');
  const request = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(cap.conformsTo(request), 'Cap with extra tag should match');
}

// TEST546: Pattern has wildcard - matches any value
function test546_matching_semantics_request_wildcard() {
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const request = TaggedUrn.fromString('cap:op=generate;ext=*');
  assert(cap.conformsTo(request), 'Request wildcard should match');
}

// TEST547: Instance has wildcard - matches any pattern constraint
function test547_matching_semantics_cap_wildcard() {
  const cap = TaggedUrn.fromString('cap:op=generate;ext=*');
  const request = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(cap.conformsTo(request), 'Cap wildcard should match');
}

// TEST548: Instance and pattern have same key but different values - no match
function test548_matching_semantics_value_mismatch() {
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const request = TaggedUrn.fromString('cap:op=generate;ext=docx');
  assert(!cap.conformsTo(request), 'Value mismatch should not match');
}

// TEST549: Pattern has constraint instance doesn't have - no match
function test549_matching_semantics_pattern_extra_tag() {
  const instance = TaggedUrn.fromString('cap:op=generate_thumbnail;out="media:binary"');
  const pattern = TaggedUrn.fromString('cap:op=generate_thumbnail;out="media:binary";ext=wav');
  assert(!instance.conformsTo(pattern), 'Instance missing ext should NOT match pattern requiring ext=wav');

  const patternNoExt = TaggedUrn.fromString('cap:op=generate_thumbnail;out="media:binary"');
  assert(instance.conformsTo(patternNoExt), 'Should match pattern without ext constraint');
}

// TEST550: Empty pattern matches any instance
function test550_matching_semantics_empty_pattern() {
  const instance = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const emptyPattern = TaggedUrn.fromString('cap:');
  assert(instance.conformsTo(emptyPattern), 'Any instance should match empty pattern');

  const emptyInstance = TaggedUrn.fromString('cap:');
  const pattern = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(!emptyInstance.conformsTo(pattern), 'Empty instance should NOT match pattern with requirements');
}

// TEST551: Multiple independent tag constraints work correctly
function test551_matching_semantics_cross_dimension() {
  const instance = TaggedUrn.fromString('cap:op=generate');
  const pattern = TaggedUrn.fromString('cap:ext=pdf');
  assert(!instance.conformsTo(pattern), 'Instance without ext should NOT match pattern requiring ext');

  const instance2 = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const pattern2 = TaggedUrn.fromString('cap:ext=pdf');
  assert(instance2.conformsTo(pattern2), 'Instance with ext=pdf should match');
}

// TEST552: Matching URNs with different prefixes returns error
function test552_matching_different_prefixes_error() {
  const urn1 = TaggedUrn.fromString('cap:op=test');
  const urn2 = TaggedUrn.fromString('other:op=test');

  assertThrows(
    () => urn1.conformsTo(urn2),
    ErrorCodes.PREFIX_MISMATCH,
    'conformsTo with different prefixes should throw'
  );

  assertThrows(
    () => urn1.accepts(urn2),
    ErrorCodes.PREFIX_MISMATCH,
    'accepts with different prefixes should throw'
  );

  assertThrows(
    () => urn1.isMoreSpecificThan(urn2),
    ErrorCodes.PREFIX_MISMATCH,
    'isMoreSpecificThan with different prefixes should throw'
  );
}

// ============================================================================
// VALUELESS TAG TESTS (TEST553-TEST566)
// ============================================================================

// TEST553: Single value-less tag parses as wildcard
function test553_valueless_tag_parsing_single() {
  const urn = TaggedUrn.fromString('cap:optimize');
  assertEqual(urn.getTag('optimize'), '*', 'Should parse value-less tag as wildcard');
  assertEqual(urn.toString(), 'cap:optimize', 'Should serialize without =*');
}

// TEST554: Multiple value-less tags parse correctly
function test554_valueless_tag_parsing_multiple() {
  const urn = TaggedUrn.fromString('cap:fast;optimize;secure');
  assertEqual(urn.getTag('fast'), '*', 'Should parse first value-less tag');
  assertEqual(urn.getTag('optimize'), '*', 'Should parse second value-less tag');
  assertEqual(urn.getTag('secure'), '*', 'Should parse third value-less tag');
  assertEqual(urn.toString(), 'cap:fast;optimize;secure', 'Should serialize alphabetically');
}

// TEST555: Mix of valueless and valued tags works
function test555_valueless_tag_mixed_with_valued() {
  const urn = TaggedUrn.fromString('cap:op=generate;optimize;ext=pdf;secure');
  assertEqual(urn.getTag('op'), 'generate', 'Should parse valued tag');
  assertEqual(urn.getTag('optimize'), '*', 'Should parse value-less tag');
  assertEqual(urn.getTag('ext'), 'pdf', 'Should parse valued tag');
  assertEqual(urn.getTag('secure'), '*', 'Should parse value-less tag');
  assertEqual(urn.toString(), 'cap:ext=pdf;op=generate;optimize;secure', 'Should serialize alphabetically');
}

// TEST556: Valueless tag at end (no trailing semicolon) works
function test556_valueless_tag_at_end() {
  const urn = TaggedUrn.fromString('cap:op=generate;optimize');
  assertEqual(urn.getTag('op'), 'generate', 'Should parse valued tag');
  assertEqual(urn.getTag('optimize'), '*', 'Should parse value-less tag');
  assertEqual(urn.toString(), 'cap:op=generate;optimize', 'Should serialize correctly');
}

// TEST557: Valueless tag is equivalent to explicit wildcard
function test557_valueless_tag_equivalence_to_wildcard() {
  const valueless = TaggedUrn.fromString('cap:ext');
  const wildcard = TaggedUrn.fromString('cap:ext=*');
  assert(valueless.equals(wildcard), 'Value-less should equal explicit wildcard');
  assertEqual(valueless.toString(), 'cap:ext', 'Value-less should serialize as value-less');
  assertEqual(wildcard.toString(), 'cap:ext', 'Wildcard should serialize as value-less');
}

// TEST558: Valueless tag (wildcard) matches any value
function test558_valueless_tag_matching() {
  const urn = TaggedUrn.fromString('cap:op=generate;ext');
  const requestPdf = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const requestDocx = TaggedUrn.fromString('cap:op=generate;ext=docx');
  const requestAny = TaggedUrn.fromString('cap:op=generate;ext=anything');

  assert(urn.conformsTo(requestPdf), 'Should match pdf');
  assert(urn.conformsTo(requestDocx), 'Should match docx');
  assert(urn.conformsTo(requestAny), 'Should match anything');
}

// TEST559: Pattern with valueless tag requires instance to have tag (any value)
function test559_valueless_tag_in_pattern() {
  const pattern = TaggedUrn.fromString('cap:op=generate;ext');
  const instancePdf = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const instanceDocx = TaggedUrn.fromString('cap:op=generate;ext=docx');
  const instanceMissing = TaggedUrn.fromString('cap:op=generate');

  assert(instancePdf.conformsTo(pattern), 'Should match pdf instance');
  assert(instanceDocx.conformsTo(pattern), 'Should match docx instance');
  assert(!instanceMissing.conformsTo(pattern), 'Should NOT match instance without ext');

  const patternOptional = TaggedUrn.fromString('cap:op=generate;ext=?');
  assert(instanceMissing.conformsTo(patternOptional), 'Instance should match pattern with ext=?');
}

// TEST560: Valueless tag contributes 2 points to specificity
function test560_valueless_tag_specificity() {
  const urn1 = TaggedUrn.fromString('cap:op=generate');
  const urn2 = TaggedUrn.fromString('cap:op=generate;optimize');
  const urn3 = TaggedUrn.fromString('cap:op=generate;ext=pdf');

  assertEqual(urn1.specificity(), 3, '1 exact = 3');
  assertEqual(urn2.specificity(), 5, '1 exact + 1 * = 3 + 2 = 5');
  assertEqual(urn3.specificity(), 6, '2 exact = 3 + 3 = 6');
}

// TEST561: Valueless tags round-trip correctly (serialize as just key)
function test561_valueless_tag_roundtrip() {
  const original = 'cap:ext=pdf;op=generate;optimize;secure';
  const urn = TaggedUrn.fromString(original);
  const serialized = urn.toString();
  const reparsed = TaggedUrn.fromString(serialized);
  assert(urn.equals(reparsed), 'Should roundtrip correctly');
  assertEqual(serialized, original, 'Serialized should match original');
}

// TEST562: Valueless tags normalized to lowercase
function test562_valueless_tag_case_normalization() {
  const urn = TaggedUrn.fromString('cap:OPTIMIZE;Fast;SECURE');
  assertEqual(urn.getTag('optimize'), '*', 'Should normalize to lowercase');
  assertEqual(urn.getTag('fast'), '*', 'Should normalize to lowercase');
  assertEqual(urn.getTag('secure'), '*', 'Should normalize to lowercase');
  assertEqual(urn.toString(), 'cap:fast;optimize;secure', 'Should serialize as lowercase');
}

// TEST563: Empty value with = is still error (different from valueless)
function test563_empty_value_still_error() {
  assertThrows(
    () => TaggedUrn.fromString('cap:key='),
    ErrorCodes.EMPTY_TAG,
    'Should reject empty value with ='
  );
  assertThrows(
    () => TaggedUrn.fromString('cap:key=;other=value'),
    ErrorCodes.EMPTY_TAG,
    'Should reject empty value mid-string'
  );
}

// TEST564: Valueless tags (wildcard) accept any specific value
function test564_valueless_tag_compatibility() {
  const wildcard = TaggedUrn.fromString('cap:op=generate;ext');
  const pdf = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const docx = TaggedUrn.fromString('cap:op=generate;ext=docx');

  // Wildcard ext accepts both pdf and docx instances
  assert(wildcard.accepts(pdf), 'Wildcard ext should accept pdf');
  assert(wildcard.accepts(docx), 'Wildcard ext should accept docx');
  // Specific values: pdf does not accept docx and vice versa
  assert(!pdf.accepts(docx), 'pdf should not accept docx');
  assert(!docx.accepts(pdf), 'docx should not accept pdf');
}

// TEST565: Purely numeric keys still rejected for valueless tags
function test565_valueless_numeric_key_still_rejected() {
  assertThrows(
    () => TaggedUrn.fromString('cap:123'),
    ErrorCodes.NUMERIC_KEY,
    'Should reject numeric key'
  );
  assertThrows(
    () => TaggedUrn.fromString('cap:op=generate;456'),
    ErrorCodes.NUMERIC_KEY,
    'Should reject numeric key'
  );
}

// TEST566: Leading/trailing whitespace in input is rejected
function test566_whitespace_in_input_rejected() {
  assertThrows(
    () => TaggedUrn.fromString(' cap:op=test'),
    ErrorCodes.WHITESPACE_IN_INPUT,
    'Should reject leading whitespace'
  );
  assertThrows(
    () => TaggedUrn.fromString('cap:op=test '),
    ErrorCodes.WHITESPACE_IN_INPUT,
    'Should reject trailing whitespace'
  );
  assertThrows(
    () => TaggedUrn.fromString(' cap:op=test '),
    ErrorCodes.WHITESPACE_IN_INPUT,
    'Should reject leading and trailing whitespace'
  );
  assertThrows(
    () => TaggedUrn.fromString('\tcap:op=test'),
    ErrorCodes.WHITESPACE_IN_INPUT,
    'Should reject tab'
  );
  assertThrows(
    () => TaggedUrn.fromString('cap:op=test\n'),
    ErrorCodes.WHITESPACE_IN_INPUT,
    'Should reject newline'
  );

  const urn = TaggedUrn.fromString('cap:op=test');
  assertEqual(urn.getTag('op'), 'test', 'Clean input should work');
}

// ============================================================================
// SPECIAL VALUES ?, !, * (TEST567-TEST577)
// ============================================================================

// TEST567: ? parses as unspecified value
function test567_unspecified_question_mark_parsing() {
  const urn = TaggedUrn.fromString('cap:ext=?');
  assertEqual(urn.getTag('ext'), '?', 'Should parse ? as unspecified');
  assertEqual(urn.toString(), 'cap:ext=?', 'Should serialize as key=?');
}

// TEST568: ! parses as must-not-have value
function test568_must_not_have_exclamation_parsing() {
  const urn = TaggedUrn.fromString('cap:ext=!');
  assertEqual(urn.getTag('ext'), '!', 'Should parse ! as must-not-have');
  assertEqual(urn.toString(), 'cap:ext=!', 'Should serialize as key=!');
}

// TEST569: Pattern with K=? matches any instance (with or without K)
function test569_question_mark_pattern_matches_anything() {
  const pattern = TaggedUrn.fromString('cap:ext=?');

  const instancePdf = TaggedUrn.fromString('cap:ext=pdf');
  const instanceDocx = TaggedUrn.fromString('cap:ext=docx');
  const instanceMissing = TaggedUrn.fromString('cap:');
  const instanceWildcard = TaggedUrn.fromString('cap:ext=*');
  const instanceMustNot = TaggedUrn.fromString('cap:ext=!');

  assert(instancePdf.conformsTo(pattern), 'ext=pdf should match ext=?');
  assert(instanceDocx.conformsTo(pattern), 'ext=docx should match ext=?');
  assert(instanceMissing.conformsTo(pattern), '(no ext) should match ext=?');
  assert(instanceWildcard.conformsTo(pattern), 'ext=* should match ext=?');
  assert(instanceMustNot.conformsTo(pattern), 'ext=! should match ext=?');
}

// TEST570: Instance with K=? matches any pattern constraint
function test570_question_mark_in_instance() {
  const instance = TaggedUrn.fromString('cap:ext=?');

  const patternPdf = TaggedUrn.fromString('cap:ext=pdf');
  const patternWildcard = TaggedUrn.fromString('cap:ext=*');
  const patternMustNot = TaggedUrn.fromString('cap:ext=!');
  const patternQuestion = TaggedUrn.fromString('cap:ext=?');
  const patternMissing = TaggedUrn.fromString('cap:');

  assert(instance.conformsTo(patternPdf), 'ext=? should match ext=pdf');
  assert(instance.conformsTo(patternWildcard), 'ext=? should match ext=*');
  assert(instance.conformsTo(patternMustNot), 'ext=? should match ext=!');
  assert(instance.conformsTo(patternQuestion), 'ext=? should match ext=?');
  assert(instance.conformsTo(patternMissing), 'ext=? should match (no ext)');
}

// TEST571: Pattern with K=! requires instance to NOT have K
function test571_must_not_have_pattern_requires_absent() {
  const pattern = TaggedUrn.fromString('cap:ext=!');

  const instanceMissing = TaggedUrn.fromString('cap:');
  const instancePdf = TaggedUrn.fromString('cap:ext=pdf');
  const instanceWildcard = TaggedUrn.fromString('cap:ext=*');
  const instanceMustNot = TaggedUrn.fromString('cap:ext=!');

  assert(instanceMissing.conformsTo(pattern), '(no ext) should match ext=!');
  assert(!instancePdf.conformsTo(pattern), 'ext=pdf should NOT match ext=!');
  assert(!instanceWildcard.conformsTo(pattern), 'ext=* should NOT match ext=!');
  assert(instanceMustNot.conformsTo(pattern), 'ext=! should match ext=!');
}

// TEST572: Instance with K=! conflicts with patterns requiring K
function test572_must_not_have_in_instance() {
  const instance = TaggedUrn.fromString('cap:ext=!');

  const patternPdf = TaggedUrn.fromString('cap:ext=pdf');
  const patternWildcard = TaggedUrn.fromString('cap:ext=*');
  const patternMustNot = TaggedUrn.fromString('cap:ext=!');
  const patternQuestion = TaggedUrn.fromString('cap:ext=?');
  const patternMissing = TaggedUrn.fromString('cap:');

  assert(!instance.conformsTo(patternPdf), 'ext=! should NOT match ext=pdf');
  assert(!instance.conformsTo(patternWildcard), 'ext=! should NOT match ext=*');
  assert(instance.conformsTo(patternMustNot), 'ext=! should match ext=!');
  assert(instance.conformsTo(patternQuestion), 'ext=! should match ext=?');
  assert(instance.conformsTo(patternMissing), 'ext=! should match (no ext)');
}

// TEST573: Comprehensive test of all instance/pattern combinations
function test573_full_cross_product_matching() {
  function check(instanceStr, patternStr, expected, msg) {
    const inst = TaggedUrn.fromString(instanceStr);
    const patt = TaggedUrn.fromString(patternStr);
    const result = inst.conformsTo(patt);
    if (result !== expected) {
      throw new Error(`Cross-product failed: ${msg}: instance=${instanceStr}, pattern=${patternStr}, expected=${expected}, got=${result}`);
    }
  }

  // Instance missing, Pattern variations
  check('cap:', 'cap:', true, '(none)/(none)');
  check('cap:', 'cap:k=?', true, '(none)/K=?');
  check('cap:', 'cap:k=!', true, '(none)/K=!');
  check('cap:', 'cap:k', false, '(none)/K=*');
  check('cap:', 'cap:k=v', false, '(none)/K=v');

  // Instance K=?, Pattern variations
  check('cap:k=?', 'cap:', true, 'K=?/(none)');
  check('cap:k=?', 'cap:k=?', true, 'K=?/K=?');
  check('cap:k=?', 'cap:k=!', true, 'K=?/K=!');
  check('cap:k=?', 'cap:k', true, 'K=?/K=*');
  check('cap:k=?', 'cap:k=v', true, 'K=?/K=v');

  // Instance K=!, Pattern variations
  check('cap:k=!', 'cap:', true, 'K=!/(none)');
  check('cap:k=!', 'cap:k=?', true, 'K=!/K=?');
  check('cap:k=!', 'cap:k=!', true, 'K=!/K=!');
  check('cap:k=!', 'cap:k', false, 'K=!/K=*');
  check('cap:k=!', 'cap:k=v', false, 'K=!/K=v');

  // Instance K=*, Pattern variations
  check('cap:k', 'cap:', true, 'K=*/(none)');
  check('cap:k', 'cap:k=?', true, 'K=*/K=?');
  check('cap:k', 'cap:k=!', false, 'K=*/K=!');
  check('cap:k', 'cap:k', true, 'K=*/K=*');
  check('cap:k', 'cap:k=v', true, 'K=*/K=v');

  // Instance K=v, Pattern variations
  check('cap:k=v', 'cap:', true, 'K=v/(none)');
  check('cap:k=v', 'cap:k=?', true, 'K=v/K=?');
  check('cap:k=v', 'cap:k=!', false, 'K=v/K=!');
  check('cap:k=v', 'cap:k', true, 'K=v/K=*');
  check('cap:k=v', 'cap:k=v', true, 'K=v/K=v');
  check('cap:k=v', 'cap:k=w', false, 'K=v/K=w');
}

// TEST574: URNs with multiple special values work correctly
function test574_mixed_special_values() {
  const pattern = TaggedUrn.fromString('cap:required;optional=?;forbidden=!;exact=pdf');

  // Instance that satisfies all constraints
  const goodInstance = TaggedUrn.fromString('cap:required=yes;optional=maybe;exact=pdf');
  assert(goodInstance.conformsTo(pattern), 'Good instance should match');

  // Instance missing required tag
  const missingRequired = TaggedUrn.fromString('cap:optional=maybe;exact=pdf');
  assert(!missingRequired.conformsTo(pattern), 'Missing required should not match');

  // Instance has forbidden tag
  const hasForbidden = TaggedUrn.fromString('cap:required=yes;forbidden=oops;exact=pdf');
  assert(!hasForbidden.conformsTo(pattern), 'Having forbidden tag should not match');

  // Instance with wrong exact value
  const wrongExact = TaggedUrn.fromString('cap:required=yes;exact=doc');
  assert(!wrongExact.conformsTo(pattern), 'Wrong exact value should not match');
}

// TEST575: All special values round-trip correctly
function test575_serialization_round_trip_special_values() {
  const originals = [
    'cap:ext=?',
    'cap:ext=!',
    'cap:ext',  // * serializes as valueless
    'cap:a=?;b=!;c;d=exact',
  ];

  for (const original of originals) {
    const urn = TaggedUrn.fromString(original);
    const serialized = urn.toString();
    const reparsed = TaggedUrn.fromString(serialized);
    assert(urn.equals(reparsed), `Round-trip failed for: ${original}`);
  }
}

// TEST576: Bidirectional accepts with special values
function test576_compatibility_with_special_values() {
  const mustNot = TaggedUrn.fromString('cap:ext=!');
  const mustHave = TaggedUrn.fromString('cap:ext=*');
  const specific = TaggedUrn.fromString('cap:ext=pdf');
  const unspecified = TaggedUrn.fromString('cap:ext=?');
  const missing = TaggedUrn.fromString('cap:');

  // ! neither accepts nor is accepted by * or specific
  assert(!mustNot.accepts(mustHave) && !mustHave.accepts(mustNot), '! and * do not accept each other');
  assert(!mustNot.accepts(specific) && !specific.accepts(mustNot), '! and specific do not accept each other');
  // ! accepted by ? (unspecified accepts anything)
  assert(unspecified.accepts(mustNot), '? accepts !');
  assert(mustNot.accepts(unspecified), '! accepts ? (? is don\'t-care)');
  // ! and missing: missing pattern has no constraint
  assert(missing.accepts(mustNot), 'empty pattern accepts !');
  // ! and !: mutual acceptance
  assert(mustNot.accepts(mustNot), '! accepts !');

  // * accepts specific
  assert(mustHave.accepts(specific), '* accepts specific');
  // * accepts *
  assert(mustHave.accepts(mustHave), '* accepts *');

  // ? accepts everything
  assert(unspecified.accepts(mustNot), '? accepts !');
  assert(unspecified.accepts(mustHave), '? accepts *');
  assert(unspecified.accepts(specific), '? accepts specific');
  assert(unspecified.accepts(unspecified), '? accepts ?');
  assert(unspecified.accepts(missing), '? accepts missing');
}

// TEST577: Verify graded specificity with special values
function test577_specificity_with_special_values() {
  const exact = TaggedUrn.fromString('cap:a=x;b=y;c=z'); // 3*3 = 9
  const mustHave = TaggedUrn.fromString('cap:a;b;c'); // 3*2 = 6
  const mustNot = TaggedUrn.fromString('cap:a=!;b=!;c=!'); // 3*1 = 3
  const unspecified = TaggedUrn.fromString('cap:a=?;b=?;c=?'); // 3*0 = 0
  const mixed = TaggedUrn.fromString('cap:a=x;b;c=!;d=?'); // 3+2+1+0 = 6

  assertEqual(exact.specificity(), 9, '3 exact = 9');
  assertEqual(mustHave.specificity(), 6, '3 must-have = 6');
  assertEqual(mustNot.specificity(), 3, '3 must-not = 3');
  assertEqual(unspecified.specificity(), 0, '3 unspecified = 0');
  assertEqual(mixed.specificity(), 6, 'mixed = 6');

  // Test specificity tuples
  assertDeepEqual(exact.specificityTuple(), [3, 0, 0], 'exact tuple');
  assertDeepEqual(mustHave.specificityTuple(), [0, 3, 0], 'mustHave tuple');
  assertDeepEqual(mustNot.specificityTuple(), [0, 0, 3], 'mustNot tuple');
  assertDeepEqual(unspecified.specificityTuple(), [0, 0, 0], 'unspecified tuple');
  assertDeepEqual(mixed.specificityTuple(), [1, 1, 1], 'mixed tuple');
}

// ============================================================================
// JS-ONLY TESTS (no Rust equivalent)
// ============================================================================

// JS-only: Test op tag is used instead of deprecated action tag
function testJsOnly_op_tag_rename() {
  const cap = TaggedUrn.fromString('cap:op=generate;format=json');
  assertEqual(cap.getTag('op'), 'generate', 'Should have op tag');
  assertEqual(cap.getTag('action'), undefined, 'Should not have action tag');

  const built = new TaggedUrnBuilder('cap')
    .tag('op', 'transform')
    .tag('type', 'data')
    .build();
  assertEqual(built.getTag('op'), 'transform', 'Builder should set op tag');
}

// ============================================================================
// CONVENIENCE METHOD TESTS (conformsToStr, acceptsStr, canonical)
// ============================================================================

// Test conformsToStr convenience method
function testConformsToStr() {
  const urn = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(urn.conformsToStr('cap:op=generate'), 'Should match subset pattern string');
  assert(!urn.conformsToStr('cap:op=extract'), 'Should not match conflicting pattern string');
}

// Test acceptsStr convenience method
function testAcceptsStr() {
  const pattern = TaggedUrn.fromString('cap:op=generate');
  assert(pattern.acceptsStr('cap:op=generate;ext=pdf'), 'Should accept more specific instance string');
  assert(!pattern.acceptsStr('cap:op=extract'), 'Should not accept conflicting instance string');
}

// Test canonical static method
function testCanonical() {
  assertEqual(
    TaggedUrn.canonical('cap:op=generate;ext=pdf;target=thumbnail'),
    'cap:ext=pdf;op=generate;target=thumbnail',
    'Should return canonical form'
  );
}

// Test canonicalOption static method
function testCanonicalOption() {
  assertEqual(
    TaggedUrn.canonicalOption('cap:op=generate;ext=pdf'),
    'cap:ext=pdf;op=generate',
    'Should return canonical form for valid input'
  );
  assertEqual(TaggedUrn.canonicalOption(null), null, 'Should return null for null');
  assertEqual(TaggedUrn.canonicalOption(undefined), null, 'Should return null for undefined');
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function runTests() {
  const tests = [
    // Parsing/Creation (TEST501-TEST518)
    ['TEST501', test501_tagged_urn_creation],
    ['TEST502', test502_custom_prefix],
    ['TEST503', test503_prefix_case_insensitive],
    ['TEST504', test504_prefix_mismatch_error],
    ['TEST505', test505_builder_with_prefix],
    ['TEST506', test506_unquoted_values_lowercased],
    ['TEST507', test507_quoted_values_preserve_case],
    ['TEST508', test508_quoted_value_special_chars],
    ['TEST509', test509_quoted_value_escape_sequences],
    ['TEST510', test510_mixed_quoted_unquoted],
    ['TEST511', test511_unterminated_quote_error],
    ['TEST512', test512_invalid_escape_sequence_error],
    ['TEST513', test513_serialization_smart_quoting],
    ['TEST514', test514_round_trip_simple],
    ['TEST515', test515_round_trip_quoted],
    ['TEST516', test516_round_trip_escapes],
    ['TEST517', test517_prefix_required],
    ['TEST518', test518_trailing_semicolon_equivalence],
    // Canonical form (TEST519)
    ['TEST519', test519_canonical_string_format],
    // Tag access/matching (TEST520-TEST522)
    ['TEST520', test520_tag_matching],
    ['TEST521', test521_matching_case_sensitive_values],
    ['TEST522', test522_missing_tag_handling],
    // Specificity (TEST523)
    ['TEST523', test523_specificity],
    // Builder (TEST524-TEST525)
    ['TEST524', test524_builder],
    ['TEST525', test525_builder_preserves_case],
    // Compatibility/matching (TEST526-TEST527)
    ['TEST526', test526_compatibility],
    ['TEST527', test527_best_match],
    // Set operations (TEST528-TEST529)
    ['TEST528', test528_merge_and_subset],
    ['TEST529', test529_merge_prefix_mismatch],
    // Wildcards (TEST530)
    ['TEST530', test530_wildcard_tag],
    // Empty URNs (TEST531-TEST532)
    ['TEST531', test531_empty_tagged_urn],
    ['TEST532', test532_empty_with_custom_prefix],
    // Character support/validation (TEST533-TEST542)
    ['TEST533', test533_extended_character_support],
    ['TEST534', test534_wildcard_restrictions],
    ['TEST535', test535_duplicate_key_rejection],
    ['TEST536', test536_numeric_key_restriction],
    ['TEST537', test537_empty_value_error],
    ['TEST538', test538_has_tag_case_sensitive],
    ['TEST539', test539_with_tag_preserves_value],
    ['TEST540', test540_with_tag_rejects_empty_value],
    ['TEST541', test541_builder_rejects_empty_value],
    ['TEST542', test542_semantic_equivalence],
    // Matching semantics core (TEST543-TEST552)
    ['TEST543', test543_matching_semantics_exact_match],
    ['TEST544', test544_matching_semantics_instance_missing_tag],
    ['TEST545', test545_matching_semantics_extra_tag],
    ['TEST546', test546_matching_semantics_request_wildcard],
    ['TEST547', test547_matching_semantics_cap_wildcard],
    ['TEST548', test548_matching_semantics_value_mismatch],
    ['TEST549', test549_matching_semantics_pattern_extra_tag],
    ['TEST550', test550_matching_semantics_empty_pattern],
    ['TEST551', test551_matching_semantics_cross_dimension],
    ['TEST552', test552_matching_different_prefixes_error],
    // Valueless tags (TEST553-TEST566)
    ['TEST553', test553_valueless_tag_parsing_single],
    ['TEST554', test554_valueless_tag_parsing_multiple],
    ['TEST555', test555_valueless_tag_mixed_with_valued],
    ['TEST556', test556_valueless_tag_at_end],
    ['TEST557', test557_valueless_tag_equivalence_to_wildcard],
    ['TEST558', test558_valueless_tag_matching],
    ['TEST559', test559_valueless_tag_in_pattern],
    ['TEST560', test560_valueless_tag_specificity],
    ['TEST561', test561_valueless_tag_roundtrip],
    ['TEST562', test562_valueless_tag_case_normalization],
    ['TEST563', test563_empty_value_still_error],
    ['TEST564', test564_valueless_tag_compatibility],
    ['TEST565', test565_valueless_numeric_key_still_rejected],
    ['TEST566', test566_whitespace_in_input_rejected],
    // Special values (TEST567-TEST577)
    ['TEST567', test567_unspecified_question_mark_parsing],
    ['TEST568', test568_must_not_have_exclamation_parsing],
    ['TEST569', test569_question_mark_pattern_matches_anything],
    ['TEST570', test570_question_mark_in_instance],
    ['TEST571', test571_must_not_have_pattern_requires_absent],
    ['TEST572', test572_must_not_have_in_instance],
    ['TEST573', test573_full_cross_product_matching],
    ['TEST574', test574_mixed_special_values],
    ['TEST575', test575_serialization_round_trip_special_values],
    ['TEST576', test576_compatibility_with_special_values],
    ['TEST577', test577_specificity_with_special_values],
    // JS-only tests
    ['JS-ONLY: op tag rename', testJsOnly_op_tag_rename],
    // Convenience method tests
    ['conformsToStr', testConformsToStr],
    ['acceptsStr', testAcceptsStr],
    ['canonical', testCanonical],
    ['canonicalOption', testCanonicalOption],
  ];

  console.log('Running Tagged URN JavaScript tests...\n');

  let passed = 0;
  let failed = 0;

  for (const [name, fn] of tests) {
    try {
      fn();
      console.log(`  OK ${name}`);
      passed++;
    } catch (error) {
      console.error(`  FAIL ${name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }
}

// Run the tests
if (require.main === module) {
  try {
    runTests();
    process.exit(0);
  } catch (error) {
    console.error('\nERR Test suite failed:', error.message);
    process.exit(1);
  }
}

module.exports = { runTests };

// =========================================================================
// ORDER-THEORETIC RELATIONS & BUILDER TESTS (TEST578-595)
// =========================================================================

// TEST578: Equivalent URNs with identical tag sets
(() => {
  const a = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const b = TaggedUrn.fromString('cap:ext=pdf;op=generate');
  assert(a.isEquivalent(b), 'TEST578: Equivalent should be true');
  assert(b.isEquivalent(a), 'TEST578: Equivalent should be symmetric');
})();

// TEST579: Non-equivalent URNs where one is more specific
(() => {
  const general = TaggedUrn.fromString('media:bytes');
  const specific = TaggedUrn.fromString('media:pdf;bytes');
  assert(!general.isEquivalent(specific), 'TEST579: Should not be equivalent');
  assert(!specific.isEquivalent(general), 'TEST579: Should not be equivalent (reverse)');
})();

// TEST580: Comparable URNs on the same specialization chain
(() => {
  const general = TaggedUrn.fromString('media:bytes');
  const specific = TaggedUrn.fromString('media:pdf;bytes');
  assert(general.isComparable(specific), 'TEST580: Should be comparable');
  assert(specific.isComparable(general), 'TEST580: Should be comparable (symmetric)');
})();

// TEST581: Incomparable URNs in different branches
(() => {
  const pdf = TaggedUrn.fromString('media:pdf;bytes');
  const txt = TaggedUrn.fromString('media:txt;textable');
  assert(!pdf.isComparable(txt), 'TEST581: Should not be comparable');
  assert(!txt.isComparable(pdf), 'TEST581: Should not be comparable (reverse)');
})();

// TEST582: Equivalent implies comparable
(() => {
  const a = TaggedUrn.fromString('cap:op=test;ext=pdf');
  const b = TaggedUrn.fromString('cap:op=test;ext=pdf');
  assert(a.isEquivalent(b), 'TEST582: Should be equivalent');
  assert(a.isComparable(b), 'TEST582: Equivalent implies comparable');
})();

// TEST583: Prefix mismatch errors
(() => {
  const cap = TaggedUrn.fromString('cap:op=test');
  const media = TaggedUrn.fromString('media:bytes');
  assertThrowsAny(() => cap.isEquivalent(media), 'TEST583: Prefix mismatch should error');
  assertThrowsAny(() => cap.isComparable(media), 'TEST583: Prefix mismatch should error');
})();

// TEST587: Builder fluent API
(() => {
  const urn = new TaggedUrnBuilder('cap')
    .tag('op', 'generate')
    .tag('target', 'thumbnail')
    .tag('format', 'pdf')
    .build();
  assertEqual(urn.getTag('op'), 'generate', 'TEST587: op tag');
  assertEqual(urn.getTag('target'), 'thumbnail', 'TEST587: target tag');
  assertEqual(urn.getTag('format'), 'pdf', 'TEST587: format tag');
})();

// TEST590: Builder empty build error
(() => {
  assertThrowsAny(() => new TaggedUrnBuilder('cap').build(), 'TEST590: Empty builder should error');
})();

// TEST591: Builder with single tag
(() => {
  const urn = new TaggedUrnBuilder('cap').tag('type', 'utility').build();
  assertEqual(urn.toString(), 'cap:type=utility', 'TEST591: toString');
  assertEqual(urn.specificity(), 3, 'TEST591: specificity');
})();

// TEST593: Builder with wildcards
(() => {
  const urn = new TaggedUrnBuilder('cap')
    .tag('op', 'convert')
    .soloTag('ext')
    .soloTag('quality')
    .build();
  assertEqual(urn.toString(), 'cap:ext;op=convert;quality', 'TEST593: toString with wildcards');
  assertEqual(urn.specificity(), 7, 'TEST593: specificity');
})();

// TEST595: Builder matching
(() => {
  const specificInstance = new TaggedUrnBuilder('cap')
    .tag('op', 'generate')
    .tag('target', 'thumbnail')
    .tag('format', 'pdf')
    .build();
  const generalPattern = new TaggedUrnBuilder('cap').tag('op', 'generate').build();
  const wildcardPattern = new TaggedUrnBuilder('cap')
    .tag('op', 'generate')
    .tag('target', 'thumbnail')
    .soloTag('ext')
    .build();
  
  assert(specificInstance.conformsTo(generalPattern), 'TEST595: Should conform to general');
  assert(!specificInstance.conformsTo(wildcardPattern), 'TEST595: Should not conform to wildcard pattern');
  assertEqual(specificInstance.specificity(), 9, 'TEST595: specific specificity');
  assertEqual(generalPattern.specificity(), 3, 'TEST595: general specificity');
  assertEqual(wildcardPattern.specificity(), 8, 'TEST595: wildcard specificity');
})();

// Builder rejects empty value
(() => {
  assertThrows(
    () => new TaggedUrnBuilder('cap').tag('key', ''),
    ErrorCodes.EMPTY_TAG,
    'Builder should reject empty value'
  );
})();

console.log('All tests passed!');
