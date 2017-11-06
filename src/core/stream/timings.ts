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

import objectAssign = require("object-assign");
import { Observable } from "rxjs/Observable";
import { getMaximumBufferPosition } from "../../manifest/timings";
import Manifest from "../../manifest";

import { IStreamClockTick } from "./types";

export interface ITimingsClockTick extends IStreamClockTick {
  liveGap : number;
}

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
function seekingsSampler(
  timingsSampling : Observable<IStreamClockTick>
) : Observable<null> {
  return timingsSampling
    .filter(timing => {
      return timing.state === "seeking" &&
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
    .map(() => null)
    .startWith(null); // TODO Why starting with somthing?
}

/**
 * Create timings and seekings Observables:
 *   - timings is the given timings observable with added informations.
 *   - seekings emits each time the player go in a seeking state.
 * @param {Object} manifest
 * @returns {Object}
 */
function createTimingsAndSeekingsObservables(
  manifest : Manifest,
  timings : Observable<IStreamClockTick>
) : {
  timings : Observable<ITimingsClockTick>,
  seekings : Observable<null>,
} {
  const augmentedTimings = timings.map((timing) => {
    return objectAssign({
      liveGap: manifest.isLive ?
        getMaximumBufferPosition(manifest) - timing.currentTime :
        Infinity,
    }, timing);
  });

  const seekings = seekingsSampler(augmentedTimings);

  return {
    timings: augmentedTimings,
    seekings,
  };
}

export default createTimingsAndSeekingsObservables;