import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminClosures() {
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
      .gte('end_date', todayString) // Mostra solo le chiusure future o in corso
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
      .insert([{ start_date: startDate, end_date: endDate, reason: reason || 'Ferie Collettive' }])

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

  return (
    <div>
      <h3 className="section-title">Chiusure Collettive e Ferie Salone</h3>

      {/* Form inserimento chiusura */}
      <div className="info-card" style={{ marginBottom: '25px', borderColor: 'var(--barber-blue)' }}>
        <h4 style={{ color: '#64B5F6', marginTop: 0, marginBottom: '15px' }}>📅 Programma Chiusura Salone</h4>
        <form onSubmit={handleAddClosure} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Dal giorno:</label>
              <input 
                type="date" 
                min={todayString}
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Al giorno (incluso):</label>
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
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Motivo (es. Ferie Estive, Natale):</label>
            <input 
              type="text" 
              placeholder="Es. Ferie Estive" 
              value={reason} 
              onChange={e => setReason(e.target.value)} 
              style={inputStyle} 
            />
          </div>

          <button type="submit" style={{ ...btnStyle, backgroundColor: 'var(--barber-blue)', marginTop: '5px' }}>
            Salva Chiusura Collettiva
          </button>
        </form>
      </div>

      {/* Lista chiusure programmate */}
      <h4 style={{ color: '#FFF', marginBottom: '10px' }}>Periodi di Chiusura Attivi</h4>
      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Caricamento...</p>
      ) : closures.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nessuna chiusura collettiva programmata.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {closures.map(c => (
            <div key={c.id} style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(24, 24, 24, 0.85)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <strong style={{ color: '#FFF' }}>{c.reason}</strong>
                <div style={{ fontSize: '12px', color: '#64B5F6', marginTop: '2px' }}>
                  🏖️ Dal {c.start_date} al {c.end_date}
                </div>
              </div>
              <button 
                onClick={() => handleDeleteClosure(c.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--barber-red)', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
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
