import { createFileRoute, redirect } from '@tanstack/react-router'
import { AdminPage } from '@/features/admin/components/AdminPage'
import { adminOverviewQueryOptions, isPlatformAdminQueryOptions } from '@/features/admin/queries'

// Solo el super admin (0095_platform_admin.sql). El guard del cliente es
// cortesía: la barrera real son las funciones admin_* en la base, que exigen
// `is_platform_admin()` aunque alguien navegue directo a esta URL.
export const Route = createFileRoute('/_app/admin')({
  beforeLoad: async ({ context }) => {
    const isAdmin = await context.queryClient.ensureQueryData(isPlatformAdminQueryOptions())
    if (!isAdmin) throw redirect({ to: '/' })
    await context.queryClient.ensureQueryData(adminOverviewQueryOptions())
  },
  component: AdminPage,
})
