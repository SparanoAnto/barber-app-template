import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminApprovals({ onApprovalChange }) {
  const [pendingUsers, setPendingUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPendingUsers()
  }, [])

  async function fetchPendingUsers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_approved', false)
      .order('created_at', { ascending: false }) // 1. Ordinamento cronologico decrescente

    if (error) {
      console.error('Errore recupero utenti:', error.message)
    } else {
      setPendingUsers(data || [])
    }
    setLoading(false)
  }

  async function approveUser(userId) {
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', userId)

    if (error) {
      alert('Errore nell\'approvazione: ' + error.message)
    } else {
      // Rimuove l'utente approvato dalla lista locale
      setPendingUsers(prev => prev.filter(user => user.id !== userId))
      // Notifica ad App.jsx di aggiornare il contatore del badge
      if (onApprovalChange) onApprovalChange()
    }
  }

  // 2. Funzione per Rifiutare/Eliminare la richiesta
  async function rejectUser(userId, userName) {
    const confirmDelete = window.confirm(
      `Sei sicuro di voler rifiutare la richiesta di ${userName}?\nIl profilo verrà rimosso.`
    )

    if (!confirmDelete) return

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (error) {
      alert('Errore durante il rifiuto della richiesta: ' + error.message)
    } else {
      // Rimuove l'utente rifiutato dalla lista locale
      setPendingUsers(prev => prev.filter(user => user.id !== userId))
      // Notifica ad App.jsx di aggiornare il contatore del badge
      if (onApprovalChange) onApprovalChange()
    }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Caricamento richieste...</p>

  return (
    <div style={{ marginTop: '10px' }}>
      <h4 style={{ 
        borderBottom: '1px solid var(--border-color)', 
        paddingBottom: '10px', 
        color: '#ffffff',
        fontSize: '1.1rem',
        marginTop: 0 
      }}>
        Richieste in Attesa <span style={{ color: 'var(--barber-blue)', fontWeight: 'bold' }}>({pendingUsers.length})</span>
      </h4>

      {pendingUsers.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Nessuna richiesta da approvare.</p>
      ) : (
        pendingUsers.map(user => (
          <div
            key={user.id}
            className="info-card"
            style={{
              marginBottom: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              padding: '15px'
            }}
          >
            <div>
              <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '1rem', color: '#ffffff' }}>
                {user.first_name} {user.last_name}
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{user.email}</p>
              {user.phone && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#888' }}>
                  📞 {user.phone}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => rejectUser(user.id, `${user.first_name} ${user.last_name}`)}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--barber-red)',
                  border: '1px solid var(--barber-red)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  transition: 'transform 0.1s ease, background-color 0.2s ease',
                  flexShrink: 0
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Rifiuta
              </button>

              <button
                onClick={() => approveUser(user.id)}
                style={{
                  backgroundColor: '#2e7d32',
                  color: '#FFF',
                  border: 'none',
                  padding: '9px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  letterSpacing: '0.5px',
                  transition: 'transform 0.1s ease, background-color 0.2s ease',
                  flexShrink: 0
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Approva
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
