/**
 * Moon phase computation, ported from Jean Meeus, *Astronomical Algorithms*,
 * 2nd edition (Willmann-Bell, 1998).  This is a PORT of a published algorithm,
 * not an invention (SPEC "Provenance"):
 *
 *   - ch. 49 "Phases of the Moon": true phase instants = mean phase, eq. (49.1)
 *     + the full periodic-correction tables (pp. 350-352: 25 terms for new/full,
 *     25 terms + W for quarters) + the 14 "additional corrections" A1..A14.
 *     The mean formula alone is an explicit spec failure ("Domain rules");
 *     the correction tables below are the whole point of this module.
 *   - ch. 48 "Illuminated Fraction of the Moon's Disk": phase angle i via
 *     eq. (48.4) (a truncation of the ch. 47 lunar theory, largest term
 *     6.289 sin M'), then illuminated fraction k = (1 + cos i) / 2, eq. (48.1).
 *     This is derived from the real solar/lunar longitude difference -- it is
 *     NOT a cosine of the moon's age.
 *   - ch. 47, eqs. (47.2)-(47.4): polynomials for D (mean elongation),
 *     M (Sun's mean anomaly), M' (Moon's mean anomaly) feeding eq. (48.4).
 *
 * Time scales: Meeus' formulae yield JDE on the TT (dynamical) timescale.
 * We convert TT -> UT with the Espenak-Meeus DeltaT polynomial for 2005-2050
 * (also used outside that range; worst-case error over 1950-2100 is well under
 * one minute, negligible against the ~1 hour accuracy target).
 *
 * Vendored from github.com/trmnmc/moon (the user's Meeus port); cross-checked
 * by moon.test.ts fixtures.
 */

const PHASE_NAMES = ["new", "waxing crescent", "first quarter", "waxing gibbous",
  "full", "waning gibbous", "last quarter", "waning crescent"];

/** Mean synodic month in days (Meeus ch. 49). */
const SYNODIC_MONTH = 29.530588861;

/**
 * Instant-phase tolerance: +/- 0.5 days (12 hours) around the exact instant.
 *
 * Rationale: an instant phase "owns" its calendar day, matching almanac and
 * calendar convention ("tonight is the full moon") -- report "full" for the
 * ~24 h centred on the instant, and a crescent/gibbous name outside it, where
 * the terminator's curvature actually becomes visible.  12 h is also well
 * under half the ~7.38-day gap between consecutive quarter instants, so the
 * windows can never collide and each intermediate name keeps the majority
 * (~6.4 days) of its arc.
 */
const INSTANT_TOLERANCE_DAYS = 0.5;

/**
 * KI-7: the declared domain over which `phaseName` and `illumination` are
 * known to stay mutually consistent -- the half-open range of calendar
 * years 1000-3000 (i.e. [Date.UTC(1000,0,1), Date.UTC(3000,0,1))).
 *
 * WHY: `phaseName` and `illumination` come from two DIFFERENT Meeus series
 * that are each polynomial in T (centuries/millennia from J2000):
 *   - phaseName derives from the ch. 49 true-phase instant series
 *     (truePhaseJD), driven by k and T = k / 1236.85.
 *   - illumination derives from the ch. 48 elongation series
 *     (elongationDeg), via k = (1 + cos i) / 2, driven by T = centuries
 *     from J2000 in eqs. (47.2)-(47.4).
 * Both series are truncations fitted and validated near J2000; nothing
 * about them guarantees the two stay in step once T grows large. Far
 * outside this domain (Meeus gives no domain of validity, so "far" was
 * found empirically -- e.g. epochs around +/-270,000 years) the two series
 * can disagree enough that phaseName names a band illumination does not
 * support, e.g. "waning gibbous" reported at 3.85% illumination.
 *
 * This bound is SAMPLED-clean, not proven: test/astro.test.js strides
 * deterministically across it and finds no contradiction between phaseName
 * and illumination anywhere in the sample. It is not a derived error bound
 * on either series. Behavior outside this domain is UNSPECIFIED -- not
 * guaranteed wrong, simply not checked.
 */
const PHASE_ILLUMINATION_CONSISTENCY_DOMAIN = {
  startMs: Date.UTC(1000, 0, 1),
  endMs: Date.UTC(3000, 0, 1),
};

const DEG = Math.PI / 180;
const DAY_MS = 86400000;
const JD_UNIX_EPOCH = 2440587.5; // JD of 1970-01-01T00:00:00Z
const MEAN_PHASE_EPOCH = 2451550.09766; // JDE of the k=0 mean new moon (49.1)

const sin = Math.sin;
const cos = Math.cos;

/** Normalize an angle in degrees to [0, 360). */
function normDeg(x) {
  x %= 360;
  if (x < 0) x += 360;
  return x >= 360 ? 0 : x;
}

/** Julian Day (UT) for a JS Date. */
function dateToJulianDay(date) {
  return date.getTime() / DAY_MS + JD_UNIX_EPOCH;
}

/**
 * DeltaT = TT - UT, in days.  Espenak & Meeus polynomial for 2005-2050:
 * DeltaT(s) = 62.92 + 0.32217 t + 0.005589 t^2,  t = year - 2000.
 */
function deltaTDays(jd) {
  const t = (jd - 2451545.0) / 365.25; // years from 2000.0
  return (62.92 + 0.32217 * t + 0.005589 * t * t) / 86400;
}

/**
 * True instant of a lunar phase, Meeus ch. 49.
 * k integer -> new moon;  k + 0.25 -> first quarter;  k + 0.5 -> full moon;
 * k + 0.75 -> last quarter.  k = 0 is the new moon of 2000 Jan 6.
 * @param {number} k
 * @returns {number} Julian Day of the instant, on the UT timescale
 */
function truePhaseJD(k) {
  const phase = ((k % 1) + 1) % 1; // 0, 0.25, 0.5 or 0.75 (exact in binary)
  const T = k / 1236.85;           // (49.3)
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;

  // (49.1) mean phase
  let jde = MEAN_PHASE_EPOCH + SYNODIC_MONTH * k
    + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;

  // (47.6) eccentricity factor
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  // Angular arguments (ch. 49, p. 350), degrees -> radians
  const M = (2.5534 + 29.10535670 * k
    - 0.0000014 * T2 - 0.00000011 * T3) * DEG;                 // Sun's mean anomaly
  const Mp = (201.5643 + 385.81693528 * k
    + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * DEG; // Moon's mean anomaly
  const F = (160.7108 + 390.67050284 * k
    - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * DEG; // argument of latitude
  const Om = (124.7746 - 1.56375588 * k
    + 0.0020672 * T2 + 0.00000215 * T3) * DEG;                 // ascending node

  let corr;
  if (phase === 0 || phase === 0.5) {
    // Periodic corrections for NEW moon / FULL moon (ch. 49, pp. 351-352).
    // The first seven coefficients differ between new and full; the rest are shared.
    const a = phase === 0
      ? [-0.40720, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208]
      : [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209];
    corr =
        a[0] * sin(Mp)
      + a[1] * E * sin(M)
      + a[2] * sin(2 * Mp)
      + a[3] * sin(2 * F)
      + a[4] * E * sin(Mp - M)
      + a[5] * E * sin(Mp + M)
      + a[6] * E * E * sin(2 * M)
      - 0.00111 * sin(Mp - 2 * F)
      - 0.00057 * sin(Mp + 2 * F)
      + 0.00056 * E * sin(2 * Mp + M)
      - 0.00042 * sin(3 * Mp)
      + 0.00042 * E * sin(M + 2 * F)
      + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M)
      - 0.00017 * sin(Om)
      - 0.00007 * sin(Mp + 2 * M)
      + 0.00004 * sin(2 * Mp - 2 * F)
      + 0.00004 * sin(3 * M)
      + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(2 * Mp + 2 * F)
      - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F)
      - 0.00002 * sin(Mp - M - 2 * F)
      - 0.00002 * sin(3 * Mp + M)
      + 0.00002 * sin(4 * Mp);
  } else {
    // Periodic corrections for FIRST / LAST quarter (ch. 49, p. 352).
    corr =
      - 0.62801 * sin(Mp)
      + 0.17172 * E * sin(M)
      - 0.01183 * E * sin(Mp + M)
      + 0.00862 * sin(2 * Mp)
      + 0.00804 * sin(2 * F)
      + 0.00454 * E * sin(Mp - M)
      + 0.00204 * E * E * sin(2 * M)
      - 0.00180 * sin(Mp - 2 * F)
      - 0.00070 * sin(Mp + 2 * F)
      - 0.00040 * sin(3 * Mp)
      - 0.00034 * E * sin(2 * Mp - M)
      + 0.00032 * E * sin(M + 2 * F)
      + 0.00032 * E * sin(M - 2 * F)
      - 0.00028 * E * E * sin(Mp + 2 * M)
      + 0.00027 * E * sin(2 * Mp + M)
      - 0.00017 * sin(Om)
      - 0.00005 * sin(Mp - M - 2 * F)
      + 0.00004 * sin(2 * Mp + 2 * F)
      - 0.00004 * sin(Mp + M + 2 * F)
      + 0.00004 * sin(Mp - 2 * M)
      + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(3 * M)
      + 0.00002 * sin(2 * Mp - 2 * F)
      + 0.00002 * sin(Mp - M + 2 * F)
      - 0.00002 * sin(3 * Mp + M);
    // Quarter-phase asymmetry term W (ch. 49, p. 352): +W for first quarter,
    // -W for last quarter.
    const W = 0.00306
      - 0.00038 * E * cos(M)
      + 0.00026 * cos(Mp)
      - 0.00002 * cos(Mp - M)
      + 0.00002 * cos(Mp + M)
      + 0.00002 * cos(2 * F);
    corr += (phase === 0.25) ? W : -W;
  }

  // Fourteen "additional corrections" A1..A14 (ch. 49, p. 352), applied to
  // all phases.  [coefficient in days, argument polynomial in degrees]
  const A = [
    [0.000325, 299.77 + 0.107408 * k - 0.009173 * T2],
    [0.000165, 251.88 + 0.016321 * k],
    [0.000164, 251.83 + 26.651886 * k],
    [0.000126, 349.42 + 36.412478 * k],
    [0.000110, 84.66 + 18.206239 * k],
    [0.000062, 141.74 + 53.303771 * k],
    [0.000060, 207.14 + 2.453732 * k],
    [0.000056, 154.84 + 7.306860 * k],
    [0.000047, 34.52 + 27.261239 * k],
    [0.000042, 207.19 + 0.121824 * k],
    [0.000040, 291.34 + 1.844379 * k],
    [0.000037, 161.72 + 24.198154 * k],
    [0.000035, 239.56 + 25.513099 * k],
    [0.000023, 331.55 + 3.592518 * k],
  ];
  for (let i = 0; i < A.length; i++) jde += A[i][0] * sin(A[i][1] * DEG);

  jde += corr;
  return jde - deltaTDays(jde); // TT -> UT
}

/**
 * The Moon's true elongation from the Sun in ecliptic longitude, degrees in
 * [0, 360): 0 = new, 90 = first quarter, 180 = full, 270 = last quarter.
 *
 * This is Meeus eq. (48.4) rearranged: Meeus gives the phase angle
 *   i = 180 - D - 6.289 sin M' + 2.100 sin M - 1.274 sin(2D - M')
 *       - 0.658 sin 2D - 0.214 sin 2M' - 0.110 sin D
 * where (180 - i) is exactly the true elongation below.  The periodic terms
 * are the leading terms of the ch. 47 lunar longitude series and the Sun's
 * equation of centre -- i.e. a real Moon-minus-Sun longitude difference.
 */
function elongationDeg(jd) {
  const T = (jd + deltaTDays(jd) - 2451545.0) / 36525; // TT centuries from J2000
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  // (47.2) mean elongation of the Moon from the Sun
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2
    + T3 / 545868 - T4 / 113065000;
  // (47.3) Sun's mean anomaly
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  // (47.4) Moon's mean anomaly
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2
    + T3 / 69699 - T4 / 14712000;

  const d = D * DEG, m = M * DEG, mp = Mp * DEG;
  const elong = D
    + 6.289 * sin(mp)
    - 2.100 * sin(m)
    + 1.274 * sin(2 * d - mp)
    + 0.658 * sin(2 * d)
    + 0.214 * sin(2 * mp)
    + 0.110 * sin(d);
  return normDeg(elong);
}

/**
 * Locate the lunation containing `jd`: returns the integer k whose true new
 * moon is the latest one at or before `jd`.
 */
function lunationK(jd) {
  let k = Math.round((jd - MEAN_PHASE_EPOCH) / SYNODIC_MONTH);
  while (truePhaseJD(k) > jd) k -= 1;
  while (truePhaseJD(k + 1) <= jd) k += 1;
  return k;
}

/**
 * @param {Date} date
 * @returns {MoonState}
 */
function computeMoon(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('computeMoon expects a valid Date');
  }
  const jd = dateToJulianDay(date);

  // True quarter instants of the current lunation (ch. 49, with corrections).
  const k = lunationK(jd);
  const instants = [
    [truePhaseJD(k), 0],           // new (start of lunation)
    [truePhaseJD(k + 0.25), 2],    // first quarter
    [truePhaseJD(k + 0.5), 4],     // full
    [truePhaseJD(k + 0.75), 6],    // last quarter
    [truePhaseJD(k + 1), 0],       // next new
  ];

  // Illumination from the true elongation (ch. 48).  Folding the elongation
  // about 180 gives the phase angle i of eq. (48.4); eq. (48.1) then gives
  // the illuminated fraction.  (Geocentric latitude is neglected as in 48.4;
  // its effect on the fraction is < 0.2%.)
  const phaseAngle = elongationDeg(jd);
  const i = Math.abs(180 - phaseAngle);
  const illumination = (1 + cos(i * DEG)) / 2;

  const cycleFraction = phaseAngle / 360;

  // Days since the true new moon that started this lunation.
  //
  // NOT clamped to the mean synodic month. An earlier revision clamped to
  // SYNODIC_MONTH (29.5306) to satisfy a contract that wrongly used the MEAN
  // lunation as an upper bound; real lunations run to ~29.84 days, so that clamp
  // silently under-reported age by up to ~7 hours in the closing hours of a long
  // lunation — while the documented meaning is plain elapsed time. Reporting the
  // true elapsed value is the only reading consistent with the documentation.
  const age = jd - instants[0][0];

  // Nearest quarter instant decides instant-phase naming.
  let nearest = 0;
  for (let n = 1; n < instants.length; n++) {
    if (Math.abs(jd - instants[n][0]) < Math.abs(jd - instants[nearest][0])) nearest = n;
  }
  const isInstantPhase = Math.abs(jd - instants[nearest][0]) <= INSTANT_TOLERANCE_DAYS;

  let phaseName;
  if (isInstantPhase) {
    phaseName = PHASE_NAMES[instants[nearest][1]];
  } else {
    // Between quarter instants: pick the intermediate name for the arc we
    // are in (index of the latest quarter instant at or before jd).
    let arc = 0;
    for (let n = 1; n < 4; n++) {
      if (instants[n][0] <= jd) arc = n;
    }
    phaseName = PHASE_NAMES[arc * 2 + 1];
  }

  return { julianDay: jd, age, cycleFraction, phaseAngle, illumination, phaseName, isInstantPhase };
}

/**
 * Instant of the next full moon strictly after `date`, using the same Meeus
 * ch. 49 machinery (mean phase + periodic corrections) as computeMoon.
 * @param {Date} date
 * @returns {Date}
 */
function nextFullMoon(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('nextFullMoon expects a valid Date');
  }
  const jd = dateToJulianDay(date);
  // Full moon of the lunation containing jd, else the following one.
  // Compare in rounded milliseconds so "strictly after" holds at the exact
  // returned Date (JD -> ms rounding can otherwise land 1 ms on either side).
  const k = lunationK(jd);
  const toMs = (j) => Math.round((j - JD_UNIX_EPOCH) * DAY_MS);
  let fullMs = toMs(truePhaseJD(k + 0.5));
  if (fullMs <= date.getTime()) fullMs = toMs(truePhaseJD(k + 1.5));
  const result = new Date(fullMs);
  if (Number.isNaN(result.getTime())) {
    throw new TypeError('nextFullMoon result is outside the representable Date range');
  }
  return result;
}

export { computeMoon, nextFullMoon, PHASE_NAMES, PHASE_ILLUMINATION_CONSISTENCY_DOMAIN };
