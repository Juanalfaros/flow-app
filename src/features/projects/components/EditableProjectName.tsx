import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useUpdateProjectMutation } from '@/features/projects/mutations'

export function EditableProjectName({ projectId, name }: { projectId: string; name: string }) {
  const { workspaceId } = useCurrentWorkspace()
  const mutation = useUpdateProjectMutation(workspaceId, projectId)
  const [value, setValue] = useState(name)

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() && value !== name) mutation.mutate(value.trim())
      }}
      aria-label="Nombre de la lista"
      // `w-auto` no alcanza para que un <input> nativo se ajuste al
      // contenido (el browser le aplica su propio ancho por default vía
      // el atributo `size`, ignorando `width: auto` en CSS) — el ancho en
      // `ch` (una unidad ≈ el ancho del carácter "0" en la fuente actual)
      // se recalcula en cada tecla porque depende de `value`.
      // `boxSizing: content-box` es necesario porque Preflight de Tailwind
      // pone `border-box` global — sin esto el padding horizontal (`px-1`)
      // se resta del `width` en vez de sumarse, y el último carácter queda
      // cortado (bug real: "2026" se veía como "202").
      // `maxWidth` es un techo: sin esto, un nombre de proyecto largo
      // expande el input sin límite y empuja el resto de la fila del
      // header (favorito/borrar/tabs) fuera de pantalla en mobile.
      style={{ width: `${Math.max(value.length, 2)}ch`, maxWidth: '50vw', boxSizing: 'content-box' }}
      className="h-auto border-transparent bg-transparent px-1 text-lg font-medium focus-visible:border-ring focus-visible:bg-bg focus-visible:px-2.5"
    />
  )
}
