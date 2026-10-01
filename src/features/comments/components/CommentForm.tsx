import { useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { SentIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCreateCommentMutation } from '@/features/comments/mutations'
import { useWorkspaceMembers } from '@/features/workspace/queries'

interface MentionMatch {
  query: string
  start: number
}

function findMentionMatch(value: string, cursor: number): MentionMatch | null {
  const upToCursor = value.slice(0, cursor)
  const atIndex = upToCursor.lastIndexOf('@')
  if (atIndex === -1) return null
  const between = upToCursor.slice(atIndex + 1)
  // el "@" dejó de estar activo si ya hay un espacio/salto de línea
  // después (el usuario terminó de escribir el token o siguió de largo).
  if (/\s/.test(between)) return null
  return { query: between, start: atIndex }
}

export function CommentForm({
  taskId,
  authorId,
  authorLabel,
  workspaceId,
  parentId,
  onCancel,
  autoFocus,
}: {
  taskId: string
  authorId: string
  authorLabel: string
  workspaceId: string
  /** F5 #5: presente cuando esta instancia es un "Responder a…" inline
   * (ver CommentThreadItem en ActivityCommentThread.tsx), ausente para el
   * composer raíz al pie del hilo. */
  parentId?: string
  /** Solo tiene sentido junto a `parentId` — botón "Cancelar" para
   * cerrar la caja de respuesta sin escribir nada, y auto-cierre al
   * enviar (no tiene sentido dejar el formulario de respuesta abierto
   * después de responder). */
  onCancel?: () => void
  autoFocus?: boolean
}) {
  const [body, setBody] = useState('')
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set())
  const [match, setMatch] = useState<MentionMatch | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mutation = useCreateCommentMutation(taskId, authorId, authorLabel, parentId ?? null)
  const { data: members } = useWorkspaceMembers(workspaceId)

  const suggestions = match
    ? (members ?? []).filter((m) =>
        (m.profile?.full_name ?? '').toLowerCase().includes(match.query.toLowerCase()),
      )
    : []

  function selectMention(member: NonNullable<typeof members>[number]) {
    if (!match || !member.profile?.full_name) return
    const before = body.slice(0, match.start)
    const after = body.slice(match.start + 1 + match.query.length)
    setBody(`${before}@${member.profile.full_name} ${after}`)
    setMentionedIds((prev) => new Set(prev).add(member.user_id))
    setMatch(null)
    textareaRef.current?.focus()
  }

  return (
    <form
      className="relative flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!body.trim()) return
        mutation.mutate(
          { body: body.trim(), mentionedUserIds: [...mentionedIds] },
          { onSuccess: () => onCancel?.() },
        )
        setBody('')
        setMentionedIds(new Set())
      }}
    >
      {/* `items-end`: el botón se ancla al borde inferior de un campo que
          crece con el contenido (`field-sizing-content` en textarea.tsx),
          no debajo de él en una fila propia — reportado con el mismo
          síntoma que motivó form-dialog.tsx: el composer raíz vive al pie
          de un hilo de actividad potencialmente largo, y una fila de
          botones DEBAJO del campo quedaba tapada por el teclado justo al
          terminar de escribir. Con el botón en la misma fila que el campo,
          no hay nada "debajo" que el teclado pueda taparle de más — el
          scroll-to-focus nativo del navegador que ya trae cualquier
          textarea enfocado alcanza para los dos. */}
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            setMatch(findMentionMatch(e.target.value, e.target.selectionStart))
          }}
          placeholder={parentId ? 'Responder…' : 'Agregar un comentario… (@ para mencionar)'}
          // min-w-0: sin esto, un flex item con contenido de ancho
          // intrínseco (un <textarea>) se niega a encogerse por debajo de
          // ese ancho, y el botón de al lado queda empujado fuera de la
          // fila en una pantalla angosta.
          className="min-h-16 min-w-0 flex-1"
        />
        <div className="flex shrink-0 items-center gap-1">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button
            type="submit"
            variant="outline"
            size="icon-sm"
            aria-label={parentId ? 'Responder' : 'Comentar'}
            disabled={mutation.isPending}
          >
            <HugeiconsIcon icon={SentIcon} />
          </Button>
        </div>
      </div>
      {match && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded-md border border-border bg-bg py-1 shadow-md">
          {suggestions.map((m) => (
            <button
              key={m.user_id}
              type="button"
              className="block w-full px-2 py-1 text-left text-sm hover:bg-surface"
              onClick={() => selectMention(m)}
            >
              {m.profile?.full_name}
            </button>
          ))}
        </div>
      )}
    </form>
  )
}
