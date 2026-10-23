import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Keyboard, ScrollView, TextInput, View, type ScrollViewProps } from 'react-native'

/** Keep screen coordinates in one coordinate system, including bottom sheets. */
export function keyboardScrollAdjustment(
  viewportTop: number, viewportHeight: number, keyboardTop: number | undefined,
  inputTop: number, inputHeight: number,
) {
  const viewportBottom = viewportTop + viewportHeight
  const visibleBottom = Math.min(viewportBottom, keyboardTop ?? viewportBottom)
  const availableHeight = Math.max(0, visibleBottom - viewportTop - 24)
  const inputBottom = inputTop + Math.min(inputHeight, availableHeight)
  const below = inputBottom + 16 - visibleBottom
  const above = inputTop - viewportTop - 12
  return {
    delta: below > 0 ? below : above < 0 ? above : 0,
    extraSpace: Math.max(0, viewportBottom - visibleBottom) + 24,
  }
}

/** Existing form props and refs are forwarded; only focused inputs are moved. */
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(
  { children, onFocus, onBlur, onScroll, onLayout, onContentSizeChange,
    keyboardShouldPersistTaps = 'handled', keyboardDismissMode = 'on-drag', horizontal, ...props },
  forwardedRef,
) {
  const scroll = useRef<ScrollView>(null)
  const scrollY = useRef(0)
  const focused = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null)
  const keyboardTop = useRef<number | undefined>(undefined)
  const allowAdjustment = useRef(false)
  const mounted = useRef(false)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [extraSpace, setExtraSpace] = useState(0)
  useImperativeHandle(forwardedRef, () => scroll.current!, [])

  const reveal = useCallback(() => {
    const input = focused.current
    if (!mounted.current || horizontal || !allowAdjustment.current || !input ||
      TextInput.State.currentlyFocusedInput() !== input) return
    scroll.current?.getNativeScrollRef()?.measureInWindow((_x: number, top: number, _width: number, height: number) => {
      input.measureInWindow((_ix, inputTop, _iw, inputHeight) => {
        // Ignore a delayed measurement after blur, unmount or another screen's focus.
        if (!mounted.current || !allowAdjustment.current || focused.current !== input ||
          TextInput.State.currentlyFocusedInput() !== input || height <= 0) return
        const adjustment = keyboardScrollAdjustment(top, height, keyboardTop.current ?? Keyboard.metrics()?.screenY, inputTop, inputHeight)
        setExtraSpace(value => value === adjustment.extraSpace ? value : adjustment.extraSpace)
        if (Math.abs(adjustment.delta) > 1) {
          scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + adjustment.delta), animated: true })
        }
      })
    })
  }, [horizontal])

  const scheduleReveal = useCallback(() => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(() => { pending.current = null; reveal() }, 80)
  }, [reveal])

  useEffect(() => {
    mounted.current = true
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY
      allowAdjustment.current = true
      scheduleReveal()
    })
    const change = Keyboard.addListener('keyboardDidChangeFrame', event => {
      keyboardTop.current = event.endCoordinates.screenY
      scheduleReveal()
    })
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = undefined
      allowAdjustment.current = false
      if (pending.current) clearTimeout(pending.current)
      pending.current = null
      setExtraSpace(0)
    })
    return () => {
      mounted.current = false
      if (pending.current) clearTimeout(pending.current)
      show.remove(); change.remove(); hide.remove()
    }
  }, [scheduleReveal])

  return <ScrollView {...props} ref={scroll} horizontal={horizontal}
    keyboardShouldPersistTaps={keyboardShouldPersistTaps} keyboardDismissMode={keyboardDismissMode}
    scrollEventThrottle={props.scrollEventThrottle ?? 16}
    onFocus={event => {
      focused.current = TextInput.State.currentlyFocusedInput()
      allowAdjustment.current = true
      scheduleReveal()
      onFocus?.(event)
    }}
    onBlur={event => { focused.current = null; onBlur?.(event) }}
    onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; onScroll?.(event) }}
    onLayout={event => { onLayout?.(event); scheduleReveal() }}
    onContentSizeChange={(width, height) => { onContentSizeChange?.(width, height); scheduleReveal() }}>
    {children}
    {!horizontal && extraSpace > 0 ? <View pointerEvents="none" style={{ height: extraSpace }} /> : null}
  </ScrollView>
})
