const test = require('node:test')
const assert = require('node:assert/strict')
const { loadTs } = require('./helpers/loadTs.cjs')

function harness({ top = 100, height = 600, horizontal = false } = {}) {
  let cursor = 0, focused = null, keyboardY, tree, timerId = 0, inset = 0
  const slots = [], effects = [], imperative = [], timers = new Map(), listeners = new Map(), calls = []
  const forwarded = { current: null }, forwardedEvents = []
  const react = {
    forwardRef: fn => props => fn(props, forwarded),
    useRef: value => slots[cursor++] ??= { current: value },
    useState: value => {
      const i = cursor++; if (!(i in slots)) slots[i] = value
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; inset = slots[i] }]
    },
    useCallback: fn => { cursor++; return fn },
    useImperativeHandle: (_ref, fn) => { cursor++; imperative.push(() => { forwarded.current = fn() }) },
    useEffect: fn => { const i = cursor++; if (!(i in slots)) { slots[i] = null; effects.push(() => { slots[i] = fn() }) } },
  }
  const keyboard = {
    metrics: () => keyboardY === undefined ? undefined : { screenY: keyboardY },
    addListener: (name, fn) => { listeners.set(name, fn); return { remove: () => listeners.delete(name) } },
  }
  const api = loadTs('src/components/KeyboardAwareScrollView.tsx', {
    react, 'react-native': { Keyboard: keyboard, ScrollView: 'Scroll', View: 'View', TextInput: { State: { currentlyFocusedInput: () => focused } } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  }, {
    setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id),
  })
  const scroll = {
    getNativeScrollRef: () => ({ measureInWindow: fn => fn(0, top, 300, height) }),
    scrollTo: value => calls.push(value),
  }
  tree = api.KeyboardAwareScrollView({ horizontal, children: 'content', testID: 'original', contentContainerStyle: { paddingBottom: 40 },
    onFocus: () => forwardedEvents.push('focus'), onBlur: () => forwardedEvents.push('blur'),
    onScroll: () => forwardedEvents.push('scroll'), onLayout: () => forwardedEvents.push('layout'),
    onContentSizeChange: () => forwardedEvents.push('size'),
  })
  tree.props.ref.current = scroll
  imperative.forEach(fn => fn()); effects.forEach(fn => fn())
  const flush = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn() } }
  function input(y, h = 80, deferred) {
    return { measureInWindow: fn => deferred ? deferred(() => fn(0, y, 200, h)) : fn(0, y, 200, h) }
  }
  return { api, tree, calls, forwarded, forwardedEvents, listeners, flush, input,
    focus(value) { focused = value; tree.props.onFocus({}) },
    otherInput(value) { focused = value },
    show(y) { keyboardY = y; listeners.get('keyboardDidShow')({ endCoordinates: { screenY: y } }) },
    hide() { keyboardY = undefined; listeners.get('keyboardDidHide')() },
    stop() { slots.forEach(value => { if (typeof value === 'function') value() }) },
    get inset() { return inset }, get timers() { return timers.size },
  }
}

test('a covered textarea scrolls above the keyboard with room to reach the end', () => {
  const h = harness(); h.focus(h.input(550)); h.show(500); h.flush()
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].y, 146); assert.equal(h.inset, 224)
  h.stop()
})

test('resize already applied does not add the entire keyboard height a second time', () => {
  const h = harness({ height: 400 }); h.focus(h.input(550)); h.show(500); h.flush()
  assert.equal(h.calls[0].y, 146); assert.equal(h.inset, 24)
  h.stop()
})

test('switching fields while the keyboard stays open uses the new focused input', () => {
  const h = harness(); h.focus(h.input(200)); h.show(500); h.flush(); assert.equal(h.calls.length, 0)
  h.tree.props.onScroll({ nativeEvent: { contentOffset: { y: 100 } } })
  h.focus(h.input(550)); h.flush(); assert.equal(h.calls[0].y, 246)
  h.stop()
})

test('an input already visible is stable, including after layout and multiline changes', () => {
  const h = harness(); h.focus(h.input(200)); h.show(500); h.flush()
  h.tree.props.onLayout({}); h.tree.props.onContentSizeChange(300, 800); h.flush()
  assert.equal(h.calls.length, 0)
  assert.equal(h.forwarded.current, h.tree.props.ref.current)
  assert.equal(h.tree.props.testID, 'original'); assert.equal(h.tree.props.contentContainerStyle.paddingBottom, 40)
  assert.deepEqual(h.forwardedEvents, ['focus', 'layout', 'size'])
  h.stop()
})

test('a delayed measurement never moves another screen or a blurred field', () => {
  const h = harness(); let finish
  h.focus(h.input(550, 80, fn => { finish = fn })); h.show(500); h.flush()
  h.otherInput(h.input(600)); finish(); assert.equal(h.calls.length, 0)
  h.focus(h.input(550)); h.tree.props.onBlur({}); h.flush(); assert.equal(h.calls.length, 0)
  h.stop()
})

test('keyboard dismissal and unmount cancel work and remove added spacing/listeners', () => {
  const h = harness(); h.focus(h.input(550)); h.show(500); h.flush(); assert.ok(h.inset > 0)
  h.tree.props.onLayout({}); h.hide(); h.flush(); assert.equal(h.inset, 0)
  h.tree.props.onLayout({}); h.stop(); h.flush(); assert.equal(h.listeners.size, 0); assert.equal(h.timers, 0)
})

test('horizontal selectors never auto-scroll vertically or add keyboard space', () => {
  const h = harness({ horizontal: true }); h.focus(h.input(550)); h.show(500); h.flush()
  assert.equal(h.calls.length, 0); assert.equal(h.inset, 0)
  h.stop()
})
