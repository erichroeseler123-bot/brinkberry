/**
 * Race Track & Grassroots Motorsports Domain Schema
 *
 * Defines standardized data structures and validation rules for:
 * - Race Tracks (Dirt ovals, asphalt short tracks, drag strips, road courses)
 * - Race Events (Classes, timelines, green flag times, weather status, pricing)
 * - Touring Series & Drivers (Sanctioning bodies, driver profiles)
 * - Trust & Provenance (Official URLs, verification timestamps, rainout status)
 */

const TRACK_SURFACES = [
  'dirt_oval',
  'asphalt_oval',
  'drag_strip',
  'road_course',
  'karting'
];

const RACE_CLASSES = [
  'sprint_cars',
  'late_models',
  'modifieds',
  'stock_cars',
  'nhra_drag',
  'drifting',
  'track_day',
  'pro_trucks',
  'legends',
  'midgets'
];

const WEATHER_STATUSES = [
  'green_flag',       // Normal racing weather, clear / favorable
  'weather_watch',     // Rain probability elevated, active monitoring
  'rained_out',        // Cancelled due to rain/surface saturation
  'postponed',         // Moved to rain date or rescheduled
  'wind_curfew'        // Delayed or halted due to high winds / track curfew
];

const ADMISSION_MODELS = [
  'paid_ticket',
  'cash_at_gate',
  'free_admission',
  'pay_per_car'
];

const PLANNING_WINDOWS = [
  '48h',          // Next 48 Hours live radar
  'this_weekend', // Friday afternoon through Sunday night this week
  'next_weekend', // Friday afternoon through Sunday night next week
  '30d',          // Next 30 days outlook
  'season'        // Full annual/season schedule
];

function normalizeTrackMetadata(payload = {}) {
  const trackType = TRACK_SURFACES.includes(payload.trackType) ? payload.trackType : 'asphalt_oval';
  const length = String(payload.length || '3/8-mile').trim();
  const banking = String(payload.banking || '').trim();
  const sanctioningBodies = Array.isArray(payload.sanctioningBodies)
    ? payload.sanctioningBodies.map(s => String(s).trim()).filter(Boolean)
    : [];

  return {
    trackType,
    length,
    banking,
    sanctioningBodies,
    surfaceDisplay: formatSurfaceName(trackType),
    coolersAllowed: payload.coolersAllowed ?? true,
    campingAllowed: payload.campingAllowed ?? false
  };
}

function normalizeRaceEvent(payload = {}) {
  const weatherStatus = WEATHER_STATUSES.includes(payload.weatherStatus) ? payload.weatherStatus : 'green_flag';
  const admissionModel = ADMISSION_MODELS.includes(payload.admissionModel) ? payload.admissionModel : 'paid_ticket';
  const classes = Array.isArray(payload.classes)
    ? payload.classes.map(c => String(c).trim()).filter(Boolean)
    : ['Weekly Racing Series'];

  return {
    classes,
    weatherStatus,
    admissionModel,
    gateTime: payload.gateTime || '4:00 PM',
    hotLapsTime: payload.hotLapsTime || '5:30 PM',
    greenFlagTime: payload.greenFlagTime || '6:30 PM',
    pitPassPrice: payload.pitPassPrice || '$35',
    generalAdmissionPrice: payload.generalAdmissionPrice || '$20',
    kidsPolicy: payload.kidsPolicy || 'Kids 12 & Under Free with adult',
    isCancelled: weatherStatus === 'rained_out' || Boolean(payload.isCancelled),
    isStale: Boolean(payload.isStale),
    rainDate: payload.rainDate || null
  };
}

function formatSurfaceName(surfaceType) {
  switch (surfaceType) {
    case 'dirt_oval': return 'Dirt Oval';
    case 'asphalt_oval': return 'Paved Short Track';
    case 'drag_strip': return 'Drag Strip';
    case 'road_course': return 'Road Course';
    case 'karting': return 'Karting Circuit';
    default: return 'Short Track';
  }
}

module.exports = {
  TRACK_SURFACES,
  RACE_CLASSES,
  WEATHER_STATUSES,
  ADMISSION_MODELS,
  PLANNING_WINDOWS,
  normalizeTrackMetadata,
  normalizeRaceEvent,
  formatSurfaceName
};
