import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

let cachedStaffData = {
  barbers: [],
  workingDays: [],
  exceptions: [],
  closures: [],
  loaded: false
}

export function AdminStaff({ salonSettings = {} }) {
  const [barbers, setBarbers] = useState(cachedStaffData.barbers)
  const [selectedBarber, setSelectedBarber] = useState('')
  const [exceptionDate, setExceptionDate] = useState('')
  const [excStartTime, setExcStartTime] = useState('')
  const [excEndTime, setExcEndTime] = useState('')
  const [exceptionReason, setExceptionReason] = useState('')
  const [exceptions, setExceptions] = useState(cachedStaffData.exceptions)
  
  const [newBarberName, setNewBarberName] = useState('')
  const [closures, setClosures] = useState(cachedStaffData.closures)
  const [closureStartDate, setClosureStartDate] = useState('')
  const [closureEndDate, setClosureEndDate] = useState('')
  const [closureReason, setClosureReason] = useState('')

  const [workingDays, setWorkingDays] = useState(cachedStaffData.workingDays)
  const [terminationDates, setTerminationDates] = useState({})
  const [loading, setLoading] = useState(!cachedStaffData.loaded)

  const fetchingRef = useRef(false)
  const todayString = new Date().toLocaleDateString('sv-SE')

  const DAYS_OF_WEEK = [
    { id: 1, label: 'Lun' },
    { id: 2, label: 'Mar' },
    { id: 3, label: 'Mer' },
    { id: 4, label: 'Gio' },
    { id: 5, label: 'Ven' },
    { id: 6, label: 'Sab' },
    { id: 0, label: 'Dom' },
  ]

  function getDayOfWeek(dateString) {
    const parts = dateString.split('-')
    if (parts.length !== 3) return new Date(dateString).getDay()
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    return new Date(year, month, day).getDay()
  }

  function getDayName(dateString) {
    const dayIndex = getDayOfWeek(dateString)
    const found = DAYS_OF_WEEK.find(d => d.id === dayIndex)
    return found ? found.label : ''
  }

  useEffect(() => {
    fetchData(!cachedStaffData.loaded)

    const channel = supabase
      .channel('admin-staff-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_working_days' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_exceptions' }, () => fetchData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_closures' }, () => fetchData(false))
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchData(showLoader = false) {
    if (fetchingRef.current) return
    fetchingRef.current = true

    if (showLoader) setLoading(true)
    
    try {
      const { data: bData } = await supabase
        .from('barbers')
        .select('*')
        .order('name', { ascending: true })

      if (bData) {
        setBarbers(bData)
        cachedStaffData.barbers = bData
        setTerminationDates(prev => {
          const termMap = { ...prev }
          bData.forEach(b => {
            if (termMap[b.id] === undefined) {
              termMap[b.id] = b.termination_date || ''
            }
          })
          return termMap
        })
      }

      const { data: wdData } = await supabase.from('barber_working_days').select('*')
      if (wdData) {
        setWorkingDays(wdData)
        cachedStaffData.workingDays = wdData
      }

      const { data: eData } = await supabase
        .from('barber_exceptions')
        .select('*, barbers(name)')
        .gte('date', todayString)
        .order('date', { ascending: true })
      if (eData) {
        setExceptions(eData)
        cachedStaffData.exceptions = eData
      }

      const { data: cData } = await supabase
        .from('shop_closures')
        .select('*')
        .gte('end_date', todayString)
        .order('start_date', { ascending: true })
      if (cData) {
        setClosures(cData)
        cachedStaffData.closures = cData
      }

      cachedStaffData.loaded = true
    } catch (err) {
      console.error("Errore durante il fetch dei dati staff:", err)
    } finally {
      fetchingRef.current = false
      if (showLoader) setLoading(false)
    }
  }

  async function handleAddBarber(e) {
    e.preventDefault()
    if (!newBarberName.trim()) {
      alert("Inserisci il nome del nuovo operatore.")
      return
    }

    const { error } = await supabase
      .from('barbers')
      .insert([{ name: newBarberName.trim(), is_active: true }])

    if (error) {
      alert("Errore nell'inserimento: " + error.message)
    } else {
      setNewBarberName('')
      fetchData(false)
      alert("Nuovo operatore aggiunto con successo!")
    }
  }

  async function handleToggleActive(barber) {
    const newStatus = !barber.is_active
    
    if (!newStatus) {
      const { data: appts } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barber.id)
        .eq('status', 'confirmed')
        .gte('appointment_date', todayString)

      if (appts && appts.length > 0) {
        const confirmDeactivate = window.confirm(
          `⚠️ ATTENZIONE: L'operatore ${barber.name} ha ${appts.length} appuntamento/i futuro/i registrato/i!\n\nSe procedi alla disattivazione, ricordati di avvisare i clienti interessati. Vuoi continuare?`
        )
        if (!confirmDeactivate) return
      }
    }

    const { error } = await supabase
      .from('barbers')
      .update({ is_active: newStatus })
      .eq('id', barber.id)

    if (!error) fetchData(false)
  }

  async function handleSaveTerminationDate(barberId) {
    const rawVal = terminationDates[barberId]
    const termDate = rawVal && rawVal.trim() !== '' ? rawVal : null

    if (termDate && termDate >= todayString) {
      const { data: appts } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('status', 'confirmed')
        .gte('appointment_date', todayString)
        .lte('appointment_date', termDate)

      if (appts && appts.length > 0) {
        const proceed = window.confirm(
          `⚠️ ATTENZIONE: Impostando questa data di fine rapporto, ci sono ${appts.length} appuntamenti programmati nel periodo (fino al ${termDate}).\n\nAssicurati di avvisare i clienti o di spostarli su un altro operatore. Vuoi salvare comunque?`
        )
        if (!proceed) return
      }
    }

    const { error } = await supabase
      .from('barbers')
      .update({ termination_date: termDate })
      .eq('id', barberId)

    if (error) {
      alert("Errore aggiornamento data fine: " + error.message)
    } else {
      alert("Data di fine rapporto aggiornata con successo!")
      fetchData(false)
    }
  }

  async function handleToggleWorkingDay(barberId, dayOfWeek) {
    const exists = workingDays.some(wd => wd.barber_id === barberId && wd.day_of_week === dayOfWeek)

    const currentActiveDays = workingDays
      .filter(wd => wd.barber_id === barberId)
      .map(wd => wd.day_of_week)
    
    let remainingActiveDays = []
    if (exists) {
      remainingActiveDays = currentActiveDays.filter(d => d !== dayOfWeek)
    } else {
      remainingActiveDays = [...currentActiveDays, dayOfWeek]
    }

    const { data: appts, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('barber_id', barberId)
      .eq('status', 'confirmed')
      .gte('appointment_date', todayString)

    if (apptError) {
      console.error("Errore nel controllo degli appuntamenti:", apptError)
      return
    }

    const conflictingAppts = (appts || []).filter(a => {
      const apptDayOfWeek = getDayOfWeek(a.appointment_date)
      return !remainingActiveDays.includes(apptDayOfWeek)
    })

    if (conflictingAppts.length > 0) {
      const affectedDetails = [...new Set(conflictingAppts.map(a => `${a.appointment_date} (${getDayName(a.appointment_date)})`))].sort()
      const detailsListString = affectedDetails.join(', ')

      const proceed = window.confirm(
        `⚠️ ATTENZIONE: Con questa nuova pianificazione, ci sono ${conflictingAppts.length} appuntamenti futuri confermati in giorni in cui l'operatore non risulterà più disponibile!\n\n` +
        `📅 Date e giorni coinvolti: ${detailsListString}\n\n` +
        `Ricordati di avvisare i clienti o riprogrammare gli orari. Vuoi procedere comunque?`
      )
      if (!proceed) return
    }

    if (exists) {
      const { error } = await supabase
        .from('barber_working_days')
        .delete()
        .eq('barber_id', barberId)
        .eq('day_of_week', dayOfWeek)

      if (!error) fetchData(false)
    } else {
      const { error } = await supabase
        .from('barber_working_days')
        .insert([{ barber_id: barberId, day_of_week: dayOfWeek, start_time: null, end_time: null }])

      if (!error) fetchData(false)
    }
  }

  async function handleUpdateWorkingDayTime(barberId, dayOfWeek, field, value) {
    if (value) {
      const { data: appts } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('status', 'confirmed')
        .gte('appointment_date', todayString)

      const conflicting = (appts || []).filter(a => {
        const d = getDayOfWeek(a.appointment_date)
        if (d !== dayOfWeek) return false
        if (field === 'start_time' && a.start_time < value) return true
        if (field === 'end_time' && a.end_time > value) return true
        return false
      })

      if (conflicting.length > 0) {
        const affectedDetails = [...new Set(conflicting.map(a => `${a.appointment_date} (${getDayName(a.appointment_date)})`))].sort()
        const proceed = window.confirm(
          `⚠️ ATTENZIONE: Modificando questo orario, ci sono ${conflicting.length} appuntamenti fuori dalla nuova fascia.\n\n` +
          `📅 Date e giorni coinvolti: ${affectedDetails.join(', ')}\n\n` +
          `Assicurati di avvisare i clienti. Vuoi procedere?`
        )
        if (!proceed) return
      }
    }

    const { error } = await supabase
      .from('barber_working_days')
      .update({ [field]: value ? value : null })
      .eq('barber_id', barberId)
      .eq('day_of_week', dayOfWeek)

    if (!error) fetchData(false)
  }

  async function handleAddClosure(e) {
    e.preventDefault()
    if (!closureStartDate || !closureEndDate) {
      alert("Inserisci sia la data di inizio che quella di fine chiusura.")
      return
    }
    if (closureEndDate < closureStartDate) {
      alert("La data di fine non può essere precedente a quella di inizio.")
      return
    }

    const { data: conflictingAppts, error: apptError } = await supabase
      .from('appointments')
      .select('*, barbers(name)')
      .eq('status', 'confirmed')
      .gte('appointment_date', closureStartDate)
      .lte('appointment_date', closureEndDate)

    if (apptError) {
      console.error("Errore controllo appuntamenti chiusura:", apptError)
    } else if (conflictingAppts && conflictingAppts.length > 0) {
      const proceed = window.confirm(
        `⚠️ ATTENZIONE: Nel periodo di chiusura (${closureStartDate} ➔ ${closureEndDate}) ci sono ben ${conflictingAppts.length} appuntamenti prenotati!\n\nRicordati di avvisare i clienti. Vuoi procedere?`
      )
      if (!proceed) return
    }

    const { error } = await supabase
      .from('shop_closures')
      .insert([{ 
        start_date: closureStartDate, 
        end_date: closureEndDate, 
        reason: closureReason || 'Ferie Collettive' 
      }])

    if (error) {
      alert("Errore nell'inserimento chiusura: " + error.message)
    } else {
      setClosureStartDate('')
      setClosureEndDate('')
      setClosureReason('')
      fetchData(false)
      alert("Periodo di chiusura salvato!")
    }
  }

  async function handleDeleteClosure(id) {
    if (!window.confirm("Vuoi rimuovere questo periodo di chiusura?")) return
    const { error } = await supabase.from('shop_closures').delete().eq('id', id)
    if (!error) fetchData(false)
  }

  async function handleAddException(e) {
    e.preventDefault()
    if (!selectedBarber || !exceptionDate) {
      alert("Seleziona un operatore e una data.")
      return
    }
    if (exceptionDate < todayString) {
      alert("Non puoi inserire un'assenza per una data passata.")
      return
    }

    const { data: conflictingAppts, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('barber_id', selectedBarber)
      .eq('status', 'confirmed')
      .eq('appointment_date', exceptionDate)
      .gte('appointment_date', todayString)

    if (apptError) {
      console.error("Errore controllo appuntamenti operatore:", apptError)
    } else if (conflictingAppts && conflictingAppts.length > 0) {
      let filteredAppts = conflictingAppts
      if (excStartTime && excEndTime) {
        filteredAppts = conflictingAppts.filter(a => {
          return a.start_time < excEndTime && a.end_time > excStartTime
        })
      }

      if (filteredAppts.length > 0) {
        const proceed = window.confirm(
          `⚠️ ATTENZIONE: L'operatore ha ${filteredAppts.length} appuntamento/i confermato/i in questa fascia oraria nella data del ${exceptionDate} (${getDayName(exceptionDate)})!\n\nÈ necessario avvisare i clienti. Vuoi procedere comunque?`
        )
        if (!proceed) return
      }
    }

    const payload = {
      barber_id: selectedBarber,
      date: exceptionDate,
      reason: exceptionReason || 'Assenza'
    }
    if (excStartTime) payload.start_time = excStartTime
    if (excEndTime) payload.end_time = excEndTime

    const { error } = await supabase.from('barber_exceptions').insert([payload])

    if (error) {
      alert("Errore nell'inserimento: " + error.message)
    } else {
      setExceptionDate('')
      setExcStartTime('')
      setExcEndTime('')
      setExceptionReason('')
      fetchData(false)
      alert("Assenza registrata con successo!")
    }
  }

  async function handleDeleteException(id) {
    if (!window.confirm("Vuoi rimuovere questa eccezione?")) return
    const { error } = await supabase.from('barber_exceptions').delete().eq('id', id)
    if (!error) fetchData(false)
  }

  return (
    <div style={{ 
      position: 'relative', 
      zIndex: 1,
      '--primary-color': salonSettings.primary_color || '#2563eb',
      '--accent-color': salonSettings.accent_color || '#D4AF37',
      '--secondary-color': salonSettings.secondary_color || '#1E293B',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '4px'
    }}>
      {/* Header Sezione */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.35rem', fontWeight: 700 }}>Gestione Staff & Ferie</h2>
        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>Pianifica gli orari degli operatori, i giorni di chiusura collettiva e i permessi individuali</p>
      </div>

      <div className="admin-staff-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        
        {/* COLONNA SINISTRA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Chiusura Collettiva */}
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', borderLeft: '4px solid var(--primary-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <h3 style={{ color: '#1e293b', marginTop: 0, marginBottom: '18px', fontSize: '1.1rem', fontWeight: 700 }}>🏖️ Chiusura Collettiva / Ferie Salone</h3>
            <form onSubmit={handleAddClosure} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Dal giorno:</label>
                  <input type="date" min={todayString} value={closureStartDate} onChange={e => setClosureStartDate(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Al giorno:</label>
                  <input type="date" min={closureStartDate || todayString} value={closureEndDate} onChange={e => setClosureEndDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Motivo:</label>
                <input type="text" placeholder="Es. Ferie Estive / Natale" value={closureReason} onChange={e => setClosureReason(e.target.value)} style={inputStyle} />
              </div>
              <button type="submit" style={{ ...btnStyle, backgroundColor: 'var(--primary-color)', marginTop: '4px', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)' }}>
                Registra Chiusura Salone
              </button>
            </form>

            {closures.length > 0 && (
              <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Chiusure attive programmate:</span>
                {closures.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '13px', color: '#1e293b' }}><strong>{c.reason}</strong> ({c.start_date} ➔ {c.end_date})</span>
                    <button onClick={() => handleDeleteClosure(c.id)} style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px' }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aggiungi Operatore */}
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', borderLeft: '4px solid var(--accent-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <h3 style={{ color: '#1e293b', marginTop: 0, marginBottom: '18px', fontSize: '1.1rem', fontWeight: 700 }}>➕ Aggiungi Nuovo Operatore</h3>
            <form onSubmit={handleAddBarber} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Nome Operatore:</label>
                <input type="text" placeholder="Es. Marco Rossi" value={newBarberName} onChange={e => setNewBarberName(e.target.value)} style={inputStyle} />
              </div>
              <button type="submit" style={{ ...btnStyle, backgroundColor: '#10b981', marginTop: '4px', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}>
                Salva Nuovo Operatore
              </button>
            </form>
          </div>

          {/* Programma Assenza Singolo */}
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', borderLeft: '4px solid #ef4444', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <h3 style={{ color: '#1e293b', marginTop: 0, marginBottom: '18px', fontSize: '1.1rem', fontWeight: 700 }}>📅 Programma Assenza o Permesso Singolo</h3>
            <form onSubmit={handleAddException} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Operatore:</label>
                <select value={selectedBarber} onChange={e => setSelectedBarber(e.target.value)} style={inputStyle}>
                  <option value="">-- Seleziona Operatore --</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.id}>{b.name} {b.is_active ? '' : '(Disattivo)'}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Data:</label>
                <input type="date" min={todayString} value={exceptionDate} onChange={e => setExceptionDate(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Dalle ore (opz.):</label>
                  <input type="time" value={excStartTime} onChange={e => setExcStartTime(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Alle ore (opz.):</label>
                  <input type="time" value={excEndTime} onChange={e => setExcEndTime(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Motivo:</label>
                <input type="text" placeholder="Es. Permesso medico" value={exceptionReason} onChange={e => setExceptionReason(e.target.value)} style={inputStyle} />
              </div>

              <button type="submit" style={{ ...btnStyle, backgroundColor: '#ef4444', marginTop: '4px', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)' }}>
                Registra Assenza
              </button>
            </form>
          </div>

        </div>

        {/* COLONNA DESTRA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Configurazione Operatori & Orari Giornalieri */}
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', borderLeft: '4px solid var(--secondary-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <h3 style={{ color: '#1e293b', marginBottom: '18px', marginTop: 0, fontSize: '1.1rem', fontWeight: 700 }}>⚙️ Configurazione Operatori (Orari & Uscite)</h3>
            {loading && barbers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Caricamento operatori...</div>
            ) : barbers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '13px' }}>Nessun operatore registrato.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {barbers.map(b => {
                  return (
                    <div key={b.id} style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      
                      {/* Intestazione */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <strong style={{ color: '#1e293b', fontSize: '1rem' }}>{b.name}</strong>
                          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', backgroundColor: b.is_active ? '#dcfce7' : '#fee2e2', color: b.is_active ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                            {b.is_active ? 'Attivo' : 'Disattivato'}
                          </span>
                        </div>
                        <button onClick={() => handleToggleActive(b)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: b.is_active ? '#fee2e2' : '#dcfce7', color: b.is_active ? '#b91c1c' : '#15803d', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                          {b.is_active ? 'Disattiva' : 'Attiva'}
                        </button>
                      </div>

                      {/* Giorni lavorativi e orari specifici */}
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '8px' }}>Giorni lavorativi e orari dedicati (opzionali):</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {DAYS_OF_WEEK.map(day => {
                            const wdObj = workingDays.find(wd => wd.barber_id === b.id && wd.day_of_week === day.id)
                            const isWorking = !!wdObj

                            return (
                              <div key={day.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '68px', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleWorkingDay(b.id, day.id)}
                                  style={{
                                    padding: '4px 6px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    border: isWorking ? '1px solid var(--primary-color)' : '1px solid #cbd5e1',
                                    backgroundColor: isWorking ? 'var(--primary-color)' : '#f1f5f9',
                                    color: isWorking ? '#FFF' : '#64748b',
                                    width: '100%'
                                  }}
                                >
                                  {day.label} {isWorking ? '✓' : ''}
                                </button>

                                {isWorking && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                                    <input 
                                      type="time" 
                                      value={wdObj.start_time || ''} 
                                      onChange={(e) => handleUpdateWorkingDayTime(b.id, day.id, 'start_time', e.target.value)}
                                      title="Inizio (lascia vuoto per default salone)"
                                      style={{ ...inputStyle, padding: '3px', fontSize: '10px', height: '22px', textAlign: 'center', width: '100%' }} 
                                    />
                                    <input 
                                      type="time" 
                                      value={wdObj.end_time || ''} 
                                      onChange={(e) => handleUpdateWorkingDayTime(b.id, day.id, 'end_time', e.target.value)}
                                      title="Fine (lascia vuoto per default salone)"
                                      style={{ ...inputStyle, padding: '3px', fontSize: '10px', height: '22px', textAlign: 'center', width: '100%' }} 
                                    />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Data fine rapporto */}
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginTop: '4px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Data Uscita / Fine Rapporto (Opzionale):</label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input 
                              type="date" 
                              value={terminationDates[b.id] !== undefined ? terminationDates[b.id] : (b.termination_date || '')} 
                              onChange={(e) => setTerminationDates({ ...terminationDates, [b.id]: e.target.value })} 
                              style={{ ...inputStyle, padding: '9px 12px', fontSize: '12px', flex: 1 }} 
                            />
                            {(terminationDates[b.id] || b.termination_date) && (
                              <button 
                                type="button" 
                                onClick={() => setTerminationDates({ ...terminationDates, [b.id]: '' })}
                                title="Cancella data"
                                style={{ padding: '0 10px', backgroundColor: '#fee2e2', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#b91c1c', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleSaveTerminationDate(b.id)}
                          style={{ padding: '9px 14px', backgroundColor: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#FFF', fontSize: '12px', cursor: 'pointer', fontWeight: 600, height: '38px' }}
                        >
                          Salva Uscita
                        </button>
                      </div>

                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Lista Assenze Future */}
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <h3 style={{ color: '#1e293b', marginBottom: '14px', marginTop: 0, fontSize: '1.1rem', fontWeight: 700 }}>Assenze Individuali Programmate</h3>
            {loading && exceptions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Caricamento assenze...</div>
            ) : exceptions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '13px' }}>
                Nessuna assenza futura registrata.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {exceptions.map(exc => (
                  <div key={exc.id} style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div>
                      <strong style={{ color: '#1e293b', fontSize: '0.95rem' }}>{exc.barbers?.name || 'Operatore'}</strong>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                        📅 {exc.date} ({getDayName(exc.date)}) {exc.start_time && exc.end_time ? `🕒 ${exc.start_time.slice(0,5)} - ${exc.end_time.slice(0,5)}` : '(Tutto il giorno)'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Note: {exc.reason}</div>
                    </div>
                    <button onClick={() => handleDeleteException(exc.id)} style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px' }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
  color: '#1e293b',
  boxSizing: 'border-box',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s'
}

const btnStyle = {
  width: '100%',
  padding: '11px 16px',
  borderRadius: '8px',
  border: 'none',
  color: '#FFF',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '13px',
  transition: 'background 0.2s'
}
