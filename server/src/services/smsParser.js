const READING_PATTERNS = [
  {
    type: 'bp',
    pattern: /^BP\s*[:=]?\s*(\d{2,3})\s*(?:\/|,|\s)\s*(\d{2,3})\s*(?:MMHG)?$/i,
    parse: (match) => {
      const systolic = Number(match[1])
      const diastolic = Number(match[2])
      if (systolic < 50 || systolic > 300 || diastolic < 30 || diastolic > 200) return null
      return { type: 'bp', values: { systolic, diastolic, unit: 'mmHg' } }
    },
  },
  {
    type: 'sugar',
    pattern: /^SUGAR\s*[:=]?\s*(\d{2,4})\s*(?:MG\/?DL\s*)?(F|FASTING|P|POST[\s-]?MEAL|R|RANDOM)?\s*(?:MG\/?DL)?$/i,
    parse: (match) => {
      const value = Number(match[1])
      if (value < 20 || value > 2000) return null
      const context = (match[2] ?? 'R').toUpperCase().replace(/[\s-]/g, '')
      return {
        type: 'sugar',
        values: {
          value,
          unit: 'mg/dL',
          sugarContext: ['F', 'FASTING'].includes(context)
            ? 'fasting'
            : ['P', 'POSTMEAL'].includes(context)
              ? 'postMeal'
              : 'random',
        },
      }
    },
  },
  {
    type: 'heartRate',
    pattern: /^(?:HR|HEART\s*RATE|PULSE)\s*[:=]?\s*(\d{1,3})\s*(?:BPM)?$/i,
    parse: (match) => {
      const value = Number(match[1])
      if (value < 20 || value > 250) return null
      return { type: 'heartRate', values: { value, unit: 'bpm' } }
    },
  },
]

export function parseSmsCommand(message) {
  if (typeof message !== 'string' || !message.trim()) {
    return { success: false, code: 'EMPTY_MESSAGE' }
  }
  const normalized = message.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (/^SOS[.!]?$/i.test(normalized)) return { success: true, kind: 'sos' }

  for (const { pattern, parse } of READING_PATTERNS) {
    const match = normalized.match(pattern)
    if (!match) continue
    const reading = parse(match)
    return reading
      ? { success: true, kind: 'reading', ...reading }
      : { success: false, code: 'VALUE_OUT_OF_RANGE' }
  }

  if (/^(?:BP|SUGAR|HR|HEART\s*RATE|PULSE)\b/i.test(normalized)) {
    return { success: false, code: 'MALFORMED_READING' }
  }
  return { success: false, code: 'UNKNOWN_COMMAND' }
}
