import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminStaff() {
  const [barbers, setBarbers] = useState([])
  const [selectedBarber, setSelectedBarber] = useState('')
  const [exceptionDate, setExceptionDate] = useState('')
  const [excStartTime, setExcStartTime] = useState('')
  const [excEndTime, setExcEndTime] = useState('')
  const [exceptionReason, setExceptionReason] = useState('')
  const [exceptions, setExceptions] = useState([])
  
  const [newBarberName, setNewBarberName] = useState('')
  const [closures, setClosures] = useState([])
  const [closureStartDate, setClosureStartDate] = useState('')
  const [closureEndDate, setClosureEndDate] = useState('')
  const [closureReason, setClosureReason] = useState('')

  // Stato per i giorni lavorativi dei barbieri (es. [{ barber_id, day_of_week }])
  const [workingDays, setWorkingDays] = useState([])
  
  // Stato locale temporaneo per la modifica della data di fine rapporto per ogni barbiere
  const [terminationDates, setTerminationDates] = useState({})

  const [loading, setLoading] = useState(true)

  const todayString = new Date().toLocaleDateString('sv-SE')

  // Giorni della settimana standard (0 = Domenica, 1 = Lunedì, ecc.)
  const DAYS_OF_WEEK = [
    { id: 1, label: 'Lun' },
    { id: 2, label: 'Mar' },
    { id: 3, label: 'Mer' },
    { id: 4, label: 'Gio' },
    { id: 5, label: 'Ven' },
    { id: 6, label: 'Sab' },
    { id: 0, label: 'Dom' },
  ]

  useEffect(() => {
    fetchData(true)

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

  async function fetchData(isInitial = false) {
    if (isInitial) setLoading(true)
    
    // Ordinamento alfabetico fisso per gli operatori
    const { data: bData } = await supabase
      .from('barbers')
      .select('*')
      .order('name', { ascending: true })

    if (bData) {
      setBarbers(bData)
      // Inizializza le date di fine rapporto nello stato locale se non già presenti
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
    if (wdData) setWorkingDays(wdData)

    const { data: eData } = await supabase
      .from('barber_exceptions')
      .select('*, barbers(name)')
      .gte('date', todayString)
      .order('date', { ascending: true })
    if (eData) setExceptions(eData)

    const { data: cData } = await supabase
      .from('shop_closures')
      .select('*')
      .gte('end_date', todayString)
      .order('start_date', { ascending: true })
    if (cData) setClosures(cData)

    if (isInitial) setLoading(false)
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
    const { error } = await supabase
      .from('barbers')
      .update({ is_active: newStatus })
      .eq('id', barber.id)

    if (!error) fetchData(false)
  }

  // Aggiorna o salva la data di fine rapporto (gestisce anche la cancellazione impostandola a null)
  async function handleSaveTerminationDate(barberId) {
    const rawVal = terminationDates[barberId]
    const termDate = rawVal && rawVal.trim() !== '' ? rawVal : null

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

  // Gestione dei giorni lavorativi ricorrenti (Toggle checkbox)
  async function handleToggleWorkingDay(barberId, dayOfWeek) {
    const exists = workingDays.some(wd => wd.barber_id === barberId && wd.day_of_week === dayOfWeek)

    if (exists) {
      // Rimuovi il giorno
      const { error } = await supabase
        .from('barber_working_days')
        .delete()
        .eq('barber_id', barberId)
        .eq('day_of_week', dayOfWeek)

      if (!error) fetchData(false)
    } else {
      // Aggiungi il giorno
      const { error } = await supabase
        .from('barber_working_days')
        .insert([{ barber_id: barberId, day_of_week: dayOfWeek }])

      if (!error) fetchData(false)
    }
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
    }
  }

  async function handleDeleteException(id) {
    if (!window.confirm("Vuoi rimuovere questa eccezione?")) return
    const { error } = await supabase.from('barber_exceptions').delete().eq('id', id)
    if (!error) fetchData(false)
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <h3 className="section-title">Gestione Staff & Ferie</h3>

      <div className="admin-staff-responsive-grid">
        
        {/* COLONNA SINISTRA: Inserimenti (Chiusure, Staff, Permessi) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          {/* 1. SEZIONE CHIUSURA COLLETTIVA SALONE */}
          <div className="info-card" style={{ marginBottom: 0, borderColor: '#64B5F6' }}>
            <h4 style={{ color: '#64B5F6', marginTop: 0, marginBottom: '15px' }}>🏖️ Chiusura Collettiva / Ferie Salone</h4>
            <form onSubmit={handleAddClosure} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dal giorno:</label>
                  <input type="date" min={todayString} value={closureStartDate} onChange={e => setClosureStartDate(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Al giorno:</label>
                  <input type="date" min={closureStartDate || todayString} value={closureEndDate} onChange={e => setClosureEndDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Motivo:</label>
                <input type="text" placeholder="Es. Ferie Estive / Natale" value={closureReason} onChange={e => setClosureReason(e.target.value)} style={inputStyle} />
              </div>
              <button type="submit" style={{ ...btnStyle, backgroundColor: '#1976D2', marginTop: '5px' }}>
                Registra Chiusura Salone
              </button>
            </form>

            {closures.length > 0 && (
              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Chiusure attive programmate:</span>
                {closures.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '13px' }}><strong>{c.reason}</strong> ({c.start_date} ➔ {c.end_date})</span>
                    <button onClick={() => handleDeleteClosure(c.id)} style={{ background: 'transparent', border: 'none', color: 'var(--barber-red)', cursor: 'pointer' }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. SEZIONE AGGIUNGI NUOVO OPERATORE */}
          <div className="info-card" style={{ marginBottom: 0 }}>
            <h4 style={{ color: '#FFF', marginTop: 0, marginBottom: '15px' }}>➕ Aggiungi Nuovo Operatore</h4>
            <form onSubmit={handleAddBarber} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Nome Operatore:</label>
                <input type="text" placeholder="Es. Marco Rossi" value={newBarberName} onChange={e => setNewBarberName(e.target.value)} style={inputStyle} />
              </div>
              <button type="submit" style={{ ...btnStyle, backgroundColor: '#2E7D32', marginTop: '5px' }}>
                Salva Nuovo Operatore
              </button>
            </form>
          </div>

          {/* 3. SEZIONE PROGRAMMA ASSENZA SINGOLO OPERATORE */}
          <div className="info-card" style={{ marginBottom: 0 }}>
            <h4 style={{ color: '#FFF', marginTop: 0, marginBottom: '15px' }}>📅 Programma Assenza o Permesso Singolo</h4>
            <form onSubmit={handleAddException} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Operatore:</label>
                <select value={selectedBarber} onChange={e => setSelectedBarber(e.target.value)} style={inputStyle}>
                  <option value="">-- Seleziona Operatore --</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.id}>{b.name} {b.is_active ? '' : '(Disattivo)'}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Data:</label>
                <input type="date" min={todayString} value={exceptionDate} onChange={e => setExceptionDate(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dalle ore (opz.):</label>
                  <input type="time" value={excStartTime} onChange={e => setExcStartTime(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Alle ore (opz.):</label>
                  <input type="time" value={excEndTime} onChange={e => setExcEndTime(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Motivo:</label>
                <input type="text" placeholder="Es. Permesso medico" value={exceptionReason} onChange={e => setExceptionReason(e.target.value)} style={inputStyle} />
              </div>

              <button type="submit" style={{ ...btnStyle, backgroundColor: 'var(--barber-red)', marginTop: '5px' }}>
                Registra Assenza
              </button>
            </form>
          </div>

        </div>

        {/* COLONNA DESTRA: Gestione Avanzata Operatori & Assenze */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          {/* Lista Stato Operatori, Giorni Lavorativi e Uscita Programmata */}
          <div className="info-card" style={{ marginBottom: 0 }}>
            <h4 style={{ color: '#FFF', marginBottom: '15px', marginTop: 0 }}>⚙️ Configurazione Operatori (Orari & Uscite)</h4>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Caricamento...</p>
            ) : barbers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nessun operatore registrato.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {barbers.map(b => {
                  const barberDays = workingDays.filter(wd => wd.barber_id === b.id).map(wd => wd.day_of_week)

                  return (
                    <div key={b.id} style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      
                      {/* Intestazione operatore e tasto attivo/disattivo */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: '#FFF', fontSize: '1.05rem' }}>{b.name}</strong>
                          <span style={{ fontSize: '11px', marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', backgroundColor: b.is_active ? 'rgba(46, 125, 50, 0.2)' : 'rgba(211, 47, 47, 0.2)', color: b.is_active ? '#81c784' : 'var(--barber-red)' }}>
                            {b.is_active ? 'Attivo' : 'Disattivato'}
                          </span>
                        </div>
                        <button onClick={() => handleToggleActive(b)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: b.is_active ? 'rgba(211, 47, 47, 0.2)' : 'rgba(46, 125, 50, 0.2)', color: '#FFF', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                          {b.is_active ? 'Disattiva' : 'Attiva'}
                        </button>
                      </div>

                      {/* Giorni lavorativi ricorrenti */}
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Giorni lavorativi settimanali (seleziona i giorni attivi):</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {DAYS_OF_WEEK.map(day => {
                            const isWorking = barberDays.includes(day.id)
                            return (
                              <button
                                key={day.id}
                                type="button"
                                onClick={() => handleToggleWorkingDay(b.id, day.id)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  border: isWorking ? '1px solid #64B5F6' : '1px solid var(--border-color)',
                                  backgroundColor: isWorking ? 'rgba(25, 118, 210, 0.3)' : 'rgba(20, 20, 20, 0.6)',
                                  color: isWorking ? '#FFF' : '#777'
                                }}
                              >
                                {day.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Data fine rapporto con pulsante di reset rapido "✕" */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Data Uscita / Fine Rapporto (Opzionale):</label>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input 
                              type="date" 
                              value={terminationDates[b.id] !== undefined ? terminationDates[b.id] : (b.termination_date || '')} 
                              onChange={(e) => setTerminationDates({ ...terminationDates, [b.id]: e.target.value })} 
                              style={{ ...inputStyle, padding: '8px 10px', fontSize: '12px', flex: 1 }} 
                            />
                            {(terminationDates[b.id] || b.termination_date) && (
                              <button 
                                type="button" 
                                onClick={() => setTerminationDates({ ...terminationDates, [b.id]: '' })}
                                title="Cancella data"
                                style={{ padding: '0 10px', backgroundColor: 'rgba(211, 47, 47, 0.2)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--barber-red)', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleSaveTerminationDate(b.id)}
                          style={{ padding: '8px 12px', marginTop: '16px', backgroundColor: '#333', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#FFF', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
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
          <div>
            <h4 style={{ color: '#FFF', marginBottom: '10px', marginTop: 0 }}>Assenze Individuali Programmate</h4>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Caricamento...</p>
            ) : exceptions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nessuna assenza futura.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {exceptions.map(exc => (
                  <div key={exc.id} style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'rgba(24, 24, 24, 0.85)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ color: '#FFF' }}>{exc.barbers?.name || 'Operatore'}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        📅 {exc.date} {exc.start_time && exc.end_time ? `🕒 ${exc.start_time.slice(0,5)} - ${exc.end_time.slice(0,5)}` : '(Tutto il giorno)'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Note: {exc.reason}</div>
                    </div>
                    <button onClick={() => handleDeleteException(exc.id)} style={{ background: 'transparent', border: 'none', color: 'var(--barber-red)', cursor: 'pointer', fontWeight: 'bold' }}>🗑️</button>
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
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'rgba(15, 15, 15, 0.8)',
  color: '#FFF',
  boxSizing: 'border-box',
  fontSize: '14px',
  outline: 'none'
}

const btnStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '6px',
  border: 'none',
  color: '#FFF',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontSize: '14px'
}
