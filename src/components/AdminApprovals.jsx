import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminApprovals({ onApprovalCountChange }) {
  const [pendingUsers, setPendingUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let subscription = null

    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await fetchPendingUsers()
      } else {
        setLoading(false)
      }

      subscription = supabase
        .channel('public:profiles_approvals')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            fetchPendingUsers()
            if (onApprovalCountChange) onApprovalCountChange()
          }
        )
        .subscribe()
    }

    init()

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription)
      }
    }
  }, [])

  async function fetchPendingUsers() {
    setLoading(true)

    // Filtriamo direttamente sul DB dove is_approved è false (o nullo)
    // Sfruttando la struttura booleana definita nel tuo schema
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or('is_approved.is.false,is_approved.is.null')
      .order('first_name', { ascending: true })

    if (error) {
      console.error('Errore recupero utenti:', error.message)
      alert('Errore Supabase: ' + error.message)
      setPendingUsers([])
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
      setPendingUsers(prev => prev.filter(user => user.id !== userId))
      if (onApprovalCountChange) onApprovalCountChange()
    }
  }

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
      setPendingUsers(prev => prev.filter(user => user.id !== userId))
      if (onApprovalCountChange) onApprovalCountChange()
    }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Caricamento richieste...</p>

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '10px' }}>
        <h4 style={{ color: '#ffffff', fontSize: '1.1rem', margin: 0 }}>
          Richieste in Attesa <span style={{ color: 'var(--barber-blue)', fontWeight: 'bold' }}>({pendingUsers.length})</span>
        </h4>
        <button
          onClick={fetchPendingUsers}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            cursor: 'pointer'
          }}
        >
          🔄 Aggiorna
        </button>
      </div>

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
                  fontSize: '0.8rem'
                }}
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
                  fontSize: '0.8rem'
                }}
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
