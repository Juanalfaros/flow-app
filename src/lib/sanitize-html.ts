// Sanea el HTML de `nodes.description` antes de inyectarlo en el DOM vía
// `dangerouslySetInnerHTML` — hoy el único lugar del repo que lo hace es
// PublicLinkView.tsx (la página pública de un link compartido, SIN
// sesión). El resto de la app nunca necesitó esto: TaskDescriptionEditor
// monta el mismo HTML dentro de TipTap, que lo parsea contra su propio
// schema y descarta lo que no declara — un saneado "gratis" por
// construcción del editor. Acá no hay editor de por medio, así que el
// saneado hay que hacerlo a mano.
//
// `description` es una columna de texto que el cliente escribe DIRECTO
// contra PostgREST, sin pasar por el Worker ni por ninguna validación
// server-side — no alcanza con "confiar en que vino del editor":
// cualquier miembro del workspace con acceso a la tarea puede mandar un
// PATCH a mano con HTML arbitrario. Y ese HTML termina en una página
// PÚBLICA, sin sesión, en el mismo origen donde supabase-js guarda el
// token de sesión en localStorage — el peor lugar posible para un XSS
// (toma de cuenta de quien sea que abra el link, empezando por el propio
// admin que lo generó).
//
// Allowlist construida leyendo el código fuente de cada extensión de
// TipTap realmente usada en TaskDescriptionEditor.tsx: StarterKit v3
// (que en v3 ya incluye Link y Underline, a diferencia de v2), TaskList/
// TaskItem, Highlight (sin `multicolor`, así que nunca produce
// atributos), Typography (solo reemplazos de texto, sin tags nuevos).
//
// `DOMParser` con 'text/html' nunca ejecuta <script> ni pide recursos —
// a diferencia de asignar HTML crudo a un nodo ya insertado en el DOM
// real, es la forma estándar de parsear HTML no confiable sin riesgo.
const ALLOWED_ATTRS: Record<string, string[]> = {
  ul: ['data-type'],
  li: ['data-type', 'data-checked'],
}

// Sin hijos (TipTap nunca los produce con contenido, y aceptar hijos acá
// no sumaría nada útil).
const VOID_TAGS = new Set(['br', 'hr'])

const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  's',
  'u',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'mark',
  'a',
  'label',
  'span',
  'div',
  ...VOID_TAGS,
])

// No basta con bloquear `javascript:` — `data:text/html` también ejecuta
// y `blob:` hereda el origen. Allowlist explícita en vez de blocklist.
const ALLOWED_HREF_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function isSafeHref(href: string): boolean {
  try {
    // Base ficticia: si `href` ya es absoluta, la base no pesa; si es
    // relativa (p. ej. "/p/123"), también resuelve segura.
    return ALLOWED_HREF_PROTOCOLS.has(new URL(href, 'https://safe-base.invalid').protocol)
  } catch {
    return false
  }
}

function sanitizeChildren(source: Element, target: Element, doc: Document): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(doc.createTextNode(child.textContent ?? ''))
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue // comments, etc. — se descartan

    const el = child as Element
    const tag = el.tagName.toLowerCase()

    if (tag === 'input') {
      // Único caso especial: el checkbox inerte de TaskItem
      // (li[data-type="taskItem"] > label > input + span). Se reconstruye
      // desde cero, nunca se copian atributos del original — `checked` es
      // lo único que importa, y queda forzado deshabilitado: esta página
      // es de solo lectura.
      const input = doc.createElement('input')
      input.setAttribute('type', 'checkbox')
      input.setAttribute('disabled', '')
      if (el.hasAttribute('checked') || el.getAttribute('data-checked') === 'true') {
        input.setAttribute('checked', '')
      }
      target.appendChild(input)
      continue
    }

    if (!ALLOWED_TAGS.has(tag)) continue // tag entero descartado, incluidos sus hijos

    const clean = doc.createElement(tag)
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? ''
      if (isSafeHref(href)) {
        clean.setAttribute('href', href)
        // Forzado siempre, nunca copiado del original: mismo default que
        // ya usa el propio Link de TipTap al renderizar.
        clean.setAttribute('target', '_blank')
        clean.setAttribute('rel', 'noopener noreferrer nofollow')
      }
      const title = el.getAttribute('title')
      if (title) clean.setAttribute('title', title)
    } else {
      for (const attr of ALLOWED_ATTRS[tag] ?? []) {
        const value = el.getAttribute(attr)
        if (value !== null) clean.setAttribute(attr, value)
      }
    }

    if (!VOID_TAGS.has(tag)) sanitizeChildren(el, clean, doc)
    target.appendChild(clean)
  }
}

export function sanitizeDescriptionHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const container = doc.createElement('div')
  sanitizeChildren(doc.body, container, doc)
  return container.innerHTML
}
