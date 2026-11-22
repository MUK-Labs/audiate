import { midiFrequency } from './exercise.js';

const minimumHz = 55;
const maximumHz = 1500;
const listeningTime = 10000;
const sampleInterval = 60;
const quiet = 0.0001;
const pianoPartials = [
  { harmonic: 1, peak: 0.18 },
  { harmonic: 2, peak: 0.046, decay: 0.28 },
  { harmonic: 3, peak: 0.026, decay: 0.17 },
  { harmonic: 4, peak: 0.012, decay: 0.11 },
];

export function estimatePitch(samples, sampleRate) {
  // Average adjacent samples before downsampling to keep the mic check lightweight.
  const stride = Math.max(1, Math.floor(sampleRate / 16000));
  const frame = new Float32Array(Math.floor(samples.length / stride));
  let sum = 0;
  let sumOfSquares = 0;
  for (let index = 0; index < frame.length; index++) {
    let sample = 0;
    for (let offset = 0; offset < stride; offset++) {
      sample += samples[index * stride + offset];
    }
    sample /= stride;
    frame[index] = sample;
    sum += sample;
    sumOfSquares += sample * sample;
  }

  const mean = sum / frame.length;
  const variance = sumOfSquares / frame.length - mean * mean;
  if (variance < 0.005 ** 2) return null;

  const analysisRate = sampleRate / stride;
  const firstLag = Math.floor(analysisRate / maximumHz);
  const lastLag = Math.min(Math.ceil(analysisRate / minimumHz), Math.floor(frame.length / 2) - 1);
  if (lastLag <= firstLag) return null;

  // YIN compares each lag with the average difference at shorter lags.
  const difference = new Float64Array(lastLag + 1);
  difference[0] = 1;
  const comparisonLength = frame.length - lastLag;
  let runningTotal = 0;
  for (let lag = 1; lag <= lastLag; lag++) {
    let squaredDifference = 0;
    for (let index = 0; index < comparisonLength; index++) {
      const delta = frame[index] - frame[index + lag];
      squaredDifference += delta * delta;
    }
    runningTotal += squaredDifference;
    difference[lag] = runningTotal > 0 ? squaredDifference * lag / runningTotal : 1;
  }

  let bestLag = firstLag;
  for (let lag = firstLag; lag <= lastLag; lag++) {
    if (difference[lag] < difference[bestLag]) bestLag = lag;
    if (difference[lag] < 0.12) {
      while (lag < lastLag && difference[lag + 1] < difference[lag]) lag++;
      bestLag = lag;
      break;
    }
  }
  if (difference[bestLag] > 0.2) return null;

  let period = bestLag;
  if (bestLag > 1 && bestLag < lastLag) {
    const left = difference[bestLag - 1];
    const middle = difference[bestLag];
    const right = difference[bestLag + 1];
    const curvature = left + right - 2 * middle;
    if (curvature > 0) period += (left - right) / (2 * curvature);
  }

  const frequency = analysisRate / period;
  return frequency >= minimumHz && frequency <= maximumHz ? frequency : null;
}

function microphoneError(error) {
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new Error('Microphone access was blocked. You can allow it in your browser and try again.');
    case 'NotFoundError':
      return new Error('No microphone was found. Connect one and try again.');
    case 'NotReadableError':
      return new Error('The microphone is unavailable. Close other apps using it and try again.');
    default:
      return new Error('The microphone could not be started. Try again.');
  }
}

export class ExerciseAudio {
  #context;
  #playback;
  #playbackVersion = 0;

  async ready() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) throw new Error('This browser does not support audio playback.');
    if (!this.#context || this.#context.state === 'closed') {
      this.#context = new AudioContext();
    }
    if (this.#context.state !== 'running') await this.#context.resume();
    return this.#context;
  }

  async play(midiNotes) {
    this.stopPlayback();
    const version = this.#playbackVersion;
    const notes = Array.isArray(midiNotes) ? midiNotes : [midiNotes];
    if (!notes.length) return;

    const context = await this.ready();
    if (version !== this.#playbackVersion) return;

    return new Promise(resolve => {
      const oscillators = new Map();
      this.#playback = { oscillators, resolve };
      const duration = notes.length === 1 ? 0.74 : 0.43;
      const start = context.currentTime + 0.02;

      notes.forEach((note, index) => {
        const time = start + index * (duration + 0.05);
        const fundamental = midiFrequency(note);
        for (const { harmonic, peak, decay = duration } of pianoPartials) {
          const length = Math.min(duration, decay);
          const release = Math.min(0.09, length / 3);
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = fundamental * harmonic;
          gain.gain.setValueAtTime(quiet, time);
          gain.gain.exponentialRampToValueAtTime(peak, time + 0.018);
          gain.gain.exponentialRampToValueAtTime(peak * 0.45, time + length - release);
          gain.gain.exponentialRampToValueAtTime(quiet, time + length);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillators.set(oscillator, gain);

          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
            oscillators.delete(oscillator);
            if (!oscillators.size) {
              this.#playback = undefined;
              resolve();
            }
          };
          oscillator.start(time);
          oscillator.stop(time + length);
        }
      });
    });
  }

  stopPlayback() {
    this.#playbackVersion++;
    if (!this.#playback) return;
    const { oscillators, resolve } = this.#playback;
    for (const [oscillator, gain] of oscillators) {
      oscillator.onended = null;
      oscillator.stop();
      oscillator.disconnect();
      gain.disconnect();
    }
    this.#playback = undefined;
    resolve();
  }

  async listen({ onStatus = () => {}, signal } = {}) {
    const cancelled = () => new DOMException('Pitch check cancelled.', 'AbortError');
    if (signal?.aborted) throw cancelled();
    const devices = globalThis.navigator?.mediaDevices;
    if (!devices?.getUserMedia) {
      throw new Error('Microphone access requires a supported browser and a secure connection.');
    }

    return new Promise((resolve, reject) => {
      let active = true;
      let stream;
      let source;
      let analyser;
      let mutedOutput;
      let timer;

      function finish(pitch, error) {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        source?.disconnect();
        analyser?.disconnect();
        mutedOutput?.disconnect();
        stream?.getTracks().forEach(track => track.stop());
        if (error) reject(error);
        else resolve(pitch);
      }

      function abort() {
        finish(null, cancelled());
      }

      const begin = async () => {
        try {
          onStatus('Allow microphone access to check your pitch.');
          const context = await this.ready();
          if (!active) return;
          stream = await devices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false },
            video: false,
          });
          if (!active) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }

          source = context.createMediaStreamSource(stream);
          analyser = context.createAnalyser();
          analyser.fftSize = context.sampleRate <= 48000 ? 4096 : 8192;
          mutedOutput = context.createGain();
          mutedOutput.gain.value = 0;
          source.connect(analyser);
          analyser.connect(mutedOutput);
          mutedOutput.connect(context.destination);

          const samples = new Float32Array(analyser.fftSize);
          const deadline = performance.now() + listeningTime;
          const recentPitches = [];
          let lastDetection = 0;

          const sample = () => {
            const now = performance.now();
            if (now >= deadline) {
              finish(null);
              return;
            }

            analyser.getFloatTimeDomainData(samples);
            const frequency = estimatePitch(samples, context.sampleRate);
            if (frequency !== null) {
              if (now - lastDetection > 180) recentPitches.length = 0;
              lastDetection = now;
              recentPitches.push(69 + 12 * Math.log2(frequency / 440));
              if (recentPitches.length > 6) recentPitches.shift();

              if (recentPitches.length >= 5) {
                const sorted = [...recentPitches].sort((a, b) => a - b);
                const middle = Math.floor(sorted.length / 2);
                const center = (sorted[middle] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2;
                if (sorted.filter(pitch => Math.abs(pitch - center) <= 0.42).length >= 5) {
                  finish(center);
                  return;
                }
              }
            }
            timer = setTimeout(sample, sampleInterval);
          };

          onStatus('Listening. Sing and hold your note.');
          if (active) timer = setTimeout(sample, 160);
        } catch (error) {
          finish(null, microphoneError(error));
        }
      };

      signal?.addEventListener('abort', abort, { once: true });
      void begin();
    });
  }
}
