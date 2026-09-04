/* LinguaBridge — in-room client (Phases 2–6)
 *
 *  Media/presence : LiveKit (WebRTC SFU). Participant metadata carries language preferences.
 *  Captions       : Deepgram streaming STT in the SPEAKER's browser (ephemeral token; API key never leaves the server).
 *  Translation    : Worker translates each FINAL segment once per TARGET language present in the room, then the
 *                   speaker's browser fans the result out over LiveKit's reliable data channel — listeners never poll.
 *  Voice          : optional TTS of the translated caption (mode text_voice | voice), independent volumes.
 *
 *  Nothing here is simulated: every feature is enabled only when /api/rt/:slug/capabilities says it is configured.
 */
(function () {
  'use strict'
  const root = document.querySelector('[data-page="room"]')
  if (!root) return

  const $ = (s, r) => (r || document).querySelector(s)
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s))
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const api = axios.create({ baseURL: '/api', withCredentials: true, headers: { 'Content-Type': 'application/json' } })
  const errMsg = (e) => e?.response?.data?.error || e?.message || 'Something went wrong'
  const slug = root.dataset.slug
  const RT = `/rt/${slug}`
  const ME = JSON.parse($('#me-json').textContent)
  const isHost = root.dataset.role === 'host'
  const translationEnabled = root.dataset.translation === '1'

  let REF = null
  const langName = (c) => (REF?.languages.find((l) => l.code === c) || {}).name || c || '—'
  const flag = (c) => (REF?.countries.find((x) => x.code === c) || {}).flag || ''
  const rtl = (c) => !!(REF?.languages.find((l) => l.code === c) || {}).rtl

  function toast(msg, kind) {
    const el = document.createElement('div')
    el.className = 'lb-toast ' + (kind === 'err' ? 'lb-toast-err' : kind === 'ok' ? 'lb-toast-ok' : '')
    el.innerHTML = `<i class="fas ${kind === 'err' ? 'fa-circle-exclamation text-red-300' : 'fa-circle-check text-emerald-300'}"></i><span>${esc(msg)}</span>`
    ;($('#toast-root') || document.body).appendChild(el)
    setTimeout(() => el.remove(), 3800)
  }
  const setPill = (id, tone, text) => { const el = $(id); if (!el) return; el.querySelector('.lb-dot').className = `lb-dot lb-dot-${tone}`; el.querySelector('span:last-child').textContent = text }
  const notice = (text) => { const n = $('#media-notice'); n.classList.toggle('hidden', !text); $('#media-notice-text').textContent = text || '' }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const state = {
    caps: null, lk: null, room: null,
    participants: new Map(), // pid -> { id, display_name, role, country_code, spoken_language, translation_language, translation_mode, speaking, mic, cam, isLocal }
    micOn: false, camOn: false, sharing: false,
    captionsOn: false, stt: null,
    segments: new Map(), // segment_id -> { pid, source_language, original, translations:{lang:text}, is_final, el }
    ttsQueue: [], ttsPlaying: false,
    startedAt: Date.now()
  }

  // ---------------------------------------------------------------------------
  // Participants panel & media grid
  // ---------------------------------------------------------------------------
  function upsertParticipant(p) {
    const cur = state.participants.get(p.id) || {}
    state.participants.set(p.id, { ...cur, ...p })
    renderParticipants()
    ensureTile(p.id)
  }
  function removeParticipant(pid) {
    state.participants.delete(pid)
    $(`#tile-${CSS.escape(pid)}`)?.remove()
    renderParticipants()
    layoutGrid()
  }
  function renderParticipants() {
    const list = [...state.participants.values()].sort((a, b) => (a.isLocal ? -1 : b.isLocal ? 1 : a.role === 'host' ? -1 : b.role === 'host' ? 1 : a.display_name.localeCompare(b.display_name)))
    $('#participants').innerHTML = list.map((p) => `
      <div class="lb-list-item ${p.speaking ? 'is-speaking' : ''}" data-pid="${esc(p.id)}">
        <span class="lb-avatar">${esc(p.display_name.slice(0, 1).toUpperCase())}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 text-sm"><b class="text-white truncate">${esc(p.display_name)}${p.isLocal ? ' (you)' : ''}</b>${p.role === 'host' ? '<span class="lb-pill">host</span>' : ''}</div>
          <div class="text-xs text-slate-400 truncate">${flag(p.country_code)} ${esc(langName(p.spoken_language))} <i class="fas fa-arrow-right-long mx-1 opacity-50"></i> ${esc(langName(p.translation_language))}${p.translation_mode !== 'text' ? ' <i class="fas fa-volume-high ml-1 opacity-60"></i>' : ''}</div>
        </div>
        <i class="fas ${p.mic ? 'fa-microphone text-emerald-300' : 'fa-microphone-slash text-slate-500'} text-xs"></i>
        ${isHost && !p.isLocal ? `<button class="lb-icon-btn" data-kick="${esc(p.id)}" title="Remove"><i class="fas fa-user-xmark text-red-300"></i></button>` : ''}
      </div>`).join('') || '<div class="lb-empty"><i class="fas fa-users"></i>Waiting for others to join…</div>'
    $('#participant-count b').textContent = state.participants.size
    $('#p-count').textContent = `(${state.participants.size})`
    $$('[data-kick]').forEach((b) => (b.onclick = async () => { if (!confirm('Remove this participant?')) return; try { await api.post(`${RT}/participants/${b.dataset.kick}/remove`); toast('Participant removed', 'ok') } catch (e) { toast(errMsg(e), 'err') } }))
  }
  function ensureTile(pid) {
    const p = state.participants.get(pid); if (!p) return
    let tile = $(`#tile-${CSS.escape(pid)}`)
    if (!tile) {
      tile = document.createElement('div')
      tile.className = 'lb-tile'; tile.id = `tile-${pid}`
      tile.innerHTML = `<video autoplay playsinline muted class="lb-tile-video hidden"></video>
        <div class="lb-tile-avatar"><span class="lb-avatar lb-avatar-lg">${esc(p.display_name.slice(0, 1).toUpperCase())}</span></div>
        <div class="lb-tile-name"><span class="lb-tile-mic"><i class="fas fa-microphone-slash"></i></span> <span class="truncate">${esc(p.display_name)}${p.isLocal ? ' (you)' : ''}</span> <span class="opacity-60 text-xs">${flag(p.country_code)} ${esc(p.spoken_language.toUpperCase())}</span></div>
        <div class="lb-tile-caption hidden"></div>`
      $('#media-grid').appendChild(tile)
      layoutGrid()
    }
    tile.classList.toggle('is-speaking', !!p.speaking)
    tile.querySelector('.lb-tile-mic').innerHTML = `<i class="fas ${p.mic ? 'fa-microphone text-emerald-300' : 'fa-microphone-slash'}"></i>`
    tile.querySelector('.lb-tile-name span:nth-child(2)').textContent = `${p.display_name}${p.isLocal ? ' (you)' : ''}`
  }
  function layoutGrid() {
    const grid = $('#media-grid'); const n = grid.children.length
    grid.dataset.count = Math.min(n, 9)
    grid.classList.toggle('has-share', !!$('#tile-screen'))
  }
  function attachVideo(pid, track) {
    const tile = $(`#tile-${CSS.escape(pid)}`); if (!tile) return
    const v = tile.querySelector('video'); track.attach(v); v.classList.remove('hidden'); tile.classList.add('has-video')
  }
  function detachVideo(pid, track) {
    const tile = $(`#tile-${CSS.escape(pid)}`); if (!tile) return
    const v = tile.querySelector('video'); try { track?.detach(v) } catch {} v.srcObject = null; v.classList.add('hidden'); tile.classList.remove('has-video')
  }
  function showScreenShare(track, name) {
    let tile = $('#tile-screen')
    if (!tile) {
      tile = document.createElement('div'); tile.className = 'lb-tile lb-tile-screen'; tile.id = 'tile-screen'
      tile.innerHTML = `<video autoplay playsinline muted class="lb-tile-video"></video><div class="lb-tile-name"><i class="fas fa-display"></i> <span></span></div>`
      $('#media-grid').prepend(tile)
    }
    tile.querySelector('.lb-tile-name span').textContent = `${name} is presenting`
    track.attach(tile.querySelector('video')); layoutGrid()
  }
  function hideScreenShare() { $('#tile-screen')?.remove(); layoutGrid() }

  // ---------------------------------------------------------------------------
  // Captions & transcript
  // ---------------------------------------------------------------------------
  function myText(seg) {
    // What THIS participant should read: their receive language, else original
    if (seg.source_language === ME.translation_language) return { text: seg.original, lang: seg.source_language, translated: false }
    const t = seg.translations?.[ME.translation_language]
    return t ? { text: t, lang: ME.translation_language, translated: true } : { text: seg.original, lang: seg.source_language, translated: false, pending: seg.is_final }
  }
  function renderSegment(seg) {
    const speaker = state.participants.get(seg.pid)
    const name = speaker?.display_name || seg.speaker_name || 'Speaker'
    const view = myText(seg)
    const showOriginal = ME.show_original_text && view.translated
    // Transcript panel
    $('#transcript-empty')?.remove()
    let el = seg.el
    if (!el) { el = document.createElement('div'); el.className = 'lb-tx'; el.dataset.seg = seg.segment_id; $('#transcript').appendChild(el); seg.el = el }
    el.className = `lb-tx ${seg.is_final ? '' : 'is-partial'} ${seg.pid === ME.id ? 'is-mine' : ''}`
    el.innerHTML = `<div class="lb-tx-meta"><b>${esc(name)}</b> <span>${flag(speaker?.country_code)} ${esc(langName(seg.source_language))}${view.translated ? ` <i class="fas fa-arrow-right-long mx-1"></i> ${esc(langName(view.lang))}` : ''}</span>${view.pending ? '<i class="fas fa-spinner fa-spin ml-1"></i>' : ''}</div>
      <div class="lb-tx-text" dir="${rtl(view.lang) ? 'rtl' : 'ltr'}">${esc(view.text)}</div>
      ${showOriginal ? `<div class="lb-tx-orig" dir="${rtl(seg.source_language) ? 'rtl' : 'ltr'}">${esc(seg.original)}</div>` : ''}`
    const tr = $('#transcript'); tr.scrollTop = tr.scrollHeight
    // Stage overlay caption (latest per speaker) — only while captions are on for me
    if (state.captionsOn || seg.pid === ME.id) {
      const tile = $(`#tile-${CSS.escape(seg.pid)} .lb-tile-caption`)
      if (tile) { tile.textContent = view.text; tile.dir = rtl(view.lang) ? 'rtl' : 'ltr'; tile.classList.remove('hidden'); clearTimeout(tile._t); tile._t = setTimeout(() => tile.classList.add('hidden'), 6000) }
      const ov = $('#captions')
      ov.innerHTML = `<div class="lb-caption-line" dir="${rtl(view.lang) ? 'rtl' : 'ltr'}"><b>${esc(name)}:</b> ${esc(view.text)}</div>${showOriginal ? `<div class="lb-caption-orig" dir="${rtl(seg.source_language) ? 'rtl' : 'ltr'}">${esc(seg.original)}</div>` : ''}`
      clearTimeout(ov._t); ov._t = setTimeout(() => (ov.innerHTML = ''), 7000)
    }
  }
  function handleSegmentEvent(ev) {
    let seg = state.segments.get(ev.segment_id)
    if (!seg) { seg = { segment_id: ev.segment_id, pid: ev.participant_id, speaker_name: ev.speaker_name, source_language: ev.language, original: '', translations: {}, is_final: false, spokenOnce: false }; state.segments.set(ev.segment_id, seg) }
    if (ev.type === 'partial_transcript') { if (seg.is_final) return; seg.original = ev.text; seg.source_language = ev.language }
    if (ev.type === 'final_transcript') { seg.original = ev.text; seg.source_language = ev.language; seg.is_final = true }
    if (ev.type === 'translation_completed') { seg.translations[ev.target_language] = ev.text; seg.source_language = ev.source_language; seg.is_final = true }
    renderSegment(seg)
    maybeSpeak(seg)
    if (state.segments.size > 400) { const first = state.segments.keys().next().value; state.segments.get(first)?.el?.remove(); state.segments.delete(first) }
  }

  // ---------------------------------------------------------------------------
  // TTS (translated voice) — plays translated captions from OTHER speakers when mode includes voice
  // ---------------------------------------------------------------------------
  const ttsAudio = new Audio(); ttsAudio.preload = 'auto'
  function maybeSpeak(seg) {
    if (!state.caps?.features?.translated_voice) return
    if (ME.translation_mode === 'text' || seg.pid === ME.id || !seg.is_final || seg.spokenOnce) return
    const v = myText(seg); if (!v.translated) return
    seg.spokenOnce = true
    state.ttsQueue.push({ text: v.text, lang: v.lang })
    pumpTts()
  }
  async function pumpTts() {
    if (state.ttsPlaying || !state.ttsQueue.length) return
    state.ttsPlaying = true
    const item = state.ttsQueue.shift()
    try {
      const res = await api.post(`${RT}/tts`, { text: item.text, language: item.lang }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      ttsAudio.src = url; ttsAudio.volume = (ME.translated_audio_volume ?? 100) / 100
      await ttsAudio.play().catch(() => {})
      await new Promise((r) => { ttsAudio.onended = r; ttsAudio.onerror = r })
      URL.revokeObjectURL(url)
    } catch (e) { console.warn('tts', e) }
    state.ttsPlaying = false
    pumpTts()
  }
  function applyVolumes() {
    // Original audio: remote LiveKit audio tracks; translated audio: TTS element
    const vol = (ME.translation_mode === 'voice' ? Math.min(ME.original_audio_volume, 25) : ME.original_audio_volume) / 100
    if (state.room) for (const p of state.room.remoteParticipants.values()) p.setVolume(vol)
    ttsAudio.volume = (ME.translated_audio_volume ?? 100) / 100
  }

  // ---------------------------------------------------------------------------
  // Data channel (LiveKit reliable) — event contract mirrors src/lib/events.ts
  // ---------------------------------------------------------------------------
  const enc = new TextEncoder(), dec = new TextDecoder()
  async function publish(ev) {
    if (!state.room || state.room.state !== 'connected') return
    try { await state.room.localParticipant.publishData(enc.encode(JSON.stringify(ev)), { reliable: true, topic: 'lb' }) } catch (e) { console.warn('publishData', e) }
  }
  function onData(payload, participant, kind, topic) {
    if (topic && topic !== 'lb') return
    let ev; try { ev = JSON.parse(dec.decode(payload)) } catch { return }
    switch (ev.type) {
      case 'partial_transcript': case 'final_transcript': case 'translation_completed': handleSegmentEvent(ev); break
      case 'participant_updated': { const p = state.participants.get(ev.participant_id); if (p) upsertParticipant({ ...p, ...ev.preferences }); break }
      case 'meeting_ended': toast('The host ended this meeting'); setTimeout(leave, 1500); break
    }
  }

  // ---------------------------------------------------------------------------
  // LiveKit
  // ---------------------------------------------------------------------------
  function metaOf(p) { try { return JSON.parse(p.metadata || '{}') } catch { return {} } }
  function fromLk(p, isLocal) {
    const m = metaOf(p)
    return { id: m.pid || p.identity, display_name: p.name || 'Guest', role: m.role || 'participant', country_code: m.country || null, spoken_language: m.spoken || 'en', translation_language: m.receive || 'en', translation_mode: m.mode || 'text', mic: p.isMicrophoneEnabled, cam: p.isCameraEnabled, speaking: p.isSpeaking, isLocal }
  }
  async function connectLiveKit() {
    const LK = window.LivekitClient
    if (!LK) { notice('Media library failed to load. Check your network and refresh.'); return }
    const { data } = await api.post(`${RT}/livekit-token`)
    const room = new LK.Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, videoCaptureDefaults: { resolution: LK.VideoPresets.h540.resolution } })
    state.room = room; state.lk = LK
    const E = LK.RoomEvent
    room.on(E.ParticipantConnected, (p) => { upsertParticipant(fromLk(p, false)); toast(`${p.name} joined`) })
    room.on(E.ParticipantDisconnected, (p) => removeParticipant(metaOf(p).pid || p.identity))
    room.on(E.ParticipantMetadataChanged, (_m, p) => upsertParticipant(fromLk(p, p === room.localParticipant)))
    room.on(E.ActiveSpeakersChanged, (speakers) => {
      const ids = new Set(speakers.map((s) => metaOf(s).pid || s.identity))
      for (const p of state.participants.values()) { const sp = ids.has(p.id); if (sp !== p.speaking) { p.speaking = sp; ensureTile(p.id) } }
      $$('#participants [data-pid]').forEach((el) => el.classList.toggle('is-speaking', ids.has(el.dataset.pid)))
    })
    room.on(E.TrackMuted, (pub, p) => trackState(p)); room.on(E.TrackUnmuted, (pub, p) => trackState(p))
    room.on(E.LocalTrackPublished, (pub, p) => trackState(p)); room.on(E.LocalTrackUnpublished, (pub, p) => trackState(p))
    room.on(E.TrackSubscribed, (track, pub, p) => {
      const pid = metaOf(p).pid || p.identity
      if (track.kind === 'video') { if (pub.source === LK.Track.Source.ScreenShare) showScreenShare(track, p.name); else attachVideo(pid, track) }
      if (track.kind === 'audio') { const el = track.attach(); el.id = `audio-${pid}-${pub.trackSid}`; document.body.appendChild(el); applyVolumes() }
      trackState(p)
    })
    room.on(E.TrackUnsubscribed, (track, pub, p) => {
      const pid = metaOf(p).pid || p.identity
      if (track.kind === 'video') { if (pub.source === LK.Track.Source.ScreenShare) hideScreenShare(); else detachVideo(pid, track) }
      if (track.kind === 'audio') track.detach().forEach((el) => el.remove())
      trackState(p)
    })
    room.on(E.DataReceived, onData)
    room.on(E.ConnectionStateChanged, (s) => {
      const map = { connected: ['green', 'Live'], connecting: ['amber', 'Connecting…'], reconnecting: ['amber', 'Reconnecting…'], disconnected: ['red', 'Disconnected'] }
      const [tone, text] = map[s] || ['amber', s]; setPill('#conn-status', tone, text)
    })
    room.on(E.Disconnected, (reason) => {
      setPill('#conn-status', 'red', 'Disconnected')
      // 4 = PARTICIPANT_REMOVED, 5 = ROOM_DELETED (livekit DisconnectReason)
      if (reason === 4) { toast('You were removed by the host', 'err'); setTimeout(() => (location.href = '/'), 1500) }
      if (reason === 5) { toast('The meeting has ended'); setTimeout(() => (location.href = '/'), 1500) }
    })
    room.on(E.MediaDevicesError, (e) => toast(`Device error: ${e.message}`, 'err'))
    room.on(E.AudioPlaybackStatusChanged, () => { if (!room.canPlaybackAudio) showAudioUnlock() })

    await room.connect(data.url, data.token)
    upsertParticipant(fromLk(room.localParticipant, true))
    for (const p of room.remoteParticipants.values()) upsertParticipant(fromLk(p, false))
    $('#ctl-mic').disabled = false
    if (state.caps.features.video) { $('#ctl-cam').disabled = false; $('#ctl-share').disabled = false }
    setPill('#conn-status', 'green', 'Live')
    $('#rec-timer').classList.remove('hidden')
    applyVolumes()
  }
  function trackState(p) {
    const pid = metaOf(p).pid || p.identity
    const cur = state.participants.get(pid); if (!cur) return
    upsertParticipant({ ...cur, mic: p.isMicrophoneEnabled, cam: p.isCameraEnabled })
    if (p === state.room?.localParticipant) {
      // Local camera preview
      const camPub = p.getTrackPublication(state.lk.Track.Source.Camera)
      if (camPub?.track && !camPub.isMuted) attachVideo(pid, camPub.track); else detachVideo(pid, camPub?.track)
      const ssPub = p.getTrackPublication(state.lk.Track.Source.ScreenShare)
      if (ssPub?.track) showScreenShare(ssPub.track, 'You'); else if (state.sharing === false) hideScreenShare()
    }
  }
  function showAudioUnlock() {
    if ($('#audio-unlock')) return
    const b = document.createElement('button'); b.id = 'audio-unlock'; b.className = 'lb-btn lb-btn-primary fixed bottom-24 left-1/2 -translate-x-1/2 z-40'
    b.innerHTML = '<i class="fas fa-volume-high"></i> Tap to enable audio'
    b.onclick = async () => { await state.room.startAudio(); b.remove() }
    document.body.appendChild(b)
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------
  function setCtl(id, on, iconOn, iconOff) { const b = $(id); b.classList.toggle('is-off', !on); b.classList.toggle('is-on', on); b.querySelector('i').className = `fas ${on ? iconOn : iconOff}` }
  async function toggleMic() {
    if (!state.room) return
    const b = $('#ctl-mic'); b.disabled = true
    try {
      state.micOn = !state.micOn
      await state.room.localParticipant.setMicrophoneEnabled(state.micOn)
      setCtl('#ctl-mic', state.micOn, 'fa-microphone', 'fa-microphone-slash')
      api.patch(`${RT}/media`, { mic_enabled: state.micOn }).catch(() => {})
      if (state.micOn && state.caps.features.captions && state.captionsOn) await startStt(); else stopStt()
    } catch (e) { state.micOn = !state.micOn; toast(errMsg(e), 'err') } finally { b.disabled = false }
  }
  async function toggleCam() {
    if (!state.room) return
    const b = $('#ctl-cam'); b.disabled = true
    try { state.camOn = !state.camOn; await state.room.localParticipant.setCameraEnabled(state.camOn); setCtl('#ctl-cam', state.camOn, 'fa-video', 'fa-video-slash'); api.patch(`${RT}/media`, { camera_enabled: state.camOn }).catch(() => {}) }
    catch (e) { state.camOn = !state.camOn; toast(errMsg(e), 'err') } finally { b.disabled = false }
  }
  async function toggleShare() {
    if (!state.room) return
    const b = $('#ctl-share'); b.disabled = true
    try { state.sharing = !state.sharing; await state.room.localParticipant.setScreenShareEnabled(state.sharing, { audio: true }); b.classList.toggle('is-on', state.sharing); if (!state.sharing) hideScreenShare() }
    catch (e) { state.sharing = !state.sharing; if (e?.name !== 'NotAllowedError') toast(errMsg(e), 'err') } finally { b.disabled = false }
  }
  async function toggleCaptions() {
    state.captionsOn = !state.captionsOn
    $('#ctl-captions').classList.toggle('is-on', state.captionsOn)
    if (state.captionsOn && state.micOn) await startStt(); else if (!state.captionsOn) stopStt()
    setPill('#pipeline-status', state.captionsOn ? 'green' : 'amber', state.captionsOn ? 'Captions on' : 'Captions off')
  }

  // ---------------------------------------------------------------------------
  // STT — Deepgram streaming from the speaker's browser (linear16 PCM via AudioWorklet)
  // ---------------------------------------------------------------------------
  const WORKLET = `class P extends AudioWorkletProcessor{constructor(){super();this.b=[];this.n=0}process(i){const c=i[0]&&i[0][0];if(!c)return true;const o=new Int16Array(c.length);for(let k=0;k<c.length;k++){const s=Math.max(-1,Math.min(1,c[k]));o[k]=s<0?s*32768:s*32767}this.port.postMessage(o.buffer,[o.buffer]);return true}}registerProcessor('lb-pcm',P)`
  async function startStt() {
    if (state.stt || !state.caps.features.captions) return
    const micPub = state.room.localParticipant.getTrackPublication(state.lk.Track.Source.Microphone)
    const mst = micPub?.track?.mediaStreamTrack
    if (!mst) return
    const ctx = new AudioContext()
    const sampleRate = ctx.sampleRate
    const { data: cfg } = await api.post(`${RT}/stt-token`, { sample_rate: sampleRate })
    const ws = new WebSocket(cfg.ws_url, [cfg.auth_scheme || 'bearer', cfg.token])
    ws.binaryType = 'arraybuffer'
    const stt = { ws, ctx, node: null, src: null, seg: null, segStart: 0, keep: null, closed: false }
    state.stt = stt
    setPill('#pipeline-status', 'amber', 'Connecting STT…')

    ws.onopen = async () => {
      setPill('#pipeline-status', 'green', `Listening (${cfg.language === 'auto' ? 'auto' : langName(cfg.language)})`)
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })))
      stt.src = ctx.createMediaStreamSource(new MediaStream([mst]))
      stt.node = new AudioWorkletNode(ctx, 'lb-pcm')
      stt.node.port.onmessage = (e) => { if (ws.readyState === 1) ws.send(e.data) }
      stt.src.connect(stt.node) // worklet has no output → nothing reaches speakers
      stt.keep = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'KeepAlive' })) }, 8000)
    }
    ws.onmessage = (e) => { try { onDeepgram(JSON.parse(e.data), stt) } catch (err) { console.warn(err) } }
    ws.onerror = () => setPill('#pipeline-status', 'red', 'STT error')
    ws.onclose = (e) => { if (!stt.closed) { setPill('#pipeline-status', 'amber', `STT closed (${e.code})`); stopStt(); if (state.captionsOn && state.micOn && e.code !== 1000) setTimeout(() => startStt().catch(() => {}), 1500) } }
  }
  function stopStt() {
    const s = state.stt; if (!s) return
    s.closed = true; state.stt = null
    clearInterval(s.keep)
    try { s.ws.readyState === 1 && s.ws.send(JSON.stringify({ type: 'CloseStream' })) } catch {}
    try { s.ws.close(1000) } catch {}
    try { s.src?.disconnect(); s.node?.disconnect(); s.ctx.close() } catch {}
    if (state.captionsOn) setPill('#pipeline-status', 'amber', 'Captions paused (mic off)')
  }
  const newSegId = () => `${ME.id.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  function onDeepgram(msg, stt) {
    if (msg.type !== 'Results') return
    const alt = msg.channel?.alternatives?.[0]
    const text = (alt?.transcript || '').trim()
    if (!text) return
    if (!stt.seg) { stt.seg = newSegId(); stt.segStart = msg.start }
    const lang = (alt?.languages?.[0] || msg.channel?.detected_language || (state.stt && ME.spoken_language) || ME.spoken_language).slice(0, 2)
    const segId = stt.seg
    const isFinal = !!msg.is_final
    const ev = { type: isFinal ? 'final_transcript' : 'partial_transcript', segment_id: segId, participant_id: ME.id, speaker_name: ME.display_name, language: lang, text, confidence: alt?.confidence }
    handleSegmentEvent(ev); publish(ev)
    if (isFinal) {
      stt.seg = null
      submitFinal(segId, text, lang, alt?.confidence, msg.start, msg.start + msg.duration)
    } else if (translationEnabled) {
      // partials are persisted at low rate for crash-safety (not translated)
      throttlePartial(segId, text, lang)
    }
  }
  let lastPartial = 0
  function throttlePartial(segment_id, text, language) {
    const now = Date.now(); if (now - lastPartial < 1500) return; lastPartial = now
    api.post(`${RT}/transcripts`, { segment_id, text, language, is_final: false }).catch(() => {})
  }
  async function submitFinal(segment_id, text, language, confidence, start_s, end_s) {
    try {
      const { data } = await api.post(`${RT}/transcripts`, { segment_id, text, language, is_final: true, confidence, start_ms: Math.round((start_s || 0) * 1000), end_ms: Math.round((end_s || 0) * 1000) })
      for (const t of data.translations) {
        if (t.error || !t.text) { console.warn('translation failed', t); continue }
        const ev = { type: 'translation_completed', segment_id, participant_id: ME.id, speaker_name: ME.display_name, source_language: data.source_language, target_language: t.target_language, text: t.text, cache_hit: t.cache_hit }
        handleSegmentEvent(ev); publish(ev)
      }
    } catch (e) { toast(`Translation failed: ${errMsg(e)}`, 'err') }
  }

  // ---------------------------------------------------------------------------
  // Preferences (changes broadcast to peers + refresh my metadata via new token isn't needed: data channel carries it)
  // ---------------------------------------------------------------------------
  function formData(form) { const out = {}; new FormData(form).forEach((v, k) => (out[k] = v)); $$('input[type=checkbox]', form).forEach((cb) => (out[cb.name] = cb.checked)); return out }
  function wirePrefs() {
    const form = $('#prefs-form')
    const toggle = () => form.classList.toggle('hidden')
    $('#btn-settings').onclick = toggle; $('#ctl-translation').onclick = toggle
    form.addEventListener('input', () => { $('[data-vol=o]').textContent = form.original_audio_volume.value; $('[data-vol=t]').textContent = form.translated_audio_volume.value })
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try {
        const { data } = await api.patch(`/participants/${slug}/me`, formData(form))
        Object.assign(ME, data.participant)
        $('[data-k=spoken_language]').textContent = langName(ME.spoken_language); $('[data-k=translation_language]').textContent = langName(ME.translation_language)
        $('[data-k=auto_detect_language]').textContent = ME.auto_detect_language ? 'On' : 'Off'; $('[data-k=translation_mode]').textContent = ME.translation_mode.replace('_', ' + ')
        const mine = state.participants.get(ME.id); if (mine) upsertParticipant({ ...mine, spoken_language: ME.spoken_language, translation_language: ME.translation_language, translation_mode: ME.translation_mode })
        publish({ type: 'participant_updated', participant_id: ME.id, preferences: { spoken_language: ME.spoken_language, translation_language: ME.translation_language, translation_mode: ME.translation_mode } })
        applyVolumes()
        // Re-render existing segments in the (possibly new) receive language; fetch missing translations on demand
        for (const seg of state.segments.values()) { renderSegment(seg); if (seg.is_final && !seg.translations[ME.translation_language] && seg.source_language !== ME.translation_language && state.caps.features.translation) fetchTranslation(seg) }
        if (state.stt) { stopStt(); if (state.captionsOn && state.micOn) startStt() } // language change → new STT session
        toast('Preferences updated', 'ok'); form.classList.add('hidden')
      } catch (err) { toast(errMsg(err), 'err') }
    })
  }
  async function fetchTranslation(seg) {
    try { const { data } = await api.post(`${RT}/translate`, { text: seg.original, source_language: seg.source_language, target_language: ME.translation_language }); seg.translations[ME.translation_language] = data.text; renderSegment(seg) } catch {}
  }

  // ---------------------------------------------------------------------------
  // Fallback presence (no LiveKit): poll DB every 8 s — honest, not a simulation of media
  // ---------------------------------------------------------------------------
  async function pollPresence() {
    try {
      const { data } = await api.get(`/participants/${slug}/me`)
      const seen = new Set()
      for (const p of data.participants) { seen.add(p.id); upsertParticipant({ ...p, isLocal: p.id === ME.id, mic: false }) }
      for (const id of [...state.participants.keys()]) if (!seen.has(id)) removeParticipant(id)
      if (data.meeting?.status === 'ended') { toast('The host ended this meeting'); setTimeout(() => (location.href = '/'), 1500) }
    } catch (err) { if (err?.response?.status === 401) location.href = '/' }
  }
  async function loadTranscriptHistory() {
    try {
      const { data } = await api.get(`${RT}/transcript`, { params: { limit: 60 } })
      for (const r of data.transcript) {
        const seg = { segment_id: r.segment_id || r.id, pid: r.participant_id, speaker_name: r.display_name, source_language: r.detected_language, original: r.text, translations: r.translations || {}, is_final: true, spokenOnce: true }
        state.segments.set(seg.segment_id, seg); renderSegment(seg)
      }
    } catch {}
  }

  async function leave() {
    try { stopStt(); await state.room?.disconnect() } catch {}
    try { await api.post(`/participants/${slug}/me/leave`) } catch {}
    location.href = '/'
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    REF = (await api.get('/settings/reference')).data
    wirePrefs()
    $('#ctl-leave').onclick = leave
    $('#ctl-participants').onclick = () => { $('#side-panel').classList.add('is-open'); $('#participants').scrollIntoView({ behavior: 'smooth' }) }
    $('#btn-panel')?.addEventListener('click', () => $('#side-panel').classList.toggle('is-open'))
    $('#ctl-mic').onclick = toggleMic; $('#ctl-cam').onclick = toggleCam; $('#ctl-share').onclick = toggleShare; $('#ctl-captions').onclick = toggleCaptions
    $('#ctl-end')?.addEventListener('click', async () => {
      if (!confirm('End the meeting for everyone?')) return
      publish({ type: 'meeting_ended', meeting_id: root.dataset.meetingId, ended_by: ME.id })
      try { await api.post(`${RT}/end`) } catch (e) { toast(errMsg(e), 'err'); return }
      setTimeout(leave, 400)
    })
    setInterval(() => { const s = Math.floor((Date.now() - state.startedAt) / 1000); $('[data-timer]').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }, 1000)
    setInterval(() => api.post(`${RT}/heartbeat`).catch(() => {}), 30000)
    window.addEventListener('beforeunload', () => { try { state.room?.disconnect() } catch {} })

    const { data: caps } = await api.get(`${RT}/capabilities`)
    state.caps = caps
    const f = caps.features
    // Honest capability messaging
    const missing = []
    if (!f.audio) missing.push('audio/video (LiveKit not configured)')
    if (translationEnabled && !f.captions) missing.push('live captions (Deepgram not configured)')
    if (translationEnabled && f.captions && !f.translation) missing.push('translation (no translation provider)')
    if (translationEnabled && f.translation && !f.translated_voice && ME.translation_mode !== 'text') missing.push('translated voice (TTS not configured)')
    notice(missing.length ? `Not available in this workspace yet: ${missing.join(' · ')}. Ask the workspace owner to add the required API keys.` : '')
    if (!translationEnabled) setPill('#pipeline-status', 'amber', 'Translation off for this meeting')
    else if (f.translation) { setPill('#pipeline-status', 'amber', 'Captions off'); $('#ctl-captions').disabled = false; state.captionsOn = true; $('#ctl-captions').classList.add('is-on'); setPill('#pipeline-status', 'green', 'Captions on') }
    else if (f.captions) { setPill('#pipeline-status', 'amber', 'Captions only'); $('#ctl-captions').disabled = false; state.captionsOn = true; $('#ctl-captions').classList.add('is-on') }
    else setPill('#pipeline-status', 'red', 'STT not configured')

    loadTranscriptHistory()

    if (f.audio) {
      try { await connectLiveKit() } catch (e) { console.error(e); setPill('#conn-status', 'red', 'Media failed'); toast(`Could not connect to media server: ${errMsg(e)}`, 'err'); await pollPresence(); setInterval(pollPresence, 8000) }
    } else {
      setPill('#conn-status', 'amber', 'Lobby (no media)')
      $('#stage').classList.add('is-lobby')
      upsertParticipant({ ...ME, isLocal: true, mic: false })
      await pollPresence(); setInterval(pollPresence, 8000)
    }
  }
  boot().catch((e) => { console.error(e); toast(errMsg(e), 'err'); if (e?.response?.status === 401) location.href = '/' })
})()
