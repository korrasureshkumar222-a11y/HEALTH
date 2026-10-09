const errorTranslationKeys = {
  ACCOUNT_TEMPORARILY_LOCKED: 'accountLocked',
  INVALID_CREDENTIALS: 'invalidCredentials',
  UNAUTHENTICATED: 'invalidCredentials',
  ACCOUNT_EXISTS: 'accountExists',
  PATIENT_PROFILE_EXISTS: 'patientProfileExists',
  VALIDATION_ERROR: 'formValidationError',
  REGISTER_RATE_LIMITED: 'registrationRateLimited',
}

export function getAuthErrorMessage(error, t, fallbackKey) {
  const code = error.response?.data?.error?.code
  if (!error.response) return t('networkError')

  if (code && errorTranslationKeys[code]) {
    return t(errorTranslationKeys[code])
  }

  return t(fallbackKey)
}
