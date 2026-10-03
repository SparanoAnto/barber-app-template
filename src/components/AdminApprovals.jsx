import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminApprovals({ onApprovalCountChange, salonSettings = {} }) {
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

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or('is_approved.is.false,is_approved.is.null')
      .order('first_name', { ascending: true })

    if (error) {
      console.error('Errore recupero utenti:', error.message)
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '14px' }}>
        Caricamento richieste in corso...
      </div>
    )
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
      {/* Header Sezione */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
        <div>
          <h4 style={{ color: 'var(--text-main)', fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>
            Richieste in Attesa <span style={{ color: 'var(--accent-color)', fontWeight: 700 }}>({pendingUsers.length})</span>
          </h4>
          <p style={{ margin: '3px 0 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>Gestisci e approva i nuovi utenti registrati</p>
        </div>
        <button
          onClick={fetchPendingUsers}
          style={{
            backgroundColor: '#181c24',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'background 0.2s'
          }}
        >
          🔄 Aggiorna
        </button>
      </div>

      {pendingUsers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', backgroundColor: '#181c24', borderRadius: '12px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '13px' }}>
          Nessuna richiesta da approvare al momento.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pendingUsers.map(user => (
            <div
              key={user.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                backgroundColor: '#181c24',
                border: '1px solid var(--border-color)',
                borderLeft: '4px solid var(--accent-color)',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }}
            >
              <div>
                <p style={{ margin: '0 0 4px 0', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  {user.first_name} {user.last_name}
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{user.email}</p>
                {user.phone && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    📞 {user.phone}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                <button
                  onClick={() => rejectUser(user.id, `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Utente')}
                  style={{
                    backgroundColor: '#3f2222',
                    color: '#fca5a5',
                    border: '1px solid #7f1d1d',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px',
                    transition: 'background 0.2s'
                  }}
                >
                  Rifiuta
                </button>

                <button
                  onClick={() => approveUser(user.id)}
                  style={{
                    backgroundColor: 'var(--accent-color)',
                    color: '#0f1115',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    transition: 'background 0.2s'
                  }}
                >
                  Approva
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
