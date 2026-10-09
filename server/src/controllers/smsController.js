import { env } from '../config/env.js'
import { receiveInboundSms } from '../services/inboundSmsService.js'

export async function postInboundSms(request, response) {
  await receiveInboundSms({
    url: env.smsWebhookUrl,
    signature: request.get('x-twilio-signature'),
    parameters: request.body,
  })
  response.status(200).type('application/xml').send('<Response/>')
}
