import { runGoalRequested } from './runGoalRequested'
import { signalPollTick } from './signalPollTick'
import { debounceBriefingCreated, sendDigestEmail } from './digestSend'
import { healthCheckCron } from './healthCheckCron'

export const allFunctions = [
  runGoalRequested,
  signalPollTick,
  debounceBriefingCreated,
  sendDigestEmail,
  healthCheckCron,
]
