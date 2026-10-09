import {
  alertMessages,
  medicationReminderTemplate,
  sosNotificationTemplate,
  sosSmsTemplate,
} from '../src/utils/messageTemplates.js'

describe('localized server message templates', () => {
  test('provides bilingual alert and SOS notification content', () => {
    expect(alertMessages.critical_reading.en[1]).toContain('prompt review')
    expect(alertMessages.critical_reading.te[1]).toContain('తీవ్రమైన')
    expect(sosNotificationTemplate().title).toEqual({
      en: 'SOS emergency',
      te: 'అత్యవసర సహాయం',
    })
  })

  test('renders SOS SMS in the patient language with the supplied location', () => {
    const mapLink = 'https://maps.google.com/?q=16.4,80.5'
    expect(sosSmsTemplate({ name: 'Ravi', mapLink, language: 'en' }))
      .toBe(`EMERGENCY: Ravi needs help. Location: ${mapLink}`)
    expect(sosSmsTemplate({ name: 'రవి', mapLink, language: 'te' }))
      .toBe(`అత్యవసరం: రవి సహాయం కోరుతున్నారు. స్థానం: ${mapLink}`)
  })

  test('creates bilingual medication reminder strings', () => {
    expect(medicationReminderTemplate('Medicine A', '1 tablet')).toEqual({
      title: { en: 'Medication reminder', te: 'మందు తీసుకునే సమయం' },
      body: {
        en: 'It is time to take Medicine A (1 tablet).',
        te: 'Medicine A (1 tablet) తీసుకునే సమయం.',
      },
    })
  })
})
