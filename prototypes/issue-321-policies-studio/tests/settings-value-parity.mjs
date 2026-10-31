import assert from "node:assert/strict";

export function verifySettingValues(
  catalog,
  management,
  presence,
  policy,
  parseField,
  ordinary,
) {
  const checks = [];
  const same = (actual, expected, label) => {
    assert.deepEqual([...actual].sort(), [...expected].sort(), label);
    checks.push(label);
  };
  for (const field of ordinary) {
    const schema = management.managementSettingSetRequestSchema.options.find(
      (item) => item.shape.setting.value === field.key,
    ).shape.value;
    const candidates =
      field.kind === "boolean"
        ? ["true", "false", "bad"]
        : field.kind === "select"
          ? [...field.options, "INVALID"]
          : field.kind === "money"
            ? ["0", "5.000", "99999999999.999", "-1", "1.0000", "1e2"]
            : ["1", "2147483647", "0", "2147483648", "1.5", "-1"];
    if (field.options)
      same(field.options, schema.options, `${field.key} enum options`);
    for (const text of candidates) {
      const value = parseField(field, text);
      const typed =
        field.kind === "boolean"
          ? text === "true"
            ? true
            : text === "false"
              ? false
              : text
          : field.kind === "integer"
            ? Number(text)
            : text;
      assert.equal(
        value !== undefined,
        schema.safeParse(typed).success,
        `${field.key}: ${text}`,
      );
      if (value !== undefined) assert.ok(schema.safeParse(value).success);
    }
    checks.push(`${field.key} supported values and invalid bounds`);
  }
  for (const field of catalog.fields.filter(
    (field) => field.section === "presence" || field.key === "slaTargetSeconds",
  )) {
    const schema =
      field.key === "slaTargetSeconds"
        ? management.slaTargetSecondsSchema
        : field.kind === "select"
          ? policy.shiftPresenceModeSchema
          : field.key.includes("Accuracy")
            ? policy.shiftPresenceAccuracyThresholdSchema
            : policy.shiftPresenceAgeThresholdSchema;
    if (field.options)
      same(field.options, schema.options, `${field.key} enum options`);
    for (const value of field.options ?? [
      field.min,
      field.max,
      field.min - 1,
      field.max + 1,
      1.5,
    ]) {
      assert.equal(
        parseField(field, String(value)) !== undefined,
        schema.safeParse(value).success,
      );
    }
    checks.push(`${field.key} current backend values/bounds`);
  }

  return checks;
}
