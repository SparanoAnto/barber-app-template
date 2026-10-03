import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminAdvancedReports({ isOwner = false, salonSettings = {} }) {
  const [loading, setLoading] = useState(true)
  const [churnDays, setChurnDays] = useState(60) // Giorni di inattività per considerare un cliente a rischio
  
  const [dataReport, setDataReport] = useState({
    inactiveClients: [],
    lostRevenuePotential: 0,
    cancellationsCount: 0,
    cancellationsLostValue: 0,
    retentionRate: 0,
    totalUniqueClients: 0
  })

  useEffect(() => {
    fetchAdvancedData()
  }, [churnDays])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount || 0)
  }

  async function fetchAdvancedData() {
    setLoading(true)

    try {
      // 1. Recuperiamo tutti gli appuntamenti passati per calcolare la retention e i clienti inattivi
      const { data: appointments, error: appError } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_date,
          total_price,
          user_id,
          offline_client_id,
          custom_client_name,
          status,
          profiles ( id, full_name, email, phone ),
          offline_clients ( id, full_name, phone )
        `)

      if (appError) throw appError

      // 2. Recuperiamo specificamente gli appuntamenti cancellati per calcolare i No-Show / Perdite
      const cancelledAppointments = (appointments || []).filter(app => app.status === 'cancelled')
      const validAppointments = (appointments || []).filter(app => app.status !== 'cancelled')

      const now = new Date()
      
      // Mappiamo l'ultimo accesso di ogni cliente
      const clientMap = {}

      validAppointments.forEach(app => {
        // Identifichiamo univocamente il cliente (tramite user_id, offline_client_id o nome custom)
        const clientId = app.user_id || app.offline_client_id || app.custom_client_name
        if (!clientId) return

        let clientName = 'Cliente Sconosciuto'
        let clientPhone = ''
        if (app.profiles?.full_name) clientName = app.profiles.full_name
        else if (app.offline_clients?.full_name) clientName = app.offline_clients.full_name
        else if (app.custom_client_name) clientName = app.custom_client_name

        if (app.profiles?.phone) clientPhone = app.profiles.phone
        else if (app.offline_clients?.phone) clientPhone = app.offline_clients.phone

        const appDate = new Date(app.appointment_date)

        if (!clientMap[clientId]) {
          clientMap[clientId] = {
            name: clientName,
            phone: clientPhone,
            lastVisit: appDate,
            totalVisits: 1,
            totalSpent: parseFloat(app.total_price) || 0
          }
        } else {
          clientMap[clientId].totalVisits += 1
          clientMap[clientId].totalSpent += parseFloat(app.total_price) || 0
          if (appDate > clientMap[clientId].lastVisit) {
            clientMap[clientId].lastVisit = appDate
          }
        }
      })

      const clientEntries = Object.values(clientMap)
      const totalUniqueClients = clientEntries.length

      // Clienti con più di 1 visita (ritorno)
      const returningClients = clientEntries.filter(c => c.totalVisits > 1).length
      const retentionRate = totalUniqueClients > 0 ? (returningClients / totalUniqueClients) * 100 : 0

      // Filtriamo i clienti inattivi (la cui ultima visita risale a più di X giorni fa)
      const inactiveThresholdDate = new Date()
      inactiveThresholdDate.setDate(now.getDate() - churnDays)

      const inactiveClients = clientEntries.filter(c => c.lastVisit < inactiveThresholdDate)
        .sort((a, b) => a.lastVisit - b.lastVisit) // Dal più "dimenticato" in poi

      // Stimiamo il valore perso dei clienti inattivi (basato sulla loro spesa media storica)
      const lostRevenuePotential = inactiveClients.reduce((acc, c) => {
        const avgPerVisit = c.totalSpent / c.totalVisits
        return acc + avgPerVisit
      }, 0)

      // Calcoliamo i dati sulle cancellazioni
      const cancellationsCount = cancelledAppointments.length
      const cancellationsLostValue = cancelledAppointments.reduce((acc, curr) => acc + (parseFloat(curr.total_price) || 0), 0)

      setDataReport({
        inactiveClients,
        lostRevenuePotential,
        cancellationsCount,
        cancellationsLostValue,
        retentionRate,
        totalUniqueClients
      })

    } catch (err) {
      console.error('Errore report avanzato:', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      style={{
        position: 'relative',
        zIndex: 1,
        '--primary-color': salonSettings.primary_color || '#2563eb',
        '--accent-color': salonSettings.accent_color || '#D4AF37',
        '--secondary-color': salonSettings.secondary_color || '#1E293B',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '4px'
      }}
    >
      {/* Header Sezione */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.35rem', fontWeight: 700 }}>📈 Report Comportamentale & Churn</h2>
        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>Monitora la fidelizzazione, i clienti a rischio abbandono e l'impatto delle cancellazioni</p>
      </div>

      {/* Box Filtro Churn Days */}
      <div style={{ marginBottom: '24px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: '#1e293b' }}>Definizione Cliente Inattivo</h4>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Scegli dopo quanti giorni di assenza considerare un cliente "a rischio"</p>
        </div>
        <select 
          value={churnDays} 
          onChange={(e) => setChurnDays(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={30}>Oltre 30 giorni (1 mese)</option>
          <option value={45}>Oltre 45 giorni (1 mese e mezzo)</option>
          <option value={60}>Oltre 60 giorni (2 mesi)</option>
          <option value={90}>Oltre 90 giorni (3 mesi)</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '14px' }}>Analisi comportamenti in corso...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* KPI Secondari / Avanzati */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ ...statCardStyle, borderLeft: '4px solid #8b5cf6' }}>
              <span style={statIconStyle}>🔄</span>
              <span style={statLabelStyle}>Tasso di Ritorno (Retention)</span>
              <strong style={{ ...statValueStyle, color: '#8b5cf6' }}>{dataReport.retentionRate.toFixed(1)}%</strong>
            </div>

            <div style={{ ...statCardStyle, borderLeft: '4px solid #ef4444' }}>
              <span style={statIconStyle}>⚠️</span>
              <span style={statLabelStyle}>Clienti a Rischio Churn</span>
              <strong style={{ ...statValueStyle, color: '#ef4444' }}>{dataReport.inactiveClients.length}</strong>
            </div>

            {isOwner && (
              <div style={{ ...statCardStyle, borderLeft: '4px solid #f59e0b' }}>
                <span style={statIconStyle}>💸</span>
                <span style={statLabelStyle}>Valore in Sospeso (Inattivi)</span>
                <strong style={{ ...statValueStyle, color: '#d97706' }}>{formatCurrency(dataReport.lostRevenuePotential)}</strong>
              </div>
            )}

            <div style={{ ...statCardStyle, borderLeft: '4px solid #64748b' }}>
              <span style={statIconStyle}>❌</span>
              <span style={statLabelStyle}>Appuntamenti Cancellati</span>
              <strong style={{ ...statValueStyle, color: '#475569' }}>{dataReport.cancellationsCount} ({formatCurrency(dataReport.cancellationsLostValue)})</strong>
            </div>
          </div>

          {/* Lista Clienti Inattivi (Da recuperare) */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', fontWeight: 700 }}>🎯 Clienti da Riattivare ({dataReport.inactiveClients.length})</h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Non mettono piede in salone da oltre {churnDays} giorni</span>
            </div>

            {dataReport.inactiveClients.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Ottimo! Nessun cliente ha superato questa soglia di inattività.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {dataReport.inactiveClients.map((client, idx) => {
                  const daysSinceLast = Math.floor((new Date() - new Date(client.lastVisit)) / (1000 * 60 * 60 * 24))
                  return (
                    <div key={idx} style={listRowStyle}>
                      <div>
                        <strong style={{ color: '#1e293b', fontSize: '0.95rem', display: 'block' }}>{client.name}</strong>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          Ultima visita: {client.lastVisit.toLocaleDateString('it-IT')} (circa <strong>{daysSinceLast} giorni fa</strong>)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {isOwner && (
                          <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>
                            Spesa storica: {formatCurrency(client.totalSpent)}
                          </span>
                        )}
                        {client.phone && (
                          <a
                            href={`https://wa.me/${client.phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`Ciao ${clientname}, è da un po' che non ti vediamo in salone! Passa a trovarci per rinfrescare il look, ti aspettiamo!`)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={waBtnStyle}
                          >
                            💬 Promuovi
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

const selectStyle = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
  color: '#1e293b',
  fontSize: '13px',
  outline: 'none',
  cursor: 'pointer'
}

const statCardStyle = { 
  display: 'flex', 
  flexDirection: 'column', 
  alignItems: 'flex-start', 
  backgroundColor: '#ffffff', 
  border: '1px solid #e2e8f0', 
  borderRadius: '12px', 
  padding: '20px', 
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)' 
}

const statIconStyle = { 
  fontSize: '22px', 
  marginBottom: '10px' 
}

const statLabelStyle = { 
  fontSize: '11px', 
  fontWeight: 600, 
  color: '#64748b', 
  textTransform: 'uppercase', 
  letterSpacing: '0.5px', 
  marginBottom: '4px' 
}

const statValueStyle = { 
  fontSize: '1.35rem',
  fontWeight: 700
}

const listRowStyle = { 
  display: 'flex', 
  justifyContent: 'space-between', 
  alignItems: 'center', 
  padding: '12px 14px', 
  border: '1px solid #f1f5f9',
  backgroundColor: '#f8fafc',
  borderRadius: '8px'
}

const waBtnStyle = {
  backgroundColor: '#22c55e',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px'
}
