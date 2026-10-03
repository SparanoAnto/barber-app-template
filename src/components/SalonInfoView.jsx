import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function SalonInfoView({ salonSettings, isAdmin }) {
  const [weeklyHours, setWeeklyHours] = useState([])
  const [specialHours, setSpecialHours] = useState([])
  const [loading, setLoading] = useState(true)

  // Stati per la gestione admin degli orari speciali (salon_exceptions)
  const [showAddSpecial, setShowAddSpecial] = useState(false)
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [openingTime, setOpeningTime] = useState('08:30')
  const [closingTime, setClosingTime] = useState('21:00')
  const [message, setMessage] = useState({ type: '', text: '' })

  useEffect(() => {
    fetchScheduleData()
  }, [])

  async function fetchScheduleData() {
    setLoading(true)
    try {
      // 1. Carica orari settimanali
      const { data: wData, error: wError } = await supabase
        .from('salon_weekly_hours')
        .select('*')
        .order('day_of_week', { ascending: true })

      if (!wError && wData) {
        const sorted = [...wData].sort((a, b) => {
          const dayA = a.day_of_week === 0 ? 7 : a.day_of_week
          const dayB = b.day_of_week === 0 ? 7 : b.day_of_week
          return dayA - dayB
        })
        setWeeklyHours(sorted)
      }

      // 2. Carica orari speciali / aperture straordinarie futuri o odierni da salon_exceptions
      const todayStr = new Date().toISOString().split('T')[0]
      const { data: eData, error: eError } = await supabase
        .from('salon_exceptions')
        .select('*')
        .gte('end_date', todayStr)
        .order('start_date', { ascending: true })

      if (!eError && eData) {
        setSpecialHours(eData)
      }
    } catch (err) {
      console.error('Errore caricamento dati orari:', err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddSpecialHours(e) {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (!description.trim() || !startDate || !endDate || !openingTime || !closingTime) {
      setMessage({ type: 'error', text: 'Compila tutti i campi obbligatori.' })
      return
    }

    const todayStr = new Date().toISOString().split('T')[0]
    if (endDate < todayStr) {
      setMessage({ type: 'error', text: 'Non puoi inserire un orario straordinario in una data passata.' })
      return
    }

    if (startDate > endDate) {
      setMessage({ type: 'error', text: 'La data di inizio non può essere successiva alla data di fine.' })
      return
    }

    try {
      const { data: conflictingApps, error: conflictError } = await supabase
        .from('appointments')
        .select('appointment_date, start_time, end_time, status')
        .gte('appointment_date', startDate)
        .lte('appointment_date', endDate)
        .neq('status', 'cancelled')

      if (conflictError) throw conflictError

      if (conflictingApps && conflictingApps.length > 0) {
        const outOfBoundsApps = conflictingApps.filter(app => {
          const appStart = app.start_time.substring(0, 5)
          const appEnd = app.end_time.substring(0, 5)
          return appStart < openingTime || appEnd > closingTime
        })

        if (outOfBoundsApps.length > 0) {
          setMessage({ 
            type: 'error', 
            text: `⚠️ Impossibile applicare questo orario: ci sono ${outOfBoundsApps.length} appuntamenti già prenotati che si trovano fuori dalla nuova fascia oraria (${openingTime} - ${closingTime}).` 
          })
          return
        }
      }

      const payload = {
        description: description.trim(),
        start_date: startDate,
        end_date: endDate,
        is_closed: false,
        opening_time: openingTime + ':00',
        closing_time: closingTime + ':00'
      }

      const { data, error } = await supabase
        .from('salon_exceptions')
        .insert([payload])
        .select()

      if (error) throw error

      setSpecialHours(prev => [...prev, data[0]].sort((a, b) => new Date(a.start_date) - new Date(b.start_date)))
      setShowAddSpecial(false)
      setDescription('')
      setStartDate('')
      setEndDate('')
      setOpeningTime('08:30')
      setClosingTime('21:00')
      setMessage({ type: 'success', text: 'Orario speciale aggiunto con successo!' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  async function handleDeleteSpecialHours(id) {
    if (!window.confirm('Vuoi eliminare questo orario speciale?')) return

    try {
      const { error } = await supabase
        .from('salon_exceptions')
        .delete()
        .eq('id', id)

      if (error) throw error
      setSpecialHours(prev => prev.filter(item => item.id !== id))
    } catch (err) {
      alert('Errore durante l\'eliminazione: ' + err.message)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Caricamento informazioni...</div>
  }

  return (
    <div>
      <h3 className="section-title">Dove Siamo & Orari</h3>
      
      {/* Scheda Contatti */}
      <div className="info-card" style={{ marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-main)' }}>📍 {salonSettings.salon_name || 'Salone'}</h4>
        <p style={{ margin: '6px 0' }}><strong>Indirizzo:</strong> {salonSettings.address || 'Indirizzo non configurato'}</p>
        {salonSettings.phone && <p style={{ margin: '6px 0' }}><strong>Telefono:</strong> {salonSettings.phone}</p>}
        {salonSettings.slot_interval_minutes && (
          <p style={{ margin: '6px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            ⏱️ Intervallo slot appuntamenti: {salonSettings.slot_interval_minutes} minuti
          </p>
        )}
      </div>

      {/* Orari della Settimana */}
      <div className="info-card" style={{ marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-main)' }}>📅 Orari della Settimana</h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {weeklyHours.map(day => (
            <div key={day.id} style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              padding: '8px 10px', borderRadius: '6px', 
              backgroundColor: '#11141b', 
              border: '1px solid var(--border-color)'
            }}>
              <span style={{ fontWeight: '600', width: '100px', color: day.is_closed ? 'var(--text-muted)' : 'var(--text-main)' }}>
                {day.day_name}
              </span>

              <span style={{ fontSize: '13px', color: day.is_closed ? 'var(--text-muted)' : 'var(--accent-color)', fontStyle: day.is_closed ? 'italic' : 'normal' }}>
                {day.is_closed ? 'Chiuso' : `${day.opening_time.substring(0, 5)} - ${day.closing_time.substring(0, 5)}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Sezione Orari Speciali */}
      <div className="info-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, color: 'var(--text-main)' }}>⚡ Orari Straordinari & Periodi Prolungati</h4>
          {isAdmin && !showAddSpecial && (
            <button 
              onClick={() => setShowAddSpecial(true)}
              style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: 'var(--accent-color)', color: '#0f1115', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
            >
              + Aggiungi Orario Straordinario
            </button>
          )}
        </div>

        {message.text && (
          <div style={{ padding: '8px', borderRadius: '6px', marginBottom: '10px', fontSize: '12px', backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: message.type === 'error' ? '#fca5a5' : '#6ee7b7' }}>
            {message.text}
          </div>
        )}

        {isAdmin && showAddSpecial && (
          <form onSubmit={handleAddSpecialHours} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: '#11141b', borderRadius: '8px', marginBottom: '15px', border: '1px solid var(--border-color)' }}>
            <h5 style={{ margin: '0 0 5px 0', fontSize: '13px', color: 'var(--accent-color)' }}>Nuovo Orario Straordinario / Prolungato</h5>
            <input 
              type="text" 
              placeholder="Descrizione (es. Orario Natalizio Prolungato)" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              style={inputStyle} 
              required 
            />
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dal:</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Al:</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} required />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Nuovo Orario Apertura:</label>
                <input type="time" value={openingTime} onChange={e => setOpeningTime(e.target.value)} style={inputStyle} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Nuovo Orario Chiusura:</label>
                <input type="time" value={closingTime} onChange={e => setClosingTime(e.target.value)} style={inputStyle} required />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button type="submit" style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: 'var(--accent-color)', color: '#0f1115', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}>Salva</button>
              <button type="button" onClick={() => setShowAddSpecial(false)} style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: 'var(--secondary-color)', color: 'var(--text-main)', border: 'none', fontWeight: '600', cursor: 'pointer', fontSize: '12px' }}>Annulla</button>
            </div>
          </form>
        )}

        {specialHours.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '5px 0' }}>Nessun orario straordinario o prolungato programmato.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {specialHours.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#11141b', border: '1px solid var(--border-color)' }}>
                <div>
                  <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-main)' }}>{item.description}</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {item.start_date === item.end_date ? item.start_date : `Dal ${item.start_date} al ${item.end_date}`}
                  </span>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-color)', marginTop: '2px' }}>
                    Orario Straordinario: {item.opening_time ? item.opening_time.substring(0, 5) : ''} - {item.closing_time ? item.closing_time.substring(0, 5) : ''}
                  </div>
                </div>

                {isAdmin && (
                  <button onClick={() => handleDeleteSpecialHours(item.id)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '14px' }} title="Elimina">
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  backgroundColor: '#0f1115',
  color: '#f3f4f6',
  fontSize: '13px',
  boxSizing: 'border-box'
}
