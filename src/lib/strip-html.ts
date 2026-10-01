// `nodes.description` se guarda como HTML de Tiptap (ver
// TaskDescriptionEditor.tsx, `editor.getHTML()`) — para una preview de
// una línea en TaskRow hace falta texto plano, truncado.
export function stripHtmlPreview(html: string, maxLength = 80): string {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, maxLength).trimEnd()}…`
}
