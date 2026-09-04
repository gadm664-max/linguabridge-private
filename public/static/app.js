/* LinguaBridge frontend — vanilla JS, one file, page-scoped by data-page */
(function () {
  'use strict'
  if (window.dayjs && window.dayjs_plugin_relativeTime) dayjs.extend(window.dayjs_plugin_relativeTime)

  const $ = (s, r) => (r || document).querySelector(s)
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s))
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const api = axios.create({ baseURL: '/api', withCredentials: true, headers: { 'Content-Type': 'application/json' } })

  let REF = null // { languages, countries }
  async function reference() {
    if (REF) return REF
    REF = (await api.get('/settings/reference')).data
    return REF
  }
  const langName = (code) => (REF?.languages.find((l) => l.code === code) || {}).name || code || '—'
  const country = (code) => REF?.countries.find((c) => c.code === code)
  const flag = (code) => (country(code) || {}).flag || ''
  const fmtTime = (s) => (s ? dayjs(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z')).format('MMM D, YYYY HH:mm') : '—')
  const ago = (s) => (s ? dayjs(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z')).fromNow() : '—')

  function toast(msg, kind) {
    const el = document.createElement('div')
    el.className = 'lb-toast ' + (kind === 'err' ? 'lb-toast-err' : kind === 'ok' ? 'lb-toast-ok' : '')
    el.innerHTML = `<i class="fas ${kind === 'err' ? 'fa-circle-exclamation text-red-300' : 'fa-circle-check text-emerald-300'}"></i><span>${esc(msg)}</span>`
    $('#toast-root').appendChild(el)
    setTimeout(() => el.remove(), 3800)
  }
  const errMsg = (e) => e?.response?.data?.error || e?.message || 'Something went wrong'

  function showFormError(form, msg) {
    const box = $('#form-error', form) || $('#form-error')
    if (!box) return toast(msg, 'err')
    box.textContent = msg
    box.classList.toggle('hidden', !msg)
  }

  function formData(form) {
    const out = {}
    new FormData(form).forEach((v, k) => (out[k] = v))
    $$('input[type=checkbox]', form).forEach((cb) => (out[cb.name] = cb.checked))
    return out
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Link copied to clipboard', 'ok') } catch { prompt('Copy this link:', text) }
  }

  // ---- Shell: sidebar, logout, relative times -------------------------------
  $('#sidebar-open')?.addEventListener('click', () => $('#sidebar').classList.add('is-open'))
  $('#sidebar-close')?.addEventListener('click', () => $('#sidebar').classList.remove('is-open'))
  $('#logout-btn')?.addEventListener('click', async () => { await api.post('/auth/logout'); location.href = '/' })
  $$('[data-time]').forEach((el) => (el.textContent = fmtTime(el.dataset.time)))

  // ---- Country combobox -----------------------------------------------------
  async function initCombos(root) {
    const { countries } = await reference()
    $$('[data-combo=country]', root).forEach((combo) => {
      const input = $('input.lb-input', combo), hidden = $('input[type=hidden]', combo), list = $('.lb-combo-list', combo)
      const setValue = (code) => {
        const c = countries.find((x) => x.code === code)
        hidden.value = c ? c.code : ''
        input.value = c ? `${c.flag} ${c.name}` : ''
        combo.classList.remove('is-open')
        combo.dispatchEvent(new CustomEvent('country-change', { detail: c, bubbles: true }))
      }
      const render = (q) => {
        const ql = q.trim().toLowerCase()
        const items = countries.filter((c) => !ql || c.name.toLowerCase().includes(ql) || c.code.toLowerCase() === ql).slice(0, 60)
        list.innerHTML = items.length
          ? items.map((c) => `<div class="lb-combo-item" role="option" data-code="${c.code}"><span class="flag">${c.flag}</span><span>${esc(c.name)}</span><span class="ml-auto text-xs text-slate-500">${c.code}</span></div>`).join('')
          : '<div class="lb-combo-empty">No matching country</div>'
      }
      input.addEventListener('focus', () => { render(''); combo.classList.add('is-open') })
      input.addEventListener('input', () => { hidden.value = ''; render(input.value); combo.classList.add('is-open') })
      input.addEventListener('keydown', (e) => {
        const items = $$('.lb-combo-item', list); let i = items.findIndex((x) => x.classList.contains('is-active'))
        if (e.key === 'ArrowDown') { e.preventDefault(); items[i]?.classList.remove('is-active'); items[Math.min(items.length - 1, i + 1)]?.classList.add('is-active') }
        if (e.key === 'ArrowUp') { e.preventDefault(); items[i]?.classList.remove('is-active'); items[Math.max(0, i - 1)]?.classList.add('is-active') }
        if (e.key === 'Enter') { const a = $('.lb-combo-item.is-active', list) || items[0]; if (a) { e.preventDefault(); setValue(a.dataset.code) } }
        if (e.key === 'Escape') combo.classList.remove('is-open')
      })
      list.addEventListener('mousedown', (e) => { const it = e.target.closest('.lb-combo-item'); if (it) { e.preventDefault(); setValue(it.dataset.code) } })
      document.addEventListener('click', (e) => { if (!combo.contains(e.target)) combo.classList.remove('is-open') })
      combo._set = setValue
      if (hidden.value) setValue(hidden.value)
    })
  }

  /** Country → suggest spoken language, but ONLY if the user hasn't chosen one manually. */
  function wireCountrySuggestion(root) {
    root.addEventListener('country-change', (e) => {
      const c = e.detail; if (!c) return
      const spoken = $('select[name=spoken_language]', root), recv = $('select[name=translation_language]', root)
      if (spoken && !spoken.dataset.touched) spoken.value = c.defaultLanguage
      if (recv && !recv.dataset.touched && !recv.disabled) recv.value = c.defaultLanguage
    })
    $$('select[name=spoken_language], select[name=translation_language]', root).forEach((s) => s.addEventListener('change', () => (s.dataset.touched = '1')))
  }

  function wireSegments(root) {
    $$('.lb-seg', root).forEach((seg) => {
      const sync = () => $$('input[type=radio]', seg).forEach((r) => $(`label[for=${r.id}]`, seg)?.classList.toggle('is-checked', r.checked))
      seg.addEventListener('change', sync); sync()
    })
  }

  // ---- Auth -----------------------------------------------------------------
  $('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target
    try { await api.post('/auth/login', formData(f)); location.href = f.dataset.next || '/dashboard' } catch (err) { showFormError(f, errMsg(err)) }
  })
  $('#register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target
    try { await api.post('/auth/register', formData(f)); location.href = '/dashboard' } catch (err) { showFormError(f, errMsg(err)) }
  })

  // ---- Renderers ------------------------------------------------------------
  const badge = (v) => `<span class="lb-badge lb-badge-${esc(v)}">${esc(String(v).replace('_', ' '))}</span>`
  function meetingRow(m) {
    return `<tr>
      <td><a href="/meetings/${m.id}" class="font-semibold text-white hover:text-cyan-300">${esc(m.name)}</a>${m.client_name ? `<div class="text-xs text-slate-400"><i class="fas fa-user"></i> ${esc(m.client_name)}</div>` : ''}</td>
      <td>${badge(m.type)}</td><td>${badge(m.status)}</td>
      <td class="text-slate-300">${m.participant_count ?? 0}</td>
      <td class="text-slate-400 text-xs">${m.scheduled_at ? fmtTime(m.scheduled_at) : ago(m.created_at)}</td>
      <td class="text-right"><a href="/room/${m.slug}" class="lb-btn lb-btn-soft lb-btn-sm"><i class="fas fa-right-to-bracket"></i></a></td>
    </tr>`
  }
  const meetingTable = (rows) => rows.length
    ? `<table class="lb-table"><thead><tr><th>Meeting</th><th>Type</th><th>Status</th><th>Participants</th><th>When</th><th></th></tr></thead><tbody>${rows.map(meetingRow).join('')}</tbody></table>`
    : `<div class="lb-empty"><i class="fas fa-video"></i>No meetings yet. <a href="/meetings/new" class="text-cyan-300">Create your first one</a>.</div>`

  function participantRow(p, hostActions) {
    return `<div class="lb-list-item">
      <span class="lb-avatar">${esc(p.display_name.slice(0, 1).toUpperCase())}</span>
      <div class="min-w-0 flex-1">
        <div class="font-semibold text-white truncate">${esc(p.display_name)} ${p.role === 'host' ? '<span class="lb-badge lb-badge-private_room ml-1">host</span>' : ''}</div>
        <div class="text-xs text-slate-400">${flag(p.country_code)} ${esc(country(p.country_code)?.name || '')} · speaks <b class="text-slate-300">${esc(langName(p.spoken_language))}</b> → receives <b class="text-slate-300">${esc(langName(p.translation_language))}</b>${p.auto_detect_language ? ' · auto-detect' : ''}</div>
      </div>
      ${badge(p.status)}
      ${hostActions && p.role !== 'host' && p.status === 'joined' ? `<button class="lb-btn lb-btn-danger lb-btn-sm" data-remove="${p.id}" title="Remove"><i class="fas fa-user-minus"></i></button>` : ''}
    </div>`
  }

  // ---- Dashboard ------------------------------------------------------------
  async function pageDashboard() {
    await reference()
    const d = (await api.get('/dashboard')).data
    $('[data-stat=total]').textContent = d.counts.total
    $('[data-stat=active]').textContent = d.counts.active
    $('[data-stat=private_rooms]').textContent = d.counts.private_rooms
    $('[data-stat=minutes]').textContent = d.total_minutes
    $('#recent-meetings').innerHTML = meetingTable(d.recent_meetings)
    $('#active-rooms').innerHTML = d.active_rooms.length
      ? d.active_rooms.map((m) => `<div class="lb-list-item"><span class="lb-dot lb-dot-green lb-pulse"></span><div class="flex-1 min-w-0"><a href="/meetings/${m.id}" class="font-semibold text-white truncate block">${esc(m.name)}</a><div class="text-xs text-slate-400">${m.participant_count ?? 0} participants · ${ago(m.started_at || m.created_at)}</div></div><a href="/room/${m.slug}" class="lb-btn lb-btn-soft lb-btn-sm">Enter</a></div>`).join('')
      : '<div class="lb-empty"><i class="fas fa-signal"></i>No active rooms</div>'
    $('#recent-clients').innerHTML = d.recent_clients.length
      ? d.recent_clients.map((r) => `<div class="lb-list-item"><span class="lb-avatar" style="background:linear-gradient(135deg,#a78bfa,#6366f1)">${esc((r.client_name || r.name).slice(0, 1).toUpperCase())}</span><div class="flex-1 min-w-0"><a href="/meetings/${r.id}" class="font-semibold text-white truncate block">${esc(r.client_name || r.name)}</a><div class="text-xs text-slate-400">${r.participant_count} joins · ${ago(r.updated_at)}</div></div>${badge(r.status)}</div>`).join('')
      : '<div class="lb-empty"><i class="fas fa-door-closed"></i>No client rooms yet</div>'
    const total = d.language_usage.reduce((a, b) => a + b.n, 0) || 1
    $('#language-usage').innerHTML = d.language_usage.length
      ? d.language_usage.map((l) => `<div class="mb-2"><div class="flex justify-between text-sm"><span>${esc(langName(l.language))}</span><span class="text-slate-400">${Math.round((l.n / total) * 100)}%</span></div><div class="h-2 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full" style="width:${(l.n / total) * 100}%;background:var(--lb-grad)"></div></div></div>`).join('')
      : '<div class="lb-empty"><i class="fas fa-language"></i>No language data yet</div>'
    $('#recent-participants').innerHTML = d.recent_participants.length
      ? d.recent_participants.map((p) => `<div class="lb-list-item"><span class="lb-avatar">${esc(p.display_name.slice(0, 1).toUpperCase())}</span><div class="flex-1 min-w-0"><div class="font-semibold text-white truncate">${esc(p.display_name)} <span class="text-slate-500 font-normal">${flag(p.country_code)}</span></div><div class="text-xs text-slate-400 truncate">${esc(langName(p.spoken_language))} → ${esc(langName(p.translation_language))} · ${esc(p.meeting_name)}</div></div><span class="text-xs text-slate-500">${ago(p.joined_at)}</span></div>`).join('')
      : '<div class="lb-empty"><i class="fas fa-users"></i>No participants yet</div>'
  }

  // ---- Meetings list --------------------------------------------------------
  async function pageMeetings(root) {
    await reference()
    const filter = root.dataset.filter
    let rows = (await api.get('/meetings', { params: { limit: 200 } })).data.meetings
    if (filter === 'upcoming') rows = rows.filter((m) => m.status === 'scheduled')
    if (filter === 'history') rows = rows.filter((m) => m.status === 'ended' || m.status === 'cancelled')
    $('#meeting-list').innerHTML = meetingTable(rows)
  }

  // ---- Rooms ----------------------------------------------------------------
  async function pageRooms() {
    await reference()
    const rows = (await api.get('/meetings', { params: { type: 'private_room', limit: 200 } })).data.meetings
    $('#rooms-grid').innerHTML = rows.length
      ? rows.map((m) => `<article class="lb-card lb-card-pad flex flex-col gap-3">
          <div class="flex items-start justify-between gap-2"><span class="lb-avatar lb-avatar-lg" style="background:linear-gradient(135deg,#a78bfa,#6366f1)">${esc((m.client_name || m.name).slice(0, 1).toUpperCase())}</span>${badge(m.status)}</div>
          <div><a href="/meetings/${m.id}" class="text-lg font-bold text-white hover:text-cyan-300">${esc(m.name)}</a>${m.client_name ? `<div class="text-sm text-slate-400"><i class="fas fa-user"></i> ${esc(m.client_name)}</div>` : ''}</div>
          <div class="text-xs text-slate-400 flex gap-3"><span><i class="fas fa-users"></i> ${m.participant_count ?? 0} joins</span><span><i class="fas fa-clock"></i> ${ago(m.updated_at)}</span>${m.has_password ? '<span class="text-amber-300"><i class="fas fa-lock"></i></span>' : ''}${m.is_locked ? '<span class="text-red-300"><i class="fas fa-ban"></i> locked</span>' : ''}</div>
          <div class="flex gap-2 mt-auto"><a href="/room/${m.slug}" class="lb-btn lb-btn-primary lb-btn-sm flex-1"><i class="fas fa-right-to-bracket"></i> Enter</a><a href="/meetings/${m.id}" class="lb-btn lb-btn-ghost lb-btn-sm"><i class="fas fa-link"></i> Links</a></div>
        </article>`).join('')
      : `<div class="lb-card lb-empty md:col-span-3"><i class="fas fa-door-closed"></i>No private client rooms yet. <a href="/meetings/new?type=private_room" class="text-cyan-300">Create one</a>.</div>`
  }

  // ---- Create meeting -------------------------------------------------------
  async function pageCreate(root) {
    const form = $('#create-form')
    wireSegments(form)
    const syncType = () => {
      const t = formData(form).type
      $('#field-client').classList.toggle('hidden', t !== 'private_room')
      $('#field-schedule').classList.toggle('hidden', t !== 'scheduled')
      $('#scheduled_at').required = t === 'scheduled'
    }
    form.addEventListener('change', syncType); syncType()
    $('#require_password').addEventListener('change', (e) => { $('#field-password').classList.toggle('hidden', !e.target.checked); $('#password').required = e.target.checked })
    try {
      const [{ data: s }, { data: cs }] = await Promise.all([api.get('/settings/me'), api.get('/contacts')])
      if (s.settings?.primary_spoken_language) $('#host_language').value = s.settings.primary_spoken_language
      $('#client_contact_id').insertAdjacentHTML('beforeend', cs.contacts.map((c) => `<option value="${c.id}">${esc(c.name)}${c.company ? ` (${esc(c.company)})` : ''}</option>`).join(''))
      $('#client_contact_id').addEventListener('change', (e) => { const c = cs.contacts.find((x) => x.id === e.target.value); if (c && !$('#client_name').value) $('#client_name').value = c.name })
    } catch {}
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); showFormError(form, '')
      const data = formData(form)
      if (data.scheduled_at) data.scheduled_at = new Date(data.scheduled_at).toISOString()
      const btn = $('button[type=submit]', form); btn.disabled = true
      try {
        const { data: r } = await api.post('/meetings', data)
        showInvitationModal(r.meeting, r.invitation)
      } catch (err) { showFormError(form, errMsg(err)) } finally { btn.disabled = false }
    })
  }

  function showInvitationModal(m, inv) {
    const el = document.createElement('div')
    el.className = 'fixed inset-0 z-50 grid place-items-center p-4'
    el.style.background = 'rgba(3,6,12,.75)'
    el.innerHTML = `<div class="lb-card lb-card-pad w-full max-w-lg">
      <div class="text-center mb-4"><span class="lb-avatar lb-avatar-lg mx-auto mb-3" style="background:linear-gradient(135deg,#34d399,#22d3ee)"><i class="fas fa-check"></i></span><h2 class="text-xl font-bold text-white">${esc(m.name)} is ready</h2><p class="text-sm text-slate-400">Share this secure invitation link with your participants.</p></div>
      <label class="lb-label">Invitation link</label>
      <div class="lb-copy"><input class="lb-input" readonly value="${esc(inv.url)}" id="inv-url"><button class="lb-btn lb-btn-soft" id="inv-copy"><i class="fas fa-copy"></i></button></div>
      <p class="lb-hint">${inv.is_persistent ? 'Persistent link — reusable for every meeting in this room.' : `Expires ${fmtTime(inv.expires_at)}.`}</p>
      <div class="flex flex-wrap gap-2 mt-5">
        <button class="lb-btn lb-btn-ghost flex-1" id="inv-share"><i class="fas fa-share-nodes"></i> Share</button>
        <a class="lb-btn lb-btn-ghost flex-1" href="mailto:?subject=${encodeURIComponent('Join my LinguaBridge meeting: ' + m.name)}&body=${encodeURIComponent('Join the meeting here: ' + inv.url)}"><i class="fas fa-envelope"></i> Invite</a>
        <a class="lb-btn lb-btn-primary flex-1" href="/meetings/${m.id}"><i class="fas fa-arrow-right"></i> Manage</a>
      </div></div>`
    document.body.appendChild(el)
    $('#inv-copy', el).onclick = () => copy(inv.url)
    $('#inv-share', el).onclick = async () => { if (navigator.share) { try { await navigator.share({ title: m.name, url: inv.url }) } catch {} } else copy(inv.url) }
  }

  // ---- Meeting detail -------------------------------------------------------
  async function pageMeetingDetail(root) {
    await reference()
    const id = root.dataset.id
    async function load() {
      const { data } = await api.get(`/meetings/${id}`)
      $('#status-badge').textContent = data.meeting.status; $('#status-badge').className = `lb-badge lb-badge-${data.meeting.status}`
      $('#btn-end').classList.toggle('hidden', data.meeting.status !== 'active')
      $('#invitations').innerHTML = data.invitations.length
        ? data.invitations.map((i) => `<div class="lb-list-item ${i.is_active ? '' : 'opacity-50'}">
            <i class="fas ${i.is_persistent ? 'fa-infinity text-violet-300' : 'fa-link text-cyan-300'}"></i>
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2"><b class="text-white">${esc(i.label || 'Link')}</b>${i.has_password ? '<span class="lb-pill"><i class="fas fa-lock"></i> password</span>' : ''}${i.single_use ? '<span class="lb-pill">single-use</span>' : ''}${i.max_uses ? `<span class="lb-pill">${i.use_count}/${i.max_uses} uses</span>` : `<span class="lb-pill">${i.use_count} uses</span>`}${!i.is_active ? '<span class="lb-badge lb-badge-ended">disabled</span>' : ''}</div>
              <div class="text-xs text-slate-400 font-mono truncate">${esc(i.url)}</div>
              <div class="text-xs text-slate-500">${i.expires_at ? 'Expires ' + fmtTime(i.expires_at) : 'Never expires'}${i.invited_email ? ' · ' + esc(i.invited_email) : ''}</div>
            </div>
            <button class="lb-icon-btn" data-copy="${esc(i.url)}" title="Copy"><i class="fas fa-copy"></i></button>
            <button class="lb-icon-btn" data-toggle="${i.id}" data-active="${i.is_active}" title="${i.is_active ? 'Disable' : 'Enable'}"><i class="fas ${i.is_active ? 'fa-ban' : 'fa-rotate-left'}"></i></button>
            <button class="lb-icon-btn" data-del-inv="${i.id}" title="Delete"><i class="fas fa-trash text-red-300"></i></button>
          </div>`).join('')
        : '<div class="lb-empty"><i class="fas fa-link"></i>No invitation links</div>'
      $('#participants').innerHTML = data.participants.length ? data.participants.map((p) => participantRow(p, true)).join('') : '<div class="lb-empty"><i class="fas fa-users"></i>No one has joined yet. Share an invitation link.</div>'
    }
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-copy],[data-toggle],[data-del-inv],[data-remove],[data-action]'); if (!t) return
      try {
        if (t.dataset.copy) return copy(t.dataset.copy)
        if (t.dataset.toggle) { await api.patch(`/meetings/${id}/invitations/${t.dataset.toggle}`, { is_active: t.dataset.active !== '1' }); toast('Invitation updated', 'ok') }
        if (t.dataset.delInv && confirm('Delete this invitation link?')) await api.delete(`/meetings/${id}/invitations/${t.dataset.delInv}`)
        if (t.dataset.remove && confirm('Remove this participant?')) await api.post(`/meetings/${id}/participants/${t.dataset.remove}/remove`)
        if (t.dataset.action === 'end' && confirm('End this meeting for everyone?')) { await api.post(`/meetings/${id}/end`); toast('Meeting ended', 'ok') }
        if (t.dataset.action === 'delete' && confirm('Delete this meeting and all its data? This cannot be undone.')) { await api.delete(`/meetings/${id}`); location.href = '/meetings'; return }
        if (t.dataset.action === 'toggle-lock') { const locked = t.dataset.locked === '1'; await api.patch(`/meetings/${id}`, { is_locked: !locked }); t.dataset.locked = locked ? '0' : '1'; t.textContent = locked ? 'Open — lock' : 'Locked — unlock' }
        await load()
      } catch (err) { toast(errMsg(err), 'err') }
    })
    const invForm = $('#invite-form')
    $('#btn-new-invite').onclick = () => invForm.classList.toggle('hidden')
    $('#btn-cancel-invite').onclick = () => invForm.classList.add('hidden')
    invForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      try { const { data } = await api.post(`/meetings/${id}/invitations`, formData(invForm)); invForm.reset(); invForm.classList.add('hidden'); await load(); copy(data.invitation.url) } catch (err) { toast(errMsg(err), 'err') }
    })
    await load()
  }

  // ---- Contacts -------------------------------------------------------------
  async function pageContacts(root) {
    await reference(); await initCombos(root); wireCountrySuggestion($('#contact-form'))
    const form = $('#contact-form'), list = $('#contact-list')
    let all = []
    const render = (q) => {
      const ql = (q || '').toLowerCase()
      const rows = all.filter((c) => !ql || [c.name, c.email, c.company].some((x) => (x || '').toLowerCase().includes(ql)))
      list.innerHTML = rows.length
        ? `<table class="lb-table"><thead><tr><th>Name</th><th>Country</th><th>Languages</th><th></th></tr></thead><tbody>${rows.map((c) => `<tr>
            <td><b class="text-white">${esc(c.name)}</b><div class="text-xs text-slate-400">${esc(c.email || '')}${c.company ? ' · ' + esc(c.company) : ''}</div></td>
            <td>${flag(c.country_code)} ${esc(country(c.country_code)?.name || '—')}</td>
            <td class="text-sm text-slate-300">${c.spoken_language ? esc(langName(c.spoken_language)) + ' → ' + esc(langName(c.translation_language || c.spoken_language)) : '—'}</td>
            <td class="text-right whitespace-nowrap"><a class="lb-btn lb-btn-soft lb-btn-sm" href="/meetings/new?type=private_room" title="Create room"><i class="fas fa-door-open"></i></a> <button class="lb-btn lb-btn-ghost lb-btn-sm" data-edit="${c.id}"><i class="fas fa-pen"></i></button> <button class="lb-btn lb-btn-danger lb-btn-sm" data-del="${c.id}"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table>`
        : '<div class="lb-empty"><i class="fas fa-address-book"></i>No contacts yet</div>'
    }
    const load = async () => { all = (await api.get('/contacts')).data.contacts; render($('#contact-search').value) }
    $('#contact-search').addEventListener('input', (e) => render(e.target.value))
    const resetForm = () => { form.reset(); form.id.value = ''; $('[data-combo=country]', form)._set(''); $('#contact-editor-title').innerHTML = '<i class="fas fa-user-plus text-cyan-300"></i> New contact'; $('#contact-cancel').classList.add('hidden') }
    $('#contact-cancel').onclick = resetForm
    $('#btn-new-contact').onclick = () => { resetForm(); form.name.focus() }
    list.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-edit],[data-del]'); if (!b) return
      if (b.dataset.del) { if (confirm('Delete contact?')) { await api.delete(`/contacts/${b.dataset.del}`); await load() } return }
      const c = all.find((x) => x.id === b.dataset.edit); if (!c) return
      form.id.value = c.id; form.name.value = c.name; form.email.value = c.email || ''; form.company.value = c.company || ''; form.notes.value = c.notes || ''
      $('[data-combo=country]', form)._set(c.country_code || '')
      form.spoken_language.value = c.spoken_language || 'en'; form.translation_language.value = c.translation_language || c.spoken_language || 'en'
      $('#contact-editor-title').innerHTML = '<i class="fas fa-pen text-cyan-300"></i> Edit contact'; $('#contact-cancel').classList.remove('hidden')
    })
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const d = formData(form)
      try { if (d.id) await api.put(`/contacts/${d.id}`, d); else await api.post('/contacts', d); toast('Contact saved', 'ok'); resetForm(); await load() } catch (err) { showFormError(form, errMsg(err)) }
    })
    await load()
  }

  // ---- Settings -------------------------------------------------------------
  async function pageSettings(root) {
    await reference(); await initCombos(root)
    const form = $('#settings-form'); wireSegments(form); wireCountrySuggestion(form)
    const { data } = await api.get('/settings/me'); const s = data.settings || {}
    $('[data-combo=country]', form)._set(s.country_code || '')
    form.spoken_language.value = s.primary_spoken_language || 'en'; form.translation_language.value = s.preferred_translation_language || 'en'
    form.spoken_language.dataset.touched = '1'; form.translation_language.dataset.touched = '1'
    form.auto_detect_language.checked = !!s.auto_language_detection; form.show_original_text.checked = !!s.show_original_text
    $(`input[name=translation_mode][value=${s.translation_mode || 'text'}]`, form).checked = true; wireSegments(form)
    form.original_audio_volume.value = s.original_audio_volume ?? 100; form.translated_audio_volume.value = s.translated_audio_volume ?? 100
    const vol = () => { $('#v-orig').textContent = form.original_audio_volume.value; $('#v-tr').textContent = form.translated_audio_volume.value }
    form.addEventListener('input', vol); vol()
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      try { await api.put('/settings/me', formData(form)); toast('Settings saved', 'ok') } catch (err) { showFormError(form, errMsg(err)) }
    })
    $('#btn-change-password').onclick = async () => {
      try { await api.post('/auth/change-password', { current_password: $('#current_password').value, new_password: $('#new_password').value }); toast('Password updated', 'ok'); $('#current_password').value = ''; $('#new_password').value = '' } catch (err) { toast(errMsg(err), 'err') }
    }
    try {
      const { data: p } = await api.get('/settings/providers')
      const names = { realtime_media: ['Real-time media (LiveKit)', 'Phase 2/5'], speech_to_text: ['Speech-to-text (Deepgram)', 'Phase 3'], translation: ['Translation provider', 'Phase 4'], text_to_speech: ['Text-to-speech', 'Phase 6'] }
      $('#provider-status').innerHTML = Object.entries(p).map(([k, v]) => `<div class="lb-card lb-card-pad" style="background:rgba(255,255,255,.02)"><div class="flex items-center justify-between"><b class="text-white text-sm">${names[k][0]}</b><span class="lb-badge ${v.configured ? 'lb-badge-active' : 'lb-badge-scheduled'}">${v.configured ? 'configured' : 'not configured'}</span></div><div class="text-xs text-slate-400 mt-1">${esc(v.reason || v.provider)} · ${names[k][1]}</div>${v.requiredEnv ? `<div class="text-xs text-slate-500 mt-1">Requires: ${v.requiredEnv.map((x) => `<span class="lb-kbd">${x}</span>`).join(' ')}</div>` : ''}</div>`).join('')
    } catch {}
  }

  // ---- Join (pre-join language setup) ---------------------------------------
  async function pageJoin(root) {
    await reference(); await initCombos(root)
    const form = $('#join-form'); wireSegments(form); wireCountrySuggestion(form)
    const token = root.dataset.token
    try {
      const { data } = await api.get(`/join/${token}`)
      const d = data.defaults || {}
      if (d.display_name) form.display_name.value = d.display_name
      if (d.country_code) $('[data-combo=country]', form)._set(d.country_code)
      if (d.spoken_language) { form.spoken_language.value = d.spoken_language; form.spoken_language.dataset.touched = '1' }
      if (d.translation_language && !form.translation_language.disabled) { form.translation_language.value = d.translation_language; form.translation_language.dataset.touched = '1' }
      if (form.auto_detect_language && d.auto_detect_language !== undefined) form.auto_detect_language.checked = !!d.auto_detect_language
      if (d.translation_mode) { const r = $(`input[name=translation_mode][value=${d.translation_mode}]`, form); if (r) { r.checked = true; wireSegments(form) } }
      if (!d.country_code) {
        // Best-effort guess from browser locale — only a suggestion, the user confirms it.
        const region = (Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1] || '').toUpperCase()
        if (region && REF.countries.some((c) => c.code === region)) $('[data-combo=country]', form)._set(region)
      }
    } catch (err) { showFormError(form, errMsg(err)) }
    // Remember name across joins
    const saved = localStorage.getItem('lb_display_name'); if (saved && !form.display_name.value) form.display_name.value = saved
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); showFormError(form, '')
      const data = formData(form)
      if (form.translation_language.disabled) data.translation_language = form.dataset.hostLang
      const btn = $('button[type=submit]', form); btn.disabled = true
      try {
        localStorage.setItem('lb_display_name', data.display_name)
        const { data: r } = await api.post(`/join/${token}`, data)
        location.href = r.room_url
      } catch (err) {
        showFormError(form, errMsg(err))
        if (err?.response?.data?.field === 'password') form.password?.focus()
      } finally { btn.disabled = false }
    })
  }

  // ---- Room lobby -----------------------------------------------------------
  // ---- Room: handled by /static/room.js (LiveKit + STT + translation pipeline) ----

  // ---- Router ---------------------------------------------------------------
  const root = $('[data-page]')
  const page = root?.dataset.page
  const routes = { dashboard: pageDashboard, meetings: pageMeetings, rooms: pageRooms, 'create-meeting': pageCreate, 'meeting-detail': pageMeetingDetail, contacts: pageContacts, settings: pageSettings, join: pageJoin }
  if (page && routes[page]) routes[page](root).catch((err) => { console.error(err); toast(errMsg(err), 'err'); if (err?.response?.status === 401 && page !== 'join') location.href = '/login' })
})()
