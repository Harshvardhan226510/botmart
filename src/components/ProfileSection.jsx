import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ProfileSection({ sessionUser, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [supportCopied, setSupportCopied] = useState(false)
  const [userTypeRole, setUserTypeRole] = useState('') // Explicitly tracks user_type column string
  const [profileData, setProfileData] = useState({
    full_name: '',
    username: '',
    bio: '',
    github_url: '',
    linkedin_url: '',
    avatar_url: ''
  })

  // Load existing profile details from Supabase profiles table
  useEffect(() => {
    async function getProfile() {
      try {
        setLoading(true)
        // Selected exact confirmed column: user_type
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, username, bio, github_url, linkedin_url, avatar_url, user_type')
          .eq('id', sessionUser.id)
          .maybeSingle()

        if (error) throw error
        if (data) {
          setProfileData({
            full_name: data.full_name || '',
            username: data.username || '',
            bio: data.bio || '',
            github_url: data.github_url || '',
            linkedin_url: data.linkedin_url || '',
            avatar_url: data.avatar_url || ''
          })
          setUserTypeRole(data.user_type || '')
        }
      } catch (err) {
        console.error('Error fetching profile properties:', err.message)
      } finally {
        setLoading(false)
      }
    }
    getProfile()
  }, [sessionUser])

  // Save modified updates to Supabase without breaking row role definitions
  async function handleUpdateProfile(e) {
    e.preventDefault()
    try {
      setUpdating(true)
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: sessionUser.id,
          full_name: profileData.full_name,
          username: profileData.username,
          bio: profileData.bio,
          github_url: profileData.github_url,
          linkedin_url: profileData.linkedin_url,
          avatar_url: profileData.avatar_url
          // user_type remains safe and preserved on your database row
        })

      if (error) throw error
      alert('Profile synced successfully!')
    } catch (err) {
      alert('Error updating profile metadata: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  // Pure mapping helper matching your radio selection properties exactly
  const displayRoleBadge = (typeString) => {
    if (typeString === 'developer') return 'AI Developer'
    if (typeString === 'business') return 'Business Client'
    return 'Verified Account'
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
        <p className="text-sm text-slate-400 animate-pulse font-medium">Syncing profile matrix data...</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden relative z-10 font-sans">
      {/* Dynamic Profile Cover Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-orange-950/40 px-6 py-8 text-white relative">
        <div className="flex items-center gap-4 relative z-10">
          {profileData.avatar_url ? (
            <img
              src={profileData.avatar_url}
              alt="Avatar"
              className="w-16 h-16 rounded-full object-cover border-2 border-orange-500 shadow-md"
              onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80" }}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xl border-2 border-white shadow-md uppercase shrink-0 select-none">
              {profileData.full_name?.substring(0, 2) || sessionUser.email?.substring(0, 2)}
            </div>
          )}
          <div className="min-w-0 space-y-0.5">
            <h2 className="font-bold text-lg tracking-tight truncate">{profileData.full_name || 'Anonymous Creator'}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-orange-400 text-xs font-semibold truncate">@{profileData.username || 'set_handle'}</p>
              {/* Confirmed semantic user_type role display badge mapping */}
              <span className="text-[9px] font-bold uppercase tracking-wider bg-white/10 text-orange-300 px-1.5 py-0.5 rounded border border-white/5 select-none">
                {displayRoleBadge(userTypeRole)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Editable Interactive Profile Form */}
      <form onSubmit={handleUpdateProfile} className="p-6 space-y-4 bg-white">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
            <input
              type="text"
              value={profileData.full_name}
              onChange={(e) => setProfileData(prev => ({ ...prev, full_name: e.target.value }))}
              placeholder="e.g. Harshvardhan"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Username Handle</label>
            <input
              type="text"
              value={profileData.username}
              onChange={(e) => setProfileData(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
              placeholder="e.g. devloper@22"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avatar Image URL</label>
          <input
            type="url"
            value={profileData.avatar_url}
            onChange={(e) => setProfileData(prev => ({ ...prev, avatar_url: e.target.value }))}
            placeholder="https://example.com/your-photo.jpg"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bio / Pipeline Focus</label>
          <textarea
            rows="3"
            value={profileData.bio}
            onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
            placeholder="Tell developers and clients what system workflows you engineer..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs resize-none"
          />
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <h3 className="text-xs font-bold text-slate-800 tracking-tight">Professional Indexes</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">GitHub Profile Link</label>
              <input
                type="url"
                value={profileData.github_url}
                onChange={(e) => setProfileData(prev => ({ ...prev, github_url: e.target.value }))}
                placeholder="https://github.com/..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">LinkedIn Profile Link</label>
              <input
                type="url"
                value={profileData.linkedin_url}
                onChange={(e) => setProfileData(prev => ({ ...prev, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100/80 rounded-lg transition-colors uppercase tracking-wider"
          >
            Log Out
          </button>

          <button
            type="submit"
            disabled={updating}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-bold rounded-lg transition-colors uppercase tracking-wider shadow-2xs"
          >
            {updating ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>

      <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎧</span>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Need Account Help?</p>
            <p className="text-[10px] text-slate-400">Reach out to our support team directly.</p>
          </div>
        </div>
        <button 
          type="button"
          onClick={() => {
            navigator.clipboard.writeText('22harshavardhan22@gmail.com')
            setSupportCopied(true)
            setTimeout(() => setSupportCopied(false), 2000)
          }}
          className="inline-block px-4 py-2 bg-white border border-slate-200 hover:border-orange-200 text-orange-500 hover:text-orange-600 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-2xs transition-all"
        >
          {supportCopied ? 'Email Copied!' : 'Copy Support Email'}
        </button>
      </div>
    </div>
  )
}