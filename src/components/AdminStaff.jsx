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

  const [loading, setLoading] = useState(true)

  const todayString = new Date().toLocaleDateString('sv-SE')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    
    const { data: bData } = await supabase.from('barbers').select('*')
    if (bData) setBarbers(bData)

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

    setLoading(false)
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
      fetchData()
      alert("Nuovo operatore aggiunto con successo!")
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
      fetchData()
      alert("Periodo di chiusura salvato!")
    }
  }

  async function handleDeleteClosure(id) {
    if (!window.confirm("Vuoi rimuovere questo periodo di chiusura?")) return
    const { error } = await supabase.from('shop_closures').delete().eq('id', id)
    if (!error) fetchData()
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
      fetchData()
    }
  }

  async function handleDeleteException(id) {
    if (!window.confirm("Vuoi rimuovere questa eccezione?")) return
    const { error } = await supabase.from('barber_exceptions').delete().eq('id', id)
    if (!error) fetchData()
  }

  async function handleToggleActive(barber) {
    const newStatus = !barber.is_active
    const { error } = await supabase
      .from('barbers')
      .update({ is_active: newStatus })
      .eq('id', barber.id)

    if (!error) fetchData()
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <h3 className="section-title">Gestione Staff & Ferie</h3>

      {/* ========================================================= */}
      {/* 📱💻 GRIGLIA RESPONSIVE ADMIN (1 colonna mobile, 2 PC)    */}
      {/* ========================================================= */}
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

        {/* COLONNA DESTRA: Liste di controllo (Assenze Programmate & Stato Operatori) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
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

          {/* Lista Stato Operatori */}
          <div>
            <h4 style={{ color: '#FFF', marginBottom: '10px' }}>Stato Operatori nel Salone</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {barbers.map(b => (
                <div key={b.id} style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'rgba(24, 24, 24, 0.85)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#FFF' }}>{b.name}</strong>
                    <div style={{ fontSize: '12px', color: b.is_active ? '#81c784' : 'var(--barber-red)', marginTop: '2px' }}>
                      {b.is_active ? '✅ Attivo' : '❌ Disattivato'}
                    </div>
                  </div>
                  <button onClick={() => handleToggleActive(b)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: b.is_active ? 'rgba(211, 47, 47, 0.2)' : 'rgba(46, 125, 50, 0.2)', color: '#FFF', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    {b.is_active ? 'Disattiva' : 'Attiva'}
                  </button>
                </div>
              ))}
            </div>
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
