import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/useAuth.js'
import LanguageToggle from '../components/LanguageToggle.jsx'
import { getAuthErrorMessage } from '../utils/authMessages.js'

export default function RegisterPage() {
  const { register: registerAccount } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({ mode: 'onBlur' })

  async function onSubmit(values) {
    setSubmitting(true)
    try {
      await registerAccount({
        name: values.name.trim(),
        phone: values.phone.trim(),
        email: values.email?.trim() || undefined,
        password: values.password,
        language: i18n.resolvedLanguage === 'te' ? 'te' : 'en',
        village: values.village.trim(),
        consent: { accepted: true, policyVersion: 'current' },
      })
      toast.success(t('accountCreated'))
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error, t, 'registrationFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] min-h-screen place-items-center bg-canvas px-4 py-8">
      <section className="w-full min-w-0 max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand">{t('patientAccount')}</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">{t('createAccount')}</h1>
          </div>
          <LanguageToggle />
        </div>
        <p className="mb-6 text-sm leading-6 text-muted">{t('registrationDescription')}</p>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField
            label={t('fullName')}
            name="name"
            autoComplete="name"
            register={register}
            error={errors.name}
            translate={t}
            rules={{ required: 'enterName', maxLength: { value: 120, message: 'enterName' } }}
          />
          <FormField
            label={t('village')}
            name="village"
            autoComplete="address-level3"
            register={register}
            error={errors.village}
            translate={t}
            rules={{ required: 'enterVillage', maxLength: { value: 120, message: 'enterVillage' } }}
          />
          <FormField
            label={t('phoneNumber')}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            maxLength={13}
            register={register}
            error={errors.phone}
            translate={t}
            rules={{
              required: 'enterPhone',
              pattern: { value: /^(?:\+91)?[6-9]\d{9}$/, message: 'validPhone' },
            }}
          />
          <FormField
            label={`${t('email')} (${t('optional')})`}
            name="email"
            type="email"
            autoComplete="email"
            register={register}
            error={errors.email}
            translate={t}
            rules={{
              validate: (value) => !value
                || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
                || 'validEmail',
            }}
          />
          <FormField
            label={t('password')}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            register={register}
            error={errors.password}
            translate={t}
            rules={{
              required: 'enterPassword',
              minLength: { value: 12, message: 'passwordLength' },
              maxLength: { value: 72, message: 'passwordMax' },
              pattern: {
                value: /^(?=.*[A-Za-z])(?=.*\d).+$/,
                message: 'passwordComplexity',
              },
            }}
            trailingAction={
              <PasswordToggle
                visible={showPassword}
                onToggle={() => setShowPassword((shown) => !shown)}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
              />
            }
          />
          <FormField
            label={t('confirmPassword')}
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            register={register}
            error={errors.confirmPassword}
            translate={t}
            rules={{
              required: 'confirmPasswordHint',
              validate: (value) => value === getValues('password') || 'passwordsDoNotMatch',
            }}
            trailingAction={
              <PasswordToggle
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((shown) => !shown)}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
              />
            }
          />
          <div>
            <label className="flex min-h-12 items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm leading-5 text-muted">
              <input
                className="mt-1 h-5 w-5 shrink-0 accent-brand"
                type="checkbox"
                aria-invalid={Boolean(errors.consentAccepted)}
                aria-describedby={errors.consentAccepted ? 'consent-error' : undefined}
                {...register('consentAccepted', { required: 'consentRequired' })}
              />
              <span>{t('consentText')}</span>
            </label>
            {errors.consentAccepted && (
              <p id="consent-error" className="mt-1 text-sm text-critical" role="alert">
                {t(errors.consentAccepted.message)}
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
            {submitting ? t('creatingAccount') : t('createPatientAccount')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {t('alreadyRegistered')}{' '}
          <Link className="font-semibold text-brand underline underline-offset-2" to="/login">
            {t('signIn')}
          </Link>
        </p>
        <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted">
          {t('accountPolicy')}
        </p>
      </section>
    </main>
  )
}

function FormField({
  label,
  name,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
  register,
  rules,
  error,
  translate,
  trailingAction,
}) {
  const errorId = `${name}-error`
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-ink" htmlFor={`register-${name}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={`register-${name}`}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          className={`min-h-12 w-full rounded-lg border border-border px-4 text-base ${trailingAction ? 'pr-14' : ''}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          {...register(name, rules)}
        />
        {trailingAction}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-critical" role="alert">
          {translate(error.message)}
        </p>
      )}
    </div>
  )
}

function PasswordToggle({ visible, onToggle, showLabel, hideLabel }) {
  return (
    <button
      type="button"
      className="absolute inset-y-0 right-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted hover:bg-slate-100"
      aria-label={visible ? hideLabel : showLabel}
      aria-pressed={visible}
      onClick={onToggle}
    >
      {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
    </button>
  )
}
