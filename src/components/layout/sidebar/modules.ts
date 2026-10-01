import type { IconSvgElement } from '@hugeicons/react'
import {
  Home01Icon,
  InboxIcon,
  CheckListIcon,
  GridViewIcon,
  Calendar01Icon,
  UserGroupIcon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'

// Rediseño de navegación (riel + panel separados): los 7 "módulos" que
// antes eran secciones sueltas de un solo <nav> largo. Lista estática — el
// ícono/label de cada uno no cambia; qué tan activo está SÍ es dinámico
// (ver use-active-module.ts).
export type ModuleId = 'inicio' | 'bandeja' | 'tareas' | 'espacios' | 'vistas' | 'equipo' | 'ajustes'

export interface ModuleDef {
  id: ModuleId
  label: string
  icon: IconSvgElement
  /** Ruta "hogar" del módulo: clickear su ícono en el riel navega ahí Y
   * activa su panel. `undefined` en Espacios a propósito — nunca fue una
   * página, siempre fue el árbol, así que clickearlo solo cambia qué panel
   * se ve. */
  route?: string
  /** Segunda tecla del atajo `g` + inicial (ver use-module-shortcuts.ts).
   * Equipo usa `q` y no `e` porque esa se la lleva Espacios, que se navega
   * mucho más seguido. */
  key: string
}

// Ajustes va separado (con un `rail-sep` antes) y empujado al fondo del
// riel — mismo lugar que ocupa hoy "Configuración" al final del <nav>.
export const RAIL_MODULES: ModuleDef[] = [
  { id: 'inicio', label: 'Inicio', icon: Home01Icon, route: '/', key: 'i' },
  { id: 'bandeja', label: 'Bandeja', icon: InboxIcon, route: '/bandeja', key: 'b' },
  { id: 'tareas', label: 'Mis tareas', icon: CheckListIcon, route: '/mis-tareas', key: 't' },
  { id: 'espacios', label: 'Espacios', icon: GridViewIcon, key: 'e' },
  { id: 'vistas', label: 'Vistas globales', icon: Calendar01Icon, route: '/calendario', key: 'v' },
  { id: 'equipo', label: 'Equipo', icon: UserGroupIcon, route: '/equipo/personas', key: 'q' },
]

export const BOTTOM_MODULE: ModuleDef = {
  id: 'ajustes',
  label: 'Ajustes',
  icon: Settings02Icon,
  route: '/profile',
  key: 'a',
}

/** Los 7 en el orden del riel — para los atajos y para el diálogo de ayuda,
 * que si no tendrían que repetir el `[...RAIL_MODULES, BOTTOM_MODULE]`. */
export const ALL_MODULES: ModuleDef[] = [...RAIL_MODULES, BOTTOM_MODULE]
