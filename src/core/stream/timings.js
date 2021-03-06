/**
 * Copyright 2015 CANAL+ Group
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import objectAssign from "object-assign";
import { getMaximumBufferPosition } from "../../manifest/timings.js";

/**
 * TODO I'm not sure that's useful here.
 * seek gap in seconds.
 */
const SEEK_GAP = 2;

/**
 * Observable emitting each time the player is in a true seeking state.
 * That is, the player is seeking and no buffer has been constructed for this
 * range yet.
 * @param {Observable} timingsSampling - the timings observable emitting every
 * seeking events.
 * @returns {Observable}
 */
function seekingsSampler(timingsSampling) {
  return timingsSampling
    .filter(timing => {
      return timing.state == "seeking" &&
        ( timing.bufferGap === Infinity ||

        // TODO I don't think that's possible here:
        // the gap is based on the current position and the difference
        // between it and the end of the range this position is in.
        // I don't see how it could be negative.
        // It is Infinity when no range is found for the current position
          timing.bufferGap < -SEEK_GAP );
    })
    // skip the first seeking event generated by the set of the
    // initial seeking time in the video
    // TODO Always the case? check that up
    .skip(1)
    .startWith(true); // TODO What's with the true?
}

/**
 * Create timings and seekings Observables:
 *   - timings is the given timings observable with added informations.
 *   - seekings emits each time the player go in a seeking state.
 * @param {Object} manifest
 * @returns {Object}
 */
function createTimingsAndSeekingsObservables(manifest, timings) {
  const augmentedTimings = timings.map((timing) => {
    const clonedTiming = objectAssign({}, timing);

    // TODO remove liveGap for non-live?
    clonedTiming.liveGap = manifest.isLive ?
      getMaximumBufferPosition(manifest) - timing.currentTime :
      Infinity;
    return clonedTiming;
  });

  const seekings = seekingsSampler(augmentedTimings);

  return {
    timings: augmentedTimings,
    seekings,
  };
}

export default createTimingsAndSeekingsObservables;
