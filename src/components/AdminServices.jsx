import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const getCategoryIcon = (categoryName) => {
  const name = categoryName.toLowerCase()
  if (name.includes('capelli') || name.includes('taglio')) return '✂️'
  if (name.includes('barba')) return '🧔'
  if (name.includes('prodotto') || name.includes('rivendita')) return '🛍️️'
  if (name.includes('estetica') || name.includes('viso') || name.includes('trattamenti')) return '✨'
  if (name.includes('colore') || name.includes('tintura')) return '🎨'
  return '📌'
}

export function AdminServices({ salonSettings = {} }) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  const formRef = useRef(null)

  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Capelli')
  const [price, setPrice] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [type, setType] = useState('service')

  useEffect(() => {
    fetchServices()

    const channel = supabase
      .channel('admin-services-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => fetchServices())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchServices() {
    setLoading(true)
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      console.error('Errore nel recupero servizi:', error.message)
    } else {
      setServices(data || [])
    }
    setLoading(false)
  }

  async function handleSaveService(e) {
    e.preventDefault()
    if (!name.trim() || !price || !durationMinutes) {
      alert('Compila tutti i campi obbligatori (Nome, Prezzo, Durata).')
      return
    }

    const payload = {
      name: name.trim(),
      category: category.trim(),
      price: parseFloat(price),
      duration_minutes: parseInt(durationMinutes, 10),
      type: type,
      is_bookable: true
    }

    if (editingId) {
      const { error } = await supabase
        .from('services')
        .update(payload)
        .eq('id', editingId)

      if (error) {
        alert('Errore durante l\'aggiornamento: ' + error.message)
      } else {
        resetForm()
        fetchServices()
      }
    } else {
      const { error } = await supabase
        .from('services')
        .insert([payload])

      if (error) {
        alert('Errore durante l\'inserimento: ' + error.message)
      } else {
        resetForm()
        fetchServices()
      }
    }
  }

  function handleEditClick(service) {
    setEditingId(service.id)
    setName(service.name)
    setCategory(service.category || 'Capelli')
    setPrice(service.price)
    setDurationMinutes(service.duration_minutes)
    setType(service.type || 'service')

    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  async function handleToggleStatus(service) {
    const willBeActive = !service.is_bookable

    if (!willBeActive) {
      const todayStr = new Date().toISOString().split('T')[0]

      const { data: futureAppointments, error: checkError } = await supabase
        .from('appointment_services')
        .select(`
          appointment_id,
          appointments!inner (
            id,
            appointment_date,
            status
          )
        `)
        .eq('service_id', service.id)
        .gte('appointments.appointment_date', todayStr)

      if (checkError) {
        console.error('Errore controllo appuntamenti:', checkError)
      } else if (futureAppointments && futureAppointments.length > 0) {
        const activeFutureAppointments = futureAppointments.filter(
          item => item.appointments && item.appointments.status !== 'cancelled'
        )

        if (activeFutureAppointments.length > 0) {
          alert(
            `Impossibile disattivare "${service.name}": risulta associato a ${activeFutureAppointments.length} appuntamento/i futuro/i o odierno/i.`
          )
          return
        }
      }
    }

    const actionText = willBeActive ? 'riattivare' : 'disattivare'
    if (!window.confirm(`Sei sicuro di voler ${actionText} questo elemento?`)) return

    const { error } = await supabase
      .from('services')
      .update({ is_bookable: willBeActive })
      .eq('id', service.id)

    if (error) {
      alert('Errore durante l\'aggiornamento dello stato: ' + error.message)
    } else {
      fetchServices()
    }
  }

  function resetForm() {
    setEditingId(null)
    setName('')
    setCategory('Capelli')
    setPrice('')
    setDurationMinutes('')
    setType('service')
  }

  const filteredServices = services.filter(s => {
    const isSystemExtraTime = 
      (s.name && s.name.toLowerCase().includes('integrazione durata')) || 
      (s.category && s.category.toLowerCase().includes('extra time'));
    
    if (isSystemExtraTime) return false;

    return showInactive ? true : s.is_bookable !== false;
  })

  const categoriesMap = filteredServices.reduce((acc, service) => {
    const cat = service.category && service.category.trim() !== '' ? service.category : 'Generale';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(service);
    return acc;
  }, {});

  return (
    <div style={{
      '--accent-color': '#C5A059',
      '--text-main': '#f3f4f6',
      '--text-muted': '#9ca3af',
      '--border-color': '#2a3241',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '4px',
      color: 'var(--text-main)'
    }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.35rem', fontWeight: 700 }}>Gestione Listino Servizi & Prodotti</h2>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>Organizza l'offerta del salone, i prezzi e la durata dei trattamenti</p>
      </div>

      <div 
        ref={formRef} 
        style={{ 
          marginBottom: '28px', 
          backgroundColor: '#181c24',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          border: '1px solid var(--border-color)',
          borderLeft: `4px solid ${editingId ? '#ef4444' : 'var(--accent-color)'}`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {editingId ? '✏️ Modifica Servizio / Prodotto' : '➕ Aggiungi Nuovo Servizio o Prodotto'}
          </h3>
          {editingId && (
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontWeight: 600 }}>
              Modifica in corso
            </span>
          )}
        </div>

        <form onSubmit={handleSaveService} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '220px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Nome *</label>
              <input 
                type="text" 
                placeholder="Es. Taglio Classico o Cera" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Tipo *</label>
              <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                <option value="service" style={{ backgroundColor: '#181c24', color: '#f3f4f6' }}>Servizio</option>
                <option value="product" style={{ backgroundColor: '#181c24', color: '#f3f4f6' }}>Prodotto (Rivendita)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Categoria</label>
              <input 
                type="text" 
                placeholder="Es. Capelli, Barba, Trattamenti" 
                value={category} 
                onChange={e => setCategory(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Prezzo (€) *</label>
              <input 
                type="number" 
                step="0.50" 
                placeholder="Es. 15.00" 
                value={price} 
                onChange={e => setPrice(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Durata (min) *</label>
              <input 
                type="number" 
                placeholder="Es. 30" 
                value={durationMinutes} 
                onChange={e => setDurationMinutes(e.target.value)} 
                style={inputStyle} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
            <button type="submit" style={{ ...btnStyle, backgroundColor: 'var(--accent-color)', color: '#0f1115', flex: 1, boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
              {editingId ? 'Salva Modifiche' : 'Aggiungi al Listino'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} style={{ ...btnStyle, backgroundColor: '#2a3241', color: 'var(--text-main)', border: '1px solid var(--border-color)', flex: 0.4 }}>
                Annulla
              </button>
            )}
          </div>
        </form>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Listino Attuale</h3>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500 }}>
            <input 
              type="checkbox" 
              checked={showInactive} 
              onChange={e => setShowInactive(e.target.checked)} 
              style={{ cursor: 'pointer' }}
            />
            Mostra anche disattivati
          </label>

          <span style={{ fontSize: '12px', color: 'var(--text-muted)', backgroundColor: '#181c24', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontWeight: 600 }}>
            {filteredServices.length} voci visibili
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Caricamento listino in corso...</div>
      ) : filteredServices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#181c24', borderRadius: '12px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)' }}>
          Nessun servizio trovato nel listino.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(categoriesMap).map(([categoryName, catServices]) => (
            <div key={categoryName}>
              <div style={{ 
                fontSize: '0.8rem', 
                fontWeight: 700, 
                color: 'var(--accent-color)', 
                marginBottom: '10px', 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px' }}>{getCategoryIcon(categoryName)}</span> {categoryName} 
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({catServices.length})</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {catServices.map(s => {
                  const isInactive = s.is_bookable === false;
                  return (
                    <div key={s.id} style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      backgroundColor: '#181c24',
                      border: '1px solid var(--border-color)',
                      opacity: isInactive ? 0.6 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', minWidth: 0 }}>
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '10px', backgroundColor: s.type === 'product' ? 'rgba(126, 34, 206, 0.2)' : 'rgba(3, 105, 161, 0.2)',
                          color: s.type === 'product' ? '#c084fc' : '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '16px', flexShrink: 0
                        }}>
                          {s.type === 'product' ? '🧴' : '✂️'}
                        </div>

                        <div style={{ flex: 1, minWidth: '0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', textDecoration: isInactive ? 'line-through' : 'none' }}>
                              {s.name}
                            </span>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#11141b', color: 'var(--text-muted)', fontWeight: 600, border: '1px solid var(--border-color)' }}>
                              {s.type === 'product' ? 'Prodotto' : 'Servizio'}
                            </span>
                            {isInactive && (
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontWeight: 600 }}>
                                Disattivato
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span>💰 <strong style={{ color: 'var(--text-main)' }}>{parseFloat(s.price).toFixed(2)} €</strong></span>
                            <span>⏱️ {s.duration_minutes} min</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid #222834', paddingTop: '12px' }}>
                        <button 
                          onClick={() => handleEditClick(s)}
                          title="Modifica"
                          style={{ background: '#11141b', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '7px 12px', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          ✏️ Modifica
                        </button>
                        <button 
                          onClick={() => handleToggleStatus(s)}
                          title={isInactive ? "Riattiva nel listino" : "Disattiva servizio"}
                          style={{ 
                            background: '#11141b', 
                            border: '1px solid var(--border-color)', 
                            borderRadius: '6px', 
                            padding: '7px 12px', 
                            color: isInactive ? '#4ade80' : '#fbbf24', 
                            cursor: 'pointer', 
                            fontSize: '12px', 
                            fontWeight: 600 
                          }}
                        >
                          {isInactive ? '✅ Attiva' : '⏸️️ Disattiva'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
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
  border: '1px solid var(--border-color)',
  backgroundColor: '#11141b',
  color: 'var(--text-main)',
  boxSizing: 'border-box',
  fontSize: '14px',
  outline: 'none',
  transition: 'border-color 0.2s'
}

const btnStyle = {
  padding: '11px 16px',
  borderRadius: '8px',
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '13px',
  transition: 'background 0.2s'
}
