import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminClosures({ salonSettings = {} }) {
  const [closures, setClosures] = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)

  const todayString = new Date().toLocaleDateString('sv-SE')

  useEffect(() => {
    fetchClosures()
  }, [])

  async function fetchClosures() {
    setLoading(true)
    const { data } = await supabase
      .from('shop_closures')
      .select('*')
      .gte('end_date', todayString)
      .order('start_date', { ascending: true })

    if (data) setClosures(data)
    setLoading(false)
  }

  async function handleAddClosure(e) {
    e.preventDefault()
    if (!startDate || !endDate) {
      alert("Inserisci sia la data di inizio che la data di fine.")
      return
    }

    if (endDate < startDate) {
      alert("La data di fine non può essere precedente a quella di inizio.")
      return
    }

    const { error } = await supabase
      .from('shop_closures')
      .insert([{ start_date: startDate, end_date: endDate, reason: reason.trim() || 'Ferie Collettive' }])

    if (error) {
      alert("Errore nell'inserimento: " + error.message)
    } else {
      setStartDate('')
      setEndDate('')
      setReason('')
      fetchClosures()
      alert("Periodo di chiusura aggiunto con successo!")
    }
  }

  async function handleDeleteClosure(id) {
    if (!window.confirm("Vuoi rimuovere questo periodo di chiusura?")) return
    const { error } = await supabase.from('shop_closures').delete().eq('id', id)
    if (!error) fetchClosures()
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
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
        <h2 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.35rem', fontWeight: 700 }}>Chiusure Collettive e Ferie Salone</h2>
        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>Pianifica i periodi di chiusura straordinaria o collettiva dell'attività</p>
      </div>

      {/* Form Inserimento Chiusura */}
      <div 
        style={{ 
          marginBottom: '28px', 
          borderLeft: '4px solid var(--primary-color)',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}
      >
        <h3 style={{ color: '#1e293b', marginTop: 0, marginBottom: '18px', fontSize: '1.1rem', fontWeight: 700 }}>📅 Programma Chiusura Salone</h3>
        <form onSubmit={handleAddClosure} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Dal giorno:</label>
              <input 
                type="date" 
                min={todayString}
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Al giorno (incluso):</label>
              <input 
                type="date" 
                min={startDate || todayString}
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                style={inputStyle} 
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Motivo (es. Ferie Estive, Natale):</label>
            <input 
              type="text" 
              placeholder="Es. Ferie Estive" 
              value={reason} 
              onChange={e => setReason(e.target.value)} 
              style={inputStyle} 
            />
          </div>

          <button type="submit" style={{ ...btnStyle, backgroundColor: 'var(--primary-color)', marginTop: '4px', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)' }}>
            Salva Chiusura Collettiva
          </button>
        </form>
      </div>

      {/* Lista Chiusure Programmate */}
      <h3 style={{ color: '#1e293b', marginBottom: '14px', fontSize: '1.1rem', fontWeight: 700 }}>Periodi di Chiusura Attivi</h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px' }}>Caricamento chiusure...</div>
      ) : closures.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '13px' }}>
          Nessuna chiusura collettiva programmata al momento.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {closures.map(c => (
            <div key={c.id} style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div>
                <strong style={{ color: '#1e293b', fontSize: '0.95rem' }}>{c.reason}</strong>
                <div style={{ fontSize: '12px', color: 'var(--primary-color)', marginTop: '4px', fontWeight: 600 }}>
                  🏖️ Dal {formatDate(c.start_date)} al {formatDate(c.end_date)}
                </div>
              </div>
              <button 
                onClick={() => handleDeleteClosure(c.id)}
                style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', fontWeight: 600, padding: '6px' }}
              >
                🗑️ Elimina
              </button>
            </div>
          ))}
        </div>
      )}
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
