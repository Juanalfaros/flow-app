import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { unenrollFactor } from '@/features/security/api'
import { useEnrollTotpMutation, useVerifyTotpMutation } from '@/features/security/mutations'

// Flujo real de TOTP vía `supabase.auth.mfa` (ver security/api.ts): al
// abrir se pide un factor nuevo (queda "unverified" hasta que se confirme
// el código), se muestra el QR + secreto, y `challengeAndVerify` lo
// activa. Si la persona cierra el diálogo sin terminar, el factor
// unverified se limpia (best-effort) para no dejar basura acumulada en
// auth.mfa_factors cada vez que alguien abre y cancela.
export function TwoFactorEnrollDialog({
  open,
  onOpenChange,
  onEnrolled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnrolled: () => void
}) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const verifiedRef = useRef(false)

  const enrollMutation = useEnrollTotpMutation()
  const verifyMutation = useVerifyTotpMutation()

  useEffect(() => {
    if (!open) return
    verifiedRef.current = false
    setCode('')
    enrollMutation.mutate(undefined, {
      onSuccess: (data) => {
        setFactorId(data.id)
        setQrCode(data.totp.qr_code)
        setSecret(data.totp.secret)
      },
      onError: () => {
        toast.error('No se pudo iniciar la activación de 2FA.')
        onOpenChange(false)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleOpenChange(next: boolean) {
    if (!next && factorId && !verifiedRef.current) {
      // Limpieza best-effort: no bloquea el cierre ni muestra error si falla.
      void unenrollFactor(factorId).catch(() => {})
    }
    if (!next) {
      setFactorId(null)
      setQrCode(null)
      setSecret(null)
    }
    onOpenChange(next)
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId || code.length < 6) return
    verifyMutation.mutate(
      { factorId, code },
      {
        onSuccess: () => {
          verifiedRef.current = true
          toast.success('Verificación en dos pasos activada.')
          onEnrolled()
          handleOpenChange(false)
        },
        onError: () => toast.error('Código inválido. Prueba de nuevo.'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Activar verificación en dos pasos</DialogTitle>
        </DialogHeader>

        {enrollMutation.isPending || !qrCode ? (
          <p className="py-4 text-sm text-text-muted">Generando código…</p>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">
              Escanea el código con tu app de autenticación (Google Authenticator, Authy, etc.) o ingresa el
              secreto manualmente.
            </p>
            <img src={qrCode} alt="Código QR para verificación en dos pasos" className="mx-auto size-40" />
            {secret && (
              <p className="break-all rounded-md bg-surface-alt px-2 py-1.5 text-center font-mono text-[11px] text-text-muted">
                {secret}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="totp-code">Código de 6 dígitos</Label>
              <Input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </div>
            <DialogFooter>
              <Button type="submit" size="sm" disabled={code.length < 6 || verifyMutation.isPending}>
                {verifyMutation.isPending ? 'Verificando…' : 'Verificar y activar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
