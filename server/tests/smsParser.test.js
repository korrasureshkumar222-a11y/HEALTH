import { parseSmsCommand } from '../src/services/smsParser.js'

describe('SMS command parser', () => {
  test.each([
    ['BP 140 90', { type: 'bp', values: { systolic: 140, diastolic: 90, unit: 'mmHg' } }],
    [' bP: 140/90 mmHg ', { type: 'bp', values: { systolic: 140, diastolic: 90, unit: 'mmHg' } }],
    ['SUGAR 180 F', { type: 'sugar', values: { value: 180, unit: 'mg/dL', sugarContext: 'fasting' } }],
    ['sugar: 180 post-meal mg/dl', { type: 'sugar', values: { value: 180, unit: 'mg/dL', sugarContext: 'postMeal' } }],
    ['SUGAR 180', { type: 'sugar', values: { value: 180, unit: 'mg/dL', sugarContext: 'random' } }],
    ['HR 88', { type: 'heartRate', values: { value: 88, unit: 'bpm' } }],
    ['heart rate: 88 bpm', { type: 'heartRate', values: { value: 88, unit: 'bpm' } }],
  ])('parses %s case-insensitively and tolerantly', (input, expected) => {
    expect(parseSmsCommand(input)).toEqual({ success: true, kind: 'reading', ...expected })
  })

  test.each([
    ['SOS', { success: true, kind: 'sos' }],
    ['sos!', { success: true, kind: 'sos' }],
  ])('parses SOS command %s', (input, expected) => {
    expect(parseSmsCommand(input)).toEqual(expected)
  })

  test.each([
    ['', 'EMPTY_MESSAGE'],
    ['BP', 'MALFORMED_READING'],
    ['BP 140/999', 'VALUE_OUT_OF_RANGE'],
    ['BP 10 20', 'VALUE_OUT_OF_RANGE'],
    ['SUGAR 9999 F', 'VALUE_OUT_OF_RANGE'],
    ['SUGAR one fasting', 'MALFORMED_READING'],
    ['HR 0', 'VALUE_OUT_OF_RANGE'],
    ['HR 88 bpm today', 'MALFORMED_READING'],
    ['HELLO', 'UNKNOWN_COMMAND'],
    ['SOS HELP', 'UNKNOWN_COMMAND'],
    [null, 'EMPTY_MESSAGE'],
  ])('rejects malformed/out-of-range input %p', (input, code) => {
    expect(parseSmsCommand(input)).toEqual({ success: false, code })
  })
})
