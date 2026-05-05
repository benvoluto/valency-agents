import { runGoalRequested } from './runGoalRequested'
import { signalPollTick } from './signalPollTick'
import { debounceBriefingCreated, sendDigestEmail } from './digestSend'

export const allFunctions = [
  runGoalRequested,
  signalPollTick,
  debounceBriefingCreated,
  sendDigestEmail,
]
