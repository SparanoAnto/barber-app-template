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
  const [phonePrefix, setPhonePrefix] = useState('+39')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchAllClients()

    const channel = supabase
      .channel('public-admin-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offline_clients' }, () => fetchAllClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchAllClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => fetchAllClients())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchAllClients() {
    setLoading(true)
    try {
      const todayStr = new Date().toLocaleDateString('sv-SE')
      const nowTimeStr = new Date().toTimeString().slice(0, 5)

      // 1. Carica profili app
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, is_active, role, is_owner')
        .neq('role', 'admin')
        .neq('is_owner', true)
        .order('first_name', { ascending: true })

      // 2. Carica rubrica offline
      const { data: offlineData } = await supabase
        .from('offline_clients')
        .select('*')
        .order('full_name', { ascending: true })

      // 3. Carica tutti gli appuntamenti futuri non cancellati per calcolare il "prossimo appuntamento"
      const { data: futureApps } = await supabase
        .from('appointments')
        .select('id, user_id, offline_client_id, appointment_date, start_time')
        .gte('appointment_date', todayStr)
        .neq('status', 'cancelled')
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true })

      // Filtra solo quelli realmente futuri (oggi ma orario successivo o date successive)
      const validFutureApps = (futureApps || []).filter(app => {
        if (app.appointment_date > todayStr) return true
        if (app.appointment_date === todayStr && app.start_time > nowTimeStr) return true
        return false
      })

      // Mappa per trovare il primo appuntamento per ogni utente app o cliente offline
      const nextAppMapApp = {}
      const nextAppMapOffline = {}

      validFutureApps.forEach(app => {
        if (app.user_id && !nextAppMapApp[app.user_id]) {
          nextAppMapApp[app.user_id] = app
        }
        if (app.offline_client_id && !nextAppMapOffline[app.offline_client_id]) {
          nextAppMapOffline[app.offline_client_id] = app
        }
      })

      if (profilesData) {
        setAppUsers(profilesData.map(u => ({
          ...u,
          type: 'app',
          is_active: u.is_active !== false,
          displayName: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          nextAppointment: nextAppMapApp[u.id] || null
        })).sort((a, b) => a.displayName.localeCompare(b.displayName)))
      }

      if (offlineData) {
        setOfflineClients(offlineData.map(c => ({
          ...c,
          type: 'offline',
          is_active: c.is_active !== false,
          displayName: c.full_name,
          nextAppointment: nextAppMapOffline[c.id] || null
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
    if (!client.is_active) return false
    const nameMatch = (client.displayName || '').toLowerCase().includes(term)
    const phoneMatch = (client.phone || '').toLowerCase().includes(term)
    const notesMatch = (client.notes || '').toLowerCase().includes(term)
    return nameMatch || phoneMatch || notesMatch
  })

  async function handleToggleAppUserStatus(userId, currentStatus, clientName) {
    if (currentStatus) {
      const todayStr = new Date().toLocaleDateString('sv-SE')
      const nowTimeStr = new Date().toTimeString().slice(0, 5)

      const { data: futureApps, error: appError } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time')
        .eq('user_id', userId)
        .gte('appointment_date', todayStr)
        .neq('status', 'cancelled')

      if (appError) {
        alert("Errore durante il controllo degli appuntamenti: " + appError.message)
        return
      }

      const trulyFutureApps = (futureApps || []).filter(app => {
        if (app.appointment_date > todayStr) return true
        if (app.appointment_date === todayStr && app.start_time > nowTimeStr) return true
        return false
      })

      if (trulyFutureApps.length > 0) {
        alert(`Impossibile disattivare l'utente "${clientName}". Ha ${trulyFutureApps.length} appuntamento/i futuro/i programmato/i.`)
        return
      }
    }

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

  async function handleToggleOfflineClientStatus(clientId, currentStatus, clientName) {
    if (currentStatus) {
      const todayStr = new Date().toLocaleDateString('sv-SE')
      const nowTimeStr = new Date().toTimeString().slice(0, 5)

      const { data: futureApps, error: appError } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time')
        .eq('offline_client_id', clientId)
        .gte('appointment_date', todayStr)
        .neq('status', 'cancelled')

      if (appError) {
        alert("Errore durante il controllo degli appuntamenti: " + appError.message)
        return
      }

      const trulyFutureApps = (futureApps || []).filter(app => {
        if (app.appointment_date > todayStr) return true
        if (app.appointment_date === todayStr && app.start_time > nowTimeStr) return true
        return false
      })

      if (trulyFutureApps.length > 0) {
        alert(`Impossibile disattivare il cliente offline "${clientName}". Ha ${trulyFutureApps.length} appuntamento/i futuro/i programmato/i.`)
        return
      }
    }

    const actionText = currentStatus ? "disattivare" : "riattivare"
    if (!window.confirm(`Sei sicuro di voler ${actionText} il cliente offline "${clientName}"?`)) return

    try {
      const { error } = await supabase
        .from('offline_clients')
        .update({ is_active: !currentStatus })
        .eq('id', clientId)

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

    let formattedPhone = null
    const rawPhone = phone.trim()
    if (rawPhone) {
      const numericPhone = rawPhone.replace(/[^0-9]/g, '')
      if (numericPhone.length > 0) {
        formattedPhone = `${phonePrefix}${numericPhone}`
      }
    }

    try {
      if (editingClient) {
        const { error } = await supabase
          .from('offline_clients')
          .update({
            full_name: fullName.trim(),
            phone: formattedPhone,
            notes: notes.trim() || null
          })
          .eq('id', editingClient.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('offline_clients')
          .insert([{
            full_name: fullName.trim(),
            phone: formattedPhone || 'N/D',
            notes: notes.trim() || null,
            is_active: true
          }])

        if (error) throw error
      }

      closeModal()
      fetchAllClients()
    } catch (err) {
      alert("Errore durante il salvataggio: " + err.message)
    }
  }

  function openNewModal() {
    setEditingClient(null)
    setFullName('')
    setPhonePrefix('+39')
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
    setNotes(client.notes || '')

    // Estrae prefisso e numero se presenti
    const fullPhone = client.phone || ''
    if (fullPhone.startsWith('+')) {
      const knownPrefixes = ['+39', '+41', '+33', '+49', '+34', '+44']
      const foundPrefix = knownPrefixes.find(p => fullPhone.startsWith(p))
      if (foundPrefix) {
        setPhonePrefix(foundPrefix)
        setPhone(fullPhone.replace(foundPrefix, ''))
      } else {
        setPhonePrefix('+39')
        setPhone(fullPhone)
      }
    } else {
      setPhonePrefix('+39')
      setPhone(fullPhone === 'N/D' ? '' : fullPhone)
    }

    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingClient(null)
  }

  function formatDateIt(dateStr) {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  const activeOfflineCount = offlineClients.filter(c => c.is_active).length
  const totalCount = appUsers.length + activeOfflineCount

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
      position: 'relative',
      zIndex: 1,
      '--accent-color': '#C5A059',
      '--text-main': '#f3f4f6',
      '--text-muted': '#9ca3af',
      '--border-color': '#2a3241',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '4px',
      color: 'var(--text-main)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.35rem', fontWeight: 700 }}>Gestione Clienti</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>Monitora gli utenti registrati all'app e la rubrica clienti offline ({totalCount} totali)</p>
        </div>
        <button 
          onClick={openNewModal}
          style={{
            backgroundColor: 'var(--accent-color)', color: '#0f1115', border: 'none',
            padding: '10px 18px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
            fontSize: '13px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <span style={{ fontSize: '15px' }}>+</span> Nuovo Cliente Offline
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', backgroundColor: '#181c24', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('app')}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: 'none',
            backgroundColor: activeTab === 'app' ? '#222834' : 'transparent',
            color: activeTab === 'app' ? 'var(--text-main)' : 'var(--text-muted)',
            fontWeight: activeTab === 'app' ? 600 : 500, cursor: 'pointer', fontSize: '13px',
            boxShadow: activeTab === 'app' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
          }}
        >
          📱 Utenti App <span style={{ marginLeft: '6px', backgroundColor: activeTab === 'app' ? 'var(--accent-color)' : '#2a3241', color: activeTab === 'app' ? '#0f1115' : 'var(--text-muted)', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>{appUsers.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('offline')}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: 'none',
            backgroundColor: activeTab === 'offline' ? '#222834' : 'transparent',
            color: activeTab === 'offline' ? 'var(--text-main)' : 'var(--text-muted)',
            fontWeight: activeTab === 'offline' ? 600 : 500, cursor: 'pointer', fontSize: '13px',
            boxShadow: activeTab === 'offline' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
          }}
        >
          📒 Rubrica Offline <span style={{ marginLeft: '6px', backgroundColor: activeTab === 'offline' ? '#4ade80' : '#2a3241', color: activeTab === 'offline' ? '#0f1115' : 'var(--text-muted)', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>{activeOfflineCount}</span>
        </button>
      </div>

      <div style={{ marginBottom: '24px', position: 'relative' }}>
        <input 
          type="text"
          placeholder={activeTab === 'app' ? "Cerca per nome, telefono o email utente app..." : "Cerca per nome, telefono o note cliente offline..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%', padding: '12px 16px 12px 40px', borderRadius: '10px',
            border: '1px solid var(--border-color)', backgroundColor: '#181c24', color: 'var(--text-main)',
            outline: 'none', fontSize: '14px', boxSizing: 'border-box'
          }}
        />
        <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '15px' }}>
          🔍
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Caricamento in corso...</div>
      ) : (
        <div>
          {activeTab === 'app' && (
            <div>
              {filteredAppUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#181c24', borderRadius: '12px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)' }}>
                  Nessun utente app trovato.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredAppUsers.map(client => (
                    <div key={`app-${client.id}`} style={{
                      padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)',
                      backgroundColor: '#181c24',
                      display: 'flex', flexDirection: 'column', gap: '14px', opacity: client.is_active ? 1 : 0.75,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', minWidth: 0 }}>
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '50%', backgroundColor: client.is_active ? '#1e293b' : '#3f2222',
                          color: client.is_active ? 'var(--accent-color)' : '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '14px', flexShrink: 0, border: '1px solid var(--border-color)'
                        }}>
                          {getInitials(client.displayName)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{client.displayName}</span>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#222834', color: 'var(--text-muted)', fontWeight: 600 }}>App</span>
                            {!client.is_active && (
                              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#451a03', color: '#fca5a5', fontWeight: 600 }}>🔒 Disattivato</span>
                            )}
                            {client.nextAppointment && (
                              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#143825', color: '#4ade80', border: '1px solid #1e462b', fontWeight: 600 }}>
                                📅 Prossimo: {formatDateIt(client.nextAppointment.appointment_date)} alle {client.nextAppointment.start_time.slice(0, 5)}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span>📞 {client.phone || 'Nessun telefono'}</span>
                            <span>✉️ {client.email || 'Nessuna email'}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid #222834', paddingTop: '12px' }}>
                        <button 
                          onClick={() => handleToggleAppUserStatus(client.id, client.is_active, client.displayName)}
                          style={{ background: '#11141b', border: '1px solid var(--border-color)', color: client.is_active ? '#fca5a5' : '#4ade80', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          {client.is_active ? 'Disattiva' : 'Riattiva'}
                        </button>
                        {onSelectClientForBooking && client.is_active && (
                          <button 
                            onClick={() => onSelectClientForBooking(client)}
                            style={{ backgroundColor: 'var(--accent-color)', color: '#0f1115', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
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

          {activeTab === 'offline' && (
            <div>
              {filteredOfflineClients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#181c24', borderRadius: '12px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)' }}>
                  Nessun cliente offline attivo trovato nella rubrica.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredOfflineClients.map(client => (
                    <div key={`offline-${client.id}`} style={{
                      padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)',
                      backgroundColor: '#181c24', display: 'flex', flexDirection: 'column', gap: '14px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', minWidth: 0 }}>
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#143825',
                          color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '14px', flexShrink: 0, border: '1px solid #1e462b'
                        }}>
                          {getInitials(client.displayName)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{client.displayName}</span>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#143825', color: '#4ade80', fontWeight: 600 }}>Offline</span>
                            {client.nextAppointment && (
                              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#143825', color: '#4ade80', border: '1px solid #1e462b', fontWeight: 600 }}>
                                📅 Prossimo: {formatDateIt(client.nextAppointment.appointment_date)} alle {client.nextAppointment.start_time.slice(0, 5)}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span>📞 {client.phone || 'Nessun telefono'}</span>
                            {client.notes && <span style={{ fontStyle: 'italic', color: '#fbbf24' }}>Note: {client.notes}</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid #222834', paddingTop: '12px' }}>
                        <button 
                          onClick={() => openEditModal(client)}
                          style={{ background: '#11141b', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          ✏️ Modifica
                        </button>
                        <button 
                          onClick={() => handleToggleOfflineClientStatus(client.id, client.is_active, client.displayName)}
                          title="Disattiva cliente"
                          style={{ background: '#11141b', border: '1px solid var(--border-color)', color: '#fca5a5', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          🔒 Disattiva
                        </button>
                        {onSelectClientForBooking && (
                          <button 
                            onClick={() => onSelectClientForBooking(client)}
                            style={{ backgroundColor: 'var(--accent-color)', color: '#0f1115', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
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

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(11, 14, 19, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 2000, padding: '20px', boxSizing: 'border-box'
        }}>
          <div style={{
            backgroundColor: '#181c24', border: '1px solid var(--border-color)', borderRadius: '16px',
            padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: 'var(--text-main)', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                {editingClient ? 'Modifica Cliente Offline' : 'Censisci Nuovo Cliente Offline'}
              </h3>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <form onSubmit={handleSaveOfflineClient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Nome e Cognome *</label>
                <input 
                  type="text" required placeholder="Es: Mario Rossi" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} style={modalInputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Telefono</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select 
                    value={phonePrefix} 
                    onChange={e => setPhonePrefix(e.target.value)}
                    style={{
                      ...modalInputStyle,
                      flex: '0 0 85px',
                      padding: '11px 4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <option value="+39">🇮🇹 +39</option>
                    <option value="+41">🇨🇭 +41</option>
                    <option value="+33">🇫🇷 +33</option>
                    <option value="+49">🇩🇪 +49</option>
                    <option value="+34">🇪🇸 +34</option>
                    <option value="+44">🇬🇧 +44</option>
                  </select>

                  <input 
                    type="tel" 
                    placeholder="Es: 3331234567" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)} 
                    style={{ ...modalInputStyle, flex: 1 }} 
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Note</label>
                <textarea 
                  placeholder="Note opzionali sulle preferenze o annotazioni..." value={notes}
                  onChange={(e) => setNotes(e.target.value)} style={{ ...modalInputStyle, height: '90px', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={closeModal} style={{ flex: 1, padding: '11px', backgroundColor: '#222834', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>Annulla</button>
                <button type="submit" style={{ flex: 1, padding: '11px', backgroundColor: 'var(--accent-color)', color: '#0f1115', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>Salva Cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const modalInputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid var(--border-color)',
  backgroundColor: '#11141b', color: 'var(--text-main)', boxSizing: 'border-box', outline: 'none', fontSize: '14px',
  transition: 'border-color 0.2s'
}
