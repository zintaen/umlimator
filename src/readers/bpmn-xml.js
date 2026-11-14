/* ---------- BPMN XML: a reader and a writer through bpmn-moddle (notes/milestone-4b.md §12, 4b.4; risks.md R1 to R5) ---
   It imports nothing: the caller makes a `bpmn-moddle` instance (`BpmnModdle()` from bpmn-moddle 10.3.1, which it
   installs) and passes it in, as the markdown-it plugin takes the host's markdown-it. Internal: the CLI
   (`umlimator.py import x.bpmn`, `umlimator.py export`) imports this file through Node; its helpers are its own (bx...),
   since the readers share one scope in lib/umlimator-all.js. The vocabulary is model.md row 24's, as the note's §3.1
   maps it onto BPMN 2.0.2's Table 2.1, with the extras S1 and decision 21 name.

   readBpmnXml(xml, moddle) -> promise of { model, report }: a version-2 model with one `bpmn` view per BPMNDiagram, its
   `nodeIds` the plane's shapes (a sub-process's own plane is a view with it as `subject`, which the sub-process
   `opensView`; an element with no shape goes to the first view; a file with no diagram interchange is one view), and a
   report of what was not read as written, each item { line, status, message }: `line` the element's id, status
   `skipped` or `weakened`. Ids are the file's, or its `umlimator:id` (R3). Read as written: participants (a lane of
   theirs a member, nested by `parent`), tasks (user, service), sub-processes, call activities, start, end, intermediate
   and boundary events with the definitions their kind may take, exclusive and parallel gateways, data object references
   (with their data object) and data store references, text annotations, groups (a category value names its group in
   `categoryValueRef`), documentation, sequence and message flows, associations and data associations. Weakened, kept
   under the element's `ext.bpmn`: a sequence flow's condition, a gateway's default, a send or receive task's kind, a
   timer's time. Anything else (an element, an event definition or a marker outside the subset, an extension) is
   reported `skipped` and kept under the model's `ext.bpmn.skipped` as moddle's JSON with its parent's id; a line to it
   is reported too. Positions and sizes are not kept (R5): the report says so once per file.

   writeBpmnXml(model, viewId, geo, moddle) -> promise of { xml, report }: every `bpmn.*` element of the model in one
   definitions, a collaboration when it has a participant, a process per participant (its `processRef`, else
   <participant>-process) that holds anything and one for what is in no pool, and one BPMNDiagram per `bpmn` view. Its
   shapes and edges take their bounds and points from `geo` ({ nodes: [{ id, x, y, w, h }], edges: [{ id, pts }] }, the
   layout of `viewId`), any other on a plain grid. An id that is not an XML name is written escaped (`_` and its code
   points), the model's id in `umlimator:id`. Not written, and reported: what `ext.bpmn` holds, other diagrams' elements
   and views, a property or field outside row 24 or on a type it is not for, a data association against BPMN's direction
   (§4's data-ends), and whatever a reader would read back otherwise (note §12.5: a cycle of lanes, a lane as the parent
   of data or an artifact, a process id taken, a view's subject or parent, an opensView, a node in no view). The root's
   diagram is written first. The reader fills in the defaults: taskType none, definition none, cancelActivity true.

   Hostile input (§12.2; a departure from R2, which asks for hand-written linear readers): text over BX_LIMIT characters
   is refused; moddle's parser and handlers and this file's walk run inside one `try`, so a throw (a RangeError at depth
   among them) is a report item, never a throw; the walk over moddle's tree is iterative, a skipped element's JSON is cut
   at BX_DEEP levels, lookups are by Set and Map (no scan per element), and either report lists BX_MAX items, then counts
   the rest in one. Neither function ever throws. A tab
   or carriage return in a name or id reads back as a space (XML's attribute rule). */
const BX_LIMIT = 1 << 20; // characters of XML read (R2)
const BX_MAX = 1000; // report items listed; the rest counted in one
const BX_DEEP = 32; // levels of a skipped element kept under ext.bpmn
const BX_NS = 'https://zintaen.github.io/umlimator/bpmn'; // the umlimator: attributes' namespace
const BX_VIEW = 'process'; // the view of a file with no diagram interchange
const BX_TASK = { 'bpmn:Task': 'none', 'bpmn:UserTask': 'user', 'bpmn:ServiceTask': 'service', 'bpmn:SendTask': 'send', 'bpmn:ReceiveTask': 'receive' };
const BX_TASK_OUT = { none: 'bpmn:Task', user: 'bpmn:UserTask', service: 'bpmn:ServiceTask' };
const BX_DEFS = { // the definitions each kind of event may take (§3.2)
  StartEvent: ['none', 'message', 'timer'], EndEvent: ['none', 'message', 'terminate'], IntermediateCatchEvent: ['message', 'timer'],
  IntermediateThrowEvent: ['none', 'message'], BoundaryEvent: ['message', 'timer'] };
const BX_DEF = { 'bpmn:MessageEventDefinition': 'message', 'bpmn:TimerEventDefinition': 'timer', 'bpmn:TerminateEventDefinition': 'terminate' };
const BX_DEF_OUT = { message: 'bpmn:MessageEventDefinition', timer: 'bpmn:TimerEventDefinition', terminate: 'bpmn:TerminateEventDefinition' };
const BX_SAME = new Set(['Participant', 'SubProcess', 'CallActivity', 'ExclusiveGateway', 'ParallelGateway', 'DataStoreReference',
  'TextAnnotation', 'Group', ...Object.keys(BX_DEFS)]); // bpmn.X is bpmn:X
const BX_ACTIVITY = new Set(['bpmn.Task', 'bpmn.SubProcess', 'bpmn.CallActivity']);
const BX_PROPS = { 'bpmn.Participant': ['processRef'], 'bpmn.Task': ['taskType'], 'bpmn.CallActivity': ['calledElement'], 'bpmn.Association': ['direction'],
  'bpmn.BoundaryEvent': ['definition', 'attachedTo', 'cancelActivity'], 'bpmn.DataStoreReference': ['dataStoreRef'] }; // and documentation on any
const bxProp = (t, k) => k === 'documentation' || (BX_PROPS[t] || (t.slice(5) in BX_DEFS ? ['definition'] : [])).includes(k)
  || k === 'categoryValueRef' && !['bpmn.Group', 'bpmn.Lane'].includes(t) && !/(Flow|Association)$/.test(t); // a node's groups (row 24)
const BX_LOOSE = new Set(['bpmn.DataObject', 'bpmn.DataStoreReference', 'bpmn.TextAnnotation', 'bpmn.Group']); // in a pool, never a lane
const BX_FIELDS = new Set(['id', 'type', 'label', 'parent', 'props', 'members', 'opensView', 'ext', 'from', 'to']);
const BX_SIZE = { 'bpmn.Participant': [600, 200], 'bpmn.Lane': [570, 100], 'bpmn.Group': [200, 120], 'bpmn.TextAnnotation': [120, 40],
  'bpmn.DataObject': [36, 50], 'bpmn.DataStoreReference': [50, 50], 'bpmn.ExclusiveGateway': [50, 50], 'bpmn.ParallelGateway': [50, 50] };
const bxEvent = t => (t || '').endsWith('Event');
const bxStr = x => (typeof x === 'string' && x ? x : null);
const bxMsg = e => { try { return String(e && e.message || e).split('\n')[0]; } catch { return 'an error'; } };

// a moddle element as JSON: its own properties, a reference by its id, cut at BX_DEEP levels
function bxJson(el, depth = 0) {
  if (!el || typeof el !== 'object') return el;
  if (Array.isArray(el)) return el.map(x => bxJson(x, depth));
  if (depth >= BX_DEEP) return { $type: el.$type, id: el.id, cut: true };
  const out = { $type: el.$type }, refs = new Set(((el.$descriptor && el.$descriptor.properties) || []).filter(p => p.isReference).map(p => p.name));
  for (const k of Object.keys(el)) {
    const v = el[k];
    if (k.startsWith('$') && k !== '$attrs' && k !== '$body') continue;
    if (v == null || k === '$attrs' && !Object.keys(v).length) continue;
    out[k] = refs.has(k) ? (Array.isArray(v) ? v.map(x => x && x.id) : v.id) : k === '$attrs' ? { ...v } : bxJson(v, depth + 1);
  }
  return out;
}

async function readBpmnXml(xml, moddle) {
  const report = [], nodes = [], edges = [], views = [], skipped = [], byId = new Map();
  let title = null, more = 0;
  const say = (line, status, message) => { if (report.length < BX_MAX) report.push({ line, status, message }); else more++; };
  const result = () => {
    if (more) report.push({ line: '', status: 'skipped', message: `${more} more items like these: not listed` });
    return { model: { schemaVersion: 2, ...(title ? { title } : {}), ...(views.length ? { root: views[0].id } : {}), nodes, edges, views,
      ...(skipped.length ? { ext: { bpmn: { skipped } } } : {}) }, report };
  };
  if (typeof xml !== 'string') { say('', 'skipped', 'not text: nothing read'); return result(); }
  if (xml.length > BX_LIMIT) { say('', 'skipped', `over ${BX_LIMIT} characters: nothing read (R2)`); return result(); }
  if (!moddle || typeof moddle.fromXML !== 'function') {
    say('', 'skipped', 'no bpmn-moddle instance given (npm install bpmn-moddle@10.3.1): nothing read');
    return result();
  }
  try {
    const { rootElement: defs, warnings, elementsById } = await moddle.fromXML(xml);
    for (const w of warnings || []) say((w.element && w.element.id) || '', 'skipped', `${bxMsg(w)}: not read`);
    if (!defs || defs.$type !== 'bpmn:Definitions') { say('', 'skipped', 'no BPMN definitions: nothing read'); return result(); }
    title = bxStr(defs.name);
    const ns = Object.keys(defs.$attrs || {}).find(k => k.startsWith('xmlns:') && defs.$attrs[k] === BX_NS), pre = ns ? ns.slice(6) + ':' : null;
    const attr = (el, k) => (pre && el.$attrs && typeof el.$attrs[pre + k] === 'string' ? el.$attrs[pre + k] : null);
    const idOf = el => attr(el, 'id') ?? el.id;
    const foreign = (el, id) => { for (const k of Object.keys(el.$attrs || {})) if (!k.startsWith('xmlns') && !(pre && k.startsWith(pre))) say(id, 'skipped', `the attribute ${k}: not read`); };
    foreign(defs, '');
    const elOf = new Map(); // a moddle element -> its node or lane
    const skip = (el, parent, why = 'outside the subset') => {
      const id = el.id || '';
      say(id || parent || '', 'skipped', `${(el.$type || 'an element').replace('bpmn:', '')} ${why}: kept under ext.bpmn, not read`);
      skipped.push({ ...(parent ? { parent } : {}), element: bxJson(el) });
    };
    const add = (el, type, parent, props = {}, label = el.name) => {
      const id = idOf(el);
      if (!bxStr(id) || byId.has(id)) { skip(el, parent, id ? `has the id ${id}, taken` : 'has no id'); return null; }
      const doc = (el.documentation || []).map(d => d.text).filter(bxStr).join('\n');
      if (doc) props.documentation = doc;
      const n = { id, type, ...(bxStr(label) ? { label } : {}), ...(parent ? { parent } : {}), ...(Object.keys(props).length ? { props } : {}) };
      nodes.push(n); byId.set(id, n); elOf.set(el, n); foreign(el, id);
      if (el.extensionElements) skip(el.extensionElements, id, '(an extension)');
      return n;
    };
    const weak = (n, what, key, value) => { (n.ext ??= { bpmn: {} }).bpmn[key] = value; say(n.id, 'weakened', `${what}: kept under ext.bpmn, read as plain`); };
    const pending = []; // [moddle element, model type, from element, to element, parent]
    const groups = [], tagged = [], hosts = []; // groups by their category value; elements naming category values; boundary events' hosts

    // participants, their message flows and artifacts
    const owner = new Map(), queue = [];
    for (const r of defs.rootElements || []) {
      if (r.$type === 'bpmn:Collaboration') {
        for (const p of r.participants || []) {
          const n = add(p, 'bpmn.Participant', null); if (!n) continue;
          tagged.push([p, n]);
          if (p.processRef) {
            owner.set(p.processRef, n);
            const base = p.id + '-process', ref = p.processRef.id;
            if (ref !== base && !(ref.startsWith(base + '-') && /^\d+$/.test(ref.slice(base.length + 1)))) n.props = { ...n.props, processRef: ref };
          }
        }
        for (const f of r.messageFlows || []) pending.push([f, 'bpmn.MessageFlow', f.sourceRef, f.targetRef, null]);
        queue.push([{ artifacts: r.artifacts }, null]);
        for (const x of [...(r.conversations || []), ...(r.conversationLinks || [])]) skip(x, null);
      } else if (r.$type === 'bpmn:Process') queue.push([r, null]);
      else if (r.$type !== 'bpmn:DataStore' && r.$type !== 'bpmn:Category') skip(r, null);
    }
    // a process's lanes are its participant's members, nested by parent; a flow node is in the deepest lane naming it
    const laneOf = new Map(), depth = new Map();
    for (const [proc] of queue) {
      if (proc.$type !== 'bpmn:Process') continue;
      const pool = owner.get(proc), stack = (proc.laneSets || []).flatMap(s => (s.lanes || []).map(l => [l, null, 0])).reverse();
      while (stack.length) {
        const [l, up, d] = stack.pop();
        if (!pool) { skip(l, null, 'of a process with no pool'); continue; }
        const id = idOf(l);
        if (!bxStr(id) || byId.has(id)) { skip(l, pool.id, id ? `has the id ${id}, taken` : 'has no id'); continue; }
        const doc = (l.documentation || []).map(x => x.text).filter(bxStr).join('\n');
        const m = { id, type: 'bpmn.Lane', ...(bxStr(l.name) ? { label: l.name } : {}), ...(up ? { parent: up } : {}), ...(doc ? { props: { documentation: doc } } : {}) };
        (pool.members ??= []).push(m); byId.set(id, m); foreign(l, id);
        for (const f of l.flowNodeRef || []) if (!(depth.get(f) >= d)) { laneOf.set(f, id); depth.set(f, d); }
        if (l.childLaneSet) stack.push(...(l.childLaneSet.lanes || []).map(c => [c, id, d + 1]).reverse());
      }
    }
    // flow elements and artifacts, container by container (iterative: a sub-process queues its own)
    const objects = new Set(), refd = new Set();
    for (let q = 0; q < queue.length; q++) {
      const [c, inner] = queue[q], pool = c.$type === 'bpmn:Process' ? owner.get(c) : null, parent = inner || (pool && pool.id) || null;
      if (c.$type === 'bpmn:Process') foreign(c, c.id || '');
      else for (const s of c.laneSets || []) skip(s, inner, 'of a sub-process');
      for (const el of c.flowElements || []) {
        const t = el.$type, kind = t.replace('bpmn:', ''), at = (pool && laneOf.get(el)) || parent;
        let n = null;
        if (t in BX_TASK) {
          n = add(el, 'bpmn.Task', at, { taskType: BX_TASK[t] in BX_TASK_OUT ? BX_TASK[t] : 'none' });
          if (n && !(BX_TASK[t] in BX_TASK_OUT)) weak(n, `a ${BX_TASK[t]} task`, 'task', BX_TASK[t]);
        } else if (t === 'bpmn:SubProcess' && !el.triggeredByEvent) {
          n = add(el, 'bpmn.SubProcess', at);
          if (n) queue.push([el, n.id]);
        } else if (t === 'bpmn:CallActivity') n = add(el, 'bpmn.CallActivity', at, bxStr(el.calledElement) ? { calledElement: el.calledElement } : {});
        else if (kind in BX_DEFS) {
          const ds = el.eventDefinitions || [], def = ds.length ? BX_DEF[ds[0].$type] : 'none';
          if (ds.length > 1 || !BX_DEFS[kind].includes(def)) { skip(el, at, `with ${ds.map(d => d.$type.replace('bpmn:', '')).join(', ') || 'no definition'}`); continue; }
          const props = { definition: def };
          if (t === 'bpmn:BoundaryEvent') props.cancelActivity = el.cancelActivity !== false;
          n = add(el, `bpmn.${kind}`, at, props);
          if (n && el.attachedToRef) hosts.push([n, el.attachedToRef]);
          const time = ds[0] && ['timeDate', 'timeDuration', 'timeCycle'].filter(k => ds[0][k]).map(k => [k, ds[0][k].body ?? '']);
          if (n && time && time.length) weak(n, `a timer's ${time.map(x => x[0]).join(', ')}`, 'timer', Object.fromEntries(time));
        } else if (t === 'bpmn:ExclusiveGateway' || t === 'bpmn:ParallelGateway') {
          n = add(el, `bpmn.${kind}`, at);
          if (n && el.default) weak(n, 'a gateway\'s default flow', 'default', idOf(el.default));
        } else if (t === 'bpmn:DataObjectReference') {
          n = add(el, 'bpmn.DataObject', parent, {}, bxStr(el.name) || (el.dataObjectRef && el.dataObjectRef.name));
          if (el.dataObjectRef) refd.add(el.dataObjectRef);
        } else if (t === 'bpmn:DataObject') { objects.add([el, parent]); continue; }
        else if (t === 'bpmn:DataStoreReference') {
          const s = el.dataStoreRef, ref = s && (bxStr(s.name) || s.id);
          n = add(el, 'bpmn.DataStoreReference', parent, ref ? { dataStoreRef: ref } : {});
        } else if (t === 'bpmn:SequenceFlow') {
          pending.push([el, 'bpmn.SequenceFlow', el.sourceRef, el.targetRef, parent]);
          if (el.conditionExpression) pending.at(-1).push(['a condition', 'condition', el.conditionExpression.body ?? '']);
          continue;
        } else { skip(el, at); continue; }
        if (!n) continue;
        tagged.push([el, n]);
        if (el.loopCharacteristics) skip(el.loopCharacteristics, n.id, '(a marker outside the subset)');
        const ends = new Set((el.dataInputAssociations || []).map(a => a.targetRef)); // the writer's placeholder ends
        for (const x of [el.ioSpecification, el.inputSet, el.outputSet, ...(el.properties || []), ...(el.dataInputs || []), ...(el.dataOutputs || [])]) if (x && !ends.has(x)) skip(x, n.id);
        for (const a of el.dataInputAssociations || []) pending.push([a, 'bpmn.DataAssociation', (a.sourceRef || [])[0], el, null]);
        for (const a of el.dataOutputAssociations || []) pending.push([a, 'bpmn.DataAssociation', el, a.targetRef, null]);
      }
      for (const a of c.artifacts || []) {
        if (a.$type === 'bpmn:TextAnnotation') { const n = add(a, 'bpmn.TextAnnotation', parent, {}, a.text); if (n) tagged.push([a, n]); }
        else if (a.$type === 'bpmn:Group') {
          const n = add(a, 'bpmn.Group', parent, {}, a.categoryValueRef && a.categoryValueRef.value);
          if (n && a.categoryValueRef) groups.push([a.categoryValueRef, n.id]);
        } else if (a.$type === 'bpmn:Association') pending.push([a, 'bpmn.Association', a.sourceRef, a.targetRef, null]);
        else skip(a, parent);
      }
    }
    for (const [o, parent] of objects) if (!refd.has(o)) add(o, 'bpmn.DataObject', parent);
    for (const [n, h] of hosts) { // a boundary event's host is an activity read, else it is said
      const a = elOf.get(h);
      if (a && BX_ACTIVITY.has(a.type)) n.props.attachedTo = a.id;
      else say(n.id, 'skipped', `its host ${idOf(h) || '(no id)'} is not read: attachedTo not read`);
    }
    // the groups an element is in: its category values', or for an artifact its umlimator:groups
    const groupOf = new Map(groups);
    for (const [el, n] of tagged) {
      const vals = el.categoryValueRef || (attr(el, 'groups') || '').split(' ').map(v => elementsById && elementsById[v]).filter(Boolean);
      const ids = [...new Set(vals.map(v => groupOf.get(v)).filter(Boolean))];
      if (ids.length) n.props = { ...n.props, categoryValueRef: ids };
    }
    // lines, once every node is known: an end that is not read is said
    for (const [el, type, a, b, , w] of pending) {
      const id = idOf(el), from = a && elOf.get(a), to = b && elOf.get(b);
      if (!from || !to) { skip(el, null, `whose ${!from ? 'source' : 'target'} is not read`); continue; }
      if (!bxStr(id) || byId.has(id)) { skip(el, null, id ? `has the id ${id}, taken` : 'has no id'); continue; }
      const doc = (el.documentation || []).map(x => x.text).filter(bxStr).join('\n'), props = {};
      if (doc) props.documentation = doc;
      if (type === 'bpmn.Association' && el.associationDirection && el.associationDirection !== 'None') props.direction = el.associationDirection.toLowerCase();
      const e = { id, type, from: from.id, to: to.id, ...(bxStr(el.name) && type.endsWith('Flow') ? { label: el.name } : {}), ...(Object.keys(props).length ? { props } : {}) };
      edges.push(e); byId.set(id, e); foreign(el, id);
      if (w) weak(e, w[0], w[1], w[2]);
      if ((el.categoryValueRef || []).length) {
        (e.ext ??= { bpmn: {} }).bpmn.categoryValueRef = el.categoryValueRef.map(v => v.id);
        say(id, 'skipped', 'its groups (categoryValueRef, which row 24 gives no line): kept under ext.bpmn, not read');
      }
    }
    // views: one per diagram, its shapes in order; what no plane shows goes to the first
    const shown = new Set(), seen = new Set(), first = new Map(); // nodes in a plane; view ids; a node -> the first two views showing it
    let placed = false;
    for (const d of defs.diagrams || []) {
      const plane = d.plane || {}, id = idOf(d);
      if (!bxStr(id) || seen.has(id)) { skip(d, null, id ? `has the id ${id}, taken` : 'has no id'); continue; }
      const subject = plane.bpmnElement && elOf.get(plane.bpmnElement), v = { id, diagram: 'bpmn', ...(bxStr(d.name) ? { title: d.name } : {}), parent: null, nodeIds: [] };
      if (subject && subject.type === 'bpmn.SubProcess') { v.subject = subject.id; subject.opensView ??= id; }
      const ids = new Set();
      for (const s of plane.planeElement || []) {
        placed = true;
        const n = s.bpmnElement && elOf.get(s.bpmnElement);
        if (s.$type === 'bpmndi:BPMNShape' && n && !ids.has(n.id)) { ids.add(n.id); v.nodeIds.push(n.id); shown.add(n.id); const f = first.get(n.id) || []; if (f.length < 2) first.set(n.id, [...f, v]); }
      }
      views.push(v); seen.add(id);
    }
    for (const v of views) if (v.subject) { // the first other view that shows its subject
      const w = (first.get(v.subject) || []).find(x => x !== v);
      v.parent = w ? w.id : null;
    }
    if (placed) say('', 'skipped', 'positions and sizes in the diagram interchange are not kept: umlimator lays each view out (R5)');
    if (!views.length) {
      views.push({ id: BX_VIEW, diagram: 'bpmn', parent: null, nodeIds: [] });
      if (nodes.length) say('', 'skipped', `no diagram interchange: every element is in one view, ${BX_VIEW}`);
    }
    for (const n of nodes) if (!shown.has(n.id)) views[0].nodeIds.push(n.id);
  } catch (e) { // moddle's parser or handlers, or a getter, threw (a RangeError at depth among them): nothing is kept
    nodes.length = edges.length = views.length = skipped.length = 0;
    say('', 'skipped', `the file could not be read (${bxMsg(e)}): nothing read`);
  }
  return result();
}

async function writeBpmnXml(model, viewId, geo, moddle) {
  const report = [];
  let more = 0;
  const say = (line, message) => { if (report.length < BX_MAX) report.push({ line, status: 'skipped', message: `${message}: not written` }); else more++; };
  const result = xml => {
    if (more) report.push({ line: '', status: 'skipped', message: `${more} more items like these: not listed` });
    return { xml, report };
  };
  try {
    if (!moddle || typeof moddle.create !== 'function') { say('', 'no bpmn-moddle instance given (npm install bpmn-moddle@10.3.1)'); return result(''); }
    const M = (type, props) => { const el = moddle.create(type); for (const [k, v] of Object.entries(props)) if (v != null) el[k] = v; return el; };
    const all = (model && model.nodes) || [], nodes = all.filter(n => n && typeof n.type === 'string' && n.type.startsWith('bpmn.'));
    const edges = ((model && model.edges) || []).filter(e => e && typeof e.type === 'string' && e.type.startsWith('bpmn.'));
    const views = ((model && model.views) || []).filter(v => v && v.diagram === 'bpmn'), root = views.findIndex(v => v.id === model.root);
    if (root > 0) views.unshift(...views.splice(root, 1)); // a reader takes the first diagram for the root
    if (all.length > nodes.length) say('', `elements of other diagrams (${all.length - nodes.length})`);
    if (model && model.views && model.views.length > views.length) say('', `views of other diagrams (${model.views.length - views.length})`);
    if (model && model.ext && model.ext.bpmn) say('', 'what the model keeps under ext.bpmn (elements a reader skipped)');
    const pools = nodes.filter(n => n.type === 'bpmn.Participant'), members = pools.flatMap(p => (p.members || []).filter(m => m && m.type === 'bpmn.Lane').map(m => [m, p]));
    // ids: a model id that is an XML name is the element's; the others escaped, after them, so none takes a model's id
    const used = new Set(), xid = new Map(), ok = id => typeof id === 'string' && /^[A-Za-z_][\w.-]*$/.test(id);
    const free = base => { let id = base, k = 1; while (used.has(id)) id = `${base}-${++k}`; used.add(id); return id; };
    const things = [...nodes, ...members.map(x => x[0]), ...edges, ...views];
    for (const x of things) if (ok(x.id) && !used.has(x.id)) { used.add(x.id); xid.set(x, x.id); }
    for (const x of things) if (!xid.has(x)) xid.set(x, free('_' + [...String(x.id)].map(c => (/[A-Za-z0-9.-]/.test(c) ? c : `_${c.codePointAt(0).toString(16)}_`)).join('')));
    const els = new Map(), byId = new Map(nodes.map(n => [n.id, n])), laneOf = new Map(members.map(([m, p]) => [m.id, [m, p]]));
    const mk = (type, x, props = {}) => {
      const el = M(type, { id: xid.get(x), ...props }), doc = x.props && x.props.documentation;
      if (el.id !== x.id) el.$attrs['umlimator:id'] = String(x.id);
      if (bxStr(doc)) el.documentation = [M('bpmn:Documentation', { text: doc })];
      for (const k of Object.keys(x)) if (!BX_FIELDS.has(k)) say(x.id, k);
      for (const k of Object.keys(x.props || {})) if (!bxProp(x.type, k)) say(x.id, `props.${k}`);
      if (x.ext && x.ext.bpmn) say(x.id, 'what it keeps under ext.bpmn');
      return el;
    };
    // containers: a participant's process, made when something sits in it; a sub-process; the process for no pool
    const roots = [], procs = new Map(), stores = new Map();
    const collab = pools.length ? M('bpmn:Collaboration', { id: free('collaboration'), participants: [], messageFlows: [], artifacts: [] }) : null;
    let loose = null;
    const proc = p => {
      if (!p) return loose ??= (roots.push(M('bpmn:Process', { id: free('process'), flowElements: [], artifacts: [] })), roots.at(-1));
      if (!procs.has(p)) {
        const r = p.props && p.props.processRef;
        const base = `${xid.get(p)}-process`, id = free(ok(r) ? r : base);
        if (r && !ok(r)) say(p.id, 'props.processRef, which is not an XML name');
        else if (r && id !== r) say(p.id, `props.processRef ${r}, an id already taken (written as ${id})`);
        else if (r && r.startsWith(base + '-') && /^\d+$/.test(r.slice(base.length + 1))) say(p.id, `props.processRef ${r}, which a reader takes for ${base} made unique`);
        procs.set(p, M('bpmn:Process', { id, flowElements: [], artifacts: [] })); roots.push(procs.get(p));
        els.get(p).processRef = procs.get(p);
      }
      return procs.get(p);
    };
    const holder = n => { // the process or sub-process n sits in (lanes are its pool's), or null at the top
      for (let up = n.parent, k = 0; up != null && k <= all.length; k++) {
        if (laneOf.has(up)) return proc(laneOf.get(up)[1]);
        const q = byId.get(up);
        if (!q) return null;
        if (q.type === 'bpmn.Participant') return proc(q);
        if (q.type === 'bpmn.SubProcess') return els.get(q);
        up = q.parent;
      }
      return null;
    };
    for (const n of nodes) {
      const t = n.type, k = t.slice(5), pr = n.props || {};
      if (t === 'bpmn.Task') els.set(n, mk(BX_TASK_OUT[pr.taskType] || 'bpmn:Task', n, { name: n.label }));
      else if (t === 'bpmn.DataObject') els.set(n, mk('bpmn:DataObjectReference', n, { name: n.label }));
      else if (t === 'bpmn.TextAnnotation') els.set(n, mk('bpmn:TextAnnotation', n, { text: n.label }));
      else if (t === 'bpmn.Group') {
        const el = mk('bpmn:Group', n), value = M('bpmn:CategoryValue', { id: free(`${el.id}-value`), value: n.label });
        roots.push(M('bpmn:Category', { id: free(`${el.id}-category`), categoryValue: [value] })); el.categoryValueRef = value; els.set(n, el);
      } else if (BX_SAME.has(k)) {
        const el = mk(`bpmn:${k}`, n, { name: n.label, ...(k === 'SubProcess' ? { flowElements: [], artifacts: [] } : {}) });
        if (k in BX_DEFS) {
          const def = pr.definition || 'none';
          if (!BX_DEFS[k].includes(def)) say(n.id, `the definition ${def}, which a ${k} may not take`);
          else if (def !== 'none') el.eventDefinitions = [M(BX_DEF_OUT[def], {})];
          if (k === 'BoundaryEvent' && pr.cancelActivity === false) el.cancelActivity = false;
        }
        if (k === 'CallActivity' && bxStr(pr.calledElement)) el.calledElement = pr.calledElement;
        if (k === 'DataStoreReference' && bxStr(pr.dataStoreRef)) {
          if (!stores.has(pr.dataStoreRef)) { stores.set(pr.dataStoreRef, M('bpmn:DataStore', { id: free(`${el.id}-store`), name: pr.dataStoreRef })); roots.push(stores.get(pr.dataStoreRef)); }
          el.dataStoreRef = stores.get(pr.dataStoreRef);
        }
        els.set(n, el);
      } else say(n.id, `${t}, outside the subset`);
    }
    for (const [m] of members) els.set(m, mk('bpmn:Lane', m, { name: m.label, flowNodeRef: [] }));
    const el = id => els.get(byId.get(id) || (laneOf.get(id) || [])[0]);
    const ring = new Set(); // lanes whose parents lead round to them: written at the top of their pool
    for (const [m, p] of members) {
      let up = m.parent;
      for (let k = 0; k <= members.length && up !== m.id && laneOf.has(up) && laneOf.get(up)[1] === p; k++) up = laneOf.get(up)[0].parent;
      if (up === m.id) { ring.add(m); say(m.id, `parent ${m.parent}, which leads round to this lane (written at the top of its pool)`); }
    }
    const upOf = m => (ring.has(m) ? null : m.parent);
    // place each node; a flow node in a lane is named by it and every lane around it
    for (const n of nodes) {
      const e = els.get(n); if (!e) continue;
      const groups = bxProp(n.type, 'categoryValueRef') ? ((n.props && n.props.categoryValueRef) || []).map(g => el(g) && el(g).categoryValueRef).filter(Boolean) : [];
      if (groups.length && e.$descriptor.properties.some(p => p.name === 'categoryValueRef')) e.categoryValueRef = groups;
      else if (groups.length) e.$attrs['umlimator:groups'] = groups.map(g => g.id).join(' ');
      if (n.type === 'bpmn.Participant') { collab.participants.push(e); if (n.props && n.props.processRef || (n.members || []).length) proc(n); continue; }
      if (BX_LOOSE.has(n.type) && laneOf.has(n.parent)) say(n.id, `parent ${n.parent}, a lane, which BPMN gives no ${n.type.slice(5)} (written in its pool)`);
      const c = holder(n), art = n.type === 'bpmn.TextAnnotation' || n.type === 'bpmn.Group';
      if (art) (c || collab || proc(null)).artifacts.push(e);
      else {
        (c || proc(null)).flowElements.push(e);
        if (n.type === 'bpmn.DataObject') { e.dataObjectRef = M('bpmn:DataObject', { id: free(`${e.id}-object`) }); (c || proc(null)).flowElements.push(e.dataObjectRef); }
      }
      if (n.type === 'bpmn.BoundaryEvent' && n.props && el(n.props.attachedTo)) e.attachedToRef = el(n.props.attachedTo);
      for (let l = laneOf.get(n.parent), k = 0; l && k <= members.length; l = laneOf.get(upOf(l[0])), k++) els.get(l[0]).flowNodeRef.push(e);
    }
    for (const p of pools) { // lane sets, nested by parent, in members order
      const ms = members.filter(x => x[1] === p).map(x => x[0]); if (!ms.length) continue;
      const own = new Set(ms.map(m => m.id)), set = (ls, base) => (ls.length ? M('bpmn:LaneSet', { id: free(`${base}-lanes`), lanes: ls.map(m => els.get(m)) }) : null);
      proc(p).laneSets = [set(ms.filter(m => !own.has(upOf(m))), xid.get(p))];
      for (const m of ms) { const s = set(ms.filter(c => upOf(c) === m.id), xid.get(m)); if (s) els.get(m).childLaneSet = s; }
    }
    // lines: each where BPMN keeps it
    const lines = new Map();
    for (const e of edges) {
      const a = byId.get(e.from), b = byId.get(e.to), A = a && els.get(a), B = b && els.get(b), pr = e.props || {};
      if (!A || !B) { say(e.id, `${e.type} whose ${A ? 'target' : 'source'} is not written`); continue; }
      let x = null;
      if (e.type === 'bpmn.SequenceFlow') { x = mk('bpmn:SequenceFlow', e, { name: e.label, sourceRef: A, targetRef: B }); (holder(a) || proc(null)).flowElements.push(x); }
      else if (e.type === 'bpmn.MessageFlow') {
        if (!collab) { say(e.id, 'a message flow in a model with no participant'); continue; }
        collab.messageFlows.push(x = mk('bpmn:MessageFlow', e, { name: e.label, sourceRef: A, targetRef: B }));
      } else if (e.type === 'bpmn.Association') {
        x = mk('bpmn:Association', e, { sourceRef: A, targetRef: B, associationDirection: { one: 'One', both: 'Both' }[pr.direction] });
        const at = [a, b].find(n => n.type === 'bpmn.TextAnnotation') || a;
        (holder(at) || collab || proc(null)).artifacts.push(x);
      } else if (e.type === 'bpmn.DataAssociation') {
        const data = n => n.type === 'bpmn.DataObject' || n.type === 'bpmn.DataStoreReference';
        const takes = (n, dir) => BX_ACTIVITY.has(n.type) || (dir === 'in' ? ['bpmn.EndEvent', 'bpmn.IntermediateThrowEvent'] : ['bpmn.StartEvent', 'bpmn.IntermediateCatchEvent', 'bpmn.BoundaryEvent']).includes(n.type);
        if (data(a) && takes(b, 'in')) {
          const target = BX_ACTIVITY.has(b.type) ? M('bpmn:Property', { id: free(`${xid.get(e)}-target`), name: '__targetRef_placeholder' }) : M('bpmn:DataInput', { id: free(`${xid.get(e)}-target`) });
          (BX_ACTIVITY.has(b.type) ? (B.properties ??= []) : (B.dataInputs ??= [])).push(target);
          (B.dataInputAssociations ??= []).push(x = mk('bpmn:DataInputAssociation', e, { sourceRef: [A], targetRef: target }));
        } else if (data(b) && takes(a, 'out')) (A.dataOutputAssociations ??= []).push(x = mk('bpmn:DataOutputAssociation', e, { targetRef: B }));
        else { say(e.id, 'a data association against BPMN\'s direction (data-ends)'); continue; }
      } else { say(e.id, `${e.type}, outside the subset`); continue; }
      if (e.label != null && (e.type === 'bpmn.Association' || e.type === 'bpmn.DataAssociation')) say(e.id, 'label, which BPMN gives no association');
      lines.set(e, x);
    }
    // what a reader derives from the diagrams, against the model: a view's subject (a sub-process), its parent (the first
    // other view showing its subject), a sub-process's opensView (the first view with it as subject), a node in no view
    const sub = v => { const s = byId.get(v.subject); return s && s.type === 'bpmn.SubProcess' && els.get(s) ? s : null; };
    const opens = new Map(), showing = new Map(); // a sub-process -> the view it opens; a node -> the first two views showing it
    for (const v of views) {
      if (sub(v) && !opens.has(v.subject)) opens.set(v.subject, v.id);
      for (const id of v.nodeIds || []) { const f = showing.get(id) || []; if (f.length < 2 && !f.includes(v)) showing.set(id, [...f, v]); }
    }
    for (const v of views) {
      if (v.subject != null && !sub(v)) say(v.id, `the view's subject ${v.subject}, which is no sub-process written`);
      const w = sub(v) && (showing.get(v.subject) || []).find(x => x !== v), parent = w ? w.id : null;
      if ((v.parent ?? null) !== parent) say(v.id, `the view's parent ${v.parent ?? null} (a reader takes ${parent} from its subject)`);
      for (const id of v.nodeIds || []) if (!els.get(byId.get(id))) say(v.id, `the view's node ${id}, which is no element written`);
    }
    for (const n of nodes) {
      if ((n.opensView ?? null) !== (opens.get(n.id) ?? null)) say(n.id, `opensView ${n.opensView ?? 'none'} (a reader takes ${opens.get(n.id) ?? null}, the first view with it as subject)`);
      if (els.get(n) && views.length && !showing.has(n.id)) say(n.id, `in no view (a reader puts it in the first, ${views[0].id})`);
    }
    // diagram interchange: a diagram per view, viewId's from geo, the others on a plain grid
    const G = new Map(((geo && geo.nodes) || []).map(g => [g.id, g])), GE = new Map(((geo && geo.edges) || []).map(g => [g.id, g]));
    const diagrams = views.map(v => {
      for (const k of Object.keys(v)) if (!['id', 'diagram', 'title', 'parent', 'subject', 'nodeIds'].includes(k)) say(v.id, `the view's ${k}`);
      const box = new Map(), ids = new Set(v.nodeIds || []), planeElement = [], mine = v.id === viewId;
      const shape = (x, more) => {
        const g = mine && G.get(x.id), [w, h] = BX_SIZE[x.type] || (bxEvent(x.type) ? [36, 36] : [100, 80]), k = box.size;
        const b = g ? { x: g.x, y: g.y, w: g.w, h: g.h } : { x: 40 + (k % 8) * 180, y: 40 + Math.floor(k / 8) * 140, w, h };
        box.set(x.id, b);
        planeElement.push(M('bpmndi:BPMNShape', { id: free(`${els.get(x).id}_di`), bpmnElement: els.get(x), ...more,
          bounds: M('dc:Bounds', { x: b.x, y: b.y, width: b.w, height: b.h }) }));
      };
      for (const id of v.nodeIds || []) {
        const n = byId.get(id); if (!n || !els.get(n) || box.has(id)) continue;
        shape(n, n.type === 'bpmn.Participant' ? { isHorizontal: true } : n.type === 'bpmn.SubProcess' ? { isExpanded: nodes.some(c => c.parent === id && ids.has(c.id)) } : {});
        if (n.type === 'bpmn.Participant') for (const [m] of members.filter(x => x[1] === n)) shape(m, { isHorizontal: true });
      }
      for (const [e, x] of lines) {
        const a = box.get(e.from), b = box.get(e.to), g = mine && GE.get(e.id); if (!a || !b) continue;
        const pts = g && Array.isArray(g.pts) && g.pts.length > 1 ? g.pts : [[a.x + a.w / 2, a.y + a.h / 2], [b.x + b.w / 2, b.y + b.h / 2]];
        planeElement.push(M('bpmndi:BPMNEdge', { id: free(`${x.id}_di`), bpmnElement: x, waypoint: pts.map(([px, py]) => M('dc:Point', { x: px, y: py })) }));
      }
      const subject = v.subject && byId.get(v.subject), d = M('bpmndi:BPMNDiagram', { id: xid.get(v), name: v.title });
      if (d.id !== v.id) d.$attrs['umlimator:id'] = String(v.id);
      d.plane = M('bpmndi:BPMNPlane', { id: free(`${d.id}-plane`), bpmnElement: (subject && els.get(subject)) || collab || proc(null), planeElement });
      return d;
    });
    if (collab) roots.unshift(collab);
    const defs = M('bpmn:Definitions', { id: free('definitions'), name: model && bxStr(model.title), targetNamespace: BX_NS, exporter: 'umlimator', rootElements: roots, diagrams });
    defs.$attrs['xmlns:umlimator'] = BX_NS;
    return result((await moddle.toXML(defs, { format: true })).xml);
  } catch (e) {
    say('', `the model (${bxMsg(e)})`);
    return result('');
  }
}

export { readBpmnXml, writeBpmnXml };
