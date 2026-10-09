import mongoose from 'mongoose'
import { env } from '../config/env.js'
import Patient from '../models/Patient.js'
import { encryptSensitiveField } from '../utils/fieldEncryption.js'

if (!env.mongoUri) {
  throw new Error('MONGO_URI is required to encrypt existing patient emergency contacts.')
}

await mongoose.connect(env.mongoUri)

try {
  const cursor = Patient.collection.find({
    emergencyContacts: { $exists: true, $ne: null },
  }).project({ emergencyContacts: 1 })
  let encryptedCount = 0

  for await (const patient of cursor) {
    if (
      typeof patient.emergencyContacts === 'string'
      && patient.emergencyContacts.startsWith('enc:v1:')
    ) continue

    const result = await Patient.collection.updateOne(
      {
        _id: patient._id,
        emergencyContacts: patient.emergencyContacts,
      },
      { $set: { emergencyContacts: encryptSensitiveField(patient.emergencyContacts) } },
    )
    if (result.matchedCount !== 1) {
      throw new Error(`Patient ${patient._id} changed during emergency-contact encryption.`)
    }
    encryptedCount += result.modifiedCount
  }

  console.info(`Encrypted emergency contacts for ${encryptedCount} patient record(s).`)
} finally {
  await mongoose.disconnect()
}
