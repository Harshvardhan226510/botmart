import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function CreatorPortal({ userSessionId }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [demoUrl, setDemoUrl] = useState('')
  const [techInput, setTechInput] = useState('') // Optional tag line
  
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Strict Verification Check: Price verification is completely omitted
    if (!title.trim() || !description.trim() || !demoUrl.trim()) {
      setStatusMessage({ 
        type: 'error', 
        text: 'System Title, Operational Breakdown, and Live Demo URL are strictly compulsory.' 
      })
      return
    }

    try {
      setLoading(true)
      setStatusMessage({ type: '', text: '' })

      // Process optional comma-separated tech inputs into a clean array string
      const techStackArray = techInput
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0)

      // Payload matching your exact columns structure without passing price
      const { error } = await supabase
        .from('listings')
        .insert([
          {
            creator_id: userSessionId,
            title: title.trim(),
            description: description.trim(),
            demo_url: demoUrl.trim(),
            tech_stack: techStackArray.length > 0 ? techStackArray : null // Optional column fallback
          }
        ])

      if (error) throw error

      setStatusMessage({ type: 'success', text: 'System architecture successfully written to cloud registry!' })
      
      // Clean form state variables
      setTitle('')
      setDescription('')
      setDemoUrl('')
      setTechInput('')

    } catch (error) {
      setStatusMessage({ type: 'error', text: `Database rejection: ${error.message}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-5 md:p-8 space-y-6 relative z-10 font-sans text-slate-900 shadow-xs">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Compiler Portal</h2>
        <p className="text-slate-500 text-xs mt-1">Deploy an autonomous workflow straight to the marketplace index.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">System Title *</label>
          <input 
            type="text" 
            placeholder="e.g., Autonomous Invoice Processing Agent" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 shadow-2xs text-slate-900" 
          />
        </div>

        {/* Responsive Grid Panel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Locked Price Feature Component Block */}
          <div className="space-y-1 relative select-none">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-400">System Pricing</label>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                🔒 Locked For Now
              </span>
            </div>
            <div className="relative rounded-lg overflow-hidden">
              <input 
                type="text" 
                disabled
                placeholder="Feature Coming Soon..." 
                className="w-full px-3 py-2 bg-slate-50/50 border border-slate-100 rounded-lg text-slate-300 pointer-events-none blur-[1.5px]" 
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Live Production URL / Demo *</label>
            <input 
              type="url" 
              placeholder="https://your-agent-space.hf.space" 
              value={demoUrl} 
              onChange={(e) => setDemoUrl(e.target.value)} 
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 shadow-2xs text-slate-900" 
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">Operational Breakdown / System Description *</label>
          <textarea 
            rows="4" 
            placeholder="Provide a detailed overview of what your automation does, how it works, and the problems it solves..." 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 text-slate-900 text-xs leading-relaxed shadow-2xs resize-none" 
          />
        </div>

        {/* Optional tech stack entry */}
        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <label className="block text-xs font-semibold text-slate-700">Engine Stack Components</label>
            <span className="text-[10px] text-slate-400 font-medium">(Optional)</span>
          </div>
          <input 
            type="text" 
            placeholder="e.g., OpenAI, LangChain, Python" 
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

        <div className="pt-2 flex justify-end">
          <button 
            type="submit" 
            disabled={loading} 
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold text-xs rounded-lg transition-colors shadow-2xs uppercase tracking-wider"
          >
            {loading ? 'Transmitting Architecture...' : 'Publish System Listing'}
          </button>
        </div>
      </form>
    </div>
  )
}