import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminClients({ onSelectClientForBooking, salonSettings = {} }) {
  const [appUsers, setAppUsers] = useState([])
  const [offlineClients, setOfflineClients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState('app')

  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchAllClients()

    const channel = supabase
      .channel('public-admin-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offline_clients' }, () => fetchAllClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchAllClients())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchAllClients() {
    setLoading(true)
    try {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, is_active')
        .order('first_name', { ascending: true })

      if (profilesData) {
        setAppUsers(profilesData.map(u => ({
          ...u,
          type: 'app',
          is_active: u.is_active !== false,
          displayName: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email
        })).sort((a, b) => a.displayName.localeCompare(b.displayName)))
      }

      const { data: offlineData } = await supabase
        .from('offline_clients')
        .select('*')
        .order('full_name', { ascending: true })

      if (offlineData) {
        setOfflineClients(offlineData.map(c => ({
          ...c,
          type: 'offline',
          displayName: c.full_name
        })).sort((a, b) => a.displayName.localeCompare(b.displayName)))
      }
    } catch (err) {
      console.error("Errore caricamento clienti:", err.message)
    } finally {
      setLoading(false)
    }
  }

  const term = searchTerm.toLowerCase()

  const filteredAppUsers = appUsers.filter(client => {
    const nameMatch = (client.displayName || '').toLowerCase().includes(term)
    const phoneMatch = (client.phone || '').toLowerCase().includes(term)
    const emailMatch = (client.email || '').toLowerCase().includes(term)
    return nameMatch || phoneMatch || emailMatch
  })

  const filteredOfflineClients = offlineClients.filter(client => {
    const nameMatch = (client.displayName || '').toLowerCase().includes(term)
    const phoneMatch = (client.phone || '').toLowerCase().includes(term)
    const notesMatch = (client.notes || '').toLowerCase().includes(term)
    return nameMatch || phoneMatch || notesMatch
  })

  async function handleToggleAppUserStatus(userId, currentStatus, clientName) {
    const actionText = currentStatus ? "disattivare (revocare l'accesso a)" : "riattivare"
    if (!window.confirm(`Sei sicuro di voler ${actionText} l'utente "${clientName}"?`)) return

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId)

      if (error) throw error
      fetchAllClients()
    } catch (err) {
      alert("Errore durante l'aggiornamento dello stato: " + err.message)
    }
  }

  async function handleSaveOfflineClient(e) {
    e.preventDefault()
    if (!fullName.trim()) {
      alert("Il nome del cliente è obbligatorio.")
      return
    }

    try {
      if (editingClient) {
        const { error } = await supabase
          .from('offline_clients')
          .update({
            full_name: fullName.trim(),
            phone: phone.trim() || null,
            notes: notes.trim() || null
          })
          .eq('id', editingClient.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('offline_clients')
          .insert([{
            full_name: fullName.trim(),
            phone: phone.trim() || 'N/D',
            notes: notes.trim() || null
          }])

        if (error) throw error
      }

      closeModal()
      fetchAllClients()
    } catch (err) {
      alert("Errore durante il salvataggio: " + err.message)
    }
  }

  async function handleDeleteOfflineClient(clientId) {
    if (!window.confirm("Sei sicuro di voler eliminare questo cliente dalla rubrica?")) return

    const { error } = await supabase
      .from('offline_clients')
      .delete()
      .eq('id', clientId)

    if (error) {
      alert("Errore eliminazione: " + error.message)
    } else {
      fetchAllClients()
    }
  }

  function openNewModal() {
    setEditingClient(null)
    setFullName('')
    setPhone('')
    setNotes('')
    setShowModal(true)
  }

  function openEditModal(client) {
    if (client.type === 'app') {
      alert("Gli utenti registrati all'app gestiscono autonomamente il proprio profilo.")
      return
    }
    setEditingClient(client)
    setFullName(client.full_name || '')
    setPhone(client.phone || '')
    setNotes(client.notes || '')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingClient(null)
  }

  const totalCount = appUsers.length + offlineClients.length

  // Funzione d'utilità per generare le iniziali dell'avatar
  function getInitials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <div style={{
      '--primary-color': salonSettings.primary_color || '#2563eb',
      '--accent-color': salonSettings.accent_color || '#D4AF37',
      '--secondary-color': salonSettings.secondary_color || '#1E293B',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '4px'
    }}>
      {/* Header Sezione */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.35rem', fontWeight: 700 }}>Gestione Clienti</h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>Monitora gli utenti registrati all'app e la rubrica clienti offline ({totalCount} totali)</p>
        </div>
        <button 
          onClick={openNewModal}
          style={{
            backgroundColor: 'var(--primary-color)',
            color: '#FFF',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '13px',
            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
        >
          <span style={{ fontSize: '15px' }}>+</span> Nuovo Cliente Offline
        </button>
      </div>

      {/* Sistema di Tab Moderno (Pill Style) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('app')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'app' ? '#ffffff' : 'transparent',
            color: activeTab === 'app' ? 'var(--secondary-color)' : '#64748b',
            fontWeight: activeTab === 'app' ? 600 : 500,
            cursor: 'pointer',
            fontSize: '13px',
            boxShadow: activeTab === 'app' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          📱 Utenti App <span style={{ marginLeft: '6px', backgroundColor: activeTab === 'app' ? 'var(--primary-color)' : '#e2e8f0', color: activeTab === 'app' ? '#fff' : '#475569', padding: '1px 6px', borderRadius: '10px', fontSize: '11px' }}>{appUsers.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('offline')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'offline' ? '#ffffff' : 'transparent',
            color: activeTab === 'offline' ? 'var(--secondary-color)' : '#64748b',
            fontWeight: activeTab === 'offline' ? 600 : 500,
            cursor: 'pointer',
            fontSize: '13px',
            boxShadow: activeTab === 'offline' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          📒 Rubrica Offline <span style={{ marginLeft: '6px', backgroundColor: activeTab === 'offline' ? '#16a34a' : '#e2e8f0', color: activeTab === 'offline' ? '#fff' : '#475569', padding: '1px 6px', borderRadius: '10px', fontSize: '11px' }}>{offlineClients.length}</span>
        </button>
      </div>

      {/* Barra di Ricerca */}
      <div style={{ marginBottom: '24px', position: 'relative' }}>
        <input 
          type="text"
          placeholder={activeTab === 'app' ? "Cerca per nome, telefono o email utente app..." : "Cerca per nome, telefono o note cliente offline..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px 12px 40px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#1e293b',
            outline: 'none',
            fontSize: '14px',
            boxSizing: 'border-box',
            boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
            transition: 'border-color 0.2s'
          }}
        />
        <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '15px' }}>
          🔍
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Caricamento in corso...</div>
      ) : (
        <div>
          {/* TAB 1: UTENTI APP */}
          {activeTab === 'app' && (
            <div>
              {filteredAppUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                  Nessun utente app trovato.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredAppUsers.map(client => (
                    <div key={`app-${client.id}`} style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: client.is_active ? '#ffffff' : '#fef2f2',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                      opacity: client.is_active ? 1 : 0.85,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                        {/* Avatar con iniziali */}
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '50%', backgroundColor: client.is_active ? '#e0f2fe' : '#fee2e2',
                          color: client.is_active ? '#0369a1' : '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '14px', flexShrink: 0
                        }}>
                          {getInitials(client.displayName)}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{client.displayName}</span>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, border: '1px solid #e2e8f0' }}>
                              App
                            </span>
                            {!client.is_active && (
                              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>
                                🔒 Disattivato
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span>📞 {client.phone || 'Nessun telefono'}</span>
                            <span>✉️ {client.email || 'Nessuna email'}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button 
                          onClick={() => handleToggleAppUserStatus(client.id, client.is_active, client.displayName)}
                          title={client.is_active ? "Disattiva accesso" : "Riattiva accesso"}
                          style={{ 
                            background: '#ffffff', 
                            border: '1px solid #cbd5e1', 
                            color: client.is_active ? '#dc2626' : '#16a34a', 
                            padding: '7px 12px', 
                            borderRadius: '6px', 
                            cursor: 'pointer', 
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          {client.is_active ? 'Disattiva' : 'Riattiva'}
                        </button>

                        {onSelectClientForBooking && client.is_active && (
                          <button 
                            onClick={() => onSelectClientForBooking(client)}
                            title="Prenota per questo cliente"
                            style={{ backgroundColor: 'var(--primary-color)', color: '#FFF', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                          >
                            Prenota
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLIENTI OFFLINE */}
          {activeTab === 'offline' && (
            <div>
              {filteredOfflineClients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                  Nessun cliente offline trovato nella rubrica.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredOfflineClients.map(client => (
                    <div key={`offline-${client.id}`} style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s ease'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                        {/* Avatar con iniziali */}
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#dcfce7',
                          color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '14px', flexShrink: 0
                        }}>
                          {getInitials(client.displayName)}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{client.displayName}</span>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                              Offline
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span>📞 {client.phone || 'Nessun telefono'}</span>
                            {client.notes && <span style={{ fontStyle: 'italic', color: '#d97706' }}>Note: {client.notes}</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button 
                          onClick={() => openEditModal(client)}
                          title="Modifica"
                          style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          ✏️ Modifica
                        </button>
                        <button 
                          onClick={() => handleDeleteOfflineClient(client.id)}
                          title="Elimina"
                          style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#dc2626', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          🗑️
                        </button>
                        {onSelectClientForBooking && (
                          <button 
                            onClick={() => onSelectClientForBooking(client)}
                            title="Prenota per questo cliente"
                            style={{ backgroundColor: 'var(--primary-color)', color: '#FFF', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                          >
                            Prenota
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modale Professionale */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 2000, padding: '20px', boxSizing: 'border-box'
        }}>
          <div style={{
            backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px',
            padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: '#1e293b', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                {editingClient ? 'Modifica Cliente Offline' : 'Censisci Nuovo Cliente Offline'}
              </h3>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={handleSaveOfflineClient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Nome e Cognome *</label>
                <input 
                  type="text" required placeholder="Es: Mario Rossi" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} style={modalInputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Telefono</label>
                <input 
                  type="text" placeholder="Es: 3331234567" value={phone}
                  onChange={(e) => setPhone(e.target.value)} style={modalInputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>Note</label>
                <textarea 
                  placeholder="Note opzionali sulle preferenze o annotazioni..." value={notes}
                  onChange={(e) => setNotes(e.target.value)} style={{ ...modalInputStyle, height: '90px', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={closeModal} style={{ flex: 1, padding: '11px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>Annulla</button>
                <button type="submit" style={{ flex: 1, padding: '11px', backgroundColor: 'var(--primary-color)', color: '#FFF', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '13px', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)' }}>Salva Cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const modalInputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc', color: '#1e293b', boxSizing: 'border-box', outline: 'none', fontSize: '14px',
  transition: 'border-color 0.2s'
}
