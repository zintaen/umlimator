/* ---------- DBML: an adapter over @dbml/core's parsed Database (notes/milestone-2.md §8.4, M2.11; risks.md R1 to R3) ----------
   It imports nothing: a host parses DBML with @dbml/core, which it installs (`Parser.parse(text, 'dbml')`), and hands this
   the Database, or what `database.export()` gives (the same fields, as plain JSON). Tested against a Database captured
   from @dbml/core 11.0.0 (tests/import/dbml.json). Internal: the CLI (`umlimator.py import x.dbml`) runs it through Node;
   its helpers are its own (db...), since the readers share one scope in lib/umlimator-all.js.

   readDbml(database) -> { model, report }: a version-2 model with one `er` view of every table, in model.md row 20's
   vocabulary, and a report of what was not read as written, each item { line, status, message }, status `skipped` or
   `approximated` (R1). A parsed object keeps no line numbers, so `line` is the item's path in the Database
   (`schemas[0].tables[2].fields[1]`), as the CLI names a JSON source's items. Ids come from the source's names (R3): a
   table's name, a column `<table>.<column>`, a relationship `<from>-<to>`, each the next free of base, base-2, ...

   - a table is an `er.Entity`; a table of a schema other than `public` is read under its own name and reported (several
     schemas are left out, §13);
   - a field is an `er.Column`: `dataType` its type's name, `primaryKey` from `pk` or the table's `[pk]` index (a
     composite key), `unique`, and `nullable` when it is neither `not null` nor a key, as SQL has it;
   - a ref is an `er.Relationship` from its `1` end (the referenced columns) to its `*` end (the referring ones), `1` to
     `0..*`; in a one-to-one (`-`, both ends `1`) the second end is the referenced, as `>` writes it, `1` to `0..1`. The
     referring columns take `foreignKey` and `references`, pair by pair; it is identifying when they lie in the child's
     key, and its parent end is `0..1` when one of them is nullable (an optional parent). A many-to-many (`<>`) is one
     relationship `0..*` to `0..*` with no foreign key, approximated (DBML builds a junction table for it);
   - enums, notes, table groups, other indexes, defaults, increments, checks, a ref's name and actions, colours, records
     and sticky notes are reported, not read.

   Hostile input (§8, R2): at most DB_MAX tables, DB_MAX columns and DB_MAX refs are read, the rest reported once each;
   no nesting is followed (the walk is a fixed depth: schemas, tables, fields), so a deep object costs nothing; anything
   that is not an object, or a field of the wrong kind, is skipped and reported; names are looked up in Maps, so
   `__proto__` and `constructor` are ordinary names. It never throws. */
const DB_MAX = 10000; // tables, columns and refs each (§8)
const DB_VIEW = 'schema'; // the view's id
const DB_SCHEMA = 'public'; // @dbml/core's default schema
const dbObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const dbName = x => (typeof x === 'string' && x ? x : null);

function readDbml(database) {
  const report = [], say = (line, status, message) => report.push({ line, status, message });
  const nodes = [], edges = [], used = new Set(), next = new Map();
  let title = null;
  const model = () => ({ schemaVersion: 2, ...(title ? { title } : {}), root: DB_VIEW, nodes, edges,
    views: [{ id: DB_VIEW, diagram: 'er', nodeIds: nodes.map(n => n.id) }] });
  const free = base => { // the first of base, base-2, ... not taken; an id never holds "->" (model.md rule 5)
    base = base.replace(/->+/g, '-');
    let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
    while (used.has(id)) id = `${base}-${++k}`;
    next.set(base, k); used.add(id);
    return id;
  };
  const named = () => { for (const n of nodes) for (const c of n.members) if (!c.id) c.id = free(`${n.id}.${c.label}`); }; // columns after every table (names first, R3)
  try {
    if (!dbObj(database) || !Array.isArray(database.schemas)) {
      say('', 'skipped', 'not a parsed DBML Database (parse the text with @dbml/core first): nothing read');
      return { model: model(), report };
    }
    title = dbName(database.name); // a project's name, when the host's Database has one
    const tables = new Map(), aliases = new Map(), refs = [], notNull = new Set(); // `schema.table` and an alias -> { node, cols: Map name -> column }
    const count = { tables: 0, columns: 0, refs: 0 };
    const full = (what, at) => { const n = count[what]++; if (n === DB_MAX) say(at, 'skipped', `over ${DB_MAX} ${what}: the rest are not read`); return n >= DB_MAX; };
    const extra = (x, at, what, keys) => { for (const [k, word] of keys) { const v = x[k]; if (v != null && v !== false && !(Array.isArray(v) && !v.length)) say(at, 'skipped', `${what}: ${word} not read`); } };
    for (const [k, word] of [['notes', 'its sticky notes are'], ['records', 'its records are']]) if (Array.isArray(database[k]) && database[k].length) say('', 'skipped', `the database: ${word} not read`);
    database.schemas.forEach((s, si) => {
      const sat = `schemas[${si}]`;
      if (!dbObj(s)) return say(sat, 'skipped', 'a schema that is not an object');
      const sname = dbName(s.name) || DB_SCHEMA;
      for (const [k, word] of [['enums', 'enum'], ['tableGroups', 'table group']]) {
        if (s[k] == null) continue;
        if (!Array.isArray(s[k])) { say(`${sat}.${k}`, 'skipped', `${k} is not a list`); continue; }
        s[k].forEach((x, i) => say(`${sat}.${k}[${i}]`, 'skipped', `${word} ${dbName(x && x.name) || '(unnamed)'}: not read`));
      }
      if (Array.isArray(s.deps) && s.deps.length) say(`${sat}.deps`, 'skipped', `schema ${sname}: its dependencies are not read`);
      if (s.refs != null && !Array.isArray(s.refs)) say(`${sat}.refs`, 'skipped', 'refs is not a list');
      else (s.refs || []).forEach((r, i) => refs.push([r, `${sat}.refs[${i}]`]));
      if (s.tables == null) return;
      if (!Array.isArray(s.tables)) return say(`${sat}.tables`, 'skipped', 'tables is not a list');
      s.tables.forEach((t, ti) => {
        const at = `${sat}.tables[${ti}]`, name = dbObj(t) && dbName(t.name);
        if (!name) return say(at, 'skipped', 'a table with no name');
        if (full('tables', at)) return;
        const key = `${sname}.${name}`;
        if (tables.has(key)) return say(at, 'skipped', `table ${key} is named twice: the second is not read`);
        if (sname !== DB_SCHEMA) say(at, 'approximated', `table ${key}: its schema is not kept, so it is read as ${name}`);
        extra(t, at, `table ${name}`, [['note', 'its note is'], ['headerColor', 'its header colour is'], ['checks', 'its checks are'], ['partials', 'its partials are']]);
        const node = { id: free(name), type: 'er.Entity', label: name, members: [] }, cols = new Map(), rec = { node, cols };
        tables.set(key, rec);
        if (dbName(t.alias) && !aliases.has(t.alias)) aliases.set(t.alias, rec);
        nodes.push(node);
        if (!Array.isArray(t.fields)) { if (t.fields != null) say(`${at}.fields`, 'skipped', `table ${name}: fields is not a list`); }
        else t.fields.forEach((f, fi) => {
          const fat = `${at}.fields[${fi}]`, fname = dbObj(f) && dbName(f.name);
          if (!fname) return say(fat, 'skipped', `table ${name}: a field with no name`);
          if (full('columns', fat)) return;
          if (cols.has(fname)) return say(fat, 'skipped', `${name}.${fname} is named twice: the second is not read`);
          const type = dbObj(f.type) ? dbName(f.type.type_name) : null, props = {};
          if (type) props.dataType = type; else say(fat, 'approximated', `${name}.${fname}: its type is not text, so it has none`);
          if (f.pk === true) props.primaryKey = true;
          if (f.unique === true) props.unique = true;
          extra(f, fat, `${name}.${fname}`, [['note', 'its note is'], ['dbdefault', 'its default is'], ['increment', 'its increment is'], ['checks', 'its checks are']]);
          const col = { id: '', type: 'er.Column', label: fname, props }; // its id by named()
          if (f.not_null === true) notNull.add(col);
          cols.set(fname, col); node.members.push(col);
        });
        if (t.indexes != null && !Array.isArray(t.indexes)) say(`${at}.indexes`, 'skipped', `table ${name}: indexes is not a list`);
        else (t.indexes || []).forEach((x, xi) => { // a [pk] index is the table's key; any other index is not read
          const xat = `${at}.indexes[${xi}]`, list = dbObj(x) && Array.isArray(x.columns) ? x.columns : null;
          const picked = list && x.pk === true ? list.map(c => (dbObj(c) && c.type === 'column' ? cols.get(c.value) : undefined)) : null;
          if (!picked || !picked.length || picked.includes(undefined)) return say(xat, 'skipped', `table ${name}: ${x && x.pk === true ? 'a primary key index not of its columns' : 'an index'} is not read`);
          picked.forEach(c => { c.props.primaryKey = true; });
        });
        for (const c of cols.values()) if (!notNull.has(c) && !c.props.primaryKey) c.props.nullable = true;
      });
    });
    named();
    const end = e => { // a ref's end: { rec, cols, one } or null
      if (!dbObj(e) || !dbName(e.tableName) || !Array.isArray(e.fieldNames) || !e.fieldNames.length || (e.relation !== '1' && e.relation !== '*')) return null;
      const rec = tables.get(`${dbName(e.schemaName) || DB_SCHEMA}.${e.tableName}`) || (e.schemaName == null ? aliases.get(e.tableName) : undefined);
      const cols = rec && e.fieldNames.map(n => rec.cols.get(n));
      return cols && !cols.includes(undefined) ? { rec, cols, one: e.relation === '1', name: `${e.tableName}.(${e.fieldNames.join(', ')})` } : null;
    };
    for (const [r, at] of refs) {
      if (full('refs', at)) continue;
      const ends = dbObj(r) && Array.isArray(r.endpoints) && r.endpoints.length === 2 ? r.endpoints.map(end) : [null];
      if (ends.includes(null)) { say(at, 'skipped', 'a ref whose ends are not two columns of tables read: not read'); continue; }
      if (r.inactive === true) { say(at, 'skipped', `ref ${ends[0].name} - ${ends[1].name}: inactive, so not read`); continue; }
      let [child, parent] = ends; // `>` writes the referring end first, and `-` as it
      if (child.one && !parent.one) [child, parent] = [parent, child];
      const what = `ref ${child.name} -> ${parent.name}`;
      extra(r, at, what, [['name', 'its name is'], ['onDelete', 'its delete action is'], ['onUpdate', 'its update action is'], ['color', 'its colour is']]);
      if (!child.one && !parent.one) { // many-to-many: no column refers; drawn first end to second
        say(at, 'approximated', `${what}: a many-to-many is one relationship with no foreign key`);
        edges.push({ id: free(`${child.rec.node.id}-${parent.rec.node.id}`), type: 'er.Relationship', from: child.rec.node.id, to: parent.rec.node.id,
          props: { identifying: false, ends: { from: { multiplicity: '0..*' }, to: { multiplicity: '0..*' } } } });
        continue;
      }
      if (child.cols.length !== parent.cols.length) { say(at, 'skipped', `${what}: its two ends name different numbers of columns: not read`); continue; }
      child.cols.forEach((c, i) => {
        if (c.props.references && c.props.references !== parent.cols[i].id) return say(at, 'approximated', `${what}: ${c.label} refers to ${c.props.references} already, which it keeps`);
        c.props.foreignKey = true; c.props.references = parent.cols[i].id;
      });
      edges.push({ id: free(`${parent.rec.node.id}-${child.rec.node.id}`), type: 'er.Relationship', from: parent.rec.node.id, to: child.rec.node.id,
        props: { identifying: child.cols.every(c => c.props.primaryKey === true), ends: { from: { multiplicity: child.cols.some(c => c.props.nullable) ? '0..1' : '1' },
          to: { multiplicity: parent.one && child.one ? '0..1' : '0..*' } } } });
    }
  } catch (e) { // a host's object whose getter throws: what was read is kept
    say('', 'skipped', `the Database could not be read to its end (${e && e.message}): the rest is not read`);
  }
  named();
  for (const n of nodes) if (!n.members.length) delete n.members;
  return { model: model(), report };
}

export { readDbml };
