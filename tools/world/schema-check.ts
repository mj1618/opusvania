/**
 * A minimal JSON-Schema (draft-07 subset) checker, enough for LDtk's official schema
 * (tools/world/vendor/ldtk-1.5.3.schema.json: $ref, type, required, properties,
 * additionalProperties: false, items, enum, oneOf). Used by tests/unit/world.test.ts to prove
 * the files our library writes are ones the LDtk editor accepts. No dependency needed.
 */
type Schema = Record<string, unknown>;

export function checkSchema(root: Schema, value: unknown, limit = 50): string[] {
  const errors: string[] = [];
  const resolve = (ref: string): Schema => {
    let node: unknown = root;
    for (const part of ref.replace(/^#\//, '').split('/')) node = (node as Schema)[part];
    if (!node) throw new Error(`unresolved $ref ${ref}`);
    return node as Schema;
  };
  const typeOf = (v: unknown): string =>
    v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  const fits = (t: string, v: unknown) => {
    const a = typeOf(v);
    return t === a || (t === 'number' && a === 'integer');
  };
  const visit = (s: Schema, v: unknown, path: string, out: string[]): void => {
    if (out.length >= limit) return;
    if (typeof s.$ref === 'string') {
      visit(resolve(s.$ref), v, path, out);
      return;
    }
    if (Array.isArray(s.oneOf)) {
      const ok = (s.oneOf as Schema[]).filter((alt) => {
        const e: string[] = [];
        visit(alt, v, path, e);
        return e.length === 0;
      });
      if (ok.length === 0) out.push(`${path}: matches no oneOf alternative`);
      return;
    }
    if (s.type !== undefined) {
      const types = (Array.isArray(s.type) ? s.type : [s.type]) as string[];
      if (!types.some((t) => fits(t, v))) {
        out.push(`${path}: expected ${types.join('|')}, got ${typeOf(v)}`);
        return;
      }
    }
    if (Array.isArray(s.enum) && !s.enum.includes(v)) out.push(`${path}: ${JSON.stringify(v)} not in enum`);
    if (Array.isArray(v) && s.items)
      v.forEach((x, i) => {
        visit(s.items as Schema, x, `${path}[${i}]`, out);
      });
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      for (const k of (s.required as string[] | undefined) ?? [])
        if (!(k in o)) out.push(`${path}: missing required ${k}`);
      const props = (s.properties ?? {}) as Record<string, Schema>;
      for (const [k, x] of Object.entries(o)) {
        if (props[k]) visit(props[k], x, `${path}.${k}`, out);
        else if (s.additionalProperties === false && k !== '__header__')
          out.push(`${path}: unknown property ${k}`);
      }
    }
  };
  visit(root, value, '$', errors);
  return errors;
}
