import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { TimeOffList } from '@/features/people/components/TimeOffList'
import { CalendarFeedSection } from '@/features/people/components/CalendarFeedSection'
import { GoogleUpcomingEvents } from '@/features/people/components/GoogleCalendarSection'

export function PersonCalendarTab({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const { data: session } = useSession()
  const { role } = useCurrentWorkspace()

  // Espeja `time_off_insert_own_or_admin` (0026): la propia, o cualquiera si
  // eres admin. Es UI, no autorización — la policy sigue decidiendo.
  const canEdit = session?.user.id === userId || role === 'owner' || role === 'admin'

  return (
    <div className="flex flex-col gap-3">
      <TimeOffList workspaceId={workspaceId} userId={userId} canEdit={canEdit} />

      {/* El feed y los eventos de Google solo se ofrecen en la ficha propia:
          son credenciales y agenda personales, y mostrárselos a un admin que
          abre la ficha de otra persona sería darle acceso a lo que no le
          corresponde. La RLS de `google_credentials` lo impide igual — esto
          es para que la UI no prometa algo que la base va a negar. */}
      {session?.user.id === userId && (
        <>
          <div className="rounded-md border border-border p-2.5">
            <CalendarFeedSection workspaceId={workspaceId} />
          </div>
          <GoogleUpcomingEvents />
        </>
      )}
    </div>
  )
}
