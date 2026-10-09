export const alertMessages = {
  critical_reading: {
    en: ['Critical health reading', 'A critical health reading needs prompt review.'],
    te: ['తీవ్రమైన ఆరోగ్య రీడింగ్', 'తీవ్రమైన ఆరోగ్య రీడింగ్‌ను వెంటనే సమీక్షించాలి.'],
  },
  warning_reading: {
    en: ['Health reading needs review', 'A health reading needs review by the care team.'],
    te: ['ఆరోగ్య రీడింగ్ సమీక్ష అవసరం', 'ఆరోగ్య రీడింగ్‌ను సంరక్షణ బృందం సమీక్షించాలి.'],
  },
  missed_reading: {
    en: ['Reading overdue', 'No health reading has been recorded in the last 24 hours.'],
    te: ['రీడింగ్ ఆలస్యమైంది', 'గత 24 గంటల్లో ఆరోగ్య రీడింగ్ నమోదు కాలేదు.'],
  },
  sos: {
    en: ['SOS request', 'A patient has requested emergency assistance.'],
    te: ['అత్యవసర సహాయం అభ్యర్థన', 'రోగి అత్యవసర సహాయం కోరారు.'],
  },
  medication_missed: {
    en: ['Medication missed', 'A scheduled medication was reported as missed.'],
    te: ['మందు తీసుకోలేదు', 'షెడ్యూల్ చేసిన మందు తీసుకోలేదని నివేదించబడింది.'],
  },
}

export function sosNotificationTemplate() {
  return {
    title: { en: 'SOS emergency', te: 'అత్యవసర సహాయం' },
    body: {
      en: 'A patient has requested emergency assistance. Review the SOS incident immediately.',
      te: 'రోగి అత్యవసర సహాయం కోరారు. SOS ఘటనను వెంటనే సమీక్షించండి.',
    },
  }
}

export function sosSmsTemplate({ name, mapLink, language = 'en' }) {
  if (language === 'te') {
    return `అత్యవసరం: ${name} సహాయం కోరుతున్నారు. స్థానం: ${mapLink}`
  }
  return `EMERGENCY: ${name} needs help. Location: ${mapLink}`
}

export function medicationReminderTemplate(medicationName, dose) {
  return {
    title: { en: 'Medication reminder', te: 'మందు తీసుకునే సమయం' },
    body: {
      en: `It is time to take ${medicationName} (${dose}).`,
      te: `${medicationName} (${dose}) తీసుకునే సమయం.`,
    },
  }
}
