/* Мінімальний фейковий браузер для запуску js/app.js у Node: елементи створюються на льоту за id,
   localStorage — Map, navigator/location/window керовані тестом. Спільний для offline.mjs і cloud.mjs.
   Лежить прямо в tests/ (не у вкладеній папці): структура репозиторію плоска, бо підпапки важко завантажувати з телефона. */

/* Вузол дерева (елемент HTML/SVG): атрибути, діти, обробники — достатньо, щоб перевірити, що намальовано. */
export function makeNode(tag) {
  return {
    tag, attrs: {}, children: [], className: '', textContent: '', value: '', text: '', handlers: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  };
}

/* Усі вузли піддерева, що задовольняють умову (разом із коренем). */
export function findAll(root, pred, out = []) {
  if (!root || typeof root !== 'object') return out;
  if (pred(root)) out.push(root);
  for (const c of root.children || []) findAll(c, pred, out);
  return out;
}
export const hasClass = (n, cls) => ((n.attrs && n.attrs.class) || n.className || '').split(/\s+/).includes(cls);

export function installFakeDom({ groups = {} } = {}) {
  const elements = new Map();
  const winHandlers = {};
  const groupDefs = { '[data-sync-up]': ['btn-sync-up-calc', 'btn-sync-up-info'], ...groups };

  function makeEl(id) {
    let options = [];
    const classes = new Set();
    return {
      id, value: '', innerText: '', textContent: '', dataset: {}, style: {}, handlers: {}, selectedIndex: 0, disabled: false,
      classList: {
        toggle(name, force) { const on = force === undefined ? !classes.has(name) : !!force; if (on) classes.add(name); else classes.delete(name); return on; },
        add(...names) { names.forEach(n => classes.add(n)); },
        remove(...names) { names.forEach(n => classes.delete(n)); },
        contains(name) { return classes.has(name); }
      },
      get options() { return options; },
      set innerHTML(_v) { options = []; },
      appendChild(o) { options.push(o); },
      children: [],
      replaceChildren(...nodes) { this.children = nodes; },
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      removeAttribute(k) { delete this.attrs[k]; }, hasAttribute() { return false; },
      dispatchEvent() {}, closest() { return null; }
    };
  }

  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const fire = async (el, type, target = el) => { for (const fn of el.handlers[type] || []) await fn({ target }); };
  const fireWindow = async type => { for (const fn of winHandlers[type] || []) await fn({ type }); };

  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    get length() { return store.size; },
    key: i => [...store.keys()][i] ?? null
  };
  globalThis.window = globalThis;
  globalThis.window.scrollTo = () => {};
  globalThis.window.addEventListener = (type, fn) => { (winHandlers[type] ||= []).push(fn); };
  globalThis.location = { reloads: 0, reload() { this.reloads++; } };
  globalThis.document = {
    title: '',
    documentElement: { lang: '', setAttribute() {}, getAttribute() { return ''; } },
    getElementById: getEl,
    querySelector: () => null,
    querySelectorAll: sel => (sel === 'input, select' ? [...elements.values()] : (groupDefs[sel] || []).map(getEl)),
    createElement: tag => makeNode(tag),
    createElementNS: (_ns, tag) => makeNode(tag),
    addEventListener() {}
  };
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'uk', onLine: true }, configurable: true, writable: true });

  return { elements, getEl, fire, fireWindow, store, winHandlers };
}
