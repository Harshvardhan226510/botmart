import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AuthPage({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const [userType, setUserType] = useState('developer') // 'developer' or 'business'
  const [companyName, setCompanyName] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')

  const [loading, setLoading] = useState(false)
  const [supportCopied, setSupportCopied] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const handleAuth = async (e) => {
    e.preventDefault()

    // 1. Core verification check depending on the active portal view
    if (isSignUp) {
      if (!fullName.trim() || !email || !password) {
        setMessage({ type: 'error', text: 'Full Name, Email, and Password are strictly compulsory for registration.' })
        return
      }
      if (userType === 'business' && !companyName.trim()) {
        setMessage({ type: 'error', text: 'Company Name is required for Business Client registration.' })
        return
      }
    } else {
      if (!email || !password) {
        setMessage({ type: 'error', text: 'Please enter both your email address and password to log in.' })
        return
      }
    }

    try {
      setLoading(true)
      setMessage({ type: '', text: '' })

      if (isSignUp) {
        // Sign up user in Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error

        if (data?.user) {
          // Insert metadata row matching our exact profile constraint fields
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([
              {
                id: data.user.id,
                full_name: fullName.trim(),
                user_type: userType,
                company_name: userType === 'business' ? companyName.trim() : null,
                github_url: githubUrl.trim() || null,
                linkedin_url: linkedinUrl.trim() || null
              }
            ])
          if (profileError) throw profileError
        }

        setMessage({ type: 'success', text: 'Registration successful! You can now sign in.' })
        setIsSignUp(false)
      } else {
        // Sign In Flow
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error

        if (data?.user) {
          onAuthSuccess(data.user)
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white border border-slate-200 p-6 md:p-8 rounded-xl shadow-xs space-y-6 mt-6 font-sans">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          {isSignUp ? 'Create Your Account' : 'Welcome to Botmart'}
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          {isSignUp ? 'Register your profile details below.' : 'Sign in to access your dashboard registry.'}
        </p>
      </div>

      <form onSubmit={handleAuth} className="space-y-4 text-sm">

        {isSignUp && (
          <>
            {/* User Type Radio Group */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">I want to register as a:</label>
              <div className="flex gap-4 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer flex-1 justify-center py-1 rounded bg-white shadow-2xs border border-slate-200 text-xs font-medium text-slate-700">
                  <input
                    type="radio"
                    name="userType"
                    value="developer"
                    checked={userType === 'developer'}
                    onChange={() => setUserType('developer')}
                    className="accent-orange-500"
                  />
                  AI Developer
                </label>
                <label className="flex items-center gap-2 cursor-pointer flex-1 justify-center py-1 rounded bg-white shadow-2xs border border-slate-200 text-xs font-medium text-slate-700">
                  <input
                    type="radio"
                    name="userType"
                    value="business"
                    checked={userType === 'business'}
                    onChange={() => setUserType('business')}
                    className="accent-orange-500"
                  />
                  Business Client
                </label>
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Full Name *</label>
              <input
                type="text"
                placeholder="User22"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
              />
            </div>

            {/* Conditional Rendering for Company */}
            {userType === 'business' && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Company Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Acme Automations Ltd."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
                />
              </div>
            )}

            {/* Social Trust Links */}
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <label className="block text-xs font-semibold text-slate-700">GitHub Profile Link</label>
                <span className="text-[10px] text-slate-400 font-medium">(Optional)</span>
              </div>
              <input
                type="url"
                placeholder="https://github.com/your-username"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
              />
              <p className="text-[10px] text-orange-700 font-medium bg-orange-50/60 p-1.5 rounded border border-orange-100/40">
                💡 Linking your GitHub helps clients trust your deployment history.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <label className="block text-xs font-semibold text-slate-700">LinkedIn Profile Link</label>
                <span className="text-[10px] text-slate-400 font-medium">(Optional)</span>
              </div>
              <input
                type="url"
                placeholder="https://linkedin.com/in/your-profile"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
              />
              <p className="text-[10px] text-orange-700 font-medium bg-orange-50/60 p-1.5 rounded border border-orange-100/40">
                🤝 A verified LinkedIn profile significantly increases buyer confidence.
              </p>
            </div>
          </>
        )}

        {/* Credentials Form Control */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">Email Address *</label>
          <input
            type="email"
            placeholder="dev@botmart.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700">Password *</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-slate-900 shadow-2xs"
          />
        </div>

        {message.text && (
          <div className={`p-3 rounded-lg text-xs font-medium border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
            }`}>
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors shadow-2xs"
        >
          {loading ? 'Processing...' : isSignUp ? 'Register New Profile' : 'Sign In'}
        </button>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setMessage({ type: '', text: '' })
            }}
            className="text-xs text-orange-500 hover:text-orange-600 hover:underline font-semibold"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>
      </form>

      <div className="mt-6 -mx-6 md:-mx-8 -mb-6 md:-mb-8 bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-b-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎧</span>
          <div className="text-left">
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
          className="inline-block px-4 py-2 bg-white border border-slate-200 hover:border-orange-200 text-orange-500 hover:text-orange-600 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-2xs transition-all w-full sm:w-auto"
        >
          {supportCopied ? 'Email Copied!' : 'Copy Support Email'}
        </button>
      </div>
    </div>
  )
}