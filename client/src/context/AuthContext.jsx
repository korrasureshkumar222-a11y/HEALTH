import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  loginRequest,
  logoutRequest,
  registerRequest,
  updateLanguageRequest,
} from '../api/auth.js'
import { refreshSession } from '../api/client.js'
import i18n from '../i18n/index.js'
import {
  setAccessToken,
  setSessionExpiredHandler,
} from '../api/tokenStore.js'
import AuthContext from './authContext.js'
import { clearCachedEmergencyPhones } from '../offline/sosQueue.js'
import { startSyncManager, stopSyncManager } from '../offline/syncManager.js'

const persistedUserKey = 'chronic-care-user'
const validRoles = new Set(['patient', 'doctor', 'chw', 'admin'])

function readPersistedUser() {
  try {
    const saved = sessionStorage.getItem(persistedUserKey)
    if (!saved) return null
    const user = JSON.parse(saved)
    return user && typeof user.id === 'string' && validRoles.has(user.role) ? user : null
  } catch (error) {
    console.warn('Could not restore the persisted user profile.', error)
    return null
  }
}

function persistUser(user) {
  try {
    if (user) {
      sessionStorage.setItem(persistedUserKey, JSON.stringify(user))
    } else {
      sessionStorage.removeItem(persistedUserKey)
    }
  } catch (error) {
    console.warn('Could not persist the user profile for this tab.', error)
  }
}

export default function AuthProvider({ children }) {
  const { t } = useTranslation()
  const translateRef = useRef(t)
  const initialUser = useMemo(() => readPersistedUser(), [])
  const [user, setUser] = useState(initialUser)
  const userIdRef = useRef(initialUser?.id ?? null)
  const [isInitializing, setIsInitializing] = useState(true)
  const sessionAttempt = useRef(0)

  const clearSession = useCallback(() => {
    clearCachedEmergencyPhones(userIdRef.current).catch((error) => {
      console.error('Could not clear cached emergency contact numbers.', {
        message: error.message,
      })
    })
    userIdRef.current = null
    setAccessToken(null)
    setUser(null)
    persistUser(null)
  }, [])

  useEffect(() => {
    translateRef.current = t
  }, [t])

  useEffect(() => {
    if (user?.language === 'en' || user?.language === 'te') {
      i18n.changeLanguage(user.language)
    }
  }, [user?.language])

  useEffect(() => {
    if (user?.id) startSyncManager(user.id)
    else stopSyncManager()
    return () => stopSyncManager()
  }, [user?.id])

  useEffect(() => {
    setSessionExpiredHandler(clearSession)
    let active = true
    const attemptAtStart = sessionAttempt.current

    refreshSession()
      .then((session) => {
        if (active && sessionAttempt.current === attemptAtStart) {
          const refreshedUser = session.user ?? null
          userIdRef.current = refreshedUser?.id ?? null
          setUser(refreshedUser)
          persistUser(refreshedUser)
        }
      })
      .catch((error) => {
        if (active && sessionAttempt.current === attemptAtStart) {
          if (initialUser && (!error.response || error.response.status >= 500)) {
            userIdRef.current = initialUser.id
            setAccessToken(null)
            setUser(initialUser)
          } else {
            clearSession()
          }
          if (error.response?.status !== 401 && error.response) {
            toast.error(translateRef.current('sessionRestoreFailed'))
          }
        }
      })
      .finally(() => {
        if (active) setIsInitializing(false)
      })

    return () => {
      active = false
      setSessionExpiredHandler(() => {})
    }
  }, [clearSession, initialUser])

  const login = useCallback(async (credentials) => {
    sessionAttempt.current += 1
    setIsInitializing(false)
    const session = await loginRequest(credentials)
    if (!session.accessToken || !session.user) {
      throw new Error('Sign-in response is missing session information.')
    }
    setAccessToken(session.accessToken)
    userIdRef.current = session.user.id
    setUser(session.user)
    persistUser(session.user)
    return session.user
  }, [])

  const register = useCallback(async (details) => registerRequest(details), [])

  const updateLanguagePreference = useCallback(async (language) => {
    const result = await updateLanguageRequest(language)
    const updatedUser = result.user
    userIdRef.current = updatedUser.id
    setUser(updatedUser)
    persistUser(updatedUser)
  }, [])

  const logout = useCallback(async () => {
    sessionAttempt.current += 1
    try {
      await logoutRequest()
    } finally {
      clearSession()
    }
  }, [clearSession])

  const value = useMemo(
    () => ({
      user,
      isInitializing,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      updateLanguagePreference,
    }),
    [user, isInitializing, login, register, logout, updateLanguagePreference],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
