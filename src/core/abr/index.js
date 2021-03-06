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

import { Subject } from "rxjs/Subject";

import arrayIncludes from "../../utils/array-includes.js";
import assert from "../../utils/assert.js";

import RepresentationChooser from "./representation_chooser.js";

/**
 * Types of chunks accepted by the ABR logic.
 */
const KNOWN_TYPES = ["audio", "video", "text", "image"];

/**
 * @param {string} type
 * @throws {AssertError} - Throws if the type given is not known.
 */
const assertType = type =>
  assert(arrayIncludes(KNOWN_TYPES, type), `"${type}" is an unknown type`);

/**
 * Create the right RepresentationChooser instance, from the given data.
 * @param {string} type
 * @param {Object} options
 * @returns {Observable} - The RepresentationChooser instance
 */
const createChooser = (type, options) => {
  return new RepresentationChooser({
    limitWidth$: options.limitWidth[type],
    throttle$: options.throttle[type],
    initialBitrate: options.initialBitrates[type],
    manualBitrate: options.manualBitrates[type],
    maxAutoBitrate: options.maxAutoBitrates[type],
  });
};

/**
 * If it doesn't exist, create a RepresentationChooser instance and add
 * it to the given "instce" context, under the _choosers.<bufferType> property.
 * @param {ABRManager} intce
 * @param {string} bufferType
 */
const lazilyAttachChooser = (instce, bufferType) => {
  if (!instce._choosers[bufferType]) {
    instce._choosers[bufferType] =
      createChooser(bufferType, instce._chooserInstanceOptions);
  }
};

/**
 * Adaptive BitRate Manager.
 *
 * Select the right representation from the network and buffer infos it
 * receives.
 * @class ABRManager
 */
export default class ABRManager {
  /**
   * @param {Observable} requests$ - Emit requests infos as they begin, progress
   * and end.
   * Allows to know if a request take too much time to be finished in
   * emergency times (e.g. when the user's bandwidth falls very quickly).
   *
   * The items emitted are Observables which each emit infos about a SINGLE
   * request. These infos are under the form of objects with the following keys:
   *   - type {string}: the buffer type (example: "video")
   *
   *   - event {string}: Wether the request started, is progressing or has
   *     ended. Should be either one of these three strings:
   *       1. "requestBegin": The request has just begun.
   *
   *       2. "progress": Informations about the request progress were received
   *          (basically the amount of bytes currently received).
   *
   *       2. "requestEnd": The request just ended (successfully/on error/was
   *          canceled)
   *
   *     Note that it should ALWAYS happen in the following order:
   *     1 requestBegin -> 0+ progress -> 1 requestEnd
   *
   *     Also note that EVERY requestBegin should eventually be followed by a
   *     requestEnd at some point. If that's not the case, a memory leak
   *     can happen.
   *
   *   - value {Object|undefined}: The value depends on the type of event
   *     received:
   *       - for "requestBegin" events, it should be an object with the
   *         following keys:
   *           - id {Number|String}: The id of this particular request.
   *           - duration {Number}: duration, in seconds of the asked segment.
   *           - time {Number}: The start time, in seconds of the asked segment.
   *           - requestTimestamp {Number}: the timestamp at which the request
   *             was sent, in ms.
   *
   *       - for "progress" events, it should be an object with the following
   *         keys:
   *           - id {Number|String}: The id of this particular request.
   *           - size {Number}: amount currently downloaded, in bytes
   *           - timestamp {Number}: timestamp at which the progress event was
   *             received, in ms
   *         Those events SHOULD be received in order (that is, in increasing
   *         order for both size and timestamp).
   *
   *       - for "requestEnd" events:
   *           - id {Number|String}: The id of this particular request.
   *
   * @param {Observable} metrics$ - Emit each times the network downloaded
   * a new segment for a given buffer type. Allows to obtain informations about
   * the user's bitrate.
   *
   * The items emitted are object with the following keys:
   *   - type {string}: the buffer type (example: "video")
   *   - value {Object}:
   *     - duration {Number}: duration of the request, in seconds.
   *     - size {Number}: size of the downloaded chunks, in bytes.
   *
   * @param {Object} [options={}]
   * @param {Object} [options.initialBitrates={}]
   * @param {Object} [options.manualBitrates={}]
   * @param {Object} [options.maxAutoBitrates={}]
   * @param {Object} [options.throttle={}]
   * @param {Object} [options.limitWidth={}]
   */
  constructor(requests$, metrics$, options = {}) {
    // Subject emitting and completing on dispose.
    // Used to clean up every created observables.
    this._dispose$ = new Subject();

    // Will contain every RepresentationChooser attached to the ABRManager,
    // by type ("audio"/"video" etc.)
    this._choosers = {};

    // -- OPTIONS --

    // Will contain options used when (lazily) instantiating a
    // RepresentationChooser
    this._chooserInstanceOptions = {
      initialBitrates: options.initialBitrates || {},
      manualBitrates: options.manualBitrates || {},
      maxAutoBitrates: options.maxAutoBitrates || {},
      throttle: options.throttle || {},
      limitWidth: options.limitWidth || {},
    };

    metrics$
      .takeUntil(this._dispose$)
      .subscribe(({ type, value }) => {
        if (__DEV__) {
          assertType(type);
        }

        lazilyAttachChooser(this, type);
        const { duration, size } = value;

        // TODO Should we do a single estimate instead of a per-type one?
        // Test it thoroughly
        this._choosers[type].addEstimate(duration, size);
      });

    requests$
      // requests$ emits observables which are subscribed to
      .mergeMap(request$ => request$)
      .takeUntil(this._dispose$)
      .subscribe(({ type, event, value }) => {
        if (__DEV__) {
          assertType(type);
        }

        lazilyAttachChooser(this, type);
        switch (event) {
          case "requestBegin":
          // use the id of the segment as in any case, we should only have at
          // most one active download for the same segment.
          // This might be not optimal if this changes however. The best I think
          // for now is to just throw/warn in DEV mode when two pending ids
          // are identical
            this._choosers[type].addPendingRequest(value.id, value);
            break;
          case "requestEnd":
            this._choosers[type].removePendingRequest(value.id);
            break;
          case "progress":
            this._choosers[type].addRequestProgress(value.id, value);
            break;
        }
      });
  }

  /**
   * Take type and an array of the available representations, spit out an
   * observable emitting the best representation (given the network/buffer
   * state).
   * @param {string} type
   * @param {Array.<Representation>} [representations=[]]
   * @returns {Observable}
   */
  get$(type, clock$, representations = []) {
    if (__DEV__) {
      assertType(type);
    }
    lazilyAttachChooser(this, type);
    return this._choosers[type].get$(clock$, representations);
  }

  /**
   * Set manually the bitrate for a given type.
   *
   * The given number will act as a ceil.
   * If no representation is found with the given bitrate, we will consider:
   *   1. The representation just lower than it
   *   2. If no representation is found in the previous step, the representation
   *   with the lowest bitrate.
   *
   * @param {string} type
   * @param {Number} bitrate
   */
  setManualBitrate(type, bitrate) {
    if (__DEV__) {
      assertType(type);
    }

    const chooser = this._choosers[type];
    if (!chooser) {
      // if no chooser yet, store as a chooser option for when it will be
      // effectively instantiated
      this._chooserInstanceOptions.initialBitrates[type] = bitrate;
    } else {
      chooser.manualBitrate$.next(bitrate);
    }
  }

  setMaxAutoBitrate(type, bitrate) {
    if (__DEV__) {
      assertType(type);
    }

    const chooser = this._choosers[type];
    if (!chooser) {
      // if no chooser yet, store as a chooser option for when it will be
      // effectively instantiated
      this._chooserInstanceOptions.maxAutoBitrates[type] = bitrate;
    } else {
      chooser.maxAutoBitrate$.next(bitrate);
    }
  }

  getManualBitrate(type) {
    if (__DEV__) {
      assertType(type);
    }
    const chooser = this._choosers[type];
    return chooser ?
      chooser.manualBitrate$.getValue() :
      this._chooserInstanceOptions.manualBitrates[type];
  }

  getMaxAutoBitrate(type) {
    if (__DEV__) {
      assertType(type);
    }
    const chooser = this._choosers[type];
    return chooser ?
      chooser.maxAutoBitrate$.getValue() :
      this._chooserInstanceOptions.maxAutoBitrates[type];
  }

  dispose() {
    Object.keys(this._choosers).forEach(type => {
      this._choosers[type].dispose();
    });
    this._chooserInstanceOptions = null;
    this._choosers = null;
    this._dispose$.next();
    this._dispose$.complete();
  }
}
