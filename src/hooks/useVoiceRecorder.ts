import { useCallback, useEffect, useRef, useState } from 'react'

// Single-note cap — 2 min. At Opus ~24 kbps that's ~350 KB, easy on the free tier.
export const MAX_RECORD_MS = 120_000
// Anything shorter than this is treated as an accidental tap and dropped.
const MIN_RECORD_MS = 500

export interface RecordResult {
  blob: Blob
  durationMs: number
}

// Browser capability — Secure context + MediaRecorder + getUserMedia. (Insecure http, old Safari, etc.)
export const voiceSupported =
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia

/**
 * Microphone recording for voice notes. getUserMedia drives the permission prompt; a live AnalyserNode
 * (analyserRef) powers the real-time meter. Completed clips (whether the user stopped OR the 2-min cap
 * auto-stopped) are delivered via onClip — so auto-stop never loses the recording. Tears everything
 * down on stop/cancel AND on unmount, so the mic is never left hot.
 */
export function useVoiceRecorder(onClip: (clip: RecordResult) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const onClipRef = useRef(onClip)
  onClipRef.current = onClip

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef(0)
  const startingRef = useRef(false)
  const discardingRef = useRef(false)

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    timerRef.current = null
    autoStopRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (ctxRef.current && ctxRef.current.state !== 'closed') void ctxRef.current.close()
    ctxRef.current = null
    analyserRef.current = null
    recorderRef.current = null
  }, [])

  const start = useCallback(async () => {
    if (recording || startingRef.current) return // ignore double-taps / start-while-recording
    if (!voiceSupported) {
      setError('Voice recording isn’t supported in this browser.')
      return
    }
    startingRef.current = true
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const Ctx: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      ctxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      analyserRef.current = analyser

      chunksRef.current = []
      discardingRef.current = false
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
        const durationMs = Math.min(MAX_RECORD_MS, Date.now() - startedAtRef.current)
        const discard = discardingRef.current
        discardingRef.current = false
        teardown()
        setRecording(false)
        // Deliver real clips only — drop discards and accidental sub-half-second taps.
        if (!discard && blob.size > 0 && durationMs >= MIN_RECORD_MS) {
          onClipRef.current({ blob, durationMs })
        }
      }
      recorderRef.current = rec
      startedAtRef.current = Date.now()
      rec.start()
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(
        () => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)),
        250,
      )
      autoStopRef.current = setTimeout(() => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop() // → onstop delivers it
      }, MAX_RECORD_MS)
    } catch {
      teardown()
      setRecording(false)
      setError('Microphone blocked — allow access in your browser to record a voice note.')
    } finally {
      startingRef.current = false
    }
  }, [recording, teardown])

  // Finish and deliver the clip (via onClip).
  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state === 'recording') rec.stop()
  }, [])

  // Abort and discard — no clip delivered.
  const cancel = useCallback(() => {
    const rec = recorderRef.current
    discardingRef.current = true
    if (rec && rec.state === 'recording') {
      rec.stop()
    } else {
      teardown()
      setRecording(false)
    }
  }, [teardown])

  // Safety net: if the component unmounts mid-recording (navigate away), kill the mic + audio graph.
  useEffect(
    () => () => {
      discardingRef.current = true
      const rec = recorderRef.current
      if (rec && rec.state === 'recording') {
        try {
          rec.stop()
        } catch {
          // already stopped
        }
      }
      teardown()
    },
    [teardown],
  )

  return { recording, seconds, error, supported: voiceSupported, start, stop, cancel, analyserRef }
}
