import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Activity, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/useAuth.js'
import LanguageToggle from '../components/LanguageToggle.jsx'
import { getAuthErrorMessage } from '../utils/authMessages.js'

const roleHomes = {
  patient: '/patient',
  doctor: '/doctor',
  chw: '/chw',
  admin: '/admin',
}

function rolePathMatches(role, path) {
  return path === roleHomes[role] || path.startsWith(`${roleHomes[role]}/`)
}

function isSafeRolePath(role, path) {
  return typeof path === 'string'
    && /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(path)
    && roleHomes[role]
    && rolePathMatches(role, path)
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ mode: 'onBlur' })

  async function onSubmit(values) {
    setSubmitting(true)
    try {
      const user = await login(values)
      const requestedPath = location.state?.from?.pathname
      const destination = isSafeRolePath(user.role, requestedPath)
        ? requestedPath
        : roleHomes[user.role] ?? '/login'
      navigate(destination, { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error, t, 'loginFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] min-h-screen place-items-center bg-canvas px-4 py-8">
      <section className="w-full min-w-0 max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-info-bg text-brand">
              <Activity size={26} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-muted">{t('appTitle')}</p>
              <h1 className="text-xl font-bold text-ink">{t('appSubtitle')}</h1>
            </div>
          </div>
          <LanguageToggle />
        </div>

        <h2 className="mb-2 text-2xl font-bold text-ink">{t('signIn')}</h2>
        <p className="mb-6 text-sm leading-6 text-muted">{t('signInDescription')}</p>

        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink" htmlFor="login-phone">
              {t('phoneNumber')}
            </label>
            <input
              id="login-phone"
              autoComplete="tel"
              inputMode="tel"
              maxLength={13}
              className="min-h-12 w-full rounded-lg border border-border px-4 text-base"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'login-phone-error' : undefined}
              {...register('phone', {
                required: 'enterPhone',
                pattern: { value: /^(?:\+91)?[6-9]\d{9}$/, message: 'validPhone' },
              })}
            />
            {errors.phone && (
              <p id="login-phone-error" className="mt-1 text-sm text-critical" role="alert">
                {t(errors.phone.message)}
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-ink" htmlFor="login-password">
              {t('password')}
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="min-h-12 w-full rounded-lg border border-border px-4 pr-14 text-base"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                {...register('password', { required: 'enterPassword' })}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted hover:bg-slate-100"
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword
                  ? <EyeOff size={20} aria-hidden="true" />
                  : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>
            {errors.password && (
              <p id="login-password-error" className="mt-1 text-sm text-critical" role="alert">
                {t(errors.password.message)}
              </p>
            )}
          </div>

          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 font-bold text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70"
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" aria-hidden="true" />
            )}
            {submitting ? t('signingIn') : t('signIn')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {t('newPatient')}{' '}
          <Link className="font-semibold text-brand underline underline-offset-2" to="/register">
            {t('createAccount')}
          </Link>
        </p>
        <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted">
          {t('privacyDisclaimer')}
        </p>
      </section>
    </main>
  )
}
