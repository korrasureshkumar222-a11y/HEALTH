import Notification from '../models/Notification.js'

export async function createInAppNotification(input) {
  const notification = {
    ...input,
    channel: 'inApp',
    status: 'delivered',
  }
  if (!input.dedupeKey) {
    return { notification: await Notification.create(notification), created: true }
  }

  try {
    const createdNotification = await Notification.create(notification)
    return { notification: createdNotification, created: true }
  } catch (error) {
    if (error.code !== 11000) throw error
    const existing = await Notification.findOne({ dedupeKey: input.dedupeKey })
    if (!existing) throw error
    return { notification: existing, created: false }
  }
}
