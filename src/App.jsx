import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'
import Navbar from './components/Navbar'
import BusinessFeed from './components/BusinessFeed'
import JobBoard from './components/JobBoard'
import CreatorPortal from './components/CreatorPortal'
import AuthPage from './components/AuthPage'
import PostJobForm from './components/PostJobForm'
import Inbox from './components/Inbox'
import ProfileSection from './components/ProfileSection'

export default function App() {
  const [currentView, setCurrentView] = useState('feed')
  const [sessionUser, setSessionUser] = useState(null)
  const [userProfileData, setUserProfileData] = useState(null) // New state to hold confirmed database user_type
  const [checkingAuth, setCheckingAuth] = useState(true)
  
  // Modal tracking hook for background inspect routines
  const [selectedProfileModal, setSelectedProfileModal] = useState(null)

  // Signals the Inbox which job-linked room to auto-select after navigation.
  // Set when a developer clicks "Apply to Build" on a specific job post.
  // Cleared by the Inbox component once it has consumed the signal.
  const [pendingRoomJobId, setPendingRoomJobId] = useState(null)

  // Combined auth loop to pull core session details and user_type attributes cleanly
  async function fetchUserSessionAndProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setSessionUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', user.id)
          .maybeSingle()
        
        setUserProfileData(profile)
      } else {
        setUserProfileData(null)
      }
    } catch (err) {
      console.error('Error in auth setup loop:', err.message)
    } finally {
      setCheckingAuth(false)
    }
  }

  useEffect(() => {
    fetchUserSessionAndProfile()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSessionUser(null)
    setUserProfileData(null)
    setCurrentView('feed')
  }

  /**
   * handleStartChat — Composite Project-Isolated Room Router
   *
   * Accepts the target user's ID and an optional jobContext object (the full
   * job_posts row). When jobContext is provided (i.e., triggered via "Apply to
   * Build"), the lookup AND insert are scoped to the exact 3-column composite
   * key: (developer_id, business_id, job_id). This guarantees that a developer
   * can have multiple simultaneous chat threads with the same business owner —
   * one per distinct project contract — without any collision.
   */
  const handleStartChat = async (targetParticipantId, jobContext = null) => {
    if (sessionUser.id === targetParticipantId) {
      alert("You cannot start a chat thread with yourself.")
      return
    }
    
    try {
      const isInitiatorDev = currentView === 'jobs'
      const devId = isInitiatorDev ? sessionUser.id : targetParticipantId
      const bizId = isInitiatorDev ? targetParticipantId : sessionUser.id
      const targetJobId = jobContext?.id && jobContext?.type !== 'system' ? jobContext.id : null

      // ── Step 1: COMPOSITE LOOKUP (array-based, never errors) ─────────────────
      let lookupQuery = supabase
        .from('chat_rooms')
        .select('id, job_id, developer_status, business_status')
        .eq('developer_id', devId)
        .eq('business_id', bizId)

      if (targetJobId) {
        // Project-scoped composite lookup: match only this exact job contract UUID.
        lookupQuery = lookupQuery.eq('job_id', targetJobId)
      } else if (jobContext?.type === 'system') {
        // System-scoped composite lookup: match this exact system UUID.
        lookupQuery = lookupQuery.eq('active_meet_type', `system:${jobContext.id}:${jobContext.title}`)
      } else {
        // General chat fallback (profile modal): look for rooms with no job binding and no system binding.
        lookupQuery = lookupQuery.is('job_id', null).is('active_meet_type', null)
      }

      const { data: matchedRooms, error: lookupError } = await lookupQuery.limit(1)

      if (lookupError) {
        console.warn('Room lookup warning:', lookupError.message)
      }

      const existingRoom = matchedRooms?.[0] || null

      if (existingRoom) {
        // Restore deleted statuses if needed
        const updates = {};
        if (existingRoom.developer_status === 'deleted') updates.developer_status = 'negotiating';
        if (existingRoom.business_status === 'deleted') updates.business_status = 'negotiating';
        
        if (Object.keys(updates).length > 0) {
          await supabase.from('chat_rooms').update(updates).eq('id', existingRoom.id);
        }

        // Room for this exact project context already exists — navigate into it.
        if (targetJobId) setPendingRoomJobId(targetJobId)
        setSelectedProfileModal(null)
        setCurrentView('inbox')
        return 
      }

      // ── Step 2: COMPOSITE INSERT ──────────────────────────────────────────────
      const newRoomPayload = { 
        developer_id: devId, 
        business_id: bizId,
        developer_status: 'negotiating',
        business_status: 'negotiating',
        deal_confirmed: false,
        job_id: targetJobId,
        ...(jobContext?.type === 'system' ? { active_meet_type: `system:${jobContext.id}:${jobContext.title}` } : {})
      }

      const { error: insertError } = await supabase
        .from('chat_rooms')
        .insert([newRoomPayload])

      if (insertError) {
        // ── UPSERT-STYLE RECOVERY PATH ─────────────────────────────────────────
        console.warn('INSERT into chat_rooms failed, attempting recovery lookup:', insertError.message)

        let recoveryQuery = supabase
          .from('chat_rooms')
          .select('id, job_id, developer_status, business_status')
          .eq('developer_id', devId)
          .eq('business_id', bizId)
          .limit(1)

        if (targetJobId) {
          recoveryQuery = recoveryQuery.eq('job_id', targetJobId)
        } else if (jobContext?.type === 'system') {
          recoveryQuery = recoveryQuery.eq('active_meet_type', `system:${jobContext.id}:${jobContext.title}`)
        } else {
          recoveryQuery = recoveryQuery.is('job_id', null).is('active_meet_type', null)
        }
        
        const { data: recoveredRooms } = await recoveryQuery

        const recoveredRoom = recoveredRooms?.[0] || null

        if (recoveredRoom) {
          // Restore deleted statuses if needed
          const updates = {};
          if (recoveredRoom.developer_status === 'deleted') updates.developer_status = 'negotiating';
          if (recoveredRoom.business_status === 'deleted') updates.business_status = 'negotiating';
          
          if (Object.keys(updates).length > 0) {
            await supabase.from('chat_rooms').update(updates).eq('id', recoveredRoom.id);
          }

          if (targetJobId) setPendingRoomJobId(targetJobId)
          setSelectedProfileModal(null)
          setCurrentView('inbox')
          return
        }

        // If we truly cannot find or create a room, surface it to the user clearly.
        throw insertError
      }

      // INSERT succeeded — signal Inbox to auto-select the newly created thread.
      if (targetJobId) setPendingRoomJobId(targetJobId)
      setSelectedProfileModal(null)
      setCurrentView('inbox')
    } catch (err) { 
      console.error('Error initializing isolated chat session:', err.message)
      alert(`Could not open project channel. Error: ${err.message}`)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-t from-orange-100/30 via-slate-50/10 to-transparent flex items-center justify-center font-sans px-4">
        <p className="text-xs font-bold text-orange-600 animate-pulse uppercase tracking-widest text-center">Establishing Secure Sync...</p>
      </div>
    )
  }

  if (!sessionUser) {
    return (
      <div className="min-h-screen bg-gradient-to-t from-orange-100/30 via-slate-50/10 to-transparent font-sans py-12 flex flex-col justify-center px-4">
        <div className="max-w-md w-full mx-auto">
          <div className="text-center mb-6"><span className="text-2xl font-black text-slate-900">bot<span className="text-orange-500">mart</span></span></div>
          <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl shadow-xl">
            {/* Added trigger to re-sync full state data profiles upon successful onboarding registration/login */}
            <AuthPage onAuthSuccess={() => fetchUserSessionAndProfile()} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans antialiased relative overflow-x-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-orange-100/25 via-slate-50/10 to-transparent pointer-events-none z-0" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar currentView={currentView} setCurrentView={setCurrentView} />

        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex-1">
          {currentView === 'feed' && <BusinessFeed onAcquireSystem={handleStartChat} onViewProfile={setSelectedProfileModal} />}
          
          {/* Pass full job object as second argument so handleStartChat can bind the room to job_id */}
          {currentView === 'jobs' && (
            <JobBoard 
              onNavigateToPost={() => setCurrentView('post_job')} 
              onApplyToBuild={(targetId, jobObject) => handleStartChat(targetId, jobObject)} 
              onViewProfile={setSelectedProfileModal} 
            />
          )}
          
          {/* Gatekeeper Check 1: Block Developers from accessing the creation form directly via views */}
          {currentView === 'post_job' && (
            userProfileData?.user_type === 'developer' ? (
              <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
                <span className="text-2xl">🔒</span>
                <h3 className="text-base font-bold text-slate-900 mt-2">Access Restricted</h3>
                <p className="text-slate-500 text-xs mt-1">Only registered Business Clients are authorized to post operational bottlenecks onto the active pipeline board.</p>
                <button onClick={() => setCurrentView('jobs')} className="mt-4 px-4 py-2 bg-orange-500 text-white font-bold text-xs rounded-lg uppercase tracking-wider">Return to Pipelines</button>
              </div>
            ) : (
              <PostJobForm userSessionId={sessionUser.id} onSubmissionSuccess={() => setCurrentView('jobs')} />
            )
          )}

          {/* Gatekeeper Check 2: Block Businesses from creating listings inside the System Compiler Portal */}
          {currentView === 'creator' && (
            userProfileData?.user_type === 'business' ? (
              <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
                <span className="text-2xl">🔒</span>
                <h3 className="text-base font-bold text-slate-900 mt-2">Access Restricted</h3>
                <p className="text-slate-500 text-xs mt-1">Only active AI Developers are authorized to index systemic automations within the compiler matrix portal.</p>
                <button onClick={() => setCurrentView('feed')} className="mt-4 px-4 py-2 bg-orange-500 text-white font-bold text-xs rounded-lg uppercase tracking-wider">Return to Market Feed</button>
              </div>
            ) : (
              <CreatorPortal userSessionId={sessionUser.id} />
            )
          )}

          {currentView === 'inbox' && (
            <Inbox 
              userSessionId={sessionUser.id} 
              onViewProfile={setSelectedProfileModal}
              // Auto-select signal: when set, Inbox finds the room with this job_id and opens it.
              // onRoomSelected is the cleanup callback that clears the signal after consumption.
              pendingRoomJobId={pendingRoomJobId}
              onRoomSelected={() => setPendingRoomJobId(null)}
            />
          )}
          {currentView === 'profile' && <ProfileSection sessionUser={sessionUser} onLogout={handleLogout} />}
        </main>
      </div>

      {/* GLOBAL POPUP MODAL */}
      {selectedProfileModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            
            <div className="bg-slate-900 p-5 text-white flex items-center gap-3 shrink-0">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-orange-500 bg-slate-800 shrink-0">
                {selectedProfileModal.avatar_url ? (
                  <img src={selectedProfileModal.avatar_url} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-sm bg-orange-500 uppercase">
                    {selectedProfileModal.full_name?.substring(0,2) || selectedProfileModal.username?.substring(0,2) || 'US'}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base leading-tight truncate">{selectedProfileModal.full_name || 'Verified User'}</h3>
                <div className="flex items-center gap-2 mt-0.5 min-w-0">
                  <p className="text-xs text-orange-400 truncate">@{selectedProfileModal.username || 'user'}</p>
                  {/* Added clean user type badge to the public inspector overlay layout panel */}
                  {selectedProfileModal.user_type && (
                    <span className="text-[8px] font-extrabold uppercase tracking-widest bg-white/10 text-orange-300 border border-white/5 px-1 py-0.5 rounded shrink-0">
                      {selectedProfileModal.user_type === 'developer' ? 'AI Developer' : 'Business Client'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bio / Focus Range</h4>
                <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap break-words">
                  {selectedProfileModal.bio || 'This member has not composed a custom bio yet.'}
                </p>
              </div>
              
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Professional Indexes</h4>
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  {selectedProfileModal.github_url ? (
                    <a href={selectedProfileModal.github_url} target="_blank" rel="noreferrer" className="flex-1 py-2 px-3 text-center text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors truncate">GitHub</a>
                  ) : (
                    <span className="flex-1 py-2 px-3 text-center text-xs font-semibold bg-slate-50 border border-slate-100 border-dashed rounded-lg text-slate-400 cursor-not-allowed truncate">GitHub (Not Linked)</span>
                  )}
                  
                  {selectedProfileModal.linkedin_url ? (
                    <a href={selectedProfileModal.linkedin_url} target="_blank" rel="noreferrer" className="flex-1 py-2 px-3 text-center text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors truncate">LinkedIn</a>
                  ) : (
                    <span className="flex-1 py-2 px-3 text-center text-xs font-semibold bg-slate-50 border border-slate-100 border-dashed rounded-lg text-slate-400 cursor-not-allowed truncate">LinkedIn (Not Linked)</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100">
                <button 
                  onClick={() => handleStartChat(selectedProfileModal.id || selectedProfileModal.creator_id || selectedProfileModal.business_id)} 
                  className="w-full py-2 px-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-colors order-1 sm:order-none"
                >
                  Initiate Chat Secure Link
                </button>
                <button 
                  onClick={() => setSelectedProfileModal(null)} 
                  className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg text-xs uppercase tracking-wider transition-colors order-2 sm:order-none"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}