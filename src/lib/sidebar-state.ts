import { useSyncExternalStore } from 'react'
import type { ModuleId } from '@/components/layout/sidebar/modules'

// Reemplaza a `sidebar-collapsed.ts`, que guardaba un solo booleano. Ahora
// el riel tiene dos cosas que recordar y viajan juntas:
//
//   panelOpen — si el panel de contexto está desplegado al lado del riel.
//   module    — qué módulo se eligió a mano, cuando no es el que toca por
//               la ruta. Antes vivía en un useState de use-active-module.ts
//               y se perdía en cada recarga: si estabas en Inicio mirando
//               el panel de Espacios, recargar te devolvía a Inicio.
//
// Los dos en una sola clave: son el estado de la misma pieza de UI, y
// escribirlos por separado obligaba a dos listeners y dos eventos.
const KEY = 'flow:sidebar-state'
// Clave de la versión anterior — se lee una vez para no resetearle el
// sidebar a quien ya lo tenía colapsado.
const LEGACY_COLLAPSED_KEY = 'flow:sidebar-collapsed'
const EVENT = 'flow:sidebar-state-change'

// Banda "tablet": por encima de `md` (768px, el breakpoint que separa la
// tab bar móvil del sidebar fijo — ver AppShell.tsx) pero todavía angosta
// para que el panel abierto (~33% del ancho en un dispositivo de 768-820px)
// le robe demasiado espacio al contenido. Por arriba de 1100px ya hay
// margen de sobra y vuelve a arrancar abierto, como siempre.
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1100px)'

export interface SidebarState {
  /** `null` = sin preferencia explícita todavía: manda la heurística de
   * tablet. Una vez que se toca el botón de colapsar, gana lo elegido sin
   * importar el ancho — esto es un punto de partida, no un candado. */
  panelOpen: boolean | null
  /** `null` = manda la ruta (lo normal). Ver use-active-module.ts. */
  module: ModuleId | null
}

const EMPTY: SidebarState = { panelOpen: null, module: null }

// Una sola instancia por contenido: `useSyncExternalStore` compara el
// snapshot por identidad y vuelve a renderizar en loop si cada llamada
// devuelve un objeto nuevo.
let cached: SidebarState = EMPTY
let cachedRaw: string | null = null

function read(): SidebarState {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // Modo privado o storage bloqueado: el sidebar arranca por defecto y
    // no se recuerda nada. No es motivo para tumbar la app.
    return EMPTY
  }

  if (raw === null) {
    // Migración desde el booleano viejo, una sola vez.
    try {
      const legacy = localStorage.getItem(LEGACY_COLLAPSED_KEY)
      if (legacy !== null) return { panelOpen: legacy !== '1', module: null }
    } catch {
      return EMPTY
    }
    return EMPTY
  }

  if (raw === cachedRaw) return cached
  try {
    const parsed = JSON.parse(raw) as Partial<SidebarState>
    cached = {
      panelOpen: typeof parsed.panelOpen === 'boolean' ? parsed.panelOpen : null,
      module: (parsed.module as ModuleId | null) ?? null,
    }
    cachedRaw = raw
    return cached
  } catch {
    return EMPTY
  }
}

function write(next: SidebarState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Ver el comentario de `read`: perder la preferencia no rompe nada.
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  const mql = window.matchMedia(TABLET_QUERY)
  mql.addEventListener('change', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
    mql.removeEventListener('change', callback)
  }
}

function panelOpenSnapshot(): boolean {
  const { panelOpen } = read()
  if (panelOpen !== null) return panelOpen
  return !window.matchMedia(TABLET_QUERY).matches
}

function moduleSnapshot(): ModuleId | null {
  return read().module
}

/** Si el panel de contexto está desplegado al lado del riel. */
export function useSidebarPanelOpen(): boolean {
  return useSyncExternalStore(subscribe, panelOpenSnapshot, () => true)
}

export function setSidebarPanelOpen(open: boolean) {
  write({ ...read(), panelOpen: open })
}

/** Módulo elegido a mano, o `null` cuando manda la ruta. */
export function useSelectedModule(): ModuleId | null {
  return useSyncExternalStore(subscribe, moduleSnapshot, () => null)
}

export function setSelectedModule(module: ModuleId | null) {
  write({ ...read(), module })
}
