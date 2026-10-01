// Roles de workspace, centralizados: ShareDialog e InviteMemberForm tenían
// cada uno su propia copia de ROLES/ROLE_LABEL, y profile.tsx una tercera.

/**
 * Etiquetas para MOSTRAR un rol existente. Incluye 'owner' (no invitable, se
 * asigna al crear el workspace en `create_workspace_with_defaults`) y 'guest'
 * (ver abajo: hoy no se puede elegir, pero puede haber filas viejas).
 */
export const ROLE_LABEL: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  member: 'Miembro',
  restricted: 'Miembro restringido',
  guest: 'Invitado',
}

export interface InviteRoleOption {
  value: string
  label: string
  description: string
  /**
   * Si la RLS realmente distingue este rol.
   *
   * Los cuatro están activos desde 0031_restricted_roles.sql, que apoyó
   * `restricted` y `guest` sobre la capa de acceso por espacio (0028-0029):
   * para esos dos roles, un espacio "abierto" deja de significar visible para
   * todo el workspace — solo ven los espacios que se les comparte
   * explícitamente, por persona o por equipo.
   *
   * El campo se conserva porque es el interruptor correcto si mañana se suma
   * un rol antes de que la RLS lo contemple: mostrarlo deshabilitado es mejor
   * que ofrecer una restricción que no existe.
   */
  enforced: boolean
}

/**
 * Roles ofrecidos al invitar.
 *
 * Los cuatro restringen de verdad. `restricted` y `guest` se apoyan en la capa
 * de acceso por espacio (0028_space_acl_data.sql / 0029_space_acl_policies.sql)
 * y en `can_access_space`, que para esos dos roles exige concesión explícita
 * incluso en un espacio abierto (0031_restricted_roles.sql).
 *
 * La diferencia entre ambos es de intención, no de permisos: la RLS hoy los
 * trata igual. `guest` existe para nombrar a alguien externo al equipo, y se
 * mantiene separado para poder acotarlo más adelante (por ejemplo, sin poder
 * crear listas) sin tocar a quienes ya son `restricted`.
 */
// Tupla no vacía y no `InviteRoleOption[]`: el diálogo usa `INVITE_ROLES[0]`
// como rol por defecto, y con un array llano ese acceso es opcional. El tipo
// deja explícito que siempre hay al menos una opción.
export const INVITE_ROLES: [InviteRoleOption, ...InviteRoleOption[]] = [
  {
    value: 'member',
    label: 'Miembro',
    description: 'Tiene acceso a todos los espacios abiertos del entorno de trabajo.',
    enforced: true,
  },
  {
    value: 'restricted',
    label: 'Miembro restringido',
    description: 'Solo tiene acceso a los espacios que se le compartan, directamente o por equipo.',
    enforced: true,
  },
  {
    value: 'guest',
    label: 'Invitado',
    description: 'Externo al equipo. Igual que Miembro restringido: solo ve lo que se le comparte.',
    enforced: true,
  },
  {
    value: 'admin',
    label: 'Administrador',
    description: 'Ve todos los espacios y gestiona personas, equipos y accesos.',
    enforced: true,
  },
]

/** Los que se pueden elegir de verdad hoy. */
export const INVITABLE_ROLES = INVITE_ROLES.filter((r) => r.enforced).map((r) => r.value)
