const readingNames = {
  bp: { en: 'Blood pressure', te: 'రక్తపోటు' },
  sugar: { en: 'Blood sugar', te: 'రక్తంలో చక్కెర' },
  heartRate: { en: 'Heart rate', te: 'హృదయ స్పందన' },
}

const statusMessages = {
  normal: {
    en: 'within the configured normal range',
    te: 'సాధారణ పరిధిలో ఉంది',
  },
  warning: {
    en: 'needs attention; your care team has been notified',
    te: 'శ్రద్ధ అవసరం; మీ సంరక్షణ బృందానికి సమాచారం పంపబడింది',
  },
  critical: {
    en: 'is critical. Seek urgent medical care; do not rely on SMS alone',
    te: 'తీవ్రంగా ఉంది. వెంటనే వైద్య సహాయం పొందండి; SMSపై మాత్రమే ఆధారపడకండి',
  },
  unclassified: {
    en: 'was saved for your care team to review',
    te: 'మీ సంరక్షణ బృందం సమీక్ష కోసం సేవ్ చేయబడింది',
  },
}

export function smsReadingConfirmation(reading, status, language = 'en') {
  const lang = language === 'te' ? 'te' : 'en'
  const name = readingNames[reading.type][lang]
  let measured
  if (reading.type === 'bp') {
    measured = `${reading.values.systolic}/${reading.values.diastolic} mmHg`
  } else if (reading.type === 'sugar') {
    measured = `${reading.values.value} mg/dL`
  } else {
    measured = `${reading.values.value} bpm`
  }
  return lang === 'te'
    ? `${name} ${measured} నమోదు అయింది. స్థితి: ${statusMessages[status][lang]}.`
    : `${name} ${measured} recorded. Status: ${statusMessages[status][lang]}.`
}

export function smsCommandError(code, language = 'en') {
  const lang = language === 'te' ? 'te' : 'en'
  const messages = {
    EMPTY_MESSAGE: {
      en: 'Send BP 140 90, SUGAR 180 F, HR 88, or SOS.',
      te: 'BP 140 90, SUGAR 180 F, HR 88, లేదా SOS పంపండి.',
    },
    MALFORMED_READING: {
      en: 'Format not understood. Send BP 140 90, SUGAR 180 F, or HR 88.',
      te: 'ఫార్మాట్ అర్థం కాలేదు. BP 140 90, SUGAR 180 F, లేదా HR 88 పంపండి.',
    },
    VALUE_OUT_OF_RANGE: {
      en: 'That value is outside the accepted range. Please check it and send again.',
      te: 'ఆ విలువ అనుమతించిన పరిధికి వెలుపల ఉంది. తనిఖీ చేసి మళ్లీ పంపండి.',
    },
    UNKNOWN_COMMAND: {
      en: 'Command not recognized. Send BP 140 90, SUGAR 180 F, HR 88, or SOS.',
      te: 'కమాండ్ గుర్తించబడలేదు. BP 140 90, SUGAR 180 F, HR 88, లేదా SOS పంపండి.',
    },
  }
  return messages[code]?.[lang] ?? messages.UNKNOWN_COMMAND[lang]
}

export function smsStatusReply(status, language = 'en') {
  if (language === 'te') {
    return status === 'critical'
      ? 'అత్యవసర హెచ్చరిక: వెంటనే వైద్య సహాయం పొందండి.'
      : 'మీ ఆరోగ్య బృందానికి సమాచారం పంపబడింది.'
  }
  return status === 'critical'
    ? 'Urgent alert: seek medical care now.'
    : 'Your care team has been notified.'
}

export function smsSosReply(language = 'en') {
  return language === 'te'
    ? 'మీ SOS అందింది. మీ సంరక్షణ బృందానికి సమాచారం పంపబడింది. తక్షణ ప్రమాదంలో 112కు కాల్ చేయండి.'
    : 'Your SOS was received and your care team was notified. Call 112 for immediate danger.'
}

export function smsNoLocationReply(language = 'en') {
  return language === 'te'
    ? 'మీ SOS అందింది, కానీ మీ ప్రొఫైల్‌లో స్థానం లేదు. వెంటనే 112కు కాల్ చేసి మీ స్థానం చెప్పండి.'
    : 'Your SOS was received, but your profile has no saved location. Call 112 now and state your location.'
}

export function smsPatientUnknownReply(language = 'en') {
  return language === 'te'
    ? 'ఈ ఫోన్ నంబర్‌కు క్రియాశీల రోగి ప్రొఫైల్ లేదు. మీ ఆరోగ్య కార్యకర్తను సంప్రదించండి.'
    : 'No active patient profile is linked to this phone number. Please contact your health worker.'
}

export function smsRateLimitReply(language = 'en') {
  return language === 'te'
    ? 'చాలా సందేశాలు వచ్చాయి. కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.'
    : 'Too many messages. Please wait before trying again.'
}

export function smsAppointmentReminder({ scheduledAt, doctorName, language = 'en' }) {
  const lang = language === 'te' ? 'te' : 'en'
  const date = new Intl.DateTimeFormat(lang === 'te' ? 'te-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(scheduledAt)
  return lang === 'te'
    ? `గుర్తు: మీ వైద్య అపాయింట్‌మెంట్ ${date}${doctorName ? `, డా. ${doctorName}` : ''}.`
    : `Reminder: your doctor appointment is ${date}${doctorName ? ` with Dr. ${doctorName}` : ''}.`
}

export function smsDroneArrival({ point, etaMinutes, language = 'en' }) {
  return language === 'te'
    ? `${point} వద్దకు డ్రోన్ ${etaMinutes} నిమిషాల్లో వస్తుంది. దయచేసి ప్రాంతాన్ని ఖాళీగా ఉంచండి.`
    : `Drone arriving at ${point} in ${etaMinutes} min, keep area clear`
}

export function smsOtpTemplate(code, language = 'en') {
  return language === 'te'
    ? `మీ ధృవీకరణ కోడ్ ${code}. దీన్ని ఎవరితోనూ పంచుకోవద్దు.`
    : `Your verification code is ${code}. Do not share it with anyone.`
}
