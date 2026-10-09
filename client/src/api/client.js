import axios from 'axios'
import {
  getAccessToken,
  notifySessionExpired,
  setAccessToken,
} from './tokenStore.js'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export const apiClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 20000,
})

const refreshClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 20000,
})

function responseData(response) {
  return response.data?.data ?? response.data
}

let refreshPromise = null

export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/auth/refresh')
      .then((response) => {
        const result = responseData(response)
        if (!result?.accessToken) {
          throw new Error('Refresh response did not include an access token.')
        }
        setAccessToken(result.accessToken)
        return result
      })
      .catch((error) => {
        if (error.response?.status === 401) notifySessionExpired()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  try {
    const offlineUser = JSON.parse(sessionStorage.getItem('chronic-care-user') ?? 'null')
    if (typeof offlineUser?.id === 'string') config.headers['X-Offline-User'] = offlineUser.id
  } catch (error) {
    console.warn('Could not add the offline cache scope to this request.', error)
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config
    const requestPath = request?.url?.split('?')[0].replace(/\/+$/, '')
    const isAuthRequest = /(?:^|\/)auth\/(?:login|register|refresh)$/.test(requestPath ?? '')

    if (error.response?.status !== 401 || !request || request._retry || isAuthRequest) {
      return Promise.reject(error)
    }

    request._retry = true
    try {
      await refreshSession()
      request.headers ??= {}
      request.headers.Authorization = `Bearer ${getAccessToken()}`
      return apiClient(request)
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  },
)

export function getApiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return (
    error.response?.data?.message ??
    error.response?.data?.error?.message ??
    error.message ??
    fallback
  )
}
