import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

// Funzione helper per assegnare un'icona dinamica in base al nome della categoria
const getCategoryIcon = (categoryName) => {
  const name = categoryName.toLowerCase()
  if (name.includes('capelli') || name.includes('taglio')) return '✂️'
  if (name.includes('barba')) return '🧔'
  if (name.includes('prodotto') || name.includes('rivendita')) return '🛍️'
  if (name.includes('estetica') || name.includes('viso') || name.includes('trattamenti')) return '✨'
  if (name.includes('colore') || name.includes('tintura')) return '🎨'
  return '📌' // Icona di default per le altre categorie (es. Generale)
}

export function AdminServices() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  // Riferimento per scrollare verso il form in alto
  const formRef = useRef(null)

  // Stati per il form di creazione/modifica
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Capelli')
  const [price, setPrice] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [type, setType] = useState('service') // 'service' o 'product'

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
      type: type
    }

    if (editingId) {
      // Modifica
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
      // Inserimento nuovo
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

    // Scroll fluido verso il form in alto
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  async function handleDeleteService(id) {
    if (!window.confirm('Sei sicuro di voler eliminare questo servizio?')) return

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id)

    if (error) {
      alert('Impossibile eliminare il servizio (potrebbe essere legato a degli appuntamenti passati): ' + error.message)
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

  // Raggruppamento dei servizi per categoria
  const categoriesMap = services.reduce((acc, service) => {
    const cat = service.category && service.category.trim() !== '' ? service.category : 'Generale';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(service);
    return acc;
  }, {});

  return (
    <div>
      <h3 className="section-title">Gestione Listino Servizi & Prodotti</h3>

      {/* Form Inserimento / Modifica collegato al ref per lo scroll */}
      <div ref={formRef} className="info-card" style={{ marginBottom: '25px', borderColor: editingId ? 'var(--barber-red)' : 'var(--border-color)' }}>
        <h4 style={{ color: '#FFF', marginTop: 0, marginBottom: '15px' }}>
          {editingId ? '✏️ Modifica Servizio / Prodotto' : '➕ Aggiungi Nuovo Servizio o Prodotto'}
        </h4>
        <form onSubmit={handleSaveService} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Nome:</label>
              <input 
                type="text" 
                placeholder="Es. Taglio Classico o Cera" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Tipo:</label>
              <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                <option value="service">Servizio</option>
                <option value="product">Prodotto (Rivendita)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Categoria:</label>
              <input 
                type="text" 
                placeholder="Es. Capelli, Barba, Trattamenti" 
                value={category} 
                onChange={e => setCategory(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Prezzo (€):</label>
              <input 
                type="number" 
                step="0.50" 
                placeholder="Es. 15.00" 
                value={price} 
                onChange={e => setPrice(e.target.value)} 
                style={inputStyle} 
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Durata (min):</label>
              <input 
                type="number" 
                placeholder="Es. 30" 
                value={durationMinutes} 
                onChange={e => setDurationMinutes(e.target.value)} 
                style={inputStyle} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
            <button type="submit" style={{ ...btnStyle, backgroundColor: '#2E7D32', flex: 1 }}>
              {editingId ? 'Salva Modifiche' : 'Aggiungi al Listino'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} style={{ ...btnStyle, backgroundColor: '#444', flex: 0.5 }}>
                Annulla
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Lista Servizi Esistenti Raggruppata per Categoria */}
      <h4 style={{ color: '#FFF', marginBottom: '15px' }}>Listino Attuale ({services.length})</h4>
      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Caricamento servizi...</p>
      ) : services.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nessun servizio trovato nel listino.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(categoriesMap).map(([categoryName, catServices]) => (
            <div key={categoryName}>
              {/* Intestazione Categoria con Icona Dinamica */}
              <div style={{ 
                fontSize: '0.85rem', 
                fontWeight: 'bold', 
                color: 'var(--barber-red)', 
                marginBottom: '10px', 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>{getCategoryIcon(categoryName)}</span> {categoryName}
              </div>

              {/* Servizi della categoria */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {catServices.map(s => (
                  <div key={s.id} style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(24, 24, 24, 0.85)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{s.type === 'product' ? '🧴' : '✂️'}</span>
                        <strong style={{ color: '#FFF', fontSize: '1rem' }}>{s.name}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        💰 <strong>{parseFloat(s.price).toFixed(2)} €</strong> &nbsp;|&nbsp; ⏱️ {s.duration_minutes} min
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => handleEditClick(s)}
                        style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px', color: '#FFF', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ✏️ Modifica
                      </button>
                      <button 
                        onClick={() => handleDeleteService(s.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--barber-red)', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                        title="Elimina"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
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
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'rgba(15, 15, 15, 0.8)',
  color: '#FFF',
  boxSizing: 'border-box',
  fontSize: '14px',
  outline: 'none',
  colorScheme: 'dark'
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
