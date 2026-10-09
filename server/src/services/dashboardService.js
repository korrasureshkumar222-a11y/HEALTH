import Alert from '../models/Alert.js'
import Appointment from '../models/Appointment.js'
import Doctor from '../models/Doctor.js'
import HealthCentre from '../models/HealthCentre.js'
import HealthRecord from '../models/HealthRecord.js'
import Medication from '../models/Medication.js'
import Patient from '../models/Patient.js'
import User from '../models/User.js'
import ApiError from '../utils/ApiError.js'

const vitalTypes = ['bp', 'sugar', 'heartRate', 'weight', 'spo2', 'temperature']
const timeZone = 'Asia/Kolkata'

function scalarValue(reading) {
  return reading.type === 'bp' ? reading.values?.systolic : reading.values?.value
}

function trendBetween(latest, previous) {
  if (!previous) return 'new'
  const currentValue = scalarValue(latest)
  const previousValue = scalarValue(previous)
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return 'unavailable'
  if (currentValue === previousValue) return 'same'
  return currentValue > previousValue ? 'up' : 'down'
}

function distanceInKm(from, to) {
  const radians = (degrees) => (degrees * Math.PI) / 180
  const [longitudeA, latitudeA] = from.coordinates
  const [longitudeB, latitudeB] = to.coordinates
  const latitudeDifference = radians(latitudeB - latitudeA)
  const longitudeDifference = radians(longitudeB - longitudeA)
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB))
      * Math.sin(longitudeDifference / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function startOfTodayInIndia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type) => parts.find((item) => item.type === type).value
  return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00+05:30`)
}

function doctorPatientsPipeline(doctorId, startOfToday) {
  const pipeline = [
    { $match: { assignedDoctor: doctorId, status: 'active' } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'user',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, phone: 1 } }],
        as: 'account',
      },
    },
    { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: HealthRecord.collection.name,
        let: { patientId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$patient', '$$patientId'] } } },
          { $sort: { recordedAt: -1, _id: -1 } },
          { $limit: 1 },
          { $project: { type: 1, values: 1, status: 1, recordedAt: 1 } },
        ],
        as: 'latestReading',
      },
    },
    {
      $lookup: {
        from: HealthRecord.collection.name,
        let: { patientId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$patient', '$$patientId'] },
                  { $gte: ['$recordedAt', startOfToday] },
                ],
              },
            },
          },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'todayReading',
      },
    },
    {
      $addFields: {
        latestReading: { $arrayElemAt: ['$latestReading', 0] },
        missedToday: { $eq: [{ $size: '$todayReading' }, 0] },
      },
    },
    {
      $addFields: {
        riskStatus: {
          $switch: {
            branches: [
              { case: { $eq: ['$latestReading.status', 'critical'] }, then: 'critical' },
              { case: { $eq: ['$latestReading.status', 'warning'] }, then: 'warning' },
              { case: '$missedToday', then: 'missed' },
              { case: { $eq: ['$latestReading.status', 'normal'] }, then: 'normal' },
            ],
            default: 'unclassified',
          },
        },
      },
    },
    {
      $addFields: {
        riskScore: {
          $switch: {
            branches: [
              { case: { $eq: ['$riskStatus', 'critical'] }, then: 300 },
              { case: { $eq: ['$riskStatus', 'warning'] }, then: 200 },
              { case: { $eq: ['$riskStatus', 'missed'] }, then: 100 },
            ],
            default: 0,
          },
        },
      },
    },
  ]

  return pipeline
}

function doctorDashboardFilterStages(filters) {
  const stages = []
  if (filters.village) {
    stages.push({
      $match: {
        village: {
          $regex: filters.village.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        },
      },
    })
  }
  if (filters.condition) stages.push({ $match: { conditions: filters.condition } })
  if (filters.status) stages.push({ $match: { riskStatus: filters.status } })
  return stages
}

export async function getDoctorDashboard(user, filters) {
  const doctor = await Doctor.findOne({ user: user._id }).select('_id').lean()
  if (!doctor) throw new ApiError(404, 'Doctor profile not found.', 'DOCTOR_PROFILE_NOT_FOUND')
  const startOfToday = startOfTodayInIndia()
  const skip = (filters.page - 1) * filters.limit
  const filterStages = doctorDashboardFilterStages(filters)
  const pipeline = doctorPatientsPipeline(doctor._id, startOfToday)
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
  pipeline.push({
    $facet: {
      summary: [{
        $group: {
          _id: null,
          totalPatients: { $sum: 1 },
          criticalNow: { $sum: { $cond: [{ $eq: ['$riskStatus', 'critical'] }, 1, 0] } },
          missedReadingsToday: { $sum: { $cond: ['$missedToday', 1, 0] } },
        },
      }],
      patients: [
        ...filterStages,
        { $sort: { riskScore: -1, 'latestReading.recordedAt': 1, _id: 1 } },
        { $skip: skip },
        { $limit: filters.limit },
        {
          $project: {
            _id: 0,
            patientId: '$_id',
            name: { $ifNull: ['$account.name', '$name'] },
            phone: { $ifNull: ['$account.phone', '$phone'] },
            village: 1,
            mandal: 1,
            district: 1,
            conditions: 1,
            latestReading: 1,
            riskStatus: 1,
            riskScore: 1,
            missedToday: 1,
          },
        },
      ],
      totals: [...filterStages, { $count: 'total' }],
    },
  })

  const [result, appointmentsToday, patientIds] = await Promise.all([
    Patient.aggregate(pipeline).then(([aggregated]) => aggregated),
    Appointment.countDocuments({
      doctor: doctor._id,
      scheduledAt: { $gte: startOfToday, $lt: endOfToday },
      status: { $in: ['requested', 'confirmed'] },
    }),
    Patient.find({ assignedDoctor: doctor._id, status: 'active' }).distinct('_id'),
  ])
  const alertQuery = Alert.find({ patient: { $in: patientIds }, status: 'open' })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('patient', 'name phone village')
    .lean()
  const alerts = (await alertQuery)
    .sort((left, right) => {
      const severity = { critical: 0, warning: 1, info: 2 }
      return severity[left.severity] - severity[right.severity]
        || new Date(right.createdAt) - new Date(left.createdAt)
    })
    .slice(0, 10)
  const summary = result?.summary[0] ?? {
    totalPatients: 0,
    criticalNow: 0,
    missedReadingsToday: 0,
  }
  return {
    summary: { ...summary, appointmentsToday, appointmentsAvailable: true },
    patients: result?.patients ?? [],
    alerts,
    page: filters.page,
    limit: filters.limit,
    total: result?.totals[0]?.total ?? 0,
    hasMore: skip + (result?.patients.length ?? 0) < (result?.totals[0]?.total ?? 0),
  }
}

async function findNearestHealthCentre(patient) {
  if (patient.location) {
    return HealthCentre.findOne({
      isActive: true,
      location: { $near: { $geometry: patient.location } },
    }).select('name type address phone location').lean()
  }
  if (patient.nearestHealthCentre) {
    return HealthCentre.findOne({
      _id: patient.nearestHealthCentre,
      isActive: true,
    }).select('name type address phone location').lean()
  }
  return null
}

export async function getPatientDashboard(user) {
  const patient = await Patient.findOne({ user: user._id, status: 'active' })
    .select('_id location nearestHealthCentre')
    .lean()
  if (!patient) {
    throw new ApiError(404, 'Active patient profile not found.', 'PATIENT_PROFILE_NOT_FOUND')
  }

  const today = startOfTodayInIndia()
  const [vitalGroups, openAlertsCount, healthCentre, medications, nextAppointment] = await Promise.all([
    HealthRecord.aggregate([
      { $match: { patient: patient._id, type: { $in: vitalTypes } } },
      { $sort: { recordedAt: -1, _id: -1 } },
      {
        $group: {
          _id: '$type',
          recent: {
            $push: {
              _id: '$_id',
              type: '$type',
              values: '$values',
              status: '$status',
              recordedAt: '$recordedAt',
            },
          },
        },
      },
      { $project: { recent: { $slice: ['$recent', 2] } } },
    ]),
    Alert.countDocuments({ patient: patient._id, status: 'open' }),
    findNearestHealthCentre(patient),
    Medication.find({
      patient: patient._id,
      active: true,
      startDate: { $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
      $or: [{ endDate: null }, { endDate: { $gte: today } }],
    }).select('name dose timings instructions').lean(),
    Appointment.findOne({
      patient: patient._id,
      scheduledAt: { $gte: today },
      status: { $in: ['requested', 'confirmed'] },
    }).sort({ scheduledAt: 1, _id: 1 }).select('scheduledAt mode reason status').lean(),
  ])

  const groupsByType = new Map(vitalGroups.map((group) => [group._id, group.recent]))
  const latestVitals = vitalTypes.map((type) => {
    const [latest, previous] = groupsByType.get(type) ?? []
    return {
      type,
      latest: latest ?? null,
      previous: previous ?? null,
      trend: latest ? trendBetween(latest, previous) : 'unavailable',
    }
  })

  return {
    patientId: patient._id,
    patientName: user.name,
    latestVitals,
    todayMedications: {
      items: medications.flatMap((medication) => medication.timings.map((time) => ({
        id: `${medication._id}:${time}`,
        medicationId: medication._id,
        name: medication.name,
        dose: medication.dose,
        instructions: medication.instructions,
        time,
        taken: false,
      }))),
      available: true,
    },
    nextAppointment: { appointment: nextAppointment, available: true },
    openAlertsCount,
    nearestHealthCentre: healthCentre
      ? {
        id: healthCentre._id,
        name: healthCentre.name,
        type: healthCentre.type,
        address: healthCentre.address,
        phone: healthCentre.phone ?? null,
        distanceKm: patient.location
          ? Number(distanceInKm(patient.location, healthCentre.location).toFixed(1))
          : null,
      }
      : null,
  }
}
