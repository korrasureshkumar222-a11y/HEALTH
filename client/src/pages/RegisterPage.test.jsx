import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RegisterPage from './RegisterPage.jsx'
import { createTestI18n, renderWithProviders } from '../test/renderWithProviders.jsx'

const translations = {
  en: {
    patientAccount: 'Patient account',
    createAccount: 'Create an account',
    language: 'Language',
    registrationDescription: 'Create an account.',
    fullName: 'Full name',
    village: 'Village',
    phoneNumber: 'Phone number',
    email: 'Email address',
    optional: 'optional',
    password: 'Password',
    confirmPassword: 'Confirm password',
    consentText: 'I agree to continue.',
    createPatientAccount: 'Create patient account',
    creatingAccount: 'Creating account',
    alreadyRegistered: 'Already registered?',
    signIn: 'Sign in',
    accountPolicy: 'Patient accounts only.',
    showPassword: 'Show password',
    passwordLength: 'Password must contain at least 12 characters.',
    passwordComplexity: 'Password must include at least one letter and one number.',
  },
}

describe('RegisterPage', () => {
  it('rejects passwords that the backend would reject before sending the request', async () => {
    const user = userEvent.setup()
    const register = vi.fn()
    const i18n = await createTestI18n(translations)
    renderWithProviders(<RegisterPage />, {
      i18n,
      authValue: { register },
    })

    await user.type(screen.getByLabelText('Full name'), 'Test Patient')
    await user.type(screen.getByLabelText('Village'), 'Test Village')
    await user.type(screen.getByLabelText('Phone number'), '9876543210')
    await user.type(screen.getByLabelText('Password'), 'Short123')
    await user.type(screen.getByLabelText('Confirm password'), 'Short123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create patient account' }))

    expect(await screen.findByText('Password must contain at least 12 characters.')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('requires a letter and a number in the password', async () => {
    const user = userEvent.setup()
    const register = vi.fn()
    const i18n = await createTestI18n(translations)
    renderWithProviders(<RegisterPage />, {
      i18n,
      authValue: { register },
    })

    await user.type(screen.getByLabelText('Full name'), 'Test Patient')
    await user.type(screen.getByLabelText('Village'), 'Test Village')
    await user.type(screen.getByLabelText('Phone number'), '9876543210')
    await user.type(screen.getByLabelText('Password'), 'OnlyLettersHere')
    await user.type(screen.getByLabelText('Confirm password'), 'OnlyLettersHere')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create patient account' }))

    expect(await screen.findByText('Password must include at least one letter and one number.')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })
})
