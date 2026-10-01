import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isToday, isWithinInterval, isYesterday, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { ChevronDownIcon } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BellIcon,
  Building06Icon,
  Calendar01Icon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  Globe02Icon,
  KeyboardIcon,
  LaptopIcon,
  Link01Icon,
  LinkSquare02Icon,
  LockPasswordIcon,
  Mail01Icon,
  Moon02Icon,
  Plug01Icon,
  PlusSignIcon,
  Shield01Icon,
  SmartPhone01Icon,
  TwoFactorAccessIcon,
  Upload01Icon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar'
import { AvatarDropzone } from '@/components/shared/AvatarDropzone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Actions,
  Field,
  FieldGrid,
  Note,
  Pill,
  ReadonlyBox,
  Segmented,
  SettingList,
  SettingRow,
  SettingsSection,
} from '@/features/profile/components/settings-ui'
import { useSession } from '@/features/auth/queries'
import { useProfile, type ProfileRow } from '@/features/profile/queries'
import {
  useUpdateEmailMutation,
  useUpdatePasswordMutation,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
} from '@/features/profile/mutations'
import { useThemePreference } from '@/features/profile/use-theme-preference'
import { useAccountDeletionImpact, useMfaFactors } from '@/features/security/queries'
import { useSignOutOtherSessionsMutation, useUnenrollFactorMutation } from '@/features/security/mutations'
import { downloadAccountExport, type AccountExportType } from '@/features/security/api'
import { TwoFactorEnrollDialog } from '@/features/security/components/TwoFactorEnrollDialog'
import { DeleteAccountDialog } from '@/features/security/components/DeleteAccountDialog'
import { describeAuthError } from '@/features/auth/error-messages'
import { PASSWORD_HINT, PasswordField, describePasswordProblem, passwordStrength } from '@/features/auth/components/PasswordField'
import { useCurrentWorkspace, useInvitations, useSpaces, useWorkspaceMembers } from '@/features/workspace/queries'
import {
  useClearWorkspaceBrandingMutation,
  useInviteMemberMutation,
  useRevokeInvitationMutation,
  useUpdateWorkspaceNameMutation,
  useUploadWorkspaceBrandingMutation,
} from '@/features/workspace/mutations'
import { useTeamsByUser } from '@/features/teams/queries'
import { formatRelativeTime } from '@/lib/format-date'
import type { BrandingKind } from '@/features/workspace/api'
import { processBrandingImage } from '@/features/workspace/branding-image'
import { ROLE_LABEL } from '@/features/workspace/roles'
import { CalendarFeedSection } from '@/features/people/components/CalendarFeedSection'
import { GoogleCalendarSection } from '@/features/people/components/GoogleCalendarSection'
import { describeGoogleCallback, useGoogleConnection } from '@/features/people/google-calendar'
import { usePeople } from '@/features/people/queries'
import { useOnlineUserIds } from '@/features/people/use-workspace-presence'
import { usePersonTimeOff } from '@/features/people/time-off'
import { TimeOffList } from '@/features/people/components/TimeOffList'
import { myTasksQueryOptions } from '@/features/tasks/queries'
import { isDoneStatus } from '@/features/projects/status-kind'
import { setTaskViewMode, useIsTaskViewModeForced, useTaskViewMode, type TaskViewMode } from '@/features/nodes/task-view-mode'
import { setShortcutsDialogOpen } from '@/components/layout/shortcuts-dialog-state'
import { publicLinkUrl, useMyPublicLinks, useRevokeMyPublicLinkMutation } from '@/features/sharing/public-link'
import { PushControls, PushDeviceList } from '@/features/push/components/PushControls'
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_LABEL,
  resolvePreference,
  useNotificationPreferences,
  useSetNotificationPreferenceMutation,
} from '@/features/notifications/preferences'
import { ProfileSkeleton } from '@/components/layout/PageSkeletons'
import { cn } from '@/lib/utils'
import { deriveRailPalette, type RailStyle } from '@/lib/color'
import { initials } from '@/lib/initials'
import { PageShell } from '@/components/layout/PageShell'

// 7 pestañas (rediseño 2026-09-24, artifact "Ajustes de Flow" v2): Seguridad
// sale de lo que antes era "Cuenta" y pasa a tener pestaña propia — 2FA,
// contraseña y el correo de acceso pesaban tanto como el resto de Ajustes
// junto, mezclados con nombre/foto/cargo que no tienen nada que ver. "Cuenta"
// se divide en `perfil` (identidad pública + cargo + ausencias) y
// `seguridad` (todo lo que decide quién puede entrar). Movido arriba del
// `Route` (antes vivía justo encima de ProfilePage) porque `validateSearch`
// ahora necesita el tipo: el panel de Ajustes del sidebar linkea directo a
// una pestaña puntual (`/profile?tab=preferences`), así que la pestaña
// activa pasa de `useState` local a search param — mismo patrón que `tab`
// en routes/_app/mis-tareas.tsx.
type SettingsTab = 'perfil' | 'seguridad' | 'workspace' | 'notifications' | 'preferences' | 'integrations' | 'danger'

const VALID_SETTINGS_TABS: SettingsTab[] = [
  'perfil',
  'seguridad',
  'workspace',
  'notifications',
  'preferences',
  'integrations',
  'danger',
]

interface ProfileSearch {
  tab?: SettingsTab
}

export const Route = createFileRoute('/_app/profile')({
  validateSearch: (search: Record<string, unknown>): ProfileSearch => ({
    tab: VALID_SETTINGS_TABS.includes(search.tab as SettingsTab) ? (search.tab as SettingsTab) : undefined,
  }),
  component: ProfilePage,
})

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Hora en otra zona, respetando `profiles.time_format` (0093). */
function formatTimeInZone(date: Date, timeZone: string, timeFormat: string): string | null {
  try {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    }).format(date)
  } catch {
    return null
  }
}


// Cabecera por pestaña: el título de la página ES la pestaña abierta
// (rediseño 2026-09-25). Antes había un "Mi perfil" fijo que no decía nada
// sobre dónde estabas parado, y cada sección repetía en su propio título lo
// que la pestaña ya nombraba.
const TAB_HEADING: Record<SettingsTab, { title: string; description: string }> = {
  perfil: { title: 'Perfil', description: 'Cómo te ven los demás en tareas, comentarios y el organigrama.' },
  seguridad: { title: 'Seguridad', description: 'Cómo entras a Flow y qué compartiste fuera de él.' },
  notifications: { title: 'Notificaciones', description: 'Qué te interrumpe, por dónde y cuándo.' },
  preferences: { title: 'Preferencias', description: 'Apariencia, región y cómo trabajas en Flow.' },
  integrations: { title: 'Integraciones', description: 'Flow conectado con tu calendario.' },
  danger: { title: 'Zona de peligro', description: 'Acciones que no se pueden deshacer.' },
  workspace: { title: 'Espacio de trabajo', description: 'Quiénes están y cómo se ve el acceso.' },
}

/**
 * Muestra el resultado del callback de Google y limpia el query string.
 *
 * El Worker vuelve a `/profile?google=<estado>` porque el callback es una
 * navegación del navegador y no hay dónde entregar un JSON. Se borra el
 * parámetro después de leerlo: si no, recargar la página repetiría el aviso, y
 * el enlace copiado arrastraría un estado que ya no aplica.
 */
function useGoogleCallbackToast() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('google')
    const result = describeGoogleCallback(status)
    if (!result) return

    if (result.ok) {
      toast.success(result.message)
      void queryClient.invalidateQueries({ queryKey: ['google-connection'] })
      void queryClient.invalidateQueries({ queryKey: ['google-calendar'] })
    } else {
      toast.error(result.message)
    }
    window.history.replaceState(null, '', window.location.pathname)
  }, [queryClient])
}

// 7 secciones reales de Ajustes (rediseño 2026-09-24, artifact "Ajustes de
// Flow" v2) — mismo orden que el mockup. Mismo componente por pestaña que ya
// existía; lo único nuevo es la navegación y el agrupamiento.
const NAV_ITEMS: { id: SettingsTab; label: string; mobileLabel?: string; icon: Parameters<typeof HugeiconsIcon>[0]['icon']; danger?: boolean }[] = [
  { id: 'perfil', label: 'Perfil', icon: UserCircleIcon },
  { id: 'seguridad', label: 'Seguridad', icon: Shield01Icon },
  { id: 'notifications', label: 'Notificaciones', icon: BellIcon },
  { id: 'preferences', label: 'Preferencias', icon: Globe02Icon },
  { id: 'integrations', label: 'Integraciones', icon: Plug01Icon },
  { id: 'danger', label: 'Zona de peligro', mobileLabel: 'Peligro', icon: Delete02Icon, danger: true },
  { id: 'workspace', label: 'Espacio de trabajo', mobileLabel: 'Espacio', icon: Building06Icon },
]

function ProfilePage() {
  const { data: session } = useSession()
  const userId = session?.user.id ?? ''
  const { data: profile, isLoading } = useProfile(userId)
  const { membership, workspaceId } = useCurrentWorkspace()
  const { data: spaces } = useSpaces(workspaceId)
  const { data: members } = useWorkspaceMembers(workspaceId)
  // Search param (no `useState` local): el panel de Ajustes del sidebar
  // (rediseño de navegación) necesita poder linkear directo a una pestaña
  // puntual — `?tab=preferences` — sin pasar primero por "Cuenta".
  const { tab: tabParam } = Route.useSearch()
  const navigate = Route.useNavigate()
  const tab = tabParam ?? 'perfil'
  const setTab = (next: SettingsTab) => navigate({ search: (prev) => ({ ...prev, tab: next }) })
  useGoogleCallbackToast()

  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin'

  return (
    // `prose`, no `app`: sin el índice de escritorio (sacado en la
    // Corrección 2 del plan de corrección de layout — duplicaba
    // AjustesPanel.tsx en el sidebar, mismos 5-de-6 destinos con otro
    // nombre en el primero) ya no hay nada que repartirse los 1400px con
    // el formulario. `prose` (760px) es lo que un formulario de una
    // columna necesita — mismo criterio que Campos personalizados/
    // Archivados, que nunca tuvieron un índice que los justificara ancho.
    <PageShell width="prose">
      {isLoading || !profile || !session ? (
        <ProfileSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Tira horizontal — el único nav que le queda a esta página.
              `md:hidden`, no `@min-[640px]:hidden`: ya no es "el ancho
              alcanza para el rail o no" (ese rail se fue), es "hay panel
              de sidebar (AjustesPanel.tsx, desde `md:` en AppShell.tsx) o
              no lo hay" — mismo corte que decide toda la navegación de
              escritorio vs. mobile en el resto de la app, no uno propio
              de esta página. */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                  tab === item.id
                    ? item.danger
                      ? 'border-transparent bg-danger-bg text-danger-text'
                      : 'border-transparent bg-accent-soft text-accent-text-on-bg'
                    : item.danger
                      ? 'border-border text-danger'
                      : 'border-border text-text-secondary',
                )}
              >
                {item.mobileLabel ?? item.label}
              </button>
            ))}
          </div>

          <div>
            <h1 className="text-xl font-semibold tracking-tight">{TAB_HEADING[tab].title}</h1>
            <p className="mt-1 text-[13px] text-text-muted">{TAB_HEADING[tab].description}</p>
          </div>

          {/* Sin `divide-y`: cada SettingsSection trae su propia línea
              superior (`first:border-t-0`), que es lo que permite que una
              sección condicional —Marca solo para admin— no deje una línea
              suelta cuando no se renderiza. */}
          <div className="flex min-w-0 flex-1 flex-col">
            {tab === 'perfil' && (
              <>
                <ProfileHero
                  userId={userId}
                  fullName={profile.full_name}
                  avatarUrl={profile.avatar_url}
                  jobTitle={profile.job_title}
                  role={membership?.role ?? null}
                  timezone={profile.timezone}
                  timeFormat={profile.time_format}
                  memberSince={profile.created_at}
                  email={session.user.email ?? ''}
                />
                <IdentitySection
                  workspaceId={workspaceId}
                  userId={userId}
                  fullName={profile.full_name}
                  avatarUrl={profile.avatar_url}
                  jobTitle={profile.job_title}
                />
                <AusenciasSection workspaceId={workspaceId} userId={userId} />
              </>
            )}

            {tab === 'seguridad' && (
              <>
                <EmailSection email={session.user.email ?? ''} />
                <PasswordSection />
                <SecuritySection lastSeenAt={profile.last_seen_at} />
                <PublicLinksSection userId={userId} />
              </>
            )}

            {tab === 'workspace' && (
              <>
                <WorkspaceSection
                  workspaceId={workspaceId}
                  workspaceName={membership?.workspace?.name ?? null}
                  role={membership?.role ?? null}
                  memberSince={profile.created_at}
                  members={members ?? []}
                  isAdmin={isAdmin}
                />
                <TeamsAndSpacesSection workspaceId={workspaceId} userId={userId} spaces={spaces ?? []} />
                {isAdmin && workspaceId && <PendingInvitationsSection workspaceId={workspaceId} />}
                {isAdmin && workspaceId && (
                  <BrandingSection
                    workspaceId={workspaceId}
                    logoUrl={membership?.workspace?.logo_url ?? null}
                    backgroundUrl={membership?.workspace?.login_background_url ?? null}
                  />
                )}
              </>
            )}

            {tab === 'notifications' && (
              <>
                <NotificationsSection />
                <SettingsSection title="Tus dispositivos" description="Dónde más te llegan los avisos de Flow.">
                  <PushDeviceList />
                </SettingsSection>
                <NotificationMatrixSection userId={userId} />
                <QuietHoursSection userId={userId} profile={profile} />
                <DigestSection userId={userId} profile={profile} />
              </>
            )}

            {tab === 'preferences' && <PreferencesSection userId={userId} profile={profile} />}

            {tab === 'integrations' && <IntegrationsSection workspaceId={workspaceId} />}

            {tab === 'danger' && <DangerSection userId={userId} email={session.user.email ?? ''} />}
          </div>
        </div>
      )}
    </PageShell>
  )
}

// El correo se movió a la pestaña Seguridad (rediseño 2026-09-24): quién
// puede entrar a la cuenta es una decisión de seguridad, no de identidad
// pública. Acá se suma el cargo (`profiles.job_title`) autoeditable — antes
// solo un administrador podía cambiarlo, desde EditMemberDialog.tsx en
// Equipo → Personas; ese camino se mantiene, este es el nuevo,
// autoservicio, para el caso normal de "cambié de rol y quiero que se note
// en mi ficha y en el organigrama".
/**
 * Identidad de un vistazo, antes de cualquier control.
 *
 * Nada acá se edita: es el "así te ves" contra el que se comparan los campos
 * de abajo. Los tres chips salen de datos que la página ya pide — presencia
 * en vivo (misma fuente que el punto verde de Equipo), `timezone` para la
 * hora local, y `profiles.created_at` para desde cuándo.
 */
function ProfileHero({
  userId,
  fullName,
  avatarUrl,
  jobTitle,
  role,
  timezone,
  timeFormat,
  memberSince,
  email,
}: {
  userId: string
  fullName: string | null
  avatarUrl: string | null
  jobTitle: string | null
  role: string | null
  timezone: string | null
  timeFormat: string
  memberSince: string | null
  email: string
}) {
  const onlineIds = useOnlineUserIds()
  const isOnline = onlineIds.has(userId)
  const uploadAvatarMutation = useUploadAvatarMutation(userId)
  const tz = timezone ?? 'America/Santiago'

  // Sin `useEffect` que la refresque cada minuto: es un dato de contexto
  // ("vives en otro huso"), no un reloj — y un render por minuto en toda la
  // página para mover un dígito no se paga.
  const localTime = useMemo(() => formatTimeInZone(new Date(), tz, timeFormat), [tz, timeFormat])

  const subtitle = [jobTitle, role ? (ROLE_LABEL[role] ?? role) : null].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center gap-4 pb-5">
      {/* El avatar del hero ES la zona para soltar la foto — de ahí el
          "También puedes soltarla sobre tu foto de arriba" de la sección de
          abajo. El anillo de acento es permanente acá (AvatarDropzone solo
          lo pinta al arrastrar o enfocar). */}
      <div className="rounded-full ring-2 ring-accent ring-offset-2 ring-offset-surface">
        <AvatarDropzone
          avatarUrl={avatarUrl}
          fallbackText={initials(fullName || email)}
          uploading={uploadAvatarMutation.isPending}
          onFile={(file) =>
            uploadAvatarMutation.mutate(file, {
              onError: () => toast.error('No se pudo subir la foto. Prueba con otra imagen.'),
            })
          }
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <b className="truncate text-lg font-semibold tracking-tight">{fullName ?? 'Sin nombre'}</b>
        {subtitle && <span className="truncate text-[13px] text-text-secondary">{subtitle}</span>}
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {isOnline && (
            <Pill>
              <span className="size-1.5 rounded-full bg-success" />
              En línea
            </Pill>
          )}
          {localTime && <Pill>{`Hora local ${localTime} · ${tz.split('/').pop()?.replace(/_/g, ' ')}`}</Pill>}
          {memberSince && <Pill>{`Desde el ${formatDate(memberSince)}`}</Pill>}
        </div>
      </div>
    </div>
  )
}

function IdentitySection({
  workspaceId,
  userId,
  fullName,
  avatarUrl,
  jobTitle,
}: {
  workspaceId: string
  userId: string
  fullName: string | null
  avatarUrl: string | null
  jobTitle: string | null
}) {
  const [name, setName] = useState(fullName ?? '')
  const [job, setJob] = useState(jobTitle ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateProfileMutation = useUpdateProfileMutation(userId)
  const uploadAvatarMutation = useUploadAvatarMutation(userId)

  // "Reporta a" es un campo de esta sección, no una sección propia: es el
  // mismo bloque de "cómo te ve el resto" que el nombre y el cargo, solo que
  // lo decide un administrador en Equipo → Organigrama (`set_manager` RPC —
  // `manager_id` está protegido contra UPDATE directo, ver
  // protect_profile_email() en 0024/0027). Reusa `usePeople`, ya cacheada
  // por la ficha de persona para el mismo dato.
  const { data: people } = usePeople(workspaceId)
  const me = people?.find((p) => p.id === userId)
  const manager = me?.manager_id ? people?.find((p) => p.id === me.manager_id) : undefined

  const dirty = name.trim() !== (fullName ?? '') || job.trim() !== (jobTitle ?? '')

  function handleAvatarFile(file: File) {
    uploadAvatarMutation.mutate(file, {
      onError: () => toast.error('No se pudo subir la foto. Prueba con otra imagen.'),
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty) return
    updateProfileMutation.mutate(
      { full_name: name.trim(), job_title: job.trim() || null },
      {
        onSuccess: () => toast.success('Perfil actualizado.'),
        onError: () => toast.error('No se pudo actualizar el perfil.'),
      },
    )
  }

  return (
    <SettingsSection title="Información pública" description="Lo que ven los demás junto a tu nombre.">
      {/* La foto se cambia desde acá o soltándola sobre el avatar de arriba
          (AvatarDropzone sigue montado en el hero): dos gestos para lo
          mismo, porque "arrastra una imagen" no se descubre solo. */}
      <Actions>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handleAvatarFile(file)
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadAvatarMutation.isPending}>
          {uploadAvatarMutation.isPending ? 'Subiendo…' : 'Cambiar foto'}
        </Button>
        {avatarUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploadAvatarMutation.isPending}
            onClick={() =>
              updateProfileMutation.mutate(
                { avatar_url: null },
                { onError: () => toast.error('No se pudo quitar la foto.') },
              )
            }
          >
            Quitar
          </Button>
        )}
        <Note>JPG o PNG, hasta 5 MB. También puedes soltarla sobre tu foto de arriba.</Note>
      </Actions>

      <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
        <FieldGrid>
          <Field label="Nombre" htmlFor="profile-name">
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          </Field>
          <Field label="Cargo" htmlFor="profile-job" hint="Aparece en tu ficha y en el organigrama.">
            <Input
              id="profile-job"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder="Ej: Director de proyectos"
            />
          </Field>
        </FieldGrid>

        <Field label="Reporta a" hint="Lo define un administrador en Equipo → Organigrama.">
          <ReadonlyBox>
            {manager ? (
              <>
                <Avatar className="size-5 shrink-0">
                  {manager.avatar_url && <AvatarImage src={manager.avatar_url} alt="" />}
                  <AvatarFallback className="text-[8px]">{initials(manager.full_name)}</AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {manager.full_name}
                  {manager.job_title && ` · ${manager.job_title}`}
                </span>
              </>
            ) : (
              <span className="text-text-muted">Sin gestor asignado.</span>
            )}
          </ReadonlyBox>
        </Field>

        <Actions>
          <Button type="submit" size="sm" disabled={!dirty || updateProfileMutation.isPending}>
            {updateProfileMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </Actions>
      </form>
    </SettingsSection>
  )
}

// Ausencias propias — antes solo se cargaban desde la ficha de persona en
// Equipo (PersonCalendarTab.tsx, con TimeOffList extraído para reusarlo acá
// tal cual). El aviso de tareas que vencen durante la ausencia cruza
// `myTasksQueryOptions` (ya cacheada por "Mi trabajo") contra los rangos de
// `time_off` sin pedir nada nuevo al backend.
function AusenciasSection({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const { data: timeOff } = usePersonTimeOff(workspaceId, userId)
  const { data: myTasks } = useQuery(myTasksQueryOptions(workspaceId, userId))
  const [expanded, setExpanded] = useState(false)

  const atRisk = (myTasks ?? []).filter((task) => {
    if (!task.due_date || isDoneStatus(task.status?.status_kind)) return false
    const due = parseISO(task.due_date)
    return (timeOff ?? []).some((row) => isWithinInterval(due, { start: parseISO(row.starts_on), end: parseISO(row.ends_on) }))
  })

  return (
    <SettingsSection
      title="Mis ausencias"
      description="Vacaciones y licencias. Flow avisa qué vence mientras no estás y las muestra en la carga del equipo."
    >
      <TimeOffList workspaceId={workspaceId} userId={userId} canEdit />
      {atRisk.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-text">
          <button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setExpanded((v) => !v)}>
            {atRisk.length} de tus tareas vence{atRisk.length === 1 ? '' : 'n'} durante tus vacaciones. {expanded ? 'Ocultar' : 'Ver cuáles'}
          </button>
          {expanded && (
            <ul className="flex flex-col gap-0.5 pl-3">
              {atRisk.map((task) => (
                <li key={task.id} className="list-disc">
                  {task.title} · {formatDate(task.due_date)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SettingsSection>
  )
}

// Correo de acceso: con él se entra a Flow y llegan los avisos por correo.
// Vive en Seguridad, no en Perfil (rediseño 2026-09-24) — cambiarlo es una
// decisión de acceso a la cuenta, no de cómo te ve el resto del equipo.
function EmailSection({ email }: { email: string }) {
  const [emailValue, setEmailValue] = useState(email)
  const updateEmailMutation = useUpdateEmailMutation()
  const dirty = emailValue.trim() !== email

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = emailValue.trim()
    if (trimmed === email) return
    updateEmailMutation.mutate(trimmed, {
      onSuccess: () => toast.success('Te enviamos un correo de confirmación a la nueva dirección.'),
      onError: () => toast.error('No se pudo actualizar el correo.'),
    })
  }

  return (
    <SettingsSection title="Correo de acceso" description="Con él entras a Flow y te llegan los avisos por correo.">
      <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
        <FieldGrid>
          <Field label="Correo" htmlFor="profile-email">
            <Input
              id="profile-email"
              type="email"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              placeholder="tu@correo.com"
            />
          </Field>
          {/* El botón ocupa la segunda celda de la grilla, alineado con el
              input: el mockup lo pone al lado, no debajo. */}
          <Field label={<span className="hidden @min-[620px]:inline">&nbsp;</span>}>
            <Button type="submit" size="sm" className="self-start" disabled={!dirty || updateEmailMutation.isPending}>
              {updateEmailMutation.isPending ? 'Guardando…' : 'Cambiar correo'}
            </Button>
          </Field>
        </FieldGrid>
        <Note>
          Si lo cambias, te llega un correo a la nueva dirección para confirmar. Hasta entonces sigues entrando con este.
        </Note>
      </form>
    </SettingsSection>
  )
}

// Todo real, vía memberships — sin ningún campo de "plan" (app interna,
// sin planes pagos de ningún tipo).
function WorkspaceSection({
  workspaceId,
  workspaceName,
  role,
  memberSince,
  members,
  isAdmin,
}: {
  workspaceId: string
  workspaceName: string | null
  role: string | null
  memberSince: string | null
  members: { user_id: string; profile: { id: string; full_name: string | null; avatar_url: string | null } | null }[]
  isAdmin: boolean
}) {
  const shown = members.slice(0, 4)
  const extra = members.length - shown.length
  const [name, setName] = useState(workspaceName ?? '')
  const updateNameMutation = useUpdateWorkspaceNameMutation(workspaceId)

  useEffect(() => setName(workspaceName ?? ''), [workspaceName])

  const nameDirty = isAdmin && name.trim() !== (workspaceName ?? '') && name.trim().length > 0

  return (
    <>
      <SettingsSection title="General" description="Cómo se llama este espacio y en qué dirección vive.">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!nameDirty) return
            updateNameMutation.mutate(name.trim(), {
              onSuccess: () => toast.success('Nombre actualizado.'),
              onError: () => toast.error('No se pudo actualizar el nombre.'),
            })
          }}
        >
          <FieldGrid>
            <Field
              label="Nombre del espacio de trabajo"
              htmlFor={isAdmin ? 'ws-name' : undefined}
              hint={isAdmin ? 'Solo administradores.' : undefined}
            >
              {isAdmin ? (
                <div className="flex items-center gap-2">
                  <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
                  <Button type="submit" size="sm" disabled={!nameDirty || updateNameMutation.isPending}>
                    {updateNameMutation.isPending ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
              ) : (
                <ReadonlyBox>{workspaceName ?? 'Sin workspace'}</ReadonlyBox>
              )}
            </Field>
            {/* `window.location.host` y no una constante: en producción es
                flow.zutra.cl y en desarrollo el puerto local, sin tener
                que mantener el valor a mano en dos lados. */}
            <Field label="Dirección">
              <ReadonlyBox>{window.location.host}</ReadonlyBox>
            </Field>
          </FieldGrid>
        </form>
      </SettingsSection>

      <SettingsSection title="Tu lugar" description="Tu rol y desde cuándo estás en este espacio.">
        <SettingRow
          icon={UserCircleIcon}
          title={role ? (ROLE_LABEL[role] ?? role) : 'Sin rol'}
          subtitle={`Miembro desde ${formatDate(memberSince)}`}
          action={role ? <Badge variant="outline">{ROLE_LABEL[role] ?? role}</Badge> : undefined}
        />
      </SettingsSection>

      <SettingsSection
        title="Personas"
        description={`${members.length} ${members.length === 1 ? 'persona' : 'personas'} en ${workspaceName ?? 'este espacio'}.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          {shown.length > 0 && (
            <AvatarGroup>
              {shown.map((m) => (
                <Avatar key={m.user_id} size="sm">
                  {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} alt="" />}
                  <AvatarFallback>{initials(m.profile?.full_name)}</AvatarFallback>
                </Avatar>
              ))}
              {extra > 0 && (
                <AvatarGroupCount>
                  <span className="text-xs">+{extra}</span>
                </AvatarGroupCount>
              )}
            </AvatarGroup>
          )}
          {/* Invitar y administrar siguen viviendo en Equipo → Personas: esta
              pestaña muestra el estado, no duplica el ABM. */}
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to="/equipo/personas">
              Gestionar en Equipo
              <HugeiconsIcon icon={LinkSquare02Icon} />
            </Link>
          </Button>
        </div>
      </SettingsSection>
    </>
  )
}

// Vista previa decorativa de /login — no es SplitScreenLayout escalado a
// propósito: ese componente es `min-h-svh` con su propio breakpoint `md:`,
// y forzarlo a caber en una caja de 128px habría significado pelear con
// esas reglas en vez de reusarlas. Esta caja replica la misma composición
// (panel de acento a la izquierda, logo centrado a la derecha) con markup
// propio, mucho más simple de mantener a este tamaño.
function LoginPreview({ logoUrl, backgroundUrl }: { logoUrl: string | null; backgroundUrl: string | null }) {
  return (
    <div className="flex h-32 overflow-hidden rounded-card border border-border" aria-hidden>
      <div
        className="relative hidden w-2/5 shrink-0 bg-accent bg-cover bg-center sm:block"
        style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
      >
        {backgroundUrl && <div className="absolute inset-0 bg-black/35" />}
      </div>
      <div className="flex flex-1 items-center justify-center bg-surface p-4">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="max-h-8 w-auto object-contain" />
        ) : (
          <div className="flex w-full max-w-[140px] flex-col items-center gap-1.5">
            <div className="size-4 rounded bg-accent" />
            <div className="h-1.5 w-full rounded-full bg-surface-alt" />
            <div className="h-1.5 w-full rounded-full bg-surface-alt" />
            <div className="h-1.5 w-2/3 rounded-full bg-accent" />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Logo y fondo del login (0077_workspace_branding.sql) — solo admin/owner:
 * cambia lo que ve CUALQUIERA que abra /login, no una preferencia personal.
 * `workspaces_update_admin` (RLS) es la barrera real; este `isAdmin` es
 * solo para no ofrecer un control que va a rebotar (mismo criterio que
 * `equipos.tsx` con `CreateTeamDialog`).
 */
function BrandingSection({
  workspaceId,
  logoUrl,
  backgroundUrl,
}: {
  workspaceId: string
  logoUrl: string | null
  backgroundUrl: string | null
}) {
  const uploadMutation = useUploadWorkspaceBrandingMutation(workspaceId)
  const clearMutation = useClearWorkspaceBrandingMutation(workspaceId)

  return (
    <SettingsSection
      title="Marca"
      description="El logo y el fondo que ve cualquiera en la pantalla de inicio de sesión."
    >
      <LoginPreview logoUrl={logoUrl} backgroundUrl={backgroundUrl} />
      <FieldGrid>
        <BrandingImageField
          kind="logo"
          label="Logotipo"
          hint="Aparece sobre el formulario de login. JPG, PNG o WebP, hasta 5 MB."
          imageUrl={logoUrl}
          previewClassName="h-16 w-auto object-contain"
          uploading={uploadMutation.isPending && uploadMutation.variables?.kind === 'logo'}
          onFile={(file) => uploadMutation.mutate({ kind: 'logo', file })}
          onClear={() => clearMutation.mutate('logo')}
        />
        <BrandingImageField
          kind="login_background"
          label="Imagen de fondo"
          hint="Reemplaza el panel de color de la izquierda. JPG, PNG o WebP, hasta 5 MB."
          imageUrl={backgroundUrl}
          previewClassName="h-24 w-full object-cover"
          uploading={uploadMutation.isPending && uploadMutation.variables?.kind === 'login_background'}
          onFile={(file) => uploadMutation.mutate({ kind: 'login_background', file })}
          onClear={() => clearMutation.mutate('login_background')}
        />
      </FieldGrid>
    </SettingsSection>
  )
}

function BrandingImageField({
  kind,
  label,
  hint,
  imageUrl,
  previewClassName,
  uploading,
  onFile,
  onClear,
}: {
  kind: BrandingKind
  label: string
  hint: string
  imageUrl: string | null
  previewClassName: string
  uploading: boolean
  onFile: (file: File) => void
  onClear: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [processing, setProcessing] = useState(false)

  // El tope real y el rechazo de HEIC viven en processBrandingImage (0078
  // hace lo mismo del lado del bucket, por si alguien sube sin pasar por
  // acá) — sin gate de `file.type` antes de llamarla: el MIME de HEIC es
  // inconsistente entre navegadores, así que dejar que ella decida es más
  // confiable que filtrar acá con un prefijo que a veces ni siquiera viene.
  async function pick(file: File | undefined) {
    if (!file) return
    setProcessing(true)
    try {
      onFile(await processBrandingImage(file, kind))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo procesar esta imagen.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Cambiar ${label.toLowerCase()}, haz clic o arrastra una imagen`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          pick(e.dataTransfer.files?.[0])
        }}
        className={cn(
          'relative flex cursor-pointer items-center justify-center overflow-hidden rounded-card border border-dashed border-border bg-surface-alt outline-none transition-colors',
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          isDragging && 'border-accent bg-accent-soft',
        )}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className={previewClassName} />
        ) : (
          <div className="flex h-16 flex-col items-center justify-center gap-1 py-4 text-text-muted">
            <HugeiconsIcon icon={Upload01Icon} className="size-4" />
            <span className="text-xs">Subir imagen</span>
          </div>
        )}
        {(uploading || processing) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            pick(file)
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-muted">{hint}</span>
        {imageUrl && (
          <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs text-danger hover:underline">
            <HugeiconsIcon icon={Delete02Icon} className="size-3" />
            Quitar
          </button>
        )}
      </div>
    </div>
  )
}

// Real: los "equipos" del usuario son los espacios (`nodes` type='space')
// del workspace — ver spacesQueryOptions en workspace/queries.ts.
// Antes esto se llamaba "Equipos y espacios" y mostraba solo espacios
// (`nodes` type='space') etiquetados como si fueran equipos — Flow SÍ tiene
// equipos de verdad (`teams`/`team_members`, 0025_teams.sql, visibles en
// Equipo → Equipos) y nunca se mostraban acá. Rediseño de Ajustes PR 7:
// dos campos separados, cada uno con su propio nombre real. `useTeamsByUser`
// deriva del mismo cache que la página de Equipos (features/teams/queries.ts),
// sin pedir nada nuevo al backend.
function TeamsAndSpacesSection({
  workspaceId,
  userId,
  spaces,
}: {
  workspaceId: string
  userId: string
  spaces: { id: string; name: string }[]
}) {
  const { data: teamsByUser } = useTeamsByUser(workspaceId)
  const myTeams = teamsByUser?.get(userId) ?? []

  return (
    <SettingsSection title="Equipos y espacios" description="A los que perteneces dentro de este espacio de trabajo.">
      <Field label="Tus equipos">
        {myTeams.length === 0 ? (
          <Note>No formas parte de ningún equipo todavía.</Note>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {myTeams.map((team) => (
              <Pill key={team.id}>
                <span className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: team.color ?? undefined }} />
                {team.name}
              </Pill>
            ))}
          </div>
        )}
      </Field>

      <Field label="Tus espacios">
        {spaces.length === 0 ? (
          <Note>Todavía no formas parte de ningún espacio.</Note>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {spaces.map((space) => (
              <Pill key={space.id}>{space.name}</Pill>
            ))}
          </div>
        )}
      </Field>
    </SettingsSection>
  )
}

// "Miembros e invitaciones" (MobileMoreSheet.tsx) lleva acá pero esta
// pestaña solo mostraba cuántas personas hay — invitar vive en Equipo, y
// las invitaciones pendientes no se veían en ningún lado (issue documentado
// en el mockup de esta serie). `useInvitations` ya existía
// (features/workspace/queries.ts) sin ningún call site — dead code listo
// para usar, solo le faltaba el filtro a `pending` y esta UI.
function PendingInvitationsSection({ workspaceId }: { workspaceId: string }) {
  const { data: invitations } = useInvitations(workspaceId)
  const pending = (invitations ?? []).filter((i) => i.status === 'pending')
  const resendMutation = useInviteMemberMutation(workspaceId)
  const revokeMutation = useRevokeInvitationMutation(workspaceId)

  function handleResend(email: string, role: string) {
    resendMutation.mutate(
      { email, role },
      {
        onSuccess: () => toast.success(`Invitación reenviada a ${email}.`),
        onError: () => toast.error('No se pudo reenviar la invitación.'),
      },
    )
  }

  return (
    <SettingsSection title="Invitaciones pendientes" description="Gestiona el resto del equipo desde Equipo → Personas.">
      {pending.length === 0 ? (
        <Note>Sin invitaciones pendientes.</Note>
      ) : (
        <SettingList>
          {pending.map((inv) => {
            const expired = new Date(inv.expires_at) < new Date()
            return (
              <SettingRow
                key={inv.id}
                icon={Mail01Icon}
                title={<span className="truncate">{inv.email}</span>}
                subtitle={
                  <span className={cn(expired && 'text-warn-text')}>
                    {ROLE_LABEL[inv.role] ?? inv.role} · {expired ? 'venció' : 'vence'} {formatRelativeTime(inv.expires_at)}
                  </span>
                }
                wrap
                action={
                  <Actions className="gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResend(inv.email, inv.role)}
                      disabled={resendMutation.isPending}
                    >
                      Reenviar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      onClick={() => revokeMutation.mutate(inv.id)}
                      disabled={revokeMutation.isPending}
                    >
                      Revocar
                    </Button>
                  </Actions>
                }
              />
            )
          })}
        </SettingList>
      )}

      <Actions>
        <Button type="button" size="sm" asChild>
          <Link to="/equipo/personas">
            <HugeiconsIcon icon={PlusSignIcon} />
            Invitar personas
          </Link>
        </Button>
      </Actions>
    </SettingsSection>
  )
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mutation = useUpdatePasswordMutation()

  const passwordProblem = password.length > 0 ? describePasswordProblem(password) : null
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit =
    currentPassword.length > 0 &&
    password.length > 0 &&
    !describePasswordProblem(password) &&
    password === confirm

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    mutation.mutate(
      { password, currentPassword },
      {
        onSuccess: () => {
          toast.success('Contraseña actualizada.')
          setCurrentPassword('')
          setPassword('')
          setConfirm('')
        },
        onError: (error) => toast.error(describeAuthError(error)),
      },
    )
  }

  return (
    <SettingsSection title="Contraseña" description={PASSWORD_HINT}>
      {/* PasswordField compartido con los formularios de login/recuperación:
          suma el toggle de mostrar/ocultar que acá tampoco había, y mantiene
          un solo mínimo de longitud en toda la app. */}
      <form className="flex flex-1 flex-col gap-3" onSubmit={handleSubmit}>
        {/* Contraseña actual: el proyecto tiene activo "Require current
            password when updating", así que sin este campo el cambio fallaba
            del lado del servidor. Aparte de eso, es lo que evita que alguien
            que encuentre una sesión abierta se apropie de la cuenta — que es
            justamente lo que "Secure password change" NO cubre, porque solo
            exige que la sesión tenga menos de 24 h. */}
        <PasswordField
          id="current-password"
          label="Contraseña actual"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          required={false}
        />
        <FieldGrid>
          <PasswordField
            id="new-password"
            label="Nueva contraseña"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required={false}
            invalid={!!passwordProblem}
            hint={passwordProblem ?? undefined}
            hintTone="danger"
          />
          <PasswordField
            id="confirm-password"
            label="Confirmar"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            required={false}
            invalid={mismatch}
            hint={mismatch ? 'Las contraseñas no coinciden.' : undefined}
            hintTone="danger"
          />
        </FieldGrid>
        {/* Solo una vez que ya cumple el mínimo (`describePasswordProblem`
            vacío) — antes de eso "Débil" sería redundante con el mensaje de
            requisito que ya se muestra arriba. */}
        {password.length > 0 && !passwordProblem && <PasswordStrengthMeter password={password} />}
        <Button type="submit" size="sm" className="mt-auto self-start" disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending ? 'Actualizando…' : 'Actualizar contraseña'}
        </Button>
      </form>
    </SettingsSection>
  )
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label, hint } = passwordStrength(password)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">Seguridad de la nueva contraseña</span>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('h-1 flex-1 rounded-full', i <= score ? STRENGTH_BAR_CLASS[score] : 'bg-border')}
          />
        ))}
      </div>
      <span className="text-xs text-text-muted">
        {label}. {hint}
      </span>
    </div>
  )
}

const STRENGTH_BAR_CLASS: Record<number, string> = {
  0: 'bg-danger',
  1: 'bg-warn',
  2: 'bg-success',
  3: 'bg-success',
}

function formatLastActivity(iso: string | null): string {
  if (!iso) return 'Sin actividad registrada.'
  const date = new Date(iso)
  if (isToday(date)) return `Hoy, ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `Ayer, ${format(date, 'HH:mm')}`
  return format(date, "d 'de' MMM, HH:mm", { locale: es })
}

// Real: 2FA vía supabase.auth.mfa (TOTP) y "cerrar sesión en todos los
// demás dispositivos" vía signOut({scope:'others'}) — ver features/security.
// "Última actividad" usa `profiles.last_seen_at` (touch_presence(), cada 5
// min mientras la sesión está abierta — ver use-workspace-presence.ts), en
// vez de la lista mockeada de "sesiones activas" que hubo antes:
// dispositivo/ubicación no son datos que la API de Supabase exponga, así
// que esa lista tal cual no era construible de verdad.
function SecuritySection({ lastSeenAt }: { lastSeenAt: string | null }) {
  const { data: factors, isLoading } = useMfaFactors()
  const unenrollMutation = useUnenrollFactorMutation()
  const signOutOthersMutation = useSignOutOtherSessionsMutation()
  const [enrollOpen, setEnrollOpen] = useState(false)

  const activeFactor = factors?.totp[0] ?? null

  function handleDisable() {
    if (!activeFactor) return
    unenrollMutation.mutate(activeFactor.id, {
      onSuccess: () => toast.success('Verificación en dos pasos desactivada.'),
      onError: () => toast.error('No se pudo desactivar.'),
    })
  }

  function handleSignOutOthers() {
    signOutOthersMutation.mutate(undefined, {
      onSuccess: () => toast.success('Se cerró la sesión en todos tus demás dispositivos.'),
      onError: () => toast.error('No se pudo cerrar las demás sesiones.'),
    })
  }

  return (
    <>
      <SettingsSection
        title="Verificación en dos pasos"
        description="Un código de tu app de autenticación además de la contraseña."
      >
        <SettingRow
          icon={TwoFactorAccessIcon}
          title={isLoading ? 'Cargando…' : activeFactor ? 'Activada' : 'Desactivada'}
          subtitle="Recomendada para administradores: tu cuenta puede cambiar roles y marca."
          wrap
          action={
            activeFactor ? (
              <Button type="button" variant="outline" size="sm" onClick={handleDisable} disabled={unenrollMutation.isPending}>
                {unenrollMutation.isPending ? 'Desactivando…' : 'Desactivar'}
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setEnrollOpen(true)} disabled={isLoading}>
                Activar
              </Button>
            )
          }
        />
        <TwoFactorEnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} onEnrolled={() => setEnrollOpen(false)} />
      </SettingsSection>

      <SettingsSection title="Sesiones">
        <SettingList>
          <SettingRow
            icon={LaptopIcon}
            title={`Última actividad: ${formatLastActivity(lastSeenAt)}`}
            subtitle="Este navegador"
          />
          <SettingRow
            icon={SmartPhone01Icon}
            title="Cerrar sesión en tus otros dispositivos"
            subtitle="Útil si usaste un computador ajeno o perdiste el teléfono."
            wrap
            action={
              <Button type="button" variant="outline" size="sm" onClick={handleSignOutOthers} disabled={signOutOthersMutation.isPending}>
                {signOutOthersMutation.isPending ? 'Cerrando…' : 'Cerrar otras sesiones'}
              </Button>
            }
          />
        </SettingList>
      </SettingsSection>
    </>
  )
}

// "Links públicos que creaste" (rediseño 2026-09-24) — antes esta
// información no existía en ningún lado de Ajustes; los links públicos solo
// se veían/gestionaban desde el diálogo de compartir de cada tarea o
// proyecto, uno a la vez. La RLS (`public_links_select_admin`) ya limita
// esto a admin/owner del workspace del nodo — igual que crear un link en
// primer lugar — así que un miembro común simplemente ve la lista vacía acá,
// coherente con que tampoco puede crear ninguno.
function PublicLinksSection({ userId }: { userId: string }) {
  const { data: links } = useMyPublicLinks(userId)
  const revokeMutation = useRevokeMyPublicLinkMutation(userId)

  function handleCopy(token: string) {
    navigator.clipboard.writeText(publicLinkUrl(token))
    toast.success('Link copiado.')
  }

  return (
    <SettingsSection
      title="Links públicos que creaste"
      description="Cualquiera con el link puede ver ese contenido sin entrar a Flow."
    >
      {!links || links.length === 0 ? (
        <Note>No has creado ningún link público todavía.</Note>
      ) : (
        <SettingList>
          {links.map((link) => (
            <SettingRow
              key={link.node_id}
              icon={Link01Icon}
              title={<span className="truncate">{link.node?.title ?? 'Elemento eliminado'}</span>}
              subtitle={`Creado el ${formatDate(link.created_at)} · ${
                link.last_accessed_at ? `abierto ${formatLastActivity(link.last_accessed_at).toLowerCase()}` : 'nadie lo ha abierto'
              }`}
              wrap
              action={
                <Actions className="gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(link.token)}>
                    <HugeiconsIcon icon={Copy01Icon} />
                    Copiar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={() => revokeMutation.mutate(link.node_id)}
                    disabled={revokeMutation.isPending}
                  >
                    Revocar
                  </Button>
                </Actions>
              }
            />
          ))}
        </SettingList>
      )}
    </SettingsSection>
  )
}

// Fallback si `Intl.supportedValuesOf` no existe (motor viejo) — las
// mismas 7 zonas que había antes de la búsqueda completa.
const TIMEZONE_FALLBACK = [
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Lima',
  'America/Mexico_City',
  'America/New_York',
  'UTC',
]

function TimezoneCombobox({
  value,
  onChange,
  timeFormat,
}: {
  value: string
  onChange: (tz: string) => void
  timeFormat: string
}) {
  const [open, setOpen] = useState(false)
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return TIMEZONE_FALLBACK
    }
  }, [])
  const nowInZone = useMemo(() => formatTimeInZone(new Date(), value, timeFormat), [value, timeFormat])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value.replace(/_/g, ' ')}
            {nowInZone && <span className="text-text-muted"> · ahora {nowInZone}</span>}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar zona horaria…" />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {zones.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  onSelect={() => {
                    onChange(tz)
                    setOpen(false)
                  }}
                >
                  {tz.replace(/_/g, ' ')}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const DEFAULT_VIEW_OPTIONS = [
  { value: 'list', label: 'Lista' },
  { value: 'board', label: 'Tablero' },
  { value: 'calendar', label: 'Calendario' },
  { value: 'table', label: 'Tabla' },
]

const DATE_FORMAT_OPTIONS = [
  { value: 'dd/MM/yyyy', label: 'DD/MM/AAAA' },
  { value: 'MM/dd/yyyy', label: 'MM/DD/AAAA' },
  { value: 'yyyy-MM-dd', label: 'AAAA-MM-DD' },
]

const START_PAGE_OPTIONS = [
  { value: 'inicio', label: 'Inicio' },
  { value: 'mis-tareas', label: 'Mis tareas' },
  { value: 'bandeja', label: 'Bandeja' },
]

const TASK_VIEW_MODE_OPTIONS: { value: TaskViewMode; label: string }[] = [
  { value: 'side', label: 'Panel lateral' },
  { value: 'modal', label: 'Ventana' },
  { value: 'full', label: 'Página completa' },
]

// Con nombre, no solo el hex: un círculo de color sin etiqueta obliga a
// adivinar (y no se puede describir por lectores de pantalla).
const ACCENT_SWATCHES: { hex: string; label: string }[] = [
  { hex: '#28BDB0', label: 'Turquesa' },
  { hex: '#3B82F6', label: 'Azul' },
  { hex: '#8B5CF6', label: 'Violeta' },
  { hex: '#EC4899', label: 'Rosa' },
  { hex: '#F59E0B', label: 'Ámbar' },
  { hex: '#10B981', label: 'Verde' },
]

// Los tres valores que acepta el CHECK de la columna
// (0090_profile_rail_style.sql), en orden de menos a más color.
const RAIL_STYLES: { value: RailStyle; label: string }[] = [
  { value: 'grafito', label: 'Grafito' },
  { value: 'tinte', label: 'Con tinte' },
  { value: 'solido', label: 'Sólido' },
]

const THEME_OPTIONS: { value: 'light' | 'dark' | 'system'; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
]

/**
 * Miniatura de la app en un tema: riel a la izquierda, tres líneas de
 * contenido a la derecha.
 *
 * El tema no se puede previsualizar con una palabra ("Sistema" no dice si
 * ahora mismo se ve claro u oscuro) ni con un solo color, porque lo que
 * cambia es la relación entre el fondo, el riel y el texto — que es
 * justamente lo que esta miniatura muestra.
 */
function ThemePreview({ value }: { value: 'light' | 'dark' | 'system' }) {
  const light = { bg: '#F8FAFC', rail: '#FFFFFF', line: '#E2E8F0' }
  const dark = { bg: '#0C0C0C', rail: '#151515', line: '#2F2F2F' }
  const palette = value === 'light' ? light : dark

  return (
    <span
      className="grid h-[54px] grid-cols-[18px_1fr] gap-1 overflow-hidden rounded-md p-1.5"
      style={
        value === 'system'
          ? { background: `linear-gradient(90deg, ${light.bg} 50%, ${dark.bg} 50%)` }
          : { background: palette.bg }
      }
    >
      <span className="block rounded-[3px]" style={{ background: value === 'system' ? '#8A8A8A' : palette.rail }} />
      <span className="flex flex-col gap-1">
        {['60%', '100%', '80%'].map((width) => (
          <span
            key={width}
            className="block h-[5px] rounded-[3px]"
            style={{ background: value === 'system' ? '#8A8A8A' : palette.line, width }}
          />
        ))}
      </span>
    </span>
  )
}

// Real: cada control persiste en `profiles` (0058_profile_preferences.sql)
// vía `useUpdateProfileMutation`. El tema pasa por `useThemePreference`
// (también sincroniza next-themes) en vez de mutar directo, porque tiene
// que tocar dos lugares a la vez. Sin selector de idioma: la app es 100%
// español, uno que no traduce nada sería peor que no tenerlo.
function PreferencesSection({ userId, profile }: { userId: string; profile: ProfileRow }) {
  const updateProfileMutation = useUpdateProfileMutation(userId)
  const { theme, setTheme } = useThemePreference()
  const taskViewMode = useTaskViewMode()
  const taskViewModeForced = useIsTaskViewModeForced()

  function set<K extends keyof ProfileRow>(field: K, value: ProfileRow[K]) {
    updateProfileMutation.mutate(
      { [field]: value },
      { onError: () => toast.error('No se pudo guardar la preferencia.') },
    )
  }

  const dateExample = useMemo(() => {
    try {
      return format(new Date(), profile.date_format)
    } catch {
      return null
    }
  }, [profile.date_format])

  return (
    <>
      <SettingsSection title="Apariencia" description="El tema, el acento y cuánto color lleva la navegación.">
        <div className="grid grid-cols-3 gap-2.5">
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-1.5 text-left transition-shadow',
                  selected && 'border-accent ring-1 ring-accent',
                )}
              >
                <ThemePreview value={option.value} />
                <span className="px-0.5 pb-0.5 text-xs">{option.label}</span>
              </button>
            )
          })}
        </div>

        <Field label="Color de acento">
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_SWATCHES.map((swatch) => {
              const selected = profile.accent_color === swatch.hex
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set('accent_color', swatch.hex)}
                  className={cn(
                    'flex flex-col items-center gap-1 text-[11px]',
                    selected ? 'text-text' : 'text-text-muted',
                  )}
                >
                  <span
                    className={cn(
                      'block size-6 rounded-full border-2 border-surface ring-1 ring-border',
                      selected && 'ring-2 ring-text',
                    )}
                    style={{ backgroundColor: swatch.hex }}
                  />
                  {swatch.label}
                </button>
              )
            })}
          </div>
        </Field>

        {/* Cada opción se previsualiza con su propio fondo real — describir
            "tinte" con palabras no dice nada, y el riel de la miniatura usa
            exactamente el color que va a tomar el riel de verdad
            (deriveRailPalette, el mismo que lee AppShell). */}
        <Field label="Fondo del riel" hint="Cuánto acento lleva la barra lateral.">
          <div className="flex flex-wrap gap-2.5">
            {RAIL_STYLES.map((style) => {
              const preview = deriveRailPalette(profile.accent_color, style.value)
              const selected = (profile.rail_style ?? 'grafito') === style.value
              return (
                <button
                  key={style.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set('rail_style', style.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pr-2.5 pl-1.5 text-xs transition-shadow',
                    selected && 'border-accent ring-1 ring-accent',
                  )}
                >
                  <span
                    className="flex h-10 w-[18px] flex-col items-center gap-[3px] rounded-[5px] border border-border pt-1"
                    style={{ backgroundColor: preview.bg }}
                  >
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="block h-[3px] w-2 rounded-sm bg-current opacity-50" />
                    ))}
                  </span>
                  {style.label}
                </button>
              )
            })}
          </div>
        </Field>
      </SettingsSection>

      <SettingsSection title="Región y formato" description="Con qué reloj y qué calendario lees las fechas de Flow.">
        <Field
          label="Zona horaria"
          hint="Con búsqueda entre todas las zonas. Afecta el horario de silencio y la hora del resumen."
        >
          <TimezoneCombobox
            value={profile.timezone ?? 'America/Santiago'}
            timeFormat={profile.time_format}
            onChange={(v) => set('timezone', v)}
          />
        </Field>

        <FieldGrid>
          <Field label="Formato de fecha" htmlFor="pref-date-format">
            <Select value={profile.date_format} onValueChange={(v) => set('date_format', v)}>
              <SelectTrigger id="pref-date-format" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMAT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                    {dateExample && o.value === profile.date_format ? ` · ${dateExample}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Formato de hora">
            <Segmented
              label="Formato de hora"
              value={profile.time_format}
              onChange={(v) => set('time_format', v)}
              options={[
                { value: '24h', label: '24 h' },
                { value: '12h', label: '12 h' },
              ]}
            />
          </Field>
        </FieldGrid>

        <Field label="La semana empieza el">
          <Segmented
            label="Primer día de la semana"
            value={String(profile.week_starts_on)}
            onChange={(v) => set('week_starts_on', Number(v))}
            options={[
              { value: '1', label: 'Lunes' },
              { value: '0', label: 'Domingo' },
            ]}
          />
        </Field>
      </SettingsSection>

      <SettingsSection title="Trabajo" description="Dónde aterrizas y cómo se abren las cosas.">
        <FieldGrid>
          <Field label="Al abrir Flow, empezar en" htmlFor="pref-start-page" hint="Inicio, Mis tareas o Bandeja.">
            <Select value={profile.start_page} onValueChange={(v) => set('start_page', v)}>
              <SelectTrigger id="pref-start-page" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {START_PAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Vista por defecto de las listas"
            htmlFor="pref-default-view"
            hint="Lista, Tablero, Calendario o Tabla."
          >
            <Select value={profile.default_view} onValueChange={(v) => set('default_view', v)}>
              <SelectTrigger id="pref-default-view" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_VIEW_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGrid>

        {/* "Abrir tareas en" (task-view-mode.ts, localStorage — no
            profiles: es por dispositivo, no por cuenta) ya existía como
            selector inline en NodeDetailContent.tsx; se duplica acá, no se
            mueve, porque ese otro selector sigue siendo la única forma de
            cambiarlo sin salir de una tarea. Los dos leen/escriben el mismo
            hook, así que quedan sincronizados solos. */}
        {!taskViewModeForced && (
          <Field
            label="Abrir tareas en"
            hint="Solo en este dispositivo. En el teléfono las tareas siempre se abren en página completa."
          >
            <Segmented
              label="Abrir tareas en"
              value={taskViewMode}
              onChange={setTaskViewMode}
              options={TASK_VIEW_MODE_OPTIONS}
            />
          </Field>
        )}

        <SettingRow
          icon={KeyboardIcon}
          title="Atajos de teclado"
          subtitle="Ctrl+K para buscar o crear, y varios más."
          wrap
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setShortcutsDialogOpen(true)}>
              Ver atajos
            </Button>
          }
        />
      </SettingsSection>
    </>
  )
}

// Web Push (0050_push_subscriptions.sql). Antes esta misma sección también
// tenía "Notificarme cuando me mencionan" y "Resumen semanal" — el
// rediseño de Ajustes PR 3 (2026-09-25) las separa en secciones propias
// (NotificationMatrixSection, DigestSection) porque dejaron de ser dos
// booleanos sueltos: la mención ahora es una fila más de la matriz
// evento×canal, y el resumen sumó día/hora configurables.
function NotificationsSection() {
  return (
    <SettingsSection
      title="En este dispositivo"
      description="Avisos del sistema en este navegador, aunque Flow esté cerrado."
    >
      <PushControls />
    </SettingsSection>
  )
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}))

const WEEKDAY_OPTIONS = [
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
]

// Matriz evento × canal (0092_notification_preferences.sql). La Bandeja es
// un interruptor encendido y deshabilitado, no una columna real de la tabla:
// "La bandeja recibe todo siempre" es la decisión de producto del mockup,
// mostrarla como si fuera opcional habría sido engañoso.
function NotificationMatrixSection({ userId }: { userId: string }) {
  const { data: rows } = useNotificationPreferences(userId)
  const setMutation = useSetNotificationPreferenceMutation(userId)

  return (
    <SettingsSection title="Qué te avisa" description="Por evento y por canal.">
      <div className="grid grid-cols-[minmax(0,1fr)_50px_50px_50px] items-center @min-[620px]:grid-cols-[minmax(0,1fr)_64px_64px_64px]">
        {['', 'Bandeja', 'Push', 'Correo'].map((header, i) => (
          <span
            key={header || 'evento'}
            className={cn(
              'pb-2 text-[10px] font-medium tracking-wider text-text-muted uppercase',
              i > 0 && 'text-center',
            )}
          >
            {header}
          </span>
        ))}
        {NOTIFICATION_EVENTS.map((event) => {
          const { push, email } = resolvePreference(rows, event)
          const label = NOTIFICATION_EVENT_LABEL[event]
          const cell = 'flex justify-center border-t border-border py-2.5'
          return (
            <Fragment key={event}>
              <div className="flex flex-col border-t border-border py-2.5 pr-2 text-[13px]">
                <span>{label.title}</span>
                {label.hint && <span className="text-[11.5px] text-text-muted">{label.hint}</span>}
              </div>
              <div className={cell}>
                <Switch checked disabled aria-label={`${label.title}, en bandeja (siempre activo)`} />
              </div>
              <div className={cell}>
                <Switch
                  checked={push}
                  onCheckedChange={(v) => setMutation.mutate({ event, channel: 'push', value: v })}
                  aria-label={`${label.title}, por push`}
                />
              </div>
              <div className={cell}>
                <Switch
                  checked={email}
                  onCheckedChange={(v) => setMutation.mutate({ event, channel: 'email', value: v })}
                  aria-label={`${label.title}, por correo`}
                />
              </div>
            </Fragment>
          )
        })}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <HugeiconsIcon icon={LockPasswordIcon} className="size-3 shrink-0" />
        La bandeja recibe todo siempre. Los interruptores deciden qué más te interrumpe.
      </p>
    </SettingsSection>
  )
}

// Horario de silencio (0092): solo pausa Push — la Bandeja no cambia (ver
// worker/push-dispatch.ts). Los avisos suprimidos no se pierden: quedan
// pendientes y el barrido de cada minuto los entrega apenas termina la
// ventana (push_quiet_hold).
function QuietHoursSection({ userId, profile }: { userId: string; profile: ProfileRow }) {
  const updateProfileMutation = useUpdateProfileMutation(userId)

  function set<K extends keyof ProfileRow>(field: K, value: ProfileRow[K]) {
    updateProfileMutation.mutate(
      { [field]: value },
      { onError: () => toast.error('No se pudo guardar la preferencia.') },
    )
  }

  return (
    <SettingsSection
      title="Horario de silencio"
      description="Los push se guardan y llegan al terminar. La bandeja no cambia."
    >
      <SettingList>
        <SettingRow
          icon={Moon02Icon}
          title={
            profile.quiet_hours_enabled
              ? `Silenciar de ${String(profile.quiet_hours_start).padStart(2, '0')}:00 a ${String(profile.quiet_hours_end).padStart(2, '0')}:00`
              : 'Silenciar por horario'
          }
          subtitle={`En tu zona horaria, ${(profile.timezone ?? 'America/Santiago').split('/').pop()?.replace(/_/g, ' ')}`}
          action={
            <Switch
              checked={profile.quiet_hours_enabled}
              onCheckedChange={(v) => set('quiet_hours_enabled', v)}
              aria-label="Silenciar por horario"
            />
          }
        />
        <SettingRow
          icon={Moon02Icon}
          title="Silenciar fines de semana"
          action={
            <Switch
              checked={profile.quiet_weekends}
              onCheckedChange={(v) => set('quiet_weekends', v)}
              aria-label="Silenciar fines de semana"
            />
          }
        />
      </SettingList>

      {profile.quiet_hours_enabled && (
        <FieldGrid>
          <Field label="Desde" htmlFor="quiet-start">
            <Select value={String(profile.quiet_hours_start)} onValueChange={(v) => set('quiet_hours_start', Number(v))}>
              <SelectTrigger id="quiet-start" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Hasta" htmlFor="quiet-end">
            <Select value={String(profile.quiet_hours_end)} onValueChange={(v) => set('quiet_hours_end', Number(v))}>
              <SelectTrigger id="quiet-end" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGrid>
      )}
    </SettingsSection>
  )
}

// Resumen semanal (0058_profile_preferences.sql + 0092 para día/hora).
// worker/digest-dispatch.ts ahora corre por hora y filtra por día+hora
// LOCAL de cada persona — ver el comentario de HOURLY_CRON en
// worker/index.ts para por qué el cron cambió de frecuencia.
function DigestSection({ userId, profile }: { userId: string; profile: ProfileRow }) {
  const updateProfileMutation = useUpdateProfileMutation(userId)

  function set<K extends keyof ProfileRow>(field: K, value: ProfileRow[K]) {
    updateProfileMutation.mutate(
      { [field]: value },
      { onError: () => toast.error('No se pudo guardar la preferencia.') },
    )
  }

  return (
    <SettingsSection
      title="Resumen semanal por correo"
      description="Lo que vence, lo que se atrasó y lo que se completó en tu semana."
    >
      <SettingRow
        icon={Mail01Icon}
        title="Enviar resumen"
        subtitle={
          profile.last_digest_sent_at ? `Último envío: ${formatDate(profile.last_digest_sent_at)}` : 'Todavía no se envió ninguno.'
        }
        action={
          <Switch
            checked={profile.weekly_digest_enabled}
            onCheckedChange={(v) => set('weekly_digest_enabled', v)}
            aria-label="Resumen semanal por correo"
          />
        }
      />
      {profile.weekly_digest_enabled && (
        <FieldGrid>
          <Field label="Día" htmlFor="digest-day">
            <Select value={String(profile.digest_day)} onValueChange={(v) => set('digest_day', Number(v))}>
              <SelectTrigger id="digest-day" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Hora" htmlFor="digest-hour">
            <Select value={String(profile.digest_hour)} onValueChange={(v) => set('digest_hour', Number(v))}>
              <SelectTrigger id="digest-hour" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGrid>
      )}
    </SettingsSection>
  )
}

// Slack/GitHub salieron de esta sección (pedido explícito del usuario,
// 2026-09-10): no eran una promesa real, dos botones "Conectar"
// deshabilitados sin backend detrás ni plan de construirlo. Google
// Calendar es la única integración real, se queda.
function IntegrationsSection({ workspaceId }: { workspaceId: string }) {
  const { data: connection } = useGoogleConnection()

  // Las dos direcciones van en secciones separadas porque son cosas
  // distintas aunque las una la palabra "calendario": sacar tareas HACIA
  // Google (un enlace, sin permisos) y traer eventos DESDE Google (OAuth,
  // solo lectura). La cabecera de arriba es lo único que las agrupa.
  return (
    <>
      <div className="flex items-center gap-3 pb-5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-md bg-surface-alt text-text-secondary">
          <HugeiconsIcon icon={Calendar01Icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">Google Calendar</div>
          <div className="text-xs text-text-muted">
            Tus fechas y ausencias en tu calendario, y tu calendario dentro de Flow.
          </div>
        </div>
        {connection && (
          <Pill tone="ok">
            <span className="size-1.5 rounded-full bg-success" />
            Conectado
          </Pill>
        )}
      </div>

      <SettingsSection
        title="Tus tareas en tu calendario"
        description="Un enlace privado que Google consulta cada algunas horas. No pide permisos."
      >
        {workspaceId && <CalendarFeedSection workspaceId={workspaceId} compact />}
      </SettingsSection>

      <SettingsSection
        title="Tus eventos de Google en Flow"
        description="Solo lectura. Flow nunca crea ni cambia eventos en tu calendario."
      >
        {workspaceId && <GoogleCalendarSection workspaceId={workspaceId} />}
      </SettingsSection>
    </>
  )
}

// "Descargar mis datos" (rediseño de Ajustes PR 6) — tres CSV por
// separado (tareas asignadas, comentarios propios, horas registradas), sin
// cola ni aviso por Bandeja: a la escala de una sola persona el Worker los
// arma dentro del mismo request (worker/account-export.ts).
function DataExportSection() {
  const [pending, setPending] = useState<AccountExportType | null>(null)

  async function handleDownload(type: AccountExportType) {
    setPending(type)
    try {
      await downloadAccountExport(type)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar la descarga.')
    } finally {
      setPending(null)
    }
  }

  const EXPORTS: { type: AccountExportType; label: string; hint: string }[] = [
    { type: 'tasks', label: 'Tareas', hint: 'Las tareas que tienes asignadas.' },
    { type: 'comments', label: 'Comentarios', hint: 'Los comentarios que escribiste.' },
    { type: 'time', label: 'Horas', hint: 'Tus horas registradas por tarea.' },
  ]

  return (
    <SettingsSection
      title="Descargar mis datos"
      description="Tus tareas, comentarios y horas registradas, en archivos CSV."
    >
      <SettingList>
        {EXPORTS.map((item) => (
          <SettingRow
            key={item.type}
            icon={Download01Icon}
            title={item.label}
            subtitle={item.hint}
            wrap
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending !== null}
                onClick={() => handleDownload(item.type)}
              >
                {pending === item.type ? 'Generando…' : 'Descargar'}
              </Button>
            }
          />
        ))}
      </SettingList>
      <Note>Se generan al momento: la descarga empieza apenas termina de armarse el archivo.</Note>
    </SettingsSection>
  )
}

function DangerSection({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false)
  const { data: impact } = useAccountDeletionImpact(userId)
  const { data: links } = useMyPublicLinks(userId)

  const consequences: string[] = []
  if (impact) {
    if (impact.openTasks > 0) {
      consequences.push(
        `${impact.openTasks} tarea${impact.openTasks === 1 ? '' : 's'} abierta${impact.openTasks === 1 ? '' : 's'} queda${impact.openTasks === 1 ? '' : 'n'} sin responsable${impact.openMilestones > 0 ? `, ${impact.openMilestones} de ellas ${impact.openMilestones === 1 ? 'es un hito' : 'son hitos'}.` : '.'}`,
      )
    }
    if (impact.pendingReviews > 0) {
      consequences.push(
        `${impact.pendingReviews} revisión${impact.pendingReviews === 1 ? '' : 'es'} que tienes pendiente${impact.pendingReviews === 1 ? '' : 's'} queda${impact.pendingReviews === 1 ? '' : 'n'} sin revisor.`,
      )
    }
  }
  if (links && links.length > 0) {
    consequences.push(`Tu${links.length === 1 ? '' : 's'} ${links.length} link${links.length === 1 ? '' : 's'} público${links.length === 1 ? '' : 's'} deja${links.length === 1 ? '' : 'n'} de funcionar.`)
  }

  return (
    <>
      <DataExportSection />

      <SettingsSection title="Eliminar cuenta" description="Es permanente. Nadie puede recuperarla, ni un administrador.">
        {/* Bloque rojo con las consecuencias concretas: el mockup lo pone
            así a propósito — lo que frena un borrado no es la palabra
            "permanente", es ver qué queda huérfano si sigues. */}
        <div className="flex flex-col gap-3 rounded-xl bg-danger-bg p-4">
          <h3 className="text-sm font-semibold text-danger-text">Antes de eliminar, esto es lo que pasa</h3>
          <ul className="flex flex-col gap-1.5 text-[13px] text-text-secondary">
            {(consequences.length > 0
              ? consequences
              : ['No hay tareas ni revisiones tuyas que queden sin responsable.']
            ).map((c) => (
              <li key={c} className="flex items-baseline gap-2">
                <span className="size-1.5 shrink-0 -translate-y-px rounded-full bg-danger" />
                {c}
              </li>
            ))}
            <li className="flex items-baseline gap-2">
              <span className="size-1.5 shrink-0 -translate-y-px rounded-full bg-danger" />
              Tu feed de calendario y la conexión con Google se desactivan.
            </li>
          </ul>

          <Actions>
            {impact && impact.openTasks > 0 && (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/mis-tareas">Reasignar mis tareas primero</Link>
              </Button>
            )}
            <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
              Eliminar cuenta
            </Button>
          </Actions>

          <Note>Para confirmar vas a escribir tu correo.</Note>
        </div>
      </SettingsSection>

      <DeleteAccountDialog open={open} onOpenChange={setOpen} email={email} />
    </>
  )
}
