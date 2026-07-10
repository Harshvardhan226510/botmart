import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function JobBoard({ onNavigateToPost, onApplyToBuild, onViewProfile }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all') 
  const [currentUserId, setCurrentUserId] = useState(null)

  // Full Editing State Bindings
  const [editingJobId, setEditingJobId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editProblem, setEditProblem] = useState('')
  const [editTimeline, setEditTimeline] = useState('')
  const [editStack, setEditStack] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)

  async function fetchJobsAndSession() {
    try {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)

      const { data, error } = await supabase
        .from('job_posts')
        .select(`*, profiles:business_id (id, full_name, username, avatar_url, bio, github_url, linkedin_url, user_type)`)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      const sanitizedJobs = (data || []).map(job => ({
        ...job,
        status: job.status === 'booked' ? 'booked' : 'open'
      }))

      setJobs(sanitizedJobs)
    } catch (error) {
      console.error('Error fetching jobs:', error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobsAndSession()
  }, [])

  useEffect(() => {
    const jobSubscription = supabase
      .channel('public-job-posts-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'job_posts' }, 
        (payload) => {
          const updatedRow = payload.new
          const incomingStatus = updatedRow.status === 'booked' ? 'booked' : 'open'
          
          setJobs(prevJobs => prevJobs.map(j => 
            j.id === updatedRow.id ? { ...j, status: incomingStatus } : j
          ))
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_posts' }, 
        () => {
          fetchJobsAndSession()
        }
      )
      .subscribe()

    const chatRoomSyncChannel = supabase
      .channel('jobboard-project-fallback-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_rooms' }, 
        () => {
          fetchJobsAndSession()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(jobSubscription)
      supabase.removeChannel(chatRoomSyncChannel)
    }
  }, [])

  function startEditing(job) {
    setEditingJobId(job.id)
    setEditTitle(job.title)
    setEditProblem(job.problem_statement)
    setEditTimeline(job.estimated_timeline || '')
    
    const stackArray = Array.isArray(job.required_stack) 
      ? job.required_stack 
      : typeof job.required_stack === 'string' 
        ? job.required_stack.split(',')
        : []
    setEditStack(stackArray.join(', '))
  }

  async function handleSaveChanges(jobId) {
    const formattedStack = editStack.split(',').map(s => s.trim()).filter(Boolean)
    
    try {
      const { error } = await supabase
        .from('job_posts')
        .update({
          title: editTitle,
          problem_statement: editProblem,
          estimated_timeline: editTimeline,
          required_stack: formattedStack
        })
        .eq('id', jobId)

      if (error) throw error

      setJobs(prevJobs => prevJobs.map(j => j.id === jobId ? { 
        ...j, 
        title: editTitle, 
        problem_statement: editProblem,
        estimated_timeline: editTimeline,
        required_stack: formattedStack
      } : j))
      setEditingJobId(null)
    } catch (error) {
      console.error('Error updating post:', error.message)
    }
  }

  async function handleDeletePost(jobId) {
    const confirmDelete = window.confirm("Are you sure you want to permanently delete this pipeline requirement?")
    if (!confirmDelete) return

    try {
      await supabase
        .from('chat_rooms')
        .delete()
        .eq('job_id', jobId)

      const { error } = await supabase
        .from('job_posts')
        .delete()
        .eq('id', jobId)

      if (error) throw error
      setJobs(prevJobs => prevJobs.filter(j => j.id !== jobId))
    } catch (error) {
      console.error('Error deleting post:', error.message)
    }
  }

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === 'all') return true
    return job.status === statusFilter
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans antialiased relative z-10 px-4 md:px-0">
      <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Active Business Pipelines</h1>
          <p className="text-slate-500 text-xs mt-0.5">Browse operational bottlenecks and requests posted directly by companies.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
            <button onClick={() => setStatusFilter('all')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>All</button>
            <button onClick={() => setStatusFilter('open')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${statusFilter === 'open' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-emerald-600'}`}>Open to Build</button>
            <button onClick={() => setStatusFilter('booked')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${statusFilter === 'booked' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500 hover:text-amber-600'}`}>Booked</button>
          </div>
          <button onClick={onNavigateToPost} className="inline-flex items-center justify-center px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors uppercase tracking-wider shadow-2xs shrink-0 w-full sm:w-auto">＋ Post Requirement</button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 h-36 animate-pulse rounded-xl" />
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs font-medium uppercase tracking-wide">No matching operational requirements found.</div>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => {
            const isMyJob = currentUserId === job.business_id 
            const isBooked = job.status === 'booked'
            const isEditing = editingJobId === job.id

            const techStackArray = Array.isArray(job.required_stack) 
              ? job.required_stack 
              : typeof job.required_stack === 'string' 
                ? job.required_stack.split(',').map(s => s.trim())
                : []

            return (
              <div key={job.id} className="bg-white border border-slate-200 p-5 md:p-6 rounded-xl shadow-xs flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors">
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 min-w-0 w-full">
                      <button onClick={() => onViewProfile(job.profiles)} className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0 cursor-pointer">
                        {job.profiles?.avatar_url ? <img src={job.profiles.avatar_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800 text-white font-bold flex items-center justify-center text-xs uppercase">{job.profiles?.full_name?.substring(0,2) || 'BI'}</div>}
                      </button>
                      
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Requirement Title</label>
                            <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-orange-500" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-base text-slate-900 tracking-tight truncate">{job.title}</h3>
                            {isBooked && <span className="text-[9px] font-extrabold bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-md uppercase tracking-wide animate-pulse">Booked</span>}
                          </div>
                        )}
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          Posted by: <button onClick={() => onViewProfile(job.profiles)} className="text-slate-600 font-semibold hover:text-orange-500 hover:underline">{job.profiles?.full_name || 'Verified Client'}</button>
                        </p>
                      </div>

                      {isMyJob && !isEditing && (
                        <div className="flex items-center gap-1 shrink-0 ml-auto">
                          <button onClick={() => startEditing(job)} className="p-1.5 px-2.5 text-[10px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded uppercase transition-colors">✏️ Edit</button>
                          <button onClick={() => handleDeletePost(job.id)} className="p-1.5 px-2.5 text-[10px] font-bold border border-red-100 text-red-600 hover:bg-red-50 rounded uppercase transition-colors">🗑️ Delete</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Problem Description</label>
                        <textarea rows={3} value={editProblem} onChange={(e) => setEditProblem(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 bg-white focus:outline-none focus:border-orange-500" />
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estimated Duration</label>
                          <input type="text" value={editTimeline} onChange={(e) => setEditTimeline(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-orange-500" placeholder="e.g., 2 Weeks" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tech Stack (Comma Separated)</label>
                          <input type="text" value={editStack} onChange={(e) => setEditStack(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-orange-500" placeholder="React, Python, Supabase" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="pt-1">
                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap line-clamp-4">{job.problem_statement}</p>
                        {job.problem_statement && job.problem_statement.length > 120 && (
                          <button onClick={() => setSelectedJob(job)} className="text-[10px] font-extrabold text-orange-500 hover:text-orange-600 uppercase tracking-wider mt-1.5 transition-colors">Read more</button>
                        )}
                      </div>
                      {job.estimated_timeline && (
                        <p className="text-xs font-semibold text-slate-500 flex items-center gap-1 pt-2">
                          ⏱️ Duration: <span className="text-slate-800 bg-slate-100 border border-slate-200/60 px-1.5 py-0.5 rounded font-bold text-[11px]">{job.estimated_timeline}</span>
                        </p>
                      )}
                    </>
                  )}

                  {!isEditing && techStackArray.length > 0 && techStackArray[0] !== "" && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {techStackArray.map((tech, idx) => (
                        <span key={idx} className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider">{tech}</span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-end pt-3 border-t border-slate-100 w-full gap-2">
                  {isEditing ? (
                    <>
                      <button onClick={() => setEditingJobId(null)} className="px-4 py-2 text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg uppercase">Cancel</button>
                      <button onClick={() => handleSaveChanges(job.id)} className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg uppercase shadow-2xs">Save Changes</button>
                    </>
                  ) : isBooked ? (
                    <button disabled className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed uppercase tracking-wider w-full sm:w-auto">🔒 Booked</button>
                  ) : (
                    <button onClick={() => onApplyToBuild(job.business_id, job)} className="px-4 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors shadow-2xs w-full sm:w-auto">Apply to Build</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight truncate" title={selectedJob.title}>{selectedJob.title}</h2>
                {selectedJob.status === 'booked' && <span className="text-[10px] font-extrabold bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-0.5 rounded-md uppercase tracking-wide animate-pulse shrink-0">Booked</span>}
              </div>
              <button onClick={() => setSelectedJob(null)} className="p-1.5 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-md shrink-0 shadow-2xs">
                ✖
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                  {selectedJob.profiles?.avatar_url ? (
                    <img src={selectedJob.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-orange-500 text-white font-bold flex items-center justify-center text-xs uppercase">
                      {selectedJob.profiles?.full_name?.substring(0,2) || 'CL'}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Business Client</p>
                  <p className="text-sm font-bold text-slate-900">{selectedJob.profiles?.full_name || 'Verified Business'}</p>
                </div>
              </div>
              
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">Project Requirements</h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedJob.problem_statement}</p>
              </div>

              {(selectedJob.estimated_timeline || (selectedJob.tech_stack && selectedJob.tech_stack.length > 0 && selectedJob.tech_stack[0] !== "")) && (
                <div className="mt-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedJob.estimated_timeline && (
                    <div>
                      <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Estimated Timeline</h3>
                      <p className="text-sm font-bold text-slate-800">{selectedJob.estimated_timeline}</p>
                    </div>
                  )}
                  {selectedJob.tech_stack && selectedJob.tech_stack.length > 0 && selectedJob.tech_stack[0] !== "" && (
                    <div>
                      <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Required Stack</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedJob.tech_stack.map((tech, idx) => (
                          <span key={idx} className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider">{tech}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex justify-end shrink-0">
              {selectedJob.status === 'booked' ? (
                <button disabled className="px-5 py-2.5 text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed uppercase tracking-wider">🔒 Booked</button>
              ) : (
                <button 
                  onClick={() => {
                    onApplyToBuild(selectedJob.business_id, selectedJob)
                    setSelectedJob(null)
                  }} 
                  className="px-5 py-2.5 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors shadow-2xs uppercase tracking-wider"
                >
                  Apply to Build
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}