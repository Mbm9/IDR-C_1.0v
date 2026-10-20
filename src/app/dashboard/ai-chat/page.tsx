'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Brain, Loader2, Trash2, MessageSquare, Sparkles, Plus, History } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  data?: any
  suggestedActions?: string[]
  followUpQuestions?: string[]
}

interface ChatSession {
  id: string
  title: string
  createdAt: string
}

const SUGGESTED_QUERY_KEYS = [
  'domainAdminsInactive',
  'orphanedServiceAccounts',
  'tierViolations',
  'dormantCount',
  'tier0',
  'topRisky',
  'missingMfa',
  'nhiNoOwner',
] as const

export default function AiChatPage() {
  const t = useTranslations('aiChat')
  const format = useFormatter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [showSessions, setShowSessions] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchSessions()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function fetchSessions() {
    try {
      const res = await fetch('/api/ai/chat/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
      }
    } catch {}
  }

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/ai/chat/sessions/${id}`)
      if (res.ok) {
        const data = await res.json()
        setSessionId(id)
        setMessages(data.session?.messages || [])
        setShowSessions(false)
      }
    } catch {}
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/ai/chat/sessions/${id}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== id))
      setPendingDelete(null)
      if (sessionId === id) {
        setSessionId(null)
        setMessages([])
      }
    } catch {}
  }

  function handleNewChat() {
    setSessionId(null)
    setMessages([])
    setShowSessions(false)
    inputRef.current?.focus()
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      })

      if (!res.ok) throw new Error('Chat failed')
      const data = await res.json()

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId)
        fetchSessions()
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response?.answer || (typeof data.response === 'string' ? data.response : '') || t('cannotProcess'),
        timestamp: new Date().toISOString(),
        data: data.response?.data,
        suggestedActions: data.response?.suggestedActions,
        followUpQuestions: data.response?.followUpQuestions,
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t('errorReply'),
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-120px)] gap-4">
      {/* Mobile: toggle for the history panel */}
      <div className="flex md:hidden items-center justify-between gap-2">
        <button
          onClick={() => setShowSessions(v => !v)}
          aria-expanded={showSessions}
          aria-controls="chat-history"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs text-[var(--text-primary)]"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" /> {t('sessions')}
        </button>
        <button onClick={handleNewChat} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: 'var(--color-info)' }}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t('newChat')}
        </button>
      </div>

      {/* Sidebar — session history */}
      <nav
        id="chat-history"
        aria-label={t('sessions')}
        className={`${showSessions ? 'flex' : 'hidden'} md:flex w-full md:w-64 max-h-64 md:max-h-none shrink-0 flex-col rounded-lg border overflow-hidden`}
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-default)' }}>
          <h2 className="text-xs font-semibold text-[var(--text-primary)]">{t('sessions')}</h2>
          <button
            onClick={handleNewChat}
            className="hidden md:flex items-center gap-1 text-xs px-2 py-1 rounded font-medium text-white"
            style={{ backgroundColor: 'var(--color-info)' }}
          >
            <Plus className="w-3 h-3" aria-hidden="true" /> {t('newChat')}
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <li className="p-3 text-xs text-[var(--text-secondary)]">{t('noSessions')}</li>
          ) : (
            sessions.map(s => (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-1 p-1 mx-1 my-0.5 rounded text-xs group ${sessionId === s.id ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'}`}
              >
                {pendingDelete === s.id ? (
                  <div className="flex flex-1 items-center justify-between gap-1 p-1">
                    <span className="text-[var(--text-primary)]">{t('deleteConfirm')}</span>
                    <span className="flex gap-1">
                      <button onClick={() => deleteSession(s.id)} className="px-2 py-0.5 rounded bg-[var(--color-critical)] text-white">{t('deleteSession')}</button>
                      <button onClick={() => setPendingDelete(null)} className="px-2 py-0.5 rounded border border-[var(--border-default)] text-[var(--text-primary)]">{t('cancel')}</button>
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => loadSession(s.id)}
                      aria-current={sessionId === s.id ? 'true' : undefined}
                      className="flex flex-1 items-center gap-2 min-w-0 p-1 text-start"
                    >
                      <MessageSquare className="w-3 h-3 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                      <span className="truncate text-[var(--text-primary)]" dir="auto">{s.title}</span>
                    </button>
                    <button
                      onClick={() => setPendingDelete(s.id)}
                      aria-label={t('deleteSessionNamed', { title: s.title })}
                      title={t('deleteSession')}
                      className="md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-[var(--bg-tertiary)]"
                    >
                      <Trash2 className="w-3 h-3 text-[var(--text-secondary)]" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      </nav>

      {/* Main chat area */}
      <section className="flex-1 min-h-0 flex flex-col rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }} aria-labelledby="ai-chat-title">
        {/* Header */}
        <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-default)' }}>
          <Brain className="w-5 h-5 text-[var(--color-info-text)]" aria-hidden="true" />
          <div>
            <h2 id="ai-chat-title" className="text-sm font-semibold text-[var(--text-primary)]">{t('analystTitle')}</h2>
            <p className="text-[11px] text-[var(--text-secondary)]">{t('analystSubtitle')}</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite" aria-label={t('conversation')} tabIndex={0}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-full gap-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <Sparkles className="w-8 h-8 text-[var(--color-info-text)]" aria-hidden="true" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--text-primary)]">{t('emptyTitle')}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{t('emptySubtitle')}</p>
              </div>
              <div className="w-full max-w-lg">
                <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">{t('suggestedQueries')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_QUERY_KEYS.map((key) => {
                    const q = t(`suggestions.${key}`)
                    return (
                      <button
                        key={key}
                        onClick={() => { setInput(q); inputRef.current?.focus() }}
                        className="text-start px-3 py-2 rounded-lg border text-xs transition-colors hover:border-[var(--color-info)] text-[var(--text-primary)]"
                        style={{ borderColor: 'var(--border-default)' }}
                      >
                        {q}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] md:max-w-[75%] rounded-lg px-3 py-2 ${msg.role === 'user' ? 'rounded-ee-sm' : 'rounded-es-sm'}`}
                  style={{
                    backgroundColor: msg.role === 'user' ? 'var(--color-info)' : 'var(--bg-secondary)',
                    color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                  }}
                >
                  <span className="sr-only">{msg.role === 'user' ? t('you') : t('assistant')}: </span>
                  <p className="text-xs whitespace-pre-wrap" dir="auto">{msg.content}</p>

                  {/* Inline data results */}
                  {msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.data.slice(0, 5).map((item: any, j: number) => (
                        <Link
                          key={j}
                          href={`/dashboard/identities/${item.id || ''}`}
                          className="flex items-center justify-between gap-2 p-2 rounded text-[11px] hover:opacity-80"
                          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        >
                          <bdi className="font-medium">{item.displayName || item.name || t('unknown')}</bdi>
                          <div className="flex items-center gap-2">
                            {item.adTier && <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" dir="ltr" style={{ backgroundColor: 'var(--bg-tertiary)' }}>{item.adTier}</span>}
                            {item.riskScore != null && <span className="font-mono">{item.riskScore}</span>}
                          </div>
                        </Link>
                      ))}
                      {msg.data.length > 5 && (
                        <p className="text-[11px]">{t('andMore', { count: msg.data.length - 5 })}</p>
                      )}
                    </div>
                  )}

                  {/* Follow-up questions */}
                  {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1" aria-label={t('followUp')} role="group">
                      {msg.followUpQuestions.map((q: string, j: number) => (
                        <button
                          key={j}
                          onClick={() => { setInput(q); inputRef.current?.focus() }}
                          className="px-2 py-1 rounded text-[11px] font-medium border border-[var(--border-default)] text-[var(--text-primary)]"
                          style={{ backgroundColor: 'var(--bg-primary)' }}
                          dir="auto"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] mt-1 opacity-80">
                    <time dateTime={msg.timestamp}>{format.dateTime(new Date(msg.timestamp), { timeStyle: 'short' })}</time>
                  </p>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start" role="status">
              <div className="rounded-lg px-3 py-2 rounded-es-sm flex items-center gap-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <Loader2 className="w-3 h-3 animate-spin text-[var(--color-info-text)]" aria-hidden="true" />
                <span className="text-xs text-[var(--text-secondary)]">{t('thinking')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form className="p-3 border-t" style={{ borderColor: 'var(--border-default)' }} onSubmit={(e) => { e.preventDefault(); handleSend() }}>
          <div className="flex gap-2">
            <label htmlFor="ai-chat-input" className="sr-only">{t('inputLabel')}</label>
            <textarea
              id="ai-chat-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('inputPlaceholder')}
              rows={1}
              dir="auto"
              className="flex-1 px-3 py-2 border rounded-lg text-xs resize-none placeholder:text-[var(--text-secondary)]"
              style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label={t('send')}
              title={t('send')}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-info)' }}
            >
              <Send className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
