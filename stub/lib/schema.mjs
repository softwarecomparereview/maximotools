/**
 * schema.mjs — minimal JSON-Schema-subset validator (zero dependencies).
 *
 * Supports the subset Maximo's /oslc/jsonschemas responses actually use for
 * flat resource shapes: `type`, `properties`, `required`. Nested object
 * properties recurse. `null` values are accepted for any type: captured
 * Maximo schemas do not reliably mark nullability, and rejecting nulls
 * would fail honest captures.
 *
 * Returns a list of human-readable error strings; empty list means valid.
 */

const TYPE_CHECKS = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number",
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
};

export function validate(value, schema, path = "$") {
  const errors = [];
  if (schema == null || typeof schema !== "object") return errors;

  if (value === null || value === undefined) return errors; // nullability: accepted

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some((t) => t === "null" || TYPE_CHECKS[t]?.(value));
    if (!ok) {
      errors.push(`${path}: expected type ${types.join("|")}, got ${describeType(value)}`);
      return errors; // type mismatch makes deeper checks meaningless
    }
  }

  if (TYPE_CHECKS.object(value)) {
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push(`${path}: missing required property '${req}'`);
    }
    for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], propSchema, `${path}.${key}`));
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => errors.push(...validate(item, schema.items, `${path}[${i}]`)));
  }

  return errors;
}

function describeType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Validate a fixture response body against a captured object-structure
 * schema. Maximo collection responses put resources under `member`; a
 * single-resource response is the object itself.
 */
export function validateBodyAgainstSchema(body, schema) {
  if (body == null || typeof body !== "object") return [];
  const members = Array.isArray(body.member) ? body.member : [body];
  const errors = [];
  members.forEach((m, i) => errors.push(...validate(m, schema, `member[${i}]`)));
  return errors;
}
