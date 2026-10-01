import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  TextStrikethroughIcon,
  HighlighterIcon,
  Heading01Icon,
  Heading02Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  CheckListIcon,
  LeftToRightBlockQuoteIcon,
  CodeIcon,
  Link01Icon,
  Undo02Icon,
  Redo02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface TaskDescriptionEditorProps {
  content: string
  onSave: (html: string) => void
}

export function TaskDescriptionEditor({ content, onSave }: TaskDescriptionEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Agregar descripción…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Typography,
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none px-3 py-2 text-sm focus:outline-none min-h-24',
      },
    },
    onBlur: ({ editor }) => onSave(editor.getHTML()),
  })

  // Si `content` cambia por fuera (ej. al cargar la tarea después del
  // editor ya montado), sincronizar sin disparar onSave.
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  return (
    <div className="rounded-md border border-border bg-bg">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

type IconType = React.ComponentProps<typeof HugeiconsIcon>['icon']

function EditorToolbar({ editor }: { editor: Editor | null }) {
  // `useEditorState` evita re-renderear la toolbar en cada keystroke: solo
  // re-renderiza cuando el resultado del selector realmente cambia (ej. al
  // activar/desactivar negrita), no en cada transacción del editor.
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor) return null
      const e = ctx.editor
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        highlight: e.isActive('highlight'),
        code: e.isActive('code'),
        heading1: e.isActive('heading', { level: 1 }),
        heading2: e.isActive('heading', { level: 2 }),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        taskList: e.isActive('taskList'),
        blockquote: e.isActive('blockquote'),
        link: e.isActive('link'),
        linkHref: e.getAttributes('link').href as string | undefined,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      }
    },
  })

  if (!editor || !state) return null

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
      <ToolbarButton
        icon={TextBoldIcon}
        label="Negrita"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={TextItalicIcon}
        label="Itálica"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={TextUnderlineIcon}
        label="Subrayado"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        icon={TextStrikethroughIcon}
        label="Tachado"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        icon={HighlighterIcon}
        label="Resaltar"
        active={state.highlight}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      />

      <ToolbarSeparator />

      <ToolbarButton
        icon={Heading01Icon}
        label="Título 1"
        active={state.heading1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        icon={Heading02Icon}
        label="Título 2"
        active={state.heading2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />

      <ToolbarSeparator />

      <ToolbarButton
        icon={LeftToRightListBulletIcon}
        label="Lista"
        active={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={LeftToRightListNumberIcon}
        label="Lista numerada"
        active={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={CheckListIcon}
        label="Checklist"
        active={state.taskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <ToolbarButton
        icon={LeftToRightBlockQuoteIcon}
        label="Cita"
        active={state.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={CodeIcon}
        label="Código"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      <ToolbarSeparator />

      <LinkButton editor={editor} active={state.link} href={state.linkHref} />

      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarButton
          icon={Undo02Icon}
          label="Deshacer"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          icon={Redo02Icon}
          label="Rehacer"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>
    </div>
  )
}

function ToolbarSeparator() {
  return <div className="mx-0.5 h-4 w-px bg-border" />
}

function ToolbarButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: IconType
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-pressed={active}
          className={cn(active && 'bg-muted text-foreground')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
        >
          <HugeiconsIcon icon={icon} />
        </Button>
      </TooltipTrigger>
      {/* side="bottom": el default de Radix es "top", que en la pestaña
          Resumen queda pegado justo debajo de las tabs Resumen/Board/…
          — poco espacio vertical arriba del toolbar ahí, a diferencia de
          NodeDetailContent donde el editor no es lo primero de la página.
          Abajo siempre hay lugar (el cuerpo del editor sigue debajo). */}
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function LinkButton({ editor, active, href }: { editor: Editor; active: boolean; href?: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setUrl(href ?? '')
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-pressed={active}
          className={cn(active && 'bg-muted text-foreground')}
          title="Enlace"
        >
          <HugeiconsIcon icon={Link01Icon} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 max-w-[calc(100vw-2rem)] p-2" align="start">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) {
              editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
            } else {
              editor.chain().focus().unsetLink().run()
            }
            setOpen(false)
          }}
        >
          <Input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="h-7 flex-1 text-xs"
          />
          <Button type="submit" size="sm">
            Ok
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
