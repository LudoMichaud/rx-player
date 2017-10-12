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

import config from "../../config.js";
import takeFirstDefined from "../../utils/takeFirstDefined.js";
import objectAssign from "object-assign";
import {
  normalizeAudioTrack,
  normalizeTextTrack,
} from "../../utils/languages";

const {
  DEFAULT_AUTO_PLAY,
  DEFAULT_SHOW_SUBTITLE,
  DEFAULT_AUDIO_TRACK,
  DEFAULT_TEXT_TRACK,
  DEFAULT_WANTED_BUFFER_AHEAD,
  DEFAULT_MAX_BUFFER_AHEAD,
  DEFAULT_MAX_BUFFER_BEHIND,
  DEFAULT_INITIAL_BITRATES,
  DEFAULT_MAX_BITRATES,
  DEFAULT_THROTTLE_WHEN_HIDDEN,
  DEFAULT_LIMIT_VIDEO_WIDTH,
} = config;

const def = takeFirstDefined;

/**
 * Parse options given to the API constructor and set default options as found
 * in the config.
 *
 * Do not mutate anything, only cross the given options and sane default options
 * (most coming from the config).
 * @param {Object} [options={}]
 * @returns {Object}
 */
function parseConstructorOptions(options = {}) {
  const parsed = {
    maxBufferAhead: def(options.maxBufferAhead, DEFAULT_MAX_BUFFER_AHEAD),
    maxBufferBehind: def(options.maxBufferBehind, DEFAULT_MAX_BUFFER_BEHIND),
    limitVideoWidth: def(options.limitVideoWidth, DEFAULT_LIMIT_VIDEO_WIDTH),

    defaultAudioTrack: normalizeAudioTrack(
      def(options.defaultAudioTrack, DEFAULT_AUDIO_TRACK),
    ),

    defaultTextTrack: normalizeTextTrack(
      def(options.defaultTextTrack, DEFAULT_TEXT_TRACK),
    ),

    wantedBufferAhead: def(
      options.wantedBufferAhead,
      DEFAULT_WANTED_BUFFER_AHEAD
    ),

    throttleWhenHidden: def(
      options.throttleWhenHidden,
      DEFAULT_THROTTLE_WHEN_HIDDEN
    ),

    videoElement: options.videoElement ?
      options.videoElement : document.createElement("video"),
  };

  const defaultInitialBitrates = DEFAULT_INITIAL_BITRATES || {};
  const defaultMaxBitrates = DEFAULT_MAX_BITRATES || {};
  parsed.initialAudioBitrate = def(
    options.initialAudioBitrate,
    defaultInitialBitrates.audio,
    defaultInitialBitrates.other
  );
  parsed.initialVideoBitrate = def(
    options.initialVideoBitrate,
    defaultInitialBitrates.video,
    defaultInitialBitrates.other
  );

  parsed.maxAudioBitrate = def(
    options.maxAudioBitrate,
    defaultMaxBitrates.audio,
    defaultMaxBitrates.other
  );
  parsed.maxVideoBitrate = def(
    options.maxVideoBitrate,
    defaultMaxBitrates.video,
    defaultMaxBitrates.other
  );
  return parsed;
}

/**
 * Parse options given to loadVideo and set default options as found
 * in the config.
 *
 * Do not mutate anything, only cross the given options and sane default options
 * (most coming from the config).
 * @param {Object} [options={}]
 * @param {Object} ctx - The player context, needed for some default values.
 * @returns {Object}
 */
function parseLoadVideoOptions(options = {}, ctx) {
  const {
    _priv,
  } = ctx;

  const {
    lastTextTrack,
    lastAudioTrack,
  } = _priv;

  const parsed = {
    url: options.url,
    transport: options.transport,
    autoPlay: def(options.autoPlay, DEFAULT_AUTO_PLAY),
    keySystems: def(options.keySystems, []),
    transportOptions: options.transportOptions,
    hideNativeSubtitle: def(options.hideNativeSubtitle, !DEFAULT_SHOW_SUBTITLE),
    supplementaryTextTracks: def(options.supplementaryTextTracks, []),
    supplementaryImageTracks: def(options.supplementaryImageTracks, []),

    defaultAudioTrack: normalizeAudioTrack(
      def(options.defaultAudioTrack, lastAudioTrack),
    ),

    defaultTextTrack: normalizeTextTrack(
      def(options.defaultTextTrack, lastTextTrack),
    ),
  };

  if (options.startAt && options.startAt.wallClockTime instanceof Date) {
    parsed.startAt = objectAssign({}, options.startAt, {
      wallClockTime: options.startAt.wallClockTime / 1000,
    });
  } else {
    parsed.startAt = options.startAt;
  }

  if (options.directFile) {
    parsed.transport = "directfile";
  }

  return parsed;
}

export {
  parseConstructorOptions,
  parseLoadVideoOptions,
};
