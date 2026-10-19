const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('../../node_modules/typescript')

function loadTs(file, modules, globals = {}) {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(source, {
    exports, require: name => {
      if (!(name in modules)) throw new Error(`Missing test module: ${name}`)
      return modules[name]
    }, Date, Error, TypeError, Set, Map, WeakMap, WeakSet, Promise, AbortController,
    setTimeout, clearTimeout, setInterval, clearInterval, console, ...globals,
  }, { filename: file })
  return exports
}

// A small lifecycle runner for the actual providers; network and device adapters
// are injected, while their effects, dependency changes and state races execute.
function hooks() {
  const slots = []
  let cursor = 0, dirty = true, stopped = false, component, value
  const effects = []
  const changed = (old, next) => !old || old.length !== next.length || next.some((v, i) => !Object.is(v, old[i]))
  const react = {
    createContext: () => ({ Provider: {} }),
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = initial
      return [slots[i], next => {
        if (stopped) return
        const updated = typeof next === 'function' ? next(slots[i]) : next
        if (!Object.is(slots[i], updated)) { slots[i] = updated; dirty = true }
      }]
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useMemo(fn, deps) {
      const i = cursor++
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: fn() }
      return slots[i].value
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const i = cursor++
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const previous = slots[i]
        slots[i] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn() })
      }
    },
  }
  return {
    modules: { react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) } },
    mount(fn) { component = fn },
    get value() { return value },
    rerender() { dirty = true },
    async flush() {
      for (let turn = 0; turn < 25; turn++) {
        while (dirty) {
          dirty = false; cursor = 0; value = component({ children: null }).props.value
          for (const run of effects.splice(0)) run()
        }
        await new Promise(resolve => setImmediate(resolve))
      }
    },
    stop() { stopped = true; for (const slot of slots) slot?.cleanup?.() },
  }
}

module.exports = { loadTs, hooks }
