import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Inbox({ userSessionId, onViewProfile, pendingRoomJobId, onRoomSelected }) {
  const [rooms, setRooms] = useState([])
  const [activeRoom, setActiveRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loadingRooms, setLoadingRooms] = useState(true)

  // Track specific project properties cleanly
  const [clientOpenJobs, setClientOpenJobs] = useState([])
  const [selectedJobIdToLock, setSelectedJobIdToLock] = useState('')

  const [showMeetForm, setShowMeetForm] = useState(false)
  const [meetTypeInput, setMeetTypeInput] = useState('doubt')
  const [meetTimeInput, setMeetTimeInput] = useState('')

  const [showJitsiPopup, setShowJitsiPopup] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [isFirstMeeting, setIsFirstMeeting] = useState(() => {
    return localStorage.getItem(`hide_jitsi_popup_${userSessionId}`) !== 'true'
  })

  const messagesEndRef = useRef(null)
  const activeRoomIdRef = useRef(null)
  const currentUid = String(userSessionId || '')

  useEffect(() => {
    activeRoomIdRef.current = activeRoom ? activeRoom.id : null
  }, [activeRoom])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 🔄 Sync available project listings for the dropdown select tool.
  // Pre-populate selectedJobIdToLock from the room's own job_id column first (if set),
  // so the proposal is already bound to the correct contract without manual selection.
  useEffect(() => {
    if (activeRoom && !activeRoom.deal_confirmed) {
      async function fetchJobs() {
        const bizId = activeRoom.business_id || activeRoom.biz_profile?.id
        if (!bizId) return
        const { data } = await supabase.from('job_posts').select('id, title').eq('business_id', bizId).eq('status', 'open')
        setClientOpenJobs(data || [])

        // Priority order for pre-selection:
        // 1. The job_id already stored on this specific chat_room row (most accurate).
        // 2. The first open job for this client if no room-level binding exists.
        if (activeRoom.job_id) {
          setSelectedJobIdToLock(activeRoom.job_id)
        } else if (data && data.length > 0 && !selectedJobIdToLock) {
          setSelectedJobIdToLock(data[0].id)
        }
      }
      fetchJobs()
    }
  }, [activeRoom?.id, activeRoom?.deal_confirmed])

  async function fetchChatRooms() {
    try {
      if (!currentUid) return
      
      const { data, error } = await supabase
        .from('chat_rooms')
        .select(`
          id, developer_id, business_id, job_id,
          developer_status, business_status, scheduled_meet_time, meeting_link,
          deal_confirmed, active_meet_type, meet_creator_id,
          dev_profile:developer_id(id, full_name, username, avatar_url, bio, github_url, linkedin_url, user_type),
          biz_profile:business_id(id, full_name, username, avatar_url, bio, github_url, linkedin_url, user_type),
          job_posts:job_id(id, title)
        `)
        .or(`developer_id.eq.${currentUid},business_id.eq.${currentUid}`)

      if (error) throw error

      const normalized = (data || [])
        .filter(room => {
          const isDev = currentUid === String(room.developer_id);
          const isBiz = currentUid === String(room.business_id);
          if (isDev && room.developer_status === 'deleted') return false;
          if (isBiz && room.business_status === 'deleted') return false;
          return true;
        })
        .map(room => ({
        ...room,
        developer_status: room.developer_status || 'negotiating',
        business_status: room.business_status || 'negotiating'
      }))

      setRooms(normalized)
      
      if (activeRoomIdRef.current) {
        const freshActive = normalized.find(r => r.id === activeRoomIdRef.current)
        if (freshActive) {
          setActiveRoom(freshActive)
        } else {
          setActiveRoom(null)
        }
      }
    } catch (err) {
      console.error('Error syncing room nodes:', err.message)
    } finally {
      setLoadingRooms(false)
    }
  }

  useEffect(() => {
    if (currentUid) {
      fetchChatRooms()
    }
  }, [currentUid])

  // ── AUTO-SELECT PENDING ROOM ──────────────────────────────────────────────
  // When App.jsx navigates the user to Inbox after "Apply to Build", it sets
  // pendingRoomJobId to the job.id of the project the developer just initiated.
  // This effect watches rooms + that signal and auto-opens the exact thread so
  // the user lands directly in the correct conversation without manual sidebar click.
  useEffect(() => {
    if (!pendingRoomJobId || rooms.length === 0) return

    const targetRoom = rooms.find(r => r.job_id === pendingRoomJobId)
    if (targetRoom) {
      setActiveRoom(targetRoom)
      // Consume the signal so this doesn't re-fire on subsequent room refreshes.
      if (typeof onRoomSelected === 'function') onRoomSelected()
    }
  }, [pendingRoomJobId, rooms])

  useEffect(() => {
    if (!activeRoom?.id) {
      setMessages([])
      return
    }

    async function fetchCurrentMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', activeRoom.id)
        .order('created_at', { ascending: true })
      
      if (!error && data) {
        setMessages(prev => {
          // Keep optimistic messages that haven't synced yet, but merge real ones
          const realIds = new Set(data.map(m => m.id))
          const optimisticMsgs = prev.filter(m => m.id && String(m.id).startsWith('temp-'))
          return [...data, ...optimisticMsgs]
        })
      }
    }
    fetchCurrentMessages()

    const msgStreamChannel = supabase
      .channel(`room-viewport-stream-${activeRoom.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${activeRoom.id}` }, 
        payload => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev.filter(m => !String(m.id).startsWith('temp-')), payload.new]
          })
        }
      )
      .subscribe()

    // Fallback: Poll every 4 seconds in case Realtime isn't enabled for the messages table
    const pollInterval = setInterval(() => {
      fetchCurrentMessages()
    }, 4000)

    return () => {
      clearInterval(pollInterval)
      if (msgStreamChannel) supabase.removeChannel(msgStreamChannel)
    }
  }, [activeRoom?.id])

  useEffect(() => {
    if (!currentUid) return

    const stableActivityChannel = supabase
      .channel('inbox-classified-activity-bus')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_rooms' },
        payload => {
          const updatedRoom = payload.new
          const isDev = currentUid === String(updatedRoom.developer_id);
          const isBiz = currentUid === String(updatedRoom.business_id);
          const isDeletedForMe = (isDev && updatedRoom.developer_status === 'deleted') || (isBiz && updatedRoom.business_status === 'deleted');

          if (isDeletedForMe) {
            setRooms(currentRooms => currentRooms.filter(r => r.id !== updatedRoom.id))
            if (activeRoomIdRef.current === updatedRoom.id) setActiveRoom(null)
            return;
          }

          if (String(updatedRoom.developer_id) === currentUid || String(updatedRoom.business_id) === currentUid) {
            setRooms(currentRooms => currentRooms.map(r => {
              if (r.id === updatedRoom.id) {
                const isOpen = activeRoomIdRef.current === updatedRoom.id
                const synchronized = {
                  ...r,
                  ...updatedRoom,
                  developer_status: updatedRoom.developer_status || 'negotiating',
                  business_status: updatedRoom.business_status || 'negotiating'
                }
                if (isOpen) setActiveRoom(synchronized)
                return synchronized
              }
              return r
            }))
          }
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_rooms' },
        payload => {
          const deletedRoomId = payload.old.id
          if (activeRoomIdRef.current === deletedRoomId) {
            setActiveRoom(null)
          }
          setRooms(currentRooms => currentRooms.filter(r => r.id !== deletedRoomId))
        }
      )
      .subscribe()

    return () => {
      if (stableActivityChannel) supabase.removeChannel(stableActivityChannel)
    }
  }, [currentUid])

  const handleSelectActiveRoom = (room) => {
    setActiveRoom(room)
  }

  async function handleSendMessage(e) {
    e.preventDefault()
    if (!newMessage.trim() || !activeRoom || !currentUid) return
    const text = newMessage.trim()
    setNewMessage('')
    
    // OPTIMISTIC UPDATE
    const tempMsg = {
      id: `temp-${Date.now()}`,
      room_id: activeRoom.id,
      sender_id: currentUid,
      message_text: text,
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempMsg])

    const { error } = await supabase.from('messages').insert([{ room_id: activeRoom.id, sender_id: currentUid, message_text: text }])
    
    if (error) {
      console.error("Failed to send message:", error.message)
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      alert(`Failed to send message: ${error.message}`)
    }
  }

  async function handleDeleteChatRoom(roomId, e) {
    e.stopPropagation()
    const confirmDelete = window.confirm("Are you sure you want to permanently clear this chat channel?")
    if (!confirmDelete) return
    try {
      const roomToHide = rooms.find(r => r.id === roomId);
      if (!roomToHide) return;
      const isDev = currentUid === String(roomToHide.developer_id);

      // First delete associated messages to avoid foreign key constraints
      const { error: msgError } = await supabase.from('messages').delete().eq('room_id', roomId)
      if (msgError) console.error("Error deleting messages:", msgError.message)

      const { data, error } = await supabase.from('chat_rooms').delete().eq('id', roomId).select()
      if (error) {
        console.error("Failed to delete chat room:", error.message)
        alert("Failed to delete the chat. " + error.message)
        return
      }

      if (!data || data.length === 0) {
        const updatePayload = isDev ? { developer_status: 'deleted' } : { business_status: 'deleted' };
        const { error: softDeleteError } = await supabase.from('chat_rooms').update(updatePayload).eq('id', roomId);
        if (softDeleteError) {
          console.error("Soft delete failed:", softDeleteError.message);
          alert("Failed to hide the chat. " + softDeleteError.message);
          return;
        }
      }
      
      if (activeRoom?.id === roomId) setActiveRoom(null)
      setRooms(prev => prev.filter(r => r.id !== roomId))
    } catch (err) {
      console.error(err.message)
    }
  }

  // Propose a deal, updating the appropriate status depending on who initiated it
  async function handleProposeDeal() {
    if (!activeRoom) return
    try {
      const isSystemAcquisition = activeRoom.active_meet_type && (activeRoom.active_meet_type.startsWith('system:') || activeRoom.active_meet_type.startsWith('system_proposal:'))
      let targetJobTitle = 'Active Requirement'
      let lockJobId = null
      
      if (isSystemAcquisition) {
        // Keep the system format intact but mark it as a proposal
        const payload = activeRoom.active_meet_type.replace('system_proposal:', '').replace('system:', '')
        targetJobTitle = payload
      } else {
        const selectedJob = clientOpenJobs.find(j => j.id === selectedJobIdToLock)
        if (selectedJob) targetJobTitle = selectedJob.title
        lockJobId = selectedJobIdToLock
      }
      
      const isDev = currentUid === String(activeRoom.developer_id)

      const updates = {
        active_meet_type: isSystemAcquisition ? `system_proposal:${targetJobTitle}` : `proposal:${targetJobTitle}` 
      }
      
      if (isDev) {
        updates.developer_status = 'accepted'
      } else {
        updates.business_status = 'accepted'
      }

      // If it was a general chat, lock it to the newly proposed job (skip for system acquisitions)
      if (!activeRoom.job_id && lockJobId && !isSystemAcquisition) {
        updates.job_id = lockJobId
      }

      const { error } = await supabase.from('chat_rooms').update(updates).eq('id', activeRoom.id)
      if (error) throw error
    } catch (err) {
      console.error(err.message)
    }
  }

  async function handleConfirmDeal() {
    if (!activeRoom || !currentUid) return
    const isDev = currentUid === String(activeRoom.developer_id)
    const absoluteConfirmation = window.confirm("Ready to lock in this deal? Once confirmed, this agreement is secured.")
    
    try {
      const { data: freshRoom } = await supabase.from('chat_rooms').select('job_id, active_meet_type, developer_status, business_status').eq('id', activeRoom.id).single()
      
      if (freshRoom) {
        const jobIdToBook = freshRoom.job_id || activeRoom.job_id
        const isSystemProposal = freshRoom.active_meet_type && freshRoom.active_meet_type.startsWith('system_proposal:')

        if (jobIdToBook && !isSystemProposal) {
          const { data: directData, error: directUpdateError } = await supabase
            .from('job_posts')
            .update({ status: 'booked' })
            .eq('id', jobIdToBook)
            .select()

          if (directUpdateError || !directData || directData.length === 0) {
            console.warn('Direct job update blocked (RLS — developer path), attempting RPC fallback.')
            const { error: rpcError } = await supabase.rpc('update_job_status_secure', {
              p_job_id: jobIdToBook,
              p_status: 'booked'
            })
            if (rpcError) {
              console.error('Job status update failed:', rpcError.message)
            }
          }
        } else if (isSystemProposal) {
           const payload = freshRoom.active_meet_type.substring(16)
           if (payload.length > 36 && payload[36] === ':') {
               const systemId = payload.substring(0, 36)
               const { data: sysData, error: directUpdateError } = await supabase.from('listings').update({ status: 'booked' }).eq('id', systemId).select()
               if (directUpdateError || !sysData || sysData.length === 0) {
                   console.warn('Direct system update blocked. Attempting RPC fallback.')
                   await supabase.rpc('update_system_status_secure', { p_system_id: systemId, p_status: 'booked' })
               }
           }
        }
        
        const updates = isDev ? { developer_status: 'accepted' } : { business_status: 'accepted' }
        const currentDevStatus = freshRoom.developer_status || 'negotiating'
        const currentBizStatus = freshRoom.business_status || 'negotiating'
        const isFullyConfirmed = isDev ? currentBizStatus === 'accepted' : currentDevStatus === 'accepted'

        if (absoluteConfirmation && isFullyConfirmed) {
          updates.deal_confirmed = true
          updates.developer_status = 'negotiating'
          updates.business_status = 'negotiating'

          // STRICT STATE ISOLATION: A room must NEVER have both a system and a job ID!
          if (isSystemProposal) {
             updates.active_meet_type = freshRoom.active_meet_type.replace('system_proposal:', 'system_booked:')
             updates.job_id = null 
          } else {
             updates.active_meet_type = null
             updates.job_id = jobIdToBook
          }
        }

        const { error: roomError } = await supabase.from('chat_rooms').update(updates).eq('id', activeRoom.id)
        if (!roomError) {
          setActiveRoom(prev => ({ ...prev, ...updates }))
          setRooms(prevRooms => prevRooms.map(r => r.id === activeRoom.id ? { ...r, ...updates } : r))
        }
      }
    } catch (error) {
      console.error(error.message)
    }
  }

  async function handleBreakActiveDeal() {
    if (!activeRoom) return
    const confirmBreak = window.confirm("🚨 WARNING: Are you sure you want to break this agreement?")
    if (!confirmBreak) return

    const isSystemBooked = activeRoom.active_meet_type && activeRoom.active_meet_type.startsWith('system_booked:')
    const isJobBooked = !isSystemBooked && activeRoom.job_id
    
    // STRICT CLEANUP PAYLOAD
    const resetPayload = { 
      developer_status: 'negotiating', business_status: 'negotiating', deal_confirmed: false,
      scheduled_meet_time: null, meeting_link: null, meet_creator_id: null,
      active_meet_type: isSystemBooked ? activeRoom.active_meet_type.replace('system_booked:', 'system:') : null,
      job_id: isJobBooked ? activeRoom.job_id : null
    }

    try {
      // ── DUAL-PATH STATUS REVERT ───────────────────────────────────────────
      // We explicitly branch here so a single room can NEVER revert both a job and a system.
      if (isSystemBooked) {
         // Path A: Revert System
         const payload = activeRoom.active_meet_type.substring(14)
         if (payload.length >= 36 && payload[36] === ':') {
             const systemId = payload.substring(0, 36)
             console.log('Breaking SYSTEM deal:', systemId)
             const { data: sysData, error: directRevertError } = await supabase.from('listings').update({ status: 'open' }).eq('id', systemId).eq('status', 'booked').select()
             if (directRevertError || !sysData || sysData.length === 0) {
                 console.log('Falling back to RPC for SYSTEM')
                 await supabase.rpc('revert_system_listing_secure_v4', { p_room_id: activeRoom.id })
             }
         }
      } else if (activeRoom.job_id) {
         // Path B: Revert Job
         const jobIdToRevert = activeRoom.job_id
         console.log('Breaking JOB deal:', jobIdToRevert)
         const { data: directData, error: directRevertError } = await supabase
           .from('job_posts')
           .update({ status: 'open' })
           .eq('id', jobIdToRevert)
           .eq('status', 'booked')
           .select()

         if (directRevertError || !directData || directData.length === 0) {
           console.warn('Direct job revert blocked, attempting RPC fallback.')
           const { error: rpcError } = await supabase.rpc('revert_job_post_secure_v4', { p_room_id: activeRoom.id })
           if (rpcError) console.error('Job status revert failed:', rpcError.message)
         }
      }

      // Reset the room state after reverting the listing.
      await supabase.from('chat_rooms').update(resetPayload).eq('id', activeRoom.id)
      
      setActiveRoom(prev => ({ ...prev, ...resetPayload }))
      setRooms(prevRooms => prevRooms.map(r => r.id === activeRoom.id ? { ...r, ...resetPayload } : r))

    } catch (error) {
      console.error('Error aborting active pipeline lock:', error.message)
    }
  }

  async function handleResetOrDeclineDeal() {
    if (!activeRoom) return
    const isSystemProposal = activeRoom.active_meet_type && activeRoom.active_meet_type.startsWith('system_proposal:')
    const resetPayload = { 
      developer_status: 'negotiating', 
      business_status: 'negotiating', 
      deal_confirmed: false, 
      active_meet_type: isSystemProposal ? activeRoom.active_meet_type.replace('system_proposal:', 'system:') : null 
    }
    const { error } = await supabase.from('chat_rooms').update(resetPayload).eq('id', activeRoom.id)
    if (!error) {
      setActiveRoom(prev => ({ ...prev, ...resetPayload }))
      setRooms(prevRooms => prevRooms.map(r => r.id === activeRoom.id ? { ...r, ...resetPayload } : r))
    }
  }

  async function handleProposeMeeting(e) {
    e.preventDefault()
    if (!meetTimeInput.trim() || !activeRoom || !currentUid) return

    const randomRoomPin = Math.floor(1000 + Math.random() * 9000)
    const generatedMeetLink = `https://meet.jit.si/BotMart-${activeRoom.id}-${randomRoomPin}`
    const isDev = currentUid === String(activeRoom.developer_id)

    const isSystemBooked = activeRoom.active_meet_type && activeRoom.active_meet_type.startsWith('system_booked:')

    const updates = {
      scheduled_meet_time: meetTimeInput.trim(),
      meeting_link: generatedMeetLink,
      active_meet_type: isSystemBooked ? activeRoom.active_meet_type : meetTypeInput,
      meet_creator_id: currentUid,
      developer_status: isDev ? 'accepted' : 'negotiating',
      business_status: isDev ? 'negotiating' : 'accepted'
    }

    const { error } = await supabase.from('chat_rooms').update(updates).eq('id', activeRoom.id)
    if (!error) {
      setShowMeetForm(false)
      setMeetTimeInput('')
    }
  }

  async function handleAcceptMeeting() {
    if (!activeRoom || !currentUid) return
    const isDev = currentUid === String(activeRoom.developer_id)
    const updates = isDev ? { developer_status: 'accepted' } : { business_status: 'accepted' }
    await supabase.from('chat_rooms').update(updates).eq('id', activeRoom.id)
  }

  async function handleCancelOrDeclineMeeting() {
    if (!activeRoom) return
    const isSystemBooked = activeRoom.active_meet_type && activeRoom.active_meet_type.startsWith('system_booked:')
    await supabase.from('chat_rooms').update({
      developer_status: 'negotiating', business_status: 'negotiating',
      scheduled_meet_time: null, meeting_link: null, meet_creator_id: null,
      active_meet_type: isSystemBooked ? activeRoom.active_meet_type : null
    }).eq('id', activeRoom.id)
  }

  const handleLaunchClick = (e) => {
    if (isFirstMeeting) { e.preventDefault(); setShowJitsiPopup(true); }
  };

  const confirmFirstTimeLogin = () => {
    if (dontShowAgain) {
      localStorage.setItem(`hide_jitsi_popup_${currentUid}`, 'true');
      setIsFirstMeeting(false);
    }
    setShowJitsiPopup(false);
    window.open(`${activeRoom.meeting_link}#config.prejoinPageEnabled=true`, '_blank', 'noopener,noreferrer');
  };

  const negotiatingPipelines = rooms.filter(r => !r.deal_confirmed)
  const lockedAgreements = rooms.filter(r => r.deal_confirmed)

  return (
    <div className="relative h-full w-full">
      {showJitsiPopup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 flex flex-col gap-4 font-sans text-slate-900">
            <div className="flex items-center gap-2.5 text-orange-500">
              <span className="text-xl">🔒</span>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Jitsi Meet Login Required</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              If you are first time in a meet you must login to jisti after the meet is hosted. This ensures the secure workspace is properly initialized by a recognized host.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <input 
                type="checkbox" 
                id="dontShowAgain" 
                checked={dontShowAgain} 
                onChange={(e) => setDontShowAgain(e.target.checked)} 
                className="w-3.5 h-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer" 
              />
              <label htmlFor="dontShowAgain" className="text-[10px] font-bold text-slate-600 uppercase cursor-pointer">Don't show me again</label>
            </div>
            <div className="flex items-center justify-end gap-2 mt-2">
              <button onClick={() => setShowJitsiPopup(false)} className="px-3 py-2 text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase">Cancel</button>
              <button onClick={confirmFirstTimeLogin} className="px-4 py-2 text-[10px] font-bold bg-orange-500 text-white rounded uppercase shadow-xs">OK</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto bg-white border border-slate-200 rounded-xl overflow-hidden h-[calc(100vh-12rem)] grid grid-cols-1 md:grid-cols-4 font-sans antialiased text-slate-900">
        
        {/* Sidebar Panel Drawer */}
        <div className={`col-span-1 border-r border-slate-200 bg-slate-50 flex flex-col h-full ${activeRoom ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-5 py-4 border-b border-slate-200 h-[57px] flex items-center bg-white shrink-0">
            <h2 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Conversations</h2>
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            {loadingRooms ? (
              <div className="p-4 text-xs text-slate-400 animate-pulse">Syncing pipeline maps...</div>
            ) : rooms.length === 0 ? (
              <div className="p-4 text-xs text-slate-400 text-center mt-4">No connections indexed.</div>
            ) : (
              <div className="flex flex-col">
                
                {/* CATEGORY 1: CURRENT DISCUSSIONS */}
                <div className="flex flex-col">
                  <div className="bg-orange-50/60 px-4 py-2 border-b border-orange-100/40 flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">Current Discussions</span>
                  </div>
                  <div className="divide-y divide-slate-100 border-b border-slate-200/60">
                    {negotiatingPipelines.length === 0 ? (
                      <p className="text-[11px] text-slate-400 px-4 py-3 bg-white/50 italic">No negotiation sequences active</p>
                    ) : (
                      negotiatingPipelines.map(room => {
                        const isDev = currentUid === String(room.developer_id)
                        const profile = isDev ? room.biz_profile : room.dev_profile
                        const isSelected = activeRoom?.id === room.id
                        const linkedJobTitle = room.job_posts?.title || null
                        return (
                          <div key={room.id} className="group relative w-full flex items-center bg-white">
                            <button onClick={() => handleSelectActiveRoom(room)} className={`w-full text-left p-4 flex items-center gap-3 relative transition-colors ${isSelected ? 'bg-orange-50/50' : 'hover:bg-slate-50/60'}`}>
                              {isSelected && <span className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />}
                              <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                                {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center uppercase">{profile?.full_name?.substring(0,1) || 'U'}</div>}
                              </div>
                              <div className="truncate flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 text-sm truncate">{profile?.full_name || 'Anonymous'}</p>
                                {linkedJobTitle ? (
                                  <p className="text-[11px] font-medium text-orange-500 truncate mt-0.5" title={linkedJobTitle}>📋 {linkedJobTitle}</p>
                                ) : (() => {
                                  const isSys = room.active_meet_type && (room.active_meet_type.startsWith('system:') || room.active_meet_type.startsWith('system_proposal:') || room.active_meet_type.startsWith('system_booked:'))
                                  if (isSys) {
                                    let payload = room.active_meet_type
                                    if (payload.startsWith('system:')) payload = payload.substring(7)
                                    else if (payload.startsWith('system_proposal:')) payload = payload.substring(16)
                                    else if (payload.startsWith('system_booked:')) payload = payload.substring(14)
                                    const title = payload.length > 36 && payload[36] === ':' ? payload.substring(37) : payload
                                    
                                    const isBooked = room.active_meet_type.startsWith('system_booked:')
                                    const icon = isBooked ? '🤝' : '📋'
                                    const textColor = isBooked ? 'text-emerald-600' : 'text-orange-500'
                                    
                                    return <p className={`text-[11px] font-medium truncate mt-0.5 ${textColor}`} title={title}>{icon} {title}</p>
                                  }
                                  return <p className="text-[11px] font-medium text-slate-400 truncate mt-0.5">💬 Setup Negotiation</p>
                                })()}
                              </div>
                            </button>
                            <button onClick={(e) => handleDeleteChatRoom(room.id, e)} className="absolute right-3 p-1.5 text-slate-300 hover:text-red-500 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity z-20">🗑️</button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* CATEGORY 2: SECURED AGREEMENTS */}
                <div className="flex flex-col">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Secured Agreements
                  </div>
                  <div className="divide-y divide-slate-100">
                    {lockedAgreements.length === 0 ? (
                      <p className="text-[11px] text-slate-400 px-4 py-3 bg-white/50 italic">No locked deals confirmed yet</p>
                    ) : (
                      lockedAgreements.map(room => {
                        const isDev = currentUid === String(room.developer_id)
                        const profile = isDev ? room.biz_profile : room.dev_profile
                        const isSelected = activeRoom?.id === room.id
                        const linkedJobTitle = room.job_posts?.title || null

                        return (
                          <div key={room.id} className="group relative w-full flex items-center bg-white">
                            <button onClick={() => handleSelectActiveRoom(room)} className={`w-full text-left p-4 flex items-center gap-3 relative transition-colors ${isSelected ? 'bg-orange-50/50' : 'hover:bg-slate-50/60'}`}>
                              {isSelected && <span className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />}
                              <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                                {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center uppercase">{profile?.full_name?.substring(0,1) || 'U'}</div>}
                              </div>
                              <div className="truncate flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 text-sm truncate">{profile?.full_name || 'Anonymous'}</p>
                                  {linkedJobTitle ? (
                                    <p className="text-[11px] font-medium text-emerald-600 truncate mt-0.5" title={linkedJobTitle}>🤝 {linkedJobTitle}</p>
                                  ) : (() => {
                                    const isSys = room.active_meet_type && room.active_meet_type.startsWith('system_booked:')
                                    if (isSys) {
                                      const payload = room.active_meet_type.substring(14)
                                      const title = payload.length > 36 && payload[36] === ':' ? payload.substring(37) : payload
                                      return <p className="text-[11px] font-medium text-emerald-600 truncate mt-0.5" title={title}>🤝 {title}</p>
                                    }
                                    return <p className="text-[11px] font-medium text-emerald-600 truncate mt-0.5">🤝 Agreement Locked</p>
                                  })()}
                              </div>
                            </button>
                            <button onClick={(e) => handleDeleteChatRoom(room.id, e)} className="absolute right-3 p-1.5 text-slate-300 hover:text-red-500 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity z-20">🗑️</button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Main Communication Frame */}
        <div className={`col-span-3 flex flex-col bg-white h-full overflow-hidden ${!activeRoom ? 'hidden md:flex' : 'flex'}`}>
          {activeRoom ? (
            <>
              {/* Identity Header Row */}
              {(() => {
                const isDev = currentUid === String(activeRoom.developer_id)
                const targetProfile = isDev ? activeRoom.biz_profile : activeRoom.dev_profile
                const myStatus = isDev ? activeRoom.developer_status : activeRoom.business_status
                const peerStatus = isDev ? activeRoom.business_status : activeRoom.developer_status
                
                const isSystemMode = activeRoom.active_meet_type && (
                  activeRoom.active_meet_type.startsWith('system:') || 
                  activeRoom.active_meet_type.startsWith('system_proposal:') ||
                  activeRoom.active_meet_type.startsWith('system_booked:')
                )
                // For Job Board: Only Developer proposes. For Systems: Only Client (!isDev) proposes. For general chats: either can.
                const canPropose = activeRoom.job_id ? isDev : (isSystemMode ? !isDev : true)

                // Parse incoming active project text context cleanly
                const hasProposalText = activeRoom.active_meet_type && activeRoom.active_meet_type.startsWith('proposal:')
                const hasSystemProposalText = activeRoom.active_meet_type && activeRoom.active_meet_type.startsWith('system_proposal:')
                
                let activeProposalTitle = ''
                if (hasProposalText) {
                  activeProposalTitle = activeRoom.active_meet_type.split('proposal:')[1]
                } else if (hasSystemProposalText) {
                  const payload = activeRoom.active_meet_type.substring(16)
                  activeProposalTitle = payload.length > 36 && payload[36] === ':' ? payload.substring(37) : payload
                }
                
                let activeSystemTitle = ''
                if (isSystemMode) {
                  let payload = activeRoom.active_meet_type
                  if (payload.startsWith('system:')) payload = payload.substring(7)
                  else if (payload.startsWith('system_proposal:')) payload = payload.substring(16)
                  else if (payload.startsWith('system_booked:')) payload = payload.substring(14)
                  
                  if (payload.length > 36 && payload[36] === ':') {
                     activeSystemTitle = payload.substring(37)
                  } else {
                     activeSystemTitle = payload
                  }
                }
                const hasSystemText = isSystemMode

                return (
                  <div className="flex flex-col shrink-0 bg-white border-b border-slate-200">
                    <div className="px-6 py-3 flex justify-between items-center h-[57px] gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button onClick={() => setActiveRoom(null)} className="p-1 text-slate-400 hover:text-slate-600 md:hidden font-bold text-sm shrink-0">← Back</button>
                        <div className="w-7 h-7 rounded-full overflow-hidden border border-slate-200 cursor-pointer shrink-0" onClick={() => onViewProfile(targetProfile)}>
                          {targetProfile?.avatar_url ? <img src={targetProfile.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center uppercase">{targetProfile?.full_name?.substring(0,1) || 'U'}</div>}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-900 text-sm truncate leading-tight">{targetProfile?.full_name || 'Connection Thread'}</span>
                          {activeRoom.job_posts?.title && (
                            <span className="text-[10px] font-bold text-orange-600 truncate uppercase tracking-wider">Project: {activeRoom.job_posts.title}</span>
                          )}
                          {activeSystemTitle && (
                            <span className="text-[10px] font-bold text-orange-600 truncate uppercase tracking-wider">System: {activeSystemTitle}</span>
                          )}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase shrink-0"><span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> Connected</span>
                    </div>

                    <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shrink-0">
                      {!activeRoom.deal_confirmed ? (
                        <>
                          <div className="space-y-0.5 max-w-md">
                            <p className="font-bold text-slate-800 flex items-center gap-1">🤝 Lock Project Deal Alignment</p>
                            {/* ANY ACTIVE PROPOSAL VISIBILITY */}
                            {activeProposalTitle ? (
                              <p className="text-[11px] text-orange-600 font-bold bg-orange-50 border border-orange-100 p-1 px-2 rounded-md">Proposal offered for: <span className="underline">{activeProposalTitle}</span></p>
                            ) : (
                              <p className="text-[11px] text-slate-500 leading-relaxed">Verify terms. Select target project and execute approval handshake loops.</p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Dropdown removed as per user request */}
                            {myStatus === 'accepted' ? (
                              <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg shadow-2xs">
                                <span className="text-[11px] text-orange-600 font-bold animate-pulse">⏳ Awaiting peer match...</span>
                                <button onClick={handleResetOrDeclineDeal} className="px-2 py-1 bg-slate-100 text-slate-600 font-extrabold text-[10px] rounded uppercase">Cancel</button>
                              </div>
                            ) : peerStatus === 'accepted' ? (
                              <div className="flex items-center gap-2 bg-emerald-50 p-1.5 rounded-lg border border-emerald-200">
                                <span className="text-[10px] font-bold text-emerald-700 px-1.5 animate-pulse">Proposal Offered!</span>
                                <button onClick={handleConfirmDeal} className="px-3 py-1.5 bg-emerald-600 text-white font-extrabold text-[10px] rounded uppercase shadow-xs">
                                  Approve & Lock Deal
                                </button>
                                <button onClick={handleResetOrDeclineDeal} className="px-2 py-1.5 bg-white border border-slate-200 text-slate-500 font-bold text-[10px] rounded uppercase">Decline</button>
                              </div>
                            ) : (
                              canPropose ? (
                                <button onClick={handleProposeDeal} className="px-3.5 py-2 bg-orange-500 text-white font-bold text-[10px] rounded uppercase tracking-wider shadow-2xs">Propose Deal Parameters</button>
                              ) : (
                                <div className="px-3.5 py-2 bg-slate-100 text-slate-400 border border-slate-200 font-bold text-[10px] rounded uppercase tracking-wider cursor-not-allowed">Awaiting Proposal</div>
                              )
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {!activeRoom.scheduled_meet_time ? (
                            <>
                              <div className="space-y-0.5">
                                <p className="font-bold text-emerald-700 flex items-center gap-1">🔒 Pipeline Active & Secured</p>
                                <p className="text-[11px] text-slate-500">Terms fully locked. Schedule strategic sync options below.</p>
                              </div>
                              {!showMeetForm ? (
                                <div className="flex items-center gap-1.5">
                                  <button onClick={handleBreakActiveDeal} className="px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-100 font-bold text-[10px] rounded uppercase">💥 Break Locked Deal</button>
                                  <button onClick={() => { setMeetTypeInput('doubt'); setShowMeetForm(true) }} className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold text-[10px] rounded uppercase shadow-2xs">Request Sync Meet</button>
                                </div>
                              ) : (
                                <form onSubmit={handleProposeMeeting} className="flex items-center gap-1.5">
                                  <input type="text" required placeholder="e.g., Today 6:00 PM" value={meetTimeInput} onChange={(e) => setMeetTimeInput(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-[11px] font-medium text-slate-900 bg-white focus:outline-none w-36" />
                                  <button type="submit" className="px-2.5 py-1 bg-emerald-600 text-white font-bold text-[10px] rounded uppercase">Send</button>
                                  <button type="button" onClick={() => setShowMeetForm(false)} className="px-2 py-1 bg-slate-100 text-slate-500 font-bold text-[10px] rounded uppercase">✖</button>
                                </form>
                              )}
                            </>
                          ) : (
                            (() => {
                              const combinedLock = activeRoom.developer_status === 'accepted' && activeRoom.business_status === 'accepted'
                              const typeLabel = activeRoom.active_meet_type === 'completion' ? 'Code Handover Session' : 'Strategic Sync Session'

                              return (
                                <>
                                  <div className="space-y-0.5">
                                    <p className="font-bold text-slate-800">📅 {typeLabel}: <span className="text-orange-600 underline font-extrabold">{activeRoom.scheduled_meet_time}</span></p>
                                    <p className="text-[11px] text-slate-500">{combinedLock ? "Handshake complete. Launch call portal now." : String(activeRoom.meet_creator_id) === currentUid ? "Waiting for peer confirmation..." : "Teammate proposed a calendar slot."}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {combinedLock ? (
                                      <>
                                        <a href={`${activeRoom.meeting_link}#config.prejoinPageEnabled=true`} target="_blank" rel="noreferrer" onClick={handleLaunchClick} className="px-3 py-2 bg-emerald-600 text-white font-bold text-[10px] rounded uppercase shadow-xs inline-block">🚀 Launch Video Room</a>
                                        <button onClick={handleCancelOrDeclineMeeting} className="px-2 py-2 bg-slate-100 text-slate-600 font-bold text-[10px] rounded uppercase">Close Session</button>
                                      </>
                                    ) : String(activeRoom.meet_creator_id) === currentUid ? (
                                      <button onClick={handleCancelOrDeclineMeeting} className="px-2.5 py-1.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded uppercase">Cancel Proposal</button>
                                    ) : (
                                      <>
                                        <button onClick={handleAcceptMeeting} className="px-3 py-1.5 bg-emerald-600 text-white font-bold text-[10px] rounded uppercase shadow-xs">Accept & Lock In</button>
                                        <button onClick={handleCancelOrDeclineMeeting} className="px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-100 font-bold text-[10px] rounded uppercase">Decline</button>
                                      </>
                                    )}
                                  </div>
                                </>
                              )
                            })()
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* CHAT CONTAINER VIEWPORT */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
                {messages.map((msg) => {
                  const isMe = String(msg.sender_id) === currentUid
                  return (
                    <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] p-3 px-4 rounded-xl text-sm border shadow-3xs ${isMe ? 'bg-slate-900 border-slate-900 text-white rounded-br-none' : 'bg-white border-slate-200 text-slate-900 rounded-bl-none'}`}>
                        <p className="whitespace-pre-wrap font-medium break-words leading-relaxed">{msg.message_text}</p>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Action Form */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white flex gap-2 shrink-0">
                <input type="text" placeholder="Type your message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none text-slate-900 shadow-3xs" />
                <button type="submit" className="px-5 py-2.5 text-xs font-bold bg-orange-500 text-white rounded-lg uppercase tracking-wider">Send</button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/20">
              <h3 className="font-bold text-slate-400 text-sm uppercase tracking-wider">Select a conversation string to begin setup operations</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}