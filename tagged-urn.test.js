// Tagged URN JavaScript Test Suite
// Tests all the same rules as Rust, Go, and Objective-C implementations

const {
  TaggedUrn,
  TaggedUrnBuilder,
  UrnMatcher,
  TaggedUrnError,
  ErrorCodes
} = require('./tagged-urn.js');

// Test assertion utility
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Actual: ${actual}`);
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

// Test suite

function testTaggedUrnCreation() {
  console.log('Testing Tagged URN creation...');

  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');
  assertEqual(cap.getTag('op'), 'generate', 'Should get action tag');
  assertEqual(cap.getTag('target'), 'thumbnail', 'Should get target tag');
  assertEqual(cap.getTag('ext'), 'pdf', 'Should get ext tag');

  console.log('  ✓ Tagged URN creation');
}

function testCaseInsensitive() {
  console.log('Testing case insensitive behavior...');

  // Test that different casing produces the same URN
  const cap1 = TaggedUrn.fromString('cap:OP=Generate;EXT=PDF;Target=Thumbnail');
  const cap2 = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');

  // Both should be normalized to lowercase
  assertEqual(cap1.getTag('op'), 'generate', 'Should normalize op to lowercase');
  assertEqual(cap1.getTag('ext'), 'pdf', 'Should normalize ext to lowercase');
  assertEqual(cap1.getTag('target'), 'thumbnail', 'Should normalize target to lowercase');

  // URNs should be identical after normalization
  assertEqual(cap1.toString(), cap2.toString(), 'URNs should be equal after normalization');

  // PartialEq should work correctly - URNs with different case should be equal
  assert(cap1.equals(cap2), 'URNs with different case should be equal');

  // Case-insensitive tag lookup should work
  assertEqual(cap1.getTag('OP'), 'generate', 'Should lookup with case-insensitive key');
  assertEqual(cap1.getTag('Op'), 'generate', 'Should lookup with mixed case key');
  assert(cap1.hasTag('op', 'generate'), 'Should match with case-insensitive comparison');
  assert(cap1.hasTag('OP', 'generate'), 'Should match with case-insensitive comparison');

  // Matching should work case-insensitively
  assert(cap1.matches(cap2), 'Should match case-insensitively');
  assert(cap2.matches(cap1), 'Should match case-insensitively');

  console.log('  ✓ Case insensitive behavior');
}

function testPrefixRequired() {
  console.log('Testing prefix requirement...');

  // Missing prefix should fail
  assertThrows(
    () => TaggedUrn.fromString('op=generate;ext=pdf'),
    ErrorCodes.MISSING_PREFIX,
    'Should require prefix'
  );

  // Empty prefix should fail
  assertThrows(
    () => TaggedUrn.fromString(':op=generate'),
    ErrorCodes.EMPTY_PREFIX,
    'Should reject empty prefix'
  );

  // Valid prefix should work
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assertEqual(cap.getTag('op'), 'generate', 'Should parse with valid prefix');

  console.log('  ✓ Prefix requirement');
}

function testTrailingSemicolonEquivalence() {
  console.log('Testing trailing semicolon equivalence...');

  // Both with and without trailing semicolon should be equivalent
  const cap1 = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const cap2 = TaggedUrn.fromString('cap:op=generate;ext=pdf;');

  // They should be equal
  assert(cap1.equals(cap2), 'Should be equal with/without trailing semicolon');

  // They should have same string representation (canonical form)
  assertEqual(cap1.toString(), cap2.toString(), 'Should have same canonical form');

  // They should match each other
  assert(cap1.matches(cap2), 'Should match each other');
  assert(cap2.matches(cap1), 'Should match each other');

  console.log('  ✓ Trailing semicolon equivalence');
}

function testCanonicalStringFormat() {
  console.log('Testing canonical string format...');

  const cap = TaggedUrn.fromString('cap:op=generate;target=thumbnail;ext=pdf');
  // Should be sorted alphabetically and have no trailing semicolon in canonical form
  // 'ext' < 'op' < 'target' alphabetically
  assertEqual(cap.toString(), 'cap:ext=pdf;op=generate;target=thumbnail', 'Should be alphabetically sorted');

  console.log('  ✓ Canonical string format');
}

function testTagMatching() {
  console.log('Testing tag matching...');

  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');

  // Exact match
  const request1 = TaggedUrn.fromString('cap:op=generate;ext=pdf;target=thumbnail');
  assert(cap.matches(request1), 'Should match exact request');

  // Subset match
  const request2 = TaggedUrn.fromString('cap:op=generate');
  assert(cap.matches(request2), 'Should match subset request');

  // Wildcard request should match specific cap
  const request3 = TaggedUrn.fromString('cap:ext=*');
  assert(cap.matches(request3), 'Should match wildcard request');

  // No match - conflicting value
  const request4 = TaggedUrn.fromString('cap:op=extract');
  assert(!cap.matches(request4), 'Should not match conflicting value');

  console.log('  ✓ Tag matching');
}

function testMissingTagHandling() {
  console.log('Testing missing tag handling...');

  const cap = TaggedUrn.fromString('cap:op=generate');

  // Request with tag should match cap without tag (treated as wildcard)
  const request1 = TaggedUrn.fromString('cap:ext=pdf');
  assert(cap.matches(request1), 'Should match when cap has missing tag (wildcard)');

  // But cap with extra tags can match subset requests
  const cap2 = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const request2 = TaggedUrn.fromString('cap:op=generate');
  assert(cap2.matches(request2), 'Should match subset request');

  console.log('  ✓ Missing tag handling');
}

function testSpecificity() {
  console.log('Testing specificity...');

  const cap1 = TaggedUrn.fromString('cap:general');
  const cap2 = TaggedUrn.fromString('cap:op=generate');
  const cap3 = TaggedUrn.fromString('cap:op=*;ext=pdf');

  assertEqual(cap1.specificity(), 1, 'Should have specificity 1');
  assertEqual(cap2.specificity(), 1, 'Should have specificity 1');
  assertEqual(cap3.specificity(), 1, 'Wildcard should not count for specificity');

  assert(!cap2.isMoreSpecificThan(cap1), 'Different tags should not be more specific');

  console.log('  ✓ Specificity');
}

function testCompatibility() {
  console.log('Testing compatibility...');

  const cap1 = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const cap2 = TaggedUrn.fromString('cap:op=generate;format=*');
  const cap3 = TaggedUrn.fromString('cap:image;op=extract');

  assert(cap1.isCompatibleWith(cap2), 'Should be compatible');
  assert(cap2.isCompatibleWith(cap1), 'Should be compatible');
  assert(!cap1.isCompatibleWith(cap3), 'Should not be compatible');

  // Missing tags are treated as wildcards for compatibility
  const cap4 = TaggedUrn.fromString('cap:op=generate');
  assert(cap1.isCompatibleWith(cap4), 'Should be compatible with missing tags');
  assert(cap4.isCompatibleWith(cap1), 'Should be compatible with missing tags');

  console.log('  ✓ Compatibility');
}

function testBuilder() {
  console.log('Testing builder...');

  const cap = new TaggedUrnBuilder('cap')
    .tag('op', 'generate')
    .tag('target', 'thumbnail')
    .tag('ext', 'pdf')
    .tag('output', 'binary')
    .build();

  assertEqual(cap.getTag('op'), 'generate', 'Should build with op tag');
  assertEqual(cap.getTag('output'), 'binary', 'Should build with output tag');

  console.log('  ✓ Builder');
}

function testConvenienceMethods() {
  console.log('Testing convenience methods...');

  const original = TaggedUrn.fromString('cap:op=generate');

  // Test withTag
  const modified = original.withTag('ext', 'pdf');
  assertEqual(modified.getTag('op'), 'generate', 'Should preserve original tag');
  assertEqual(modified.getTag('ext'), 'pdf', 'Should add new tag');

  // Test withoutTag
  const removed = modified.withoutTag('op');
  assertEqual(removed.getTag('ext'), 'pdf', 'Should preserve remaining tag');
  assertEqual(removed.getTag('op'), undefined, 'Should remove specified tag');

  // Test merge
  const cap1 = TaggedUrn.fromString('cap:op=generate');
  const cap2 = TaggedUrn.fromString('cap:ext=pdf;output=binary');
  const merged = cap1.merge(cap2);
  assertEqual(merged.toString(), 'cap:ext=pdf;op=generate;output=binary', 'Should merge correctly');

  // Test subset
  const subset = merged.subset(['type', 'ext']);
  assertEqual(subset.toString(), 'cap:ext=pdf', 'Should create subset correctly');

  // Test wildcardTag
  const cap = TaggedUrn.fromString('cap:ext=pdf');
  const wildcarded = cap.withWildcardTag('ext');
  // Wildcard serializes as value-less tag
  assertEqual(wildcarded.toString(), 'cap:ext', 'Should set wildcard (serializes as value-less)');

  console.log('  ✓ Convenience methods');
}

function testUrnMatcher() {
  console.log('Testing UrnMatcher...');

  const caps = [
    TaggedUrn.fromString('cap:op=*'),
    TaggedUrn.fromString('cap:op=generate'),
    TaggedUrn.fromString('cap:op=generate;ext=pdf')
  ];

  const request = TaggedUrn.fromString('cap:op=generate');
  const best = UrnMatcher.findBestMatch(caps, request);

  // Most specific cap that can handle the request (alphabetically sorted: ext < op)
  assertEqual(best.toString(), 'cap:ext=pdf;op=generate', 'Should find most specific match');

  // Test findAllMatches
  const matches = UrnMatcher.findAllMatches(caps, request);
  assertEqual(matches.length, 3, 'Should find all matches');
  assertEqual(matches[0].toString(), 'cap:ext=pdf;op=generate', 'Should sort by specificity');

  console.log('  ✓ UrnMatcher');
}

function testJSONSerialization() {
  console.log('Testing JSON serialization...');

  const original = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const json = JSON.stringify({ urn: original.toString() });
  const parsed = JSON.parse(json);
  const restored = TaggedUrn.fromString(parsed.urn);

  assert(original.equals(restored), 'Should serialize/deserialize correctly');

  console.log('  ✓ JSON serialization');
}

function testEmptyTaggedUrn() {
  console.log('Testing empty tagged URN...');

  // Empty tagged URN should be valid and match everything
  const empty = TaggedUrn.fromString('cap:');
  assertEqual(Object.keys(empty.tags).length, 0, 'Should have no tags');
  assertEqual(empty.toString(), 'cap:', 'Should have correct string representation');

  // Should match any other cap
  const specific = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(empty.matches(specific), 'Should match any cap');
  assert(empty.matches(empty), 'Should match itself');

  console.log('  ✓ Empty tagged URN');
}

function testExtendedCharacterSupport() {
  console.log('Testing extended character support...');

  // Test forward slashes and colons in tag components
  const cap = TaggedUrn.fromString('cap:url=https://example_org/api;path=/some/file');
  assertEqual(cap.getTag('url'), 'https://example_org/api', 'Should support colons and slashes');
  assertEqual(cap.getTag('path'), '/some/file', 'Should support slashes');

  console.log('  ✓ Extended character support');
}

function testWildcardRestrictions() {
  console.log('Testing wildcard restrictions...');

  // Wildcard should be rejected in keys
  assertThrows(
    () => TaggedUrn.fromString('cap:*=value'),
    ErrorCodes.INVALID_CHARACTER,
    'Should reject wildcard in key'
  );

  // Wildcard should be accepted in values
  const cap = TaggedUrn.fromString('cap:key=*');
  assertEqual(cap.getTag('key'), '*', 'Should accept wildcard in value');

  console.log('  ✓ Wildcard restrictions');
}

function testDuplicateKeyRejection() {
  console.log('Testing duplicate key rejection...');

  // Duplicate keys should be rejected
  assertThrows(
    () => TaggedUrn.fromString('cap:key=value1;key=value2'),
    ErrorCodes.DUPLICATE_KEY,
    'Should reject duplicate keys'
  );

  console.log('  ✓ Duplicate key rejection');
}

function testNumericKeyRestriction() {
  console.log('Testing numeric key restriction...');

  // Pure numeric keys should be rejected
  assertThrows(
    () => TaggedUrn.fromString('cap:123=value'),
    ErrorCodes.NUMERIC_KEY,
    'Should reject numeric keys'
  );

  // Mixed alphanumeric keys should be allowed
  const mixedKey1 = TaggedUrn.fromString('cap:key123=value');
  assertEqual(mixedKey1.getTag('key123'), 'value', 'Should allow mixed alphanumeric keys');

  const mixedKey2 = TaggedUrn.fromString('cap:123key=value');
  assertEqual(mixedKey2.getTag('123key'), 'value', 'Should allow mixed alphanumeric keys');

  // Pure numeric values should be allowed
  const numericValue = TaggedUrn.fromString('cap:key=123');
  assertEqual(numericValue.getTag('key'), '123', 'Should allow numeric values');

  console.log('  ✓ Numeric key restriction');
}

function testOpTagRename() {
  console.log('Testing op tag (renamed from action)...');

  // Should use 'op' tag, not 'action'
  const cap = TaggedUrn.fromString('cap:op=generate;format=json');
  assertEqual(cap.getTag('op'), 'generate', 'Should have op tag');
  assertEqual(cap.getTag('action'), undefined, 'Should not have action tag');

  // Builder should use op
  const built = new TaggedUrnBuilder('cap')
    .tag('op', 'transform')
    .tag('type', 'data')
    .build();
  assertEqual(built.getTag('op'), 'transform', 'Builder should set op tag');

  console.log('  ✓ Op tag (renamed from action)');
}

// ============================================================================
// MATCHING SEMANTICS SPECIFICATION TESTS
// These 9 tests verify the exact matching semantics from RULES.md Sections 12-17
// All implementations (Rust, Go, JS, ObjC) must pass these identically
// ============================================================================

function testMatchingSemantics_Test1_ExactMatch() {
  console.log('Testing Matching Semantics Test 1: Exact match...');
  // Test 1: Exact match
  // Cap:     cap:op=generate;ext=pdf
  // Request: cap:op=generate;ext=pdf
  // Result:  MATCH
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const request = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(cap.matches(request), 'Test 1: Exact match should succeed');
  console.log('  ✓ Test 1: Exact match');
}

function testMatchingSemantics_Test2_CapMissingTag() {
  console.log('Testing Matching Semantics Test 2: Cap missing tag...');
  // Test 2: Cap missing tag (implicit wildcard)
  // Cap:     cap:op=generate
  // Request: cap:op=generate;ext=pdf
  // Result:  MATCH (cap can handle any ext)
  const cap = TaggedUrn.fromString('cap:op=generate');
  const request = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(cap.matches(request), 'Test 2: Cap missing tag should match (implicit wildcard)');
  console.log('  ✓ Test 2: Cap missing tag');
}

function testMatchingSemantics_Test3_CapHasExtraTag() {
  console.log('Testing Matching Semantics Test 3: Cap has extra tag...');
  // Test 3: Cap has extra tag
  // Cap:     cap:op=generate;ext=pdf;version=2
  // Request: cap:op=generate;ext=pdf
  // Result:  MATCH (request doesn't constrain version)
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf;version=2');
  const request = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(cap.matches(request), 'Test 3: Cap with extra tag should match');
  console.log('  ✓ Test 3: Cap has extra tag');
}

function testMatchingSemantics_Test4_RequestHasWildcard() {
  console.log('Testing Matching Semantics Test 4: Request has wildcard...');
  // Test 4: Request has wildcard
  // Cap:     cap:op=generate;ext=pdf
  // Request: cap:op=generate;ext=*
  // Result:  MATCH (request accepts any ext)
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const request = TaggedUrn.fromString('cap:op=generate;ext=*');
  assert(cap.matches(request), 'Test 4: Request wildcard should match');
  console.log('  ✓ Test 4: Request has wildcard');
}

function testMatchingSemantics_Test5_CapHasWildcard() {
  console.log('Testing Matching Semantics Test 5: Cap has wildcard...');
  // Test 5: Cap has wildcard
  // Cap:     cap:op=generate;ext=*
  // Request: cap:op=generate;ext=pdf
  // Result:  MATCH (cap handles any ext)
  const cap = TaggedUrn.fromString('cap:op=generate;ext=*');
  const request = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(cap.matches(request), 'Test 5: Cap wildcard should match');
  console.log('  ✓ Test 5: Cap has wildcard');
}

function testMatchingSemantics_Test6_ValueMismatch() {
  console.log('Testing Matching Semantics Test 6: Value mismatch...');
  // Test 6: Value mismatch
  // Cap:     cap:op=generate;ext=pdf
  // Request: cap:op=generate;ext=docx
  // Result:  NO MATCH
  const cap = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const request = TaggedUrn.fromString('cap:op=generate;ext=docx');
  assert(!cap.matches(request), 'Test 6: Value mismatch should not match');
  console.log('  ✓ Test 6: Value mismatch');
}

function testMatchingSemantics_Test7_FallbackPattern() {
  console.log('Testing Matching Semantics Test 7: Fallback pattern...');
  // Test 7: Fallback pattern
  // Cap:     cap:op=generate_thumbnail;out="media:binary"
  // Request: cap:op=generate_thumbnail;out="media:binary";ext=wav
  // Result:  MATCH (cap has implicit ext=*)
  const cap = TaggedUrn.fromString('cap:op=generate_thumbnail;out="media:binary"');
  const request = TaggedUrn.fromString('cap:op=generate_thumbnail;out="media:binary";ext=wav');
  assert(cap.matches(request), 'Test 7: Fallback pattern should match (cap missing ext = implicit wildcard)');
  console.log('  ✓ Test 7: Fallback pattern');
}

function testMatchingSemantics_Test8_EmptyCapMatchesAnything() {
  console.log('Testing Matching Semantics Test 8: Empty cap matches anything...');
  // Test 8: Empty cap matches anything
  // Cap:     cap:
  // Request: cap:op=generate;ext=pdf
  // Result:  MATCH
  const cap = TaggedUrn.fromString('cap:');
  const request = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  assert(cap.matches(request), 'Test 8: Empty cap should match anything');
  console.log('  ✓ Test 8: Empty cap matches anything');
}

function testMatchingSemantics_Test9_CrossDimensionIndependence() {
  console.log('Testing Matching Semantics Test 9: Cross-dimension independence...');
  // Test 9: Cross-dimension independence
  // Cap:     cap:op=generate
  // Request: cap:ext=pdf
  // Result:  MATCH (both have implicit wildcards for missing tags)
  const cap = TaggedUrn.fromString('cap:op=generate');
  const request = TaggedUrn.fromString('cap:ext=pdf');
  assert(cap.matches(request), 'Test 9: Cross-dimension independence should match');
  console.log('  ✓ Test 9: Cross-dimension independence');
}

// ============================================================================
// VALUE-LESS TAG TESTS
// Value-less tags are equivalent to wildcard tags (key=*)
// ============================================================================

function testValuelessTagParsingSingle() {
  console.log('Testing value-less tag parsing (single)...');
  // Single value-less tag
  const urn = TaggedUrn.fromString('cap:optimize');
  assertEqual(urn.getTag('optimize'), '*', 'Should parse value-less tag as wildcard');
  // Serializes as value-less (no =*)
  assertEqual(urn.toString(), 'cap:optimize', 'Should serialize without =*');
  console.log('  ✓ Value-less tag parsing (single)');
}

function testValuelessTagParsingMultiple() {
  console.log('Testing value-less tag parsing (multiple)...');
  // Multiple value-less tags
  const urn = TaggedUrn.fromString('cap:fast;optimize;secure');
  assertEqual(urn.getTag('fast'), '*', 'Should parse first value-less tag');
  assertEqual(urn.getTag('optimize'), '*', 'Should parse second value-less tag');
  assertEqual(urn.getTag('secure'), '*', 'Should parse third value-less tag');
  // Serializes alphabetically as value-less
  assertEqual(urn.toString(), 'cap:fast;optimize;secure', 'Should serialize alphabetically');
  console.log('  ✓ Value-less tag parsing (multiple)');
}

function testValuelessTagMixedWithValued() {
  console.log('Testing value-less tag mixed with valued...');
  // Mix of value-less and valued tags
  const urn = TaggedUrn.fromString('cap:op=generate;optimize;ext=pdf;secure');
  assertEqual(urn.getTag('op'), 'generate', 'Should parse valued tag');
  assertEqual(urn.getTag('optimize'), '*', 'Should parse value-less tag');
  assertEqual(urn.getTag('ext'), 'pdf', 'Should parse valued tag');
  assertEqual(urn.getTag('secure'), '*', 'Should parse value-less tag');
  // Serializes alphabetically
  assertEqual(urn.toString(), 'cap:ext=pdf;op=generate;optimize;secure', 'Should serialize alphabetically');
  console.log('  ✓ Value-less tag mixed with valued');
}

function testValuelessTagAtEnd() {
  console.log('Testing value-less tag at end...');
  // Value-less tag at the end (no trailing semicolon)
  const urn = TaggedUrn.fromString('cap:op=generate;optimize');
  assertEqual(urn.getTag('op'), 'generate', 'Should parse valued tag');
  assertEqual(urn.getTag('optimize'), '*', 'Should parse value-less tag');
  assertEqual(urn.toString(), 'cap:op=generate;optimize', 'Should serialize correctly');
  console.log('  ✓ Value-less tag at end');
}

function testValuelessTagEquivalenceToWildcard() {
  console.log('Testing value-less tag equivalence to wildcard...');
  // Value-less tag is equivalent to explicit wildcard
  const valueless = TaggedUrn.fromString('cap:ext');
  const wildcard = TaggedUrn.fromString('cap:ext=*');
  assert(valueless.equals(wildcard), 'Value-less should equal explicit wildcard');
  // Both serialize to value-less form
  assertEqual(valueless.toString(), 'cap:ext', 'Value-less should serialize as value-less');
  assertEqual(wildcard.toString(), 'cap:ext', 'Wildcard should serialize as value-less');
  console.log('  ✓ Value-less tag equivalence to wildcard');
}

function testValuelessTagMatching() {
  console.log('Testing value-less tag matching...');
  // Value-less tag (wildcard) matches any value
  const urn = TaggedUrn.fromString('cap:op=generate;ext');
  const requestPdf = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const requestDocx = TaggedUrn.fromString('cap:op=generate;ext=docx');
  const requestAny = TaggedUrn.fromString('cap:op=generate;ext=anything');

  assert(urn.matches(requestPdf), 'Should match pdf');
  assert(urn.matches(requestDocx), 'Should match docx');
  assert(urn.matches(requestAny), 'Should match anything');
  console.log('  ✓ Value-less tag matching');
}

function testValuelessTagInRequest() {
  console.log('Testing value-less tag in request...');
  // Request with value-less tag matches any URN value
  const request = TaggedUrn.fromString('cap:op=generate;ext');
  const urnPdf = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const urnDocx = TaggedUrn.fromString('cap:op=generate;ext=docx');
  const urnMissing = TaggedUrn.fromString('cap:op=generate');

  assert(urnPdf.matches(request), 'Should match pdf URN');
  assert(urnDocx.matches(request), 'Should match docx URN');
  assert(urnMissing.matches(request), 'Should match URN with missing tag (implicit wildcard)');
  console.log('  ✓ Value-less tag in request');
}

function testValuelessTagSpecificity() {
  console.log('Testing value-less tag specificity...');
  // Value-less tags (wildcards) don't count towards specificity
  const urn1 = TaggedUrn.fromString('cap:op=generate');
  const urn2 = TaggedUrn.fromString('cap:op=generate;optimize');
  const urn3 = TaggedUrn.fromString('cap:op=generate;ext=pdf');

  assertEqual(urn1.specificity(), 1, 'Should have specificity 1');
  assertEqual(urn2.specificity(), 1, 'Value-less tag should not count');
  assertEqual(urn3.specificity(), 2, 'Should have specificity 2');
  console.log('  ✓ Value-less tag specificity');
}

function testValuelessTagRoundtrip() {
  console.log('Testing value-less tag roundtrip...');
  // Round-trip parsing and serialization
  const original = 'cap:ext=pdf;op=generate;optimize;secure';
  const urn = TaggedUrn.fromString(original);
  const serialized = urn.toString();
  const reparsed = TaggedUrn.fromString(serialized);
  assert(urn.equals(reparsed), 'Should roundtrip correctly');
  assertEqual(serialized, original, 'Serialized should match original');
  console.log('  ✓ Value-less tag roundtrip');
}

function testValuelessTagCaseNormalization() {
  console.log('Testing value-less tag case normalization...');
  // Value-less tags are normalized to lowercase like other keys
  const urn = TaggedUrn.fromString('cap:OPTIMIZE;Fast;SECURE');
  assertEqual(urn.getTag('optimize'), '*', 'Should normalize to lowercase');
  assertEqual(urn.getTag('fast'), '*', 'Should normalize to lowercase');
  assertEqual(urn.getTag('secure'), '*', 'Should normalize to lowercase');
  assertEqual(urn.toString(), 'cap:fast;optimize;secure', 'Should serialize as lowercase');
  console.log('  ✓ Value-less tag case normalization');
}

function testEmptyValueStillError() {
  console.log('Testing empty value still error...');
  // Empty value with = is still an error (different from value-less)
  assertThrows(
    () => TaggedUrn.fromString('cap:key='),
    ErrorCodes.EMPTY_TAG,
    'Should reject empty value with ='
  );
  assertThrows(
    () => TaggedUrn.fromString('cap:key=;other=value'),
    ErrorCodes.EMPTY_TAG,
    'Should reject empty value with ='
  );
  console.log('  ✓ Empty value still error');
}

function testValuelessTagCompatibility() {
  console.log('Testing value-less tag compatibility...');
  // Value-less tags are compatible with any value
  const urn1 = TaggedUrn.fromString('cap:op=generate;ext');
  const urn2 = TaggedUrn.fromString('cap:op=generate;ext=pdf');
  const urn3 = TaggedUrn.fromString('cap:op=generate;ext=docx');

  assert(urn1.isCompatibleWith(urn2), 'Should be compatible with pdf');
  assert(urn1.isCompatibleWith(urn3), 'Should be compatible with docx');
  // But urn2 and urn3 are not compatible (different specific values)
  assert(!urn2.isCompatibleWith(urn3), 'Specific values should not be compatible');
  console.log('  ✓ Value-less tag compatibility');
}

function testValuelessNumericKeyStillRejected() {
  console.log('Testing value-less numeric key still rejected...');
  // Purely numeric keys are still rejected for value-less tags
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
  console.log('  ✓ Value-less numeric key still rejected');
}

// Run tests
function runTests() {
  console.log('Running Tagged URN JavaScript tests...\n');

  // Core URN tests
  testTaggedUrnCreation();
  testCaseInsensitive();
  testPrefixRequired();
  testTrailingSemicolonEquivalence();
  testCanonicalStringFormat();
  testTagMatching();
  testMissingTagHandling();
  testSpecificity();
  testCompatibility();
  testBuilder();
  testConvenienceMethods();
  testUrnMatcher();
  testJSONSerialization();
  testEmptyTaggedUrn();
  testExtendedCharacterSupport();
  testWildcardRestrictions();
  testDuplicateKeyRejection();
  testNumericKeyRestriction();
  testOpTagRename();

  // Matching semantics specification tests (all 9 tests from RULES.md)
  testMatchingSemantics_Test1_ExactMatch();
  testMatchingSemantics_Test2_CapMissingTag();
  testMatchingSemantics_Test3_CapHasExtraTag();
  testMatchingSemantics_Test4_RequestHasWildcard();
  testMatchingSemantics_Test5_CapHasWildcard();
  testMatchingSemantics_Test6_ValueMismatch();
  testMatchingSemantics_Test7_FallbackPattern();
  testMatchingSemantics_Test8_EmptyCapMatchesAnything();
  testMatchingSemantics_Test9_CrossDimensionIndependence();

  // Value-less tag tests
  testValuelessTagParsingSingle();
  testValuelessTagParsingMultiple();
  testValuelessTagMixedWithValued();
  testValuelessTagAtEnd();
  testValuelessTagEquivalenceToWildcard();
  testValuelessTagMatching();
  testValuelessTagInRequest();
  testValuelessTagSpecificity();
  testValuelessTagRoundtrip();
  testValuelessTagCaseNormalization();
  testEmptyValueStillError();
  testValuelessTagCompatibility();
  testValuelessNumericKeyStillRejected();

  console.log('\nOK All tests passed!');
}

// Run the tests
if (require.main === module) {
  try {
    runTests();
    process.exit(0);
  } catch (error) {
    console.error('\nERR Test failed:', error.message);
    process.exit(1);
  }
}

module.exports = { runTests };
