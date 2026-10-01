import type { IconSvgElement } from '@hugeicons/react'
import {
  CheckListIcon,
  Folder02Icon,
  Rocket01Icon,
  Briefcase01Icon,
  Target01Icon,
  Building02Icon,
  Globe02Icon,
  PaintBoardIcon,
  Idea01Icon,
  Megaphone01Icon,
  ShoppingCart01Icon,
  Camera01Icon,
  SourceCodeIcon,
  Database01Icon,
  GameController01Icon,
  MusicNote01Icon,
  BookOpen01Icon,
  Flag01Icon,
  Compass01Icon,
  Layers01Icon,
  PuzzleIcon,
  Home01Icon,
  HeartIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

// Nombres persistidos en `custom_fields.appearance.icon` (ver types.ts) —
// cambiar un nombre acá rompe los espacios que ya lo eligieron, agregar es
// seguro.
interface NodeIconPreset {
  name: string
  icon: IconSvgElement
}

// Tupla no vacía: `DEFAULT_NODE_ICON` cae al primer preset como último
// recurso, y con un array llano ese acceso sería opcional — dejando el ícono
// por defecto potencialmente `undefined`, que es justo lo que no puede pasar.
export const NODE_ICON_PRESETS: [NodeIconPreset, ...NodeIconPreset[]] = [
  { name: 'CheckListIcon', icon: CheckListIcon },
  { name: 'Folder02Icon', icon: Folder02Icon },
  { name: 'Rocket01Icon', icon: Rocket01Icon },
  { name: 'Briefcase01Icon', icon: Briefcase01Icon },
  { name: 'Target01Icon', icon: Target01Icon },
  { name: 'Building02Icon', icon: Building02Icon },
  { name: 'Globe02Icon', icon: Globe02Icon },
  { name: 'PaintBoardIcon', icon: PaintBoardIcon },
  { name: 'Idea01Icon', icon: Idea01Icon },
  { name: 'Megaphone01Icon', icon: Megaphone01Icon },
  { name: 'ShoppingCart01Icon', icon: ShoppingCart01Icon },
  { name: 'Camera01Icon', icon: Camera01Icon },
  { name: 'SourceCodeIcon', icon: SourceCodeIcon },
  { name: 'Database01Icon', icon: Database01Icon },
  { name: 'GameController01Icon', icon: GameController01Icon },
  { name: 'MusicNote01Icon', icon: MusicNote01Icon },
  { name: 'BookOpen01Icon', icon: BookOpen01Icon },
  { name: 'Flag01Icon', icon: Flag01Icon },
  { name: 'Compass01Icon', icon: Compass01Icon },
  { name: 'Layers01Icon', icon: Layers01Icon },
  { name: 'PuzzleIcon', icon: PuzzleIcon },
  { name: 'Home01Icon', icon: Home01Icon },
  { name: 'HeartIcon', icon: HeartIcon },
  { name: 'UserGroupIcon', icon: UserGroupIcon },
]

export const NODE_ICON_PRESET_MAP = new Map(NODE_ICON_PRESETS.map((p) => [p.name, p.icon]))

// `NODE_ICON_PRESETS[1]!` no: se toma por nombre, que es estable aunque alguien
// reordene o inserte presets — indexar por posición ataba el default a un
// índice que nada garantiza. El `??` cubre el caso de que ese nombre
// desaparezca, para que el fallback siga siendo un ícono y no `undefined`.
const FALLBACK_ICON_NAME = 'Folder02Icon'
export const DEFAULT_NODE_ICON =
  NODE_ICON_PRESETS.find((p) => p.name === FALLBACK_ICON_NAME) ?? NODE_ICON_PRESETS[0]
