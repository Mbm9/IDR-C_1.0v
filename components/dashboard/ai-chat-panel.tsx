'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  X, Send, MessageSquare, Plus, Trash2, ChevronDown, Loader2, Brain,
} from 'lucide-react'
import { ChatResultCard } from './chat-result-card'
import type { ChatMessage } from '@/lib/db/schema/chat-sessions'

interface ChatSession {
  id: string
  title: string
  updatedAt: string
}

interface ChatResponseData {
  sessionId: string
  response: {
    answer: string
    data?: any
    suggestedActions?: string[]
    followUpQuestions?: string[]
  }
}

interface AiChatPanelProps {
  open: boolean
  onClose: () => void
}

export function AiChatPanel({ open, onClose }: AiChatPanelProps) {
  const t = useTranslations('aiChat')
  const format = useFormatter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [showSessions, setShowSessions] = useState(false)
  const [latestMeta, setLatestMeta] = useState<{
    suggestedActions?: string[]
    followUpQuestions?: string[]
  }>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      loadSessions()
    }
  }, [open])

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/ai/chat/sessions')
      if (res.ok) {
        const data = await res.json()
        // API returns { sessions: [...] }; accept a bare array too
        setSessions(Array.isArray(data) ? data : data.sessions || [])
      }
    } catch {
      // silent
    }
  }

  const loadSession = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/chat/sessions/${id}`)
      if (res.ok) {
        const body = await res.json()
        const data = body.session ?? body
        setSessionId(data.id ?? id)
        setMessages(data.messages || [])
        setShowSessions(false)

        // Extract latest metadata
        const lastAssistant = [...(data.messages || [])].reverse().find((m: ChatMessage) => m.role === 'assistant')
        if (lastAssistant?.metadata) {
          setLatestMeta({
            suggestedActions: lastAssistant.metadata.suggestedActions,
          })
        }
      }
    } catch {
      // silent
    }
  }

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/ai/chat/sessions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id))
        if (sessionId === id) {
          startNewChat()
        }
      }
    } catch {
      // silent
    }
  }

  const startNewChat = () => {
    setSessionId(null)
    setMessages([])
    setLatestMeta({})
    setShowSessions(false)
    setInput('')
  }

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = (text || input).trim()
    if (!messageText || loading) return

    setInput('')
    setLoading(true)

    // Add user message optimistically
    const userMsg: ChatMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setLatestMeta({})

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          sessionId,
        }),
      })

      if (!res.ok) throw new Error('Chat request failed')

      const data: ChatResponseData = await res.json()
      setSessionId(data.sessionId)

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.response.answer,
        timestamp: new Date().toISOString(),
        metadata: {
          queryResults: data.response.data,
          suggestedActions: data.response.suggestedActions,
        },
      }
      setMessages(prev => [...prev, assistantMsg])
      setLatestMeta({
        suggestedActions: data.response.suggestedActions,
        followUpQuestions: data.response.followUpQuestions,
      })

      // Refresh sessions list
      loadSessions()
    } catch {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: t('errorReply'),
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }, [input, loading, sessionId])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!open) return null

  const suggestedQueries = [
    t('suggestions.domainAdminsInactive'),
    t('suggestions.tierViolations'),
    t('suggestions.orphanedServiceAccounts'),
    t('suggestions.topRisks'),
  ]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 lg:bg-transparent" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div role="dialog" aria-modal="false" aria-labelledby="ai-chat-panel-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }} className="fixed inset-y-0 end-0 z-50 w-full sm:w-[450px] bg-[var(--bg-primary)] border-s border-[var(--border-default)] flex flex-col" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-[var(--color-info)]" aria-hidden="true" />
            <h3 id="ai-chat-panel-title" className="text-body font-semibold text-[var(--text-primary)]">{t('title')}</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={startNewChat}
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
              title={t('newChat')}
              aria-label={t('newChat')}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowSessions(!showSessions)}
                className="p-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                title={t('sessions')}
                aria-label={t('sessions')}
                aria-expanded={showSessions}
              >
                <MessageSquare size={16} aria-hidden="true" />
                <ChevronDown size={10} className="absolute bottom-0.5 end-0.5" aria-hidden="true" />
              </button>
              {showSessions && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setShowSessions(false)} />
                  <div className="absolute end-0 top-full mt-1 w-72 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg z-50 overflow-hidden" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                    <div className="px-3 py-2 border-b border-[var(--border-default)]">
                      <p className="text-caption font-medium text-[var(--text-secondary)]">{t('sessions')}</p>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {sessions.length === 0 ? (
                        <p className="px-3 py-4 text-caption text-[var(--text-secondary)] text-center">{t('noSessions')}</p>
                      ) : (
                        sessions.map(s => (
                          <div
                            key={s.id}
                            className={`w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--bg-secondary)] transition-colors ${sessionId === s.id ? 'bg-[var(--bg-secondary)]' : ''}`}
                          >
                            <button onClick={() => loadSession(s.id)} className="flex-1 min-w-0 text-start">
                              <p className="text-caption text-[var(--text-primary)] truncate" dir="auto">{s.title}</p>
                              <p className="text-micro text-[var(--text-secondary)]">
                                {s.updatedAt ? format.dateTime(new Date(s.updatedAt), { dateStyle: 'medium' }) : ''}
                              </p>
                            </button>
                            <button
                              onClick={(e) => deleteSession(s.id, e)}
                              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--color-critical)] transition-colors ms-2 flex-shrink-0"
                              title={t('deleteSession')}
                              aria-label={t('deleteSessionNamed', { title: s.title })}
                            >
                              <Trash2 size={12} aria-hidden="true" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
              aria-label={t('close')}
              title={t('close')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" role="log" aria-live="polite" aria-label={t('conversation')} tabIndex={0}>
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <Brain size={40} className="text-[var(--color-info)] opacity-40 mb-3" aria-hidden="true" />
              <p className="text-body font-medium text-[var(--text-secondary)] mb-4">{t('suggestedQueries')}</p>
              <div className="space-y-2 w-full">
                {suggestedQueries.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="w-full text-start px-3 py-2.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] text-caption text-[var(--text-primary)] hover:border-[var(--color-info)] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={`${msg.timestamp}-${i}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-[var(--color-info)] text-white'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-primary)]'
                }`}
              >
                <span className="sr-only">{msg.role === 'user' ? t('you') : t('assistant')}: </span>
                <div className="text-caption whitespace-pre-wrap break-words" dir="auto">{msg.content}</div>

                {/* Inline data cards for assistant messages */}
                {msg.role === 'assistant' && msg.metadata?.queryResults && (
                  <div className="mt-3">
                    <ChatResultCard data={msg.metadata.queryResults} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg px-4 py-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[var(--color-info)]" aria-hidden="true" />
                <span className="text-caption text-[var(--text-secondary)]">{t('thinking')}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Follow-up questions + suggested actions */}
        {!loading && (latestMeta.followUpQuestions?.length || latestMeta.suggestedActions?.length) ? (
          <div className="px-4 pb-2 space-y-2">
            {latestMeta.suggestedActions && latestMeta.suggestedActions.length > 0 && (
              <div>
                <p className="text-micro text-[var(--text-secondary)] mb-1">{t('suggestedActions')}</p>
                <div className="flex flex-wrap gap-1">
                  {latestMeta.suggestedActions.map((action) => (
                    <button
                      key={action}
                      onClick={() => sendMessage(action)}
                      dir="auto"
                      className="text-micro px-2 py-1 rounded-full border border-[var(--color-info)] text-[var(--text-primary)] hover:bg-[var(--color-info)] hover:text-white transition-colors"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {latestMeta.followUpQuestions && latestMeta.followUpQuestions.length > 0 && (
              <div>
                <p className="text-micro text-[var(--text-secondary)] mb-1">{t('followUp')}</p>
                <div className="flex flex-wrap gap-1">
                  {latestMeta.followUpQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      dir="auto"
                      className="text-micro px-2 py-1 rounded-full border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Input */}
        <div className="border-t border-[var(--border-default)] px-4 py-3">
          <div className="flex items-end gap-2">
            <label htmlFor="ai-chat-panel-input" className="sr-only">{t('inputLabel')}</label>
            <textarea
              id="ai-chat-panel-input"
              dir="auto"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('placeholder')}
              rows={1}
              className="flex-1 resize-none rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] text-caption text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] px-3 py-2 focus:outline-none focus:border-[var(--color-info)] transition-colors max-h-24"
              style={{ minHeight: '38px' }}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              aria-label={t('send')}
              title={t('send')}
              className="p-2.5 rounded-md bg-[var(--color-info)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send size={14} className="rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
