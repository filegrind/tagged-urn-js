# Tagged URN Rules

## Definitive specification for Tagged URN format and behavior

This JavaScript implementation follows the exact same rules as the reference Rust implementation. See [tagged-urn-rs/docs/RULES.md](../tagged-urn-rs/docs/RULES.md) for the complete specification.

### 1. Case Handling
- **Tag keys:** Always normalized to lowercase
- **Unquoted values:** Normalized to lowercase
- **Quoted values:** Case is preserved exactly as specified

### 2. Tag Order Independence
Tags are always sorted alphabetically by key in canonical form.

### 3. Mandatory Prefix
Tagged URNs must start with `cap:` (case-insensitive for parsing).

### 4. Tag Separator
Tags are separated by semicolons (`;`).

### 5. Trailing Semicolon Optional
Both `cap:key=value` and `cap:key=value;` are equivalent.

### 6. Character Restrictions
- **Keys:** Alphanumeric, dashes (`-`), underscores (`_`), slashes (`/`), colons (`:`), dots (`.`)
- **Unquoted values:** Same as keys plus special pattern characters (`*`, `?`, `!`)
- **Quoted values:** Any character allowed with `\"` and `\\` escapes

### 7. Special Pattern Values

| Value | Name | Meaning |
|-------|------|---------|
| `K=v` | Exact value | Must have key K with exact value v |
| `K=*` | Must-have-any | Must have key K with any value |
| `K=!` | Must-not-have | Must NOT have key K |
| `K=?` | Unspecified | No constraint on key K |
| (missing) | No constraint | Same as `K=?` |

### 8. Value-less Tags
- `tag` (no `=`) is parsed as `tag=*` (must-have-any)
- `tag=*` is serialized as just `tag`
- `tag=?` and `tag=!` are serialized explicitly

### 9. Matching Semantics

Per-tag truth table (works symmetrically on both sides):

| Instance | Pattern | Match? |
|----------|---------|--------|
| (none) | (none) or `?` | OK |
| (none) | `!` | OK |
| (none) | `*` | NO |
| (none) | `v` | NO |
| `?` | (any) | OK |
| `!` | (none) or `?` or `!` | OK |
| `!` | `*` or `v` | NO |
| `*` | (none) or `?` or `*` or `v` | OK |
| `*` | `!` | NO |
| `v` | (none) or `?` or `*` or `v` | OK |
| `v` | `!` | NO |
| `v` | `w` (v≠w) | NO |

### 10. Graded Specificity

| Value Type | Score |
|------------|-------|
| Exact value (K=v) | 3 |
| Must-have-any (K=*) | 2 |
| Must-not-have (K=!) | 1 |
| Unspecified (K=?) or missing | 0 |

Total specificity = sum of all tag scores.

Tie-breaking: Compare tuples `(exact_count, must_have_any_count, must_not_count)` lexicographically.

### 11. Duplicate Keys
Duplicate keys result in an error.

### 12. Numeric Keys
Pure numeric keys are forbidden.

### 13. Empty Tagged URN
`cap:` with no tags is valid and represents no constraints.

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 1 | INVALID_FORMAT | Empty or malformed URN |
| 2 | EMPTY_TAG | Empty key or value component |
| 3 | INVALID_CHARACTER | Disallowed character in key/value |
| 4 | INVALID_TAG_FORMAT | Tag not in key=value format |
| 5 | MISSING_PREFIX | URN does not start with prefix |
| 6 | DUPLICATE_KEY | Same key appears twice |
| 7 | NUMERIC_KEY | Key is purely numeric |
| 8 | UNTERMINATED_QUOTE | Quoted value never closed |
| 9 | INVALID_ESCAPE_SEQUENCE | Invalid escape in quoted value |
| 10 | EMPTY_PREFIX | Prefix is empty |
| 11 | PREFIX_MISMATCH | Prefixes don't match in comparison |

## Implementation Notes

- Normalize keys and unquoted values to lowercase
- Preserve case in quoted values
- Sort tags alphabetically in canonical output
- Parse value-less tags as must-have-any (`tag` → `tag=*`)
- Serialize must-have-any as value-less (`tag=*` → `tag`)
- Serialize `?` and `!` explicitly
- Implement graded specificity scoring
- Allow `?` and `!` as unquoted values
