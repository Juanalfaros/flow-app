import { useSyncExternalStore } from 'react'

export type Density = 'compact' | 'comfortable'

const KEY = 'flow:density'
const EVENT = 'flow:density-change'

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

function getSnapshot(): Density {
  return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable'
}

export function useDensity(): Density {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'comfortable')
}

export function setDensity(density: Density) {
  localStorage.setItem(KEY, density)
  window.dispatchEvent(new Event(EVENT))
}
