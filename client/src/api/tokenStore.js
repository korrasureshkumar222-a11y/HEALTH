let accessToken = null
let onSessionExpired = () => {}

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token) {
  accessToken = token || null
}

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler
}

export function notifySessionExpired() {
  accessToken = null
  onSessionExpired()
}
