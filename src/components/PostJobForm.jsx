import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function PostJobForm({ userSessionId, onSubmissionSuccess }) {
  const [title, setTitle] = useState('')
  const [problemStatement, setProblemStatement] = useState('')
  
  // Optional Fields
  const [techInput, setTechInput] = useState('')
  const [timeline, setTimeline] = useState('')

  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Compulsory Field Validation (Budget check is omitted because the field is locked)
    if (!title.trim() || !problemStatement.trim()) {
      setStatusMessage({ 
        type: 'error', 
        text: 'Title and Detailed Problem Statement are strictly necessary.' 
      })
      return
    }

    try {
      setLoading(true)
      setStatusMessage({ type: '', text: '' })

      // Process comma-separated tech inputs into a clean array string
      const techStackArray = techInput
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0)

      // Payload matching your column structure without passing a budget variable
      const { error } = await supabase
        .from('job_posts')
        .insert([
          {
            business_id: userSessionId,
            title: title.trim(),
            problem_statement: problemStatement.trim(),
            required_stack: techStackArray.length > 0 ? techStackArray : null, // optional
            estimated_timeline: timeline.trim() || null // optional
          }
        ])

      if (error) throw error

      setStatusMessage({ type: 'success', text: 'Operational requirement published to live board!' })
      
      // Reset Form Fields
      setTitle('')
      setProblemStatement('')
      setTechInput('')
      setTimeline('')

      // Callback to jump views instantly if provided
      if (onSubmissionSuccess) onSubmissionSuccess()

    } catch (error) {
      setStatusMessage({ type: 'error', text: `Database rejection: ${error.message}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-5 md:p-8 space-y-6 relative z-10 font-sans text-slate-900 shadow-xs">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Post Automation Requirement</h2>
        <p className="text-slate-500 text-xs mt-1">Detail your manual operational bottlenecks so AI developers can engineer solutions.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">Requirement Title *</label>
          <input 
            type="text" 
            placeholder="e.g., HubSpot to Slack Lead Router" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 shadow-2xs text-slate-900" 
          />
        </div>

        {/* Layout grid containing the locked project budget and timeline fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Locked Project Budget Field */}
          <div className="space-y-1 relative select-none">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-400">Project Budget Allocation</label>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                🔒 Locked For Now
              </span>
            </div>
            <div className="relative rounded-lg overflow-hidden flex items-center">
              <span className="absolute left-3 text-slate-300 font-semibold pointer-events-none blur-[1px]">₹</span>
              <input 
                type="text" 
                disabled
                placeholder="Feature Coming Soon..." 
                className="w-full pl-7 pr-3 py-2 bg-slate-50/50 border border-slate-100 rounded-lg text-slate-300 pointer-events-none blur-[1.5px]" 
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <label className="block text-xs font-semibold text-slate-700">Estimated Target Timeline</label>
            </div>
            <input 
              type="text" 
              placeholder="e.g., 2 weeks, Urgent, Flexible" 
              value={timeline} 
              onChange={(e) => setTimeline(e.target.value)} 
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 shadow-2xs text-slate-900" 
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">Detailed Problem Statement / Bottleneck *</label>
          <textarea 
            rows="5" 
            placeholder="Describe the repetitive manual process. Include inputs, target apps, and expected output details..." 
            value={problemStatement} 
            onChange={(e) => setProblemStatement(e.target.value)} 
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-slate-900 text-xs leading-relaxed shadow-2xs resize-none" 
          />
        </div>

        {/* Optional Section Splitter */}
        <div className="border-t border-slate-100 pt-2 my-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Optional Parameters</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <label className="block text-xs font-semibold text-slate-700">Preferred Tech Stack</label>
            <span className="text-[10px] text-slate-400 font-medium">(Optional)</span>
          </div>
          <input 
            type="text" 
            placeholder="e.g., LangGraph, OpenAI, Python" 
            value={techInput} 
            onChange={(e) => setTechInput(e.target.value)} 
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 shadow-2xs text-slate-900" 
          />
        </div>

        {statusMessage.text && (
          <div className={`p-3 rounded-lg text-xs font-medium border ${statusMessage.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {statusMessage.text}
          </div>
        )}

        <div className="pt-2 flex items-center justify-end gap-3">
          {onSubmissionSuccess && (
            <button 
              type="button"
              onClick={onSubmissionSuccess}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors uppercase tracking-wider"
            >
              Cancel
            </button>
          )}
          <button 
            type="submit" 
            disabled={loading} 
            className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold text-xs rounded-lg transition-colors shadow-2xs uppercase tracking-wider"
          >
            {loading ? 'Transmitting...' : 'Broadcast Pipeline'}
          </button>
        </div>
      </form>
    </div>
  )
}