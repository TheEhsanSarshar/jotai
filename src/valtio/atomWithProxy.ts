import { snapshot, subscribe } from 'valtio/vanilla'
import { atom } from 'jotai'
import type { SetStateAction } from 'jotai'

const isObject = (x: unknown): x is object =>
  typeof x === 'object' && x !== null

const applyChanges = <T extends object>(proxyObject: T, prev: T, next: T) => {
  ;(Object.keys(prev) as (keyof T)[]).forEach((key) => {
    if (!(key in next)) {
      delete proxyObject[key]
    } else if (Object.is(prev[key], next[key])) {
      // unchanged
    } else if (
      isObject(proxyObject[key]) &&
      isObject(prev[key]) &&
      isObject(next[key])
    ) {
      applyChanges(
        proxyObject[key] as unknown as object,
        prev[key] as unknown as object,
        next[key] as unknown as object
      )
    } else {
      proxyObject[key] = next[key]
    }
  })
  ;(Object.keys(next) as (keyof T)[]).forEach((key) => {
    if (!(key in prev)) {
      proxyObject[key] = next[key]
    }
  })
}

// Currently atomWithProxy does not support overwriting Promise() with a primitive
// due to the requirement of valtio types to always be symmetric.
// Consequently, this would not work:
// setStatusState({ ...state, status: 'newStatus' })
// To overwrite a value that came from a promise you must do it via an immediately
// resolving promise:
// setStatusState({ ...state, status: Promise.resolve('newStatus') })
export function atomWithProxy<Value extends object>(proxyObject: Value) {
  const baseAtom = atom(snapshot(proxyObject))
  baseAtom.onMount = (setValue) => {
    const callback = () => {
      setValue(snapshot(proxyObject))
    }
    const unsub = subscribe(proxyObject, callback)
    callback()
    return unsub
  }
  const derivedAtom = atom(
    (get) => {
      baseAtom.scope = derivedAtom.scope
      return get(baseAtom) as Value
    },
    (get, _set, update: SetStateAction<Value>) => {
      baseAtom.scope = derivedAtom.scope
      const newValue =
        typeof update === 'function'
          ? (update as (prev: Value) => Value)(get(baseAtom) as Value)
          : update
      applyChanges(proxyObject, snapshot(proxyObject) as Value, newValue)
    }
  )
  return derivedAtom
}
