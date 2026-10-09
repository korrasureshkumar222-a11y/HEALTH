import PDFDocument from 'pdfkit'
import { PNG } from 'pngjs'
import { fileURLToPath } from 'node:url'

const fontPath = fileURLToPath(new URL('../assets/NTR-Regular.ttf', import.meta.url))
const pageMargin = 42
const chartColors = ['#007C78', '#D97706', '#2563EB', '#7C3AED', '#DB2777', '#0F766E']
const translations = {
  en: {
    title: 'Patient health summary',
    profile: 'Patient profile',
    period: 'Reporting period',
    stats: 'Vital statistics',
    count: 'Readings',
    average: 'Average',
    minimum: 'Minimum',
    maximum: 'Maximum',
    critical: 'Critical',
    warning: 'Warning',
    charts: 'Vital history charts',
    alerts: 'Alerts',
    medications: 'Medications',
    notes: 'Doctor and care team notes',
    noData: 'No data recorded in this period.',
    noAlerts: 'No alerts in this period.',
    noMedications: 'No medication records.',
    noNotes: 'No care team notes in this period.',
    age: 'Age',
    gender: 'Gender',
    village: 'Village',
    conditions: 'Conditions',
    doctor: 'Assigned doctor',
    phone: 'Phone',
  },
  te: {
    title: 'రోగి ఆరోగ్య సారాంశం',
    profile: 'రోగి వివరాలు',
    period: 'నివేదిక కాలం',
    stats: 'ఆరోగ్య కొలతల గణాంకాలు',
    count: 'కొలతలు',
    average: 'సగటు',
    minimum: 'కనిష్ఠం',
    maximum: 'గరిష్ఠం',
    critical: 'తీవ్రం',
    warning: 'హెచ్చరిక',
    charts: 'ఆరోగ్య కొలతల చార్ట్‌లు',
    alerts: 'హెచ్చరికలు',
    medications: 'మందులు',
    notes: 'వైద్యులు మరియు సంరక్షణ బృందం గమనికలు',
    noData: 'ఈ కాలంలో ఎటువంటి సమాచారం నమోదు కాలేదు.',
    noAlerts: 'ఈ కాలంలో హెచ్చరికలు లేవు.',
    noMedications: 'మందుల వివరాలు లేవు.',
    noNotes: 'ఈ కాలంలో సంరక్షణ బృందం గమనికలు లేవు.',
    age: 'వయస్సు',
    gender: 'లింగం',
    village: 'గ్రామం',
    conditions: 'ఆరోగ్య పరిస్థితులు',
    doctor: 'కేటాయించిన వైద్యుడు',
    phone: 'ఫోన్',
  },
}
const vitalLabels = {
  bp: { en: 'Blood pressure (mmHg)', te: 'రక్తపోటు (mmHg)' },
  sugar: { en: 'Blood sugar', te: 'రక్తంలో చక్కెర' },
  heartRate: { en: 'Heart rate', te: 'హృదయ స్పందన' },
  weight: { en: 'Weight', te: 'బరువు' },
  spo2: { en: 'Oxygen saturation', te: 'ఆక్సిజన్ స్థాయి' },
  temperature: { en: 'Temperature', te: 'ఉష్ణోగ్రత' },
}

function printableDate(value, language) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

function ensureSpace(document, height) {
  if (document.y + height > document.page.height - pageMargin) document.addPage()
}

function heading(document, text) {
  ensureSpace(document, 32)
  document.moveDown(0.65)
  document.fontSize(15).fillColor('#0F3D3B').text(text, { underline: false })
  document.moveDown(0.25)
}

function chartValues(readings, type) {
  const selected = readings.filter((reading) => reading.type === type).slice(-30)
  return selected.map((reading) => ({
    date: reading.recordedAt,
    systolic: reading.values?.systolic,
    diastolic: reading.values?.diastolic,
    value: reading.values?.value,
  }))
}

function colorChannels(hexColor) {
  return [
    Number.parseInt(hexColor.slice(1, 3), 16),
    Number.parseInt(hexColor.slice(3, 5), 16),
    Number.parseInt(hexColor.slice(5, 7), 16),
  ]
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
  const offset = (image.width * y + x) * 4
  image.data[offset] = color[0]
  image.data[offset + 1] = color[1]
  image.data[offset + 2] = color[2]
  image.data[offset + 3] = 255
}

function drawImageLine(image, startX, startY, endX, endY, color) {
  let x = Math.round(startX)
  let y = Math.round(startY)
  const targetX = Math.round(endX)
  const targetY = Math.round(endY)
  const deltaX = Math.abs(targetX - x)
  const stepX = x < targetX ? 1 : -1
  const deltaY = -Math.abs(targetY - y)
  const stepY = y < targetY ? 1 : -1
  let error = deltaX + deltaY
  while (true) {
    setPixel(image, x, y, color)
    if (x === targetX && y === targetY) break
    const doubledError = 2 * error
    if (doubledError >= deltaY) {
      error += deltaY
      x += stepX
    }
    if (doubledError <= deltaX) {
      error += deltaX
      y += stepY
    }
  }
}

function drawImagePoint(image, x, y, color) {
  for (let offsetY = -3; offsetY <= 3; offsetY += 1) {
    for (let offsetX = -3; offsetX <= 3; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY <= 9) {
        setPixel(image, Math.round(x + offsetX), Math.round(y + offsetY), color)
      }
    }
  }
}

function chartPng(points, type) {
  const image = new PNG({ width: 560, height: 130 })
  const background = colorChannels('#F8FAFC')
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) setPixel(image, x, y, background)
  }

  const fields = type === 'bp' ? ['systolic', 'diastolic'] : ['value']
  const allValues = points.flatMap((point) => fields.map((field) => point[field])).filter(Number.isFinite)
  if (!allValues.length) return PNG.sync.write(image)
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const span = max - min || 1
  const plot = { left: 42, top: 12, width: 506, height: 100 }
  const gridColor = colorChannels('#D7E1E8')
  for (let index = 0; index < 3; index += 1) {
    const gridY = plot.top + index * plot.height / 2
    drawImageLine(image, plot.left, gridY, plot.left + plot.width, gridY, gridColor)
  }

  fields.forEach((field, fieldIndex) => {
    const color = colorChannels(chartColors[fieldIndex])
    const plotted = points.map((point, index) => ({
      x: plot.left + (points.length === 1 ? plot.width / 2 : index * plot.width / (points.length - 1)),
      y: plot.top + plot.height - ((point[field] - min) / span) * plot.height,
      value: point[field],
    })).filter((point) => Number.isFinite(point.value))
    plotted.slice(1).forEach((point, index) => {
      drawImageLine(image, plotted[index].x, plotted[index].y, point.x, point.y, color)
    })
    plotted.forEach((point) => drawImagePoint(image, point.x, point.y, color))
  })
  return PNG.sync.write(image)
}

function drawChart(document, type, readings, language) {
  const points = chartValues(readings, type)
  const chartHeight = 174
  ensureSpace(document, chartHeight + 20)
  const x = pageMargin
  const y = document.y
  const width = document.page.width - pageMargin * 2
  document.roundedRect(x, y, width, chartHeight, 8).fillAndStroke('#F8FAFC', '#DCE5E5')
  document.fillColor('#173B3A').fontSize(11).text(vitalLabels[type][language], x + 12, y + 10)
  if (!points.length) {
    document.fillColor('#64748B').fontSize(9).text(translations[language].noData, x + 12, y + 45)
    document.y = y + chartHeight + 12
    return
  }

  document.image(chartPng(points, type), x + 10, y + 33, {
    width: width - 20,
    height: 108,
  })
  if (type === 'bp') {
    document.fontSize(7).fillColor(chartColors[0]).text('Systolic', x + 12, y + 145)
    document.fillColor(chartColors[1]).text('Diastolic', x + 72, y + 145)
  } else {
    document.fontSize(8).fillColor('#475569').text(
      `${printableDate(points[0].date, language)}  —  ${printableDate(points.at(-1).date, language)}`,
      x + 12,
      y + 145,
    )
  }
  document.y = y + chartHeight + 12
}

export function createPatientSummaryPdf(report, language = 'en') {
  const locale = language === 'te' ? 'te' : 'en'
  const labels = translations[locale]
  const patient = report.patient
  const document = new PDFDocument({ size: 'A4', margin: pageMargin, bufferPages: true })
  document.registerFont('NTR', fontPath)
  document.font('NTR').fillColor('#172B2A')
  document.fontSize(21).fillColor('#075E59').text(labels.title)
  document.moveDown(0.3).fontSize(9).fillColor('#475569')
    .text(`${labels.period}: ${printableDate(report.period.from, locale)} – ${printableDate(report.period.to, locale)}`)
  document.moveDown(0.8)

  heading(document, labels.profile)
  const profile = [
    [patient.user?.name ?? patient.name ?? '—', `${labels.age}: ${patient.age ?? '—'}`, `${labels.gender}: ${patient.gender ?? '—'}`],
    [`${labels.village}: ${[patient.village, patient.mandal, patient.district].filter(Boolean).join(', ') || '—'}`, `${labels.phone}: ${patient.user?.phone ?? patient.phone ?? '—'}`],
    [`${labels.conditions}: ${patient.conditions?.join(', ') || '—'}`, `${labels.doctor}: ${patient.assignedDoctor?.user?.name ?? '—'}`],
  ]
  profile.forEach((line) => document.fontSize(9).fillColor('#172B2A').text(line.join('     ')))

  heading(document, labels.stats)
  Object.entries(report.stats).forEach(([type, stats]) => {
    const average = type === 'bp'
      ? `${stats.averageSystolic ?? '—'}/${stats.averageDiastolic ?? '—'}`
      : `${stats.average ?? '—'}`
    const range = type === 'bp'
      ? `${stats.minimumSystolic ?? '—'}/${stats.minimumDiastolic ?? '—'} – ${stats.maximumSystolic ?? '—'}/${stats.maximumDiastolic ?? '—'}`
      : `${stats.minimum ?? '—'} – ${stats.maximum ?? '—'}`
    ensureSpace(document, 18)
    document.fontSize(8.5).fillColor('#172B2A')
      .text(`${vitalLabels[type][locale]}: ${labels.count} ${stats.count}  |  ${labels.average} ${average}  |  ${labels.minimum}–${labels.maximum} ${range}  |  ${labels.warning} ${stats.warning}  |  ${labels.critical} ${stats.critical}`)
  })

  heading(document, labels.charts)
  Object.keys(vitalLabels).forEach((type) => drawChart(document, type, report.readings, locale))

  heading(document, labels.alerts)
  if (!report.alerts.length) document.fontSize(9).fillColor('#64748B').text(labels.noAlerts)
  report.alerts.forEach((alert) => {
    ensureSpace(document, 30)
    const message = typeof alert.message === 'object' ? alert.message[locale] ?? alert.message.en : alert.message
    document.fontSize(9).fillColor('#172B2A')
      .text(`${printableDate(alert.createdAt, locale)} · ${alert.severity} · ${message ?? alert.type}`)
  })

  heading(document, labels.medications)
  if (!report.medications.length) document.fontSize(9).fillColor('#64748B').text(labels.noMedications)
  report.medications.forEach((medication) => {
    ensureSpace(document, 30)
    document.fontSize(9).fillColor('#172B2A')
      .text(`${medication.name} · ${medication.dose} · ${medication.frequency} · ${medication.active ? 'Active' : 'Inactive'}`)
  })

  heading(document, labels.notes)
  if (!report.notes.length) document.fontSize(9).fillColor('#64748B').text(labels.noNotes)
  report.notes.forEach((note) => {
    ensureSpace(document, 48)
    document.fontSize(8).fillColor('#64748B')
      .text(`${note.author?.name ?? ''} · ${printableDate(note.createdAt, locale)}`)
    document.fontSize(9).fillColor('#172B2A').text(note.body, { paragraphGap: 4 })
  })
  return document
}
