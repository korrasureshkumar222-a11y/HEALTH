import { expect, test } from '@playwright/test'

const apiBase = 'http://127.0.0.1:5000/api'
const seedPassword = process.env.SEED_PASSWORD

async function login(page, phone, password = seedPassword) {
  await page.goto('/login')
  await page.getByLabel('Phone number').fill(phone)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function apiLogin(request, phone) {
  const response = await request.post(`${apiBase}/auth/login`, {
    data: { phone, password: seedPassword },
  })
  expect(response.ok()).toBeTruthy()
  const result = await response.json()
  return result.data.accessToken
}

test('register → login → critical reading → doctor sees alert', async ({ page, browser, request }) => {
  const suffix = `${Date.now()}`.slice(-9)
  const phone = `9${suffix.padStart(9, '0')}`
  const name = `E2E Patient ${suffix}`
  const password = 'E2E-Patient-Password-2026!'

  await page.goto('/register')
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Village', { exact: true }).fill('Mangalagiri')
  await page.getByLabel('Phone number').fill(phone)
  await page.getByLabel(/Email/).fill(`e2e-${suffix}@example.invalid`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create patient account' }).click()
  await expect(page).toHaveURL(/\/login$/)

  const adminToken = await apiLogin(request, '9000000001')
  const adminHeaders = { Authorization: `Bearer ${adminToken}` }
  const patientResponse = await request.get(`${apiBase}/patients?search=${encodeURIComponent(name)}`, {
    headers: adminHeaders,
  })
  expect(patientResponse.ok()).toBeTruthy()
  const patientResult = await patientResponse.json()
  const patient = patientResult.data.items.find((item) => item.name === name)
  expect(patient?._id).toBeTruthy()

  const staffResponse = await request.get(`${apiBase}/patients/assignables`, { headers: adminHeaders })
  expect(staffResponse.ok()).toBeTruthy()
  const staff = (await staffResponse.json()).data
  const doctor = staff.doctors.find((candidate) => candidate.user?.phone === '9000000002')
  expect(doctor?._id).toBeTruthy()
  const assignmentResponse = await request.patch(
    `${apiBase}/patients/${patient._id}/assignments`,
    { headers: adminHeaders, data: { doctorId: doctor._id } },
  )
  expect(assignmentResponse.ok()).toBeTruthy()

  await login(page, phone, password)
  await expect(page).toHaveURL(/\/patient$/)
  await page.goto('/patient/readings/new')
  await page.getByLabel('Systolic (mmHg)').fill('184')
  await page.getByLabel('Diastolic (mmHg)').fill('122')
  await page.getByRole('button', { name: 'Save reading' }).click()
  await expect(page.getByRole('heading', { name: 'Reading saved' })).toBeVisible()

  const doctorPage = await browser.newPage()
  await login(doctorPage, '9000000002')
  await expect(doctorPage).toHaveURL(/\/doctor$/)
  await doctorPage.goto('/doctor/alerts')
  await expect(doctorPage.getByRole('heading', { name }).first()).toBeVisible()
  await expect(
    doctorPage.locator('article').filter({ hasText: name }),
  ).toContainText(/critical/i)
  await doctorPage.close()
})

test('offline reading is queued and syncs after reconnect', async ({ page }) => {
  await login(page, '9000000006')
  await expect(page).toHaveURL(/\/patient$/)
  await page.goto('/patient/readings/new')
  await page.context().setOffline(true)
  await page.getByLabel('Systolic (mmHg)').fill('142')
  await page.getByLabel('Diastolic (mmHg)').fill('92')
  await page.getByRole('button', { name: 'Save reading' }).click()
  await expect(page.getByRole('heading', { name: 'Reading saved on this device' })).toBeVisible()

  await page.context().setOffline(false)
  await expect.poll(async () => {
    const response = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open('chronic-care-client')
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('pendingReadings', 'readonly')
        const request = transaction.objectStore('pendingReadings').getAll()
        request.onsuccess = () => resolve(request.result.filter((item) => item.status === 'pending').length)
        request.onerror = () => reject(request.error)
      })
    })
    return response
  }, { timeout: 20_000 }).toBe(0)

  const syncBadge = page.getByText(/synced|pending/i).first()
  await expect(syncBadge).toBeVisible()
})

test('patient can trigger SOS and see the server-confirmed status timeline', async ({ page }) => {
  const suffix = `${Date.now()}`.slice(-9)
  const phone = `9${suffix.padStart(9, '0')}`
  const name = `SOS E2E Patient ${suffix}`
  const password = 'E2E-Patient-Password-2026!'

  await page.goto('/register')
  await page.getByLabel('Full name').fill(name)
  await page.getByLabel('Village', { exact: true }).fill('Mangalagiri')
  await page.getByLabel('Phone number').fill(phone)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create patient account' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, phone, password)
  await expect(page).toHaveURL(/\/patient$/)
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 16.43, longitude: 80.56 })
  await page.goto('/patient/sos')
  const sosButton = page.getByRole('button', { name: /press and hold to request help/i })
  await sosButton.focus()
  await page.keyboard.down('Space')
  await page.waitForTimeout(2200)
  await page.keyboard.up('Space')
  await expect(page.getByText(/sent in/i)).toBeVisible()
  await page.getByRole('button', { name: /cancel/i }).click()
  await expect(sosButton).toBeVisible()

  await sosButton.focus()
  await page.keyboard.down('Space')
  await page.waitForTimeout(2200)
  await page.keyboard.up('Space')
  await page.waitForTimeout(6000)
  await expect(page.getByRole('heading', { name: /sos status/i })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/request started/i).first()).toBeVisible()
})
