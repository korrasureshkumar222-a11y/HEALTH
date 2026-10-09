import { apiClient } from './client.js'

function responseData(response) {
  return response.data?.data ?? response.data
}

export async function loginRequest(credentials) {
  const response = await apiClient.post('/auth/login', credentials)
  return responseData(response)
}

export async function registerRequest(details) {
  const response = await apiClient.post('/auth/register', details)
  return responseData(response)
}

export async function logoutRequest() {
  await apiClient.post('/auth/logout')
}

export async function updateLanguageRequest(language) {
  const response = await apiClient.patch('/auth/language', { language })
  return responseData(response)
}
