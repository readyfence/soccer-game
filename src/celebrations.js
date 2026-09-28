import { POSE } from './playerModel.js';

// Each celebration: run toward the fans for `run` seconds in `runPose`, then stop, face the camera
// and hold `pose`. Optional popup text and crowd roar fire `popupAt` seconds into the pose.
export const CELEBRATIONS = {
  siuu: { label: 'Siuuu', run: 1.4, runPose: POSE.NONE, pose: POSE.SIUU, popup: 'SIUUU!', popupAt: 0.95, roar: 1 },
  skyPoint: { label: 'Fingers to the sky', run: 1.3, runPose: POSE.NONE, pose: POSE.SKY_POINT, popup: 'Pointing to the heavens', popupAt: 0.3 },
  armsCrossed: { label: 'Arms crossed', run: 1.1, runPose: POSE.NONE, pose: POSE.ARMS_CROSSED, popup: 'Arms folded. Unbothered.', popupAt: 0.4 },
  zen: { label: 'Zen meditation', run: 1.2, runPose: POSE.NONE, pose: POSE.ZEN, popup: 'Total zen', popupAt: 0.6 },
  heyJude: { label: 'Hey Jude', run: 1.3, runPose: POSE.AIRPLANE, pose: POSE.HEY_JUDE, popup: 'Hey Jude!', popupAt: 0.3, roar: 0.6 },
  dance: { label: 'Dance', run: 1.1, runPose: POSE.NONE, pose: POSE.DANCE, popup: 'Time to dance!', popupAt: 0.3 },
  prayer: { label: 'Sajdah', run: 1.2, runPose: POSE.NONE, pose: POSE.PRAYER, popup: 'A moment of prayer', popupAt: 0.8 },
  iceSlide: { label: 'Ice-cold slide', run: 1.3, runPose: POSE.NONE, pose: POSE.ICE_SLIDE, slide: true, popup: 'Ice cold!', popupAt: 0.3 },
  cold: { label: 'Cold shiver', run: 1.1, runPose: POSE.NONE, pose: POSE.COLD, popup: 'Cold. Palmer.', popupAt: 0.3 },
  mask: { label: 'The mask', run: 1.2, runPose: POSE.NONE, pose: POSE.MASK, popup: 'The mask is on!', popupAt: 0.3 },
  kiss: { label: 'Wrist kiss', run: 1.3, runPose: POSE.NONE, pose: POSE.KISS, popup: 'A kiss for the fans', popupAt: 0.3 },
};

const GENERIC = [
  { label: 'Knee slide', run: 1.5, runPose: POSE.AIRPLANE, pose: POSE.KNEE_SLIDE, slide: true },
  { label: 'Airplane', run: 2.4, runPose: POSE.AIRPLANE, pose: POSE.ARMS_UP },
  { label: 'Arms up', run: 1.2, runPose: POSE.ARMS_UP, pose: POSE.ARMS_UP },
];

export function celebrationFor(player) {
  if (player.celebration && CELEBRATIONS[player.celebration]) return CELEBRATIONS[player.celebration];
  return GENERIC[(Math.random() * GENERIC.length) | 0];
}
