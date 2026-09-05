export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
  if (!value || typeof value !== "object") return value as DeepReadonly<T>;

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("deepFreeze supports only plain records and arrays");
  }
  if (seen.has(value)) return value as DeepReadonly<T>;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value as DeepReadonly<T>;
}

export function renderRoleplayPrompt(template: string, variation: Readonly<Record<string, string>>): string {
  const rendered = template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, key: string) => variation[key] ?? `{${key}}`);
  if (/[{}]/u.test(rendered)) {
    throw new Error("role-play prompt contains an unresolved or malformed placeholder");
  }
  return rendered;
}
