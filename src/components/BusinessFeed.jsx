import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function BusinessFeed({ onAcquireSystem, onViewProfile }) {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [selectedSystem, setSelectedSystem] = useState(null)
  
  const [currentUserId, setCurrentUserId] = useState(null)
  const [editingListingId, setEditingListingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDemoUrl, setEditDemoUrl] = useState('')
  const [editTechStack, setEditTechStack] = useState('')

  const popularTags = ['OpenAI', 'LangChain', 'Python', 'Slack Bot', 'Database']

  async function fetchListings() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)

      const { data, error } = await supabase
        .from('listings')
        .select(`*, profiles:creator_id (id, full_name, username, avatar_url, bio, github_url, linkedin_url, user_type)`) // Explicitly added user_type column here
        .eq('is_approved', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      setListings(data || [])
    } catch (error) {
      console.error('Error loading feed:', error.message)
    } finally {
      setLoading(false)
    }
  }

  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'open', 'booked'

  useEffect(() => {
    fetchListings()

    const listingsSubscription = supabase
      .channel('public-listings-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings' }, 
        (payload) => {
          const updatedRow = payload.new
          const incomingStatus = updatedRow.status === 'booked' ? 'booked' : 'open'
          
          setListings(prevListings => prevListings.map(j => 
            j.id === updatedRow.id ? { ...j, status: incomingStatus } : j
          ))
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' }, 
        () => {
          fetchListings()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(listingsSubscription)
    }
  }, [])

  function startEditing(item) {
    setEditingListingId(item.id)
    setEditTitle(item.title)
    setEditDescription(item.description)
    setEditDemoUrl(item.demo_url || '')
    const stackArray = Array.isArray(item.tech_stack) 
      ? item.tech_stack 
      : typeof item.tech_stack === 'string' 
        ? item.tech_stack.split(',')
        : []
    setEditTechStack(stackArray.join(', '))
  }

  async function handleSaveChanges(itemId) {
    const formattedStack = editTechStack.split(',').map(s => s.trim()).filter(Boolean)
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          title: editTitle,
          description: editDescription,
          demo_url: editDemoUrl,
          tech_stack: formattedStack.length > 0 ? formattedStack : null
        })
        .eq('id', itemId)

      if (error) throw error

      setListings(prevListings => prevListings.map(item => item.id === itemId ? { 
        ...item, 
        title: editTitle, 
        description: editDescription,
        demo_url: editDemoUrl,
        tech_stack: formattedStack.length > 0 ? formattedStack : null
      } : item))
      setEditingListingId(null)
    } catch (error) {
      console.error('Error updating listing:', error.message)
    }
  }

  async function handleDeletePost(itemId) {
    const confirmDelete = window.confirm("Are you sure you want to permanently delete this system listing? Any active chats for this system will also be deleted.")
    if (!confirmDelete) return

    try {
      // 1. First fetch chat rooms to safely update them one by one (bypassing bulk-update restrictions)
      const { data: roomsToHide, error: fetchRoomsError } = await supabase
        .from('chat_rooms')
        .select('id')
        .ilike('active_meet_type', `%${itemId}%`)

      if (!fetchRoomsError && roomsToHide && roomsToHide.length > 0) {
        for (const room of roomsToHide) {
          await supabase
            .from('chat_rooms')
            .update({ developer_status: 'deleted', business_status: 'deleted' })
            .eq('id', room.id)
        }
      }

      // 2. Then delete the system itself
      const { error } = await supabase
        .from('listings')
        .delete()
        .eq('id', itemId)

      if (error) throw error
      setListings(prevListings => prevListings.filter(item => item.id !== itemId))
    } catch (error) {
      console.error('Error deleting listing:', error.message)
    }
  }

  const filteredListings = listings.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTag = activeTag ? item.tech_stack?.some(t => t.toLowerCase() === activeTag.toLowerCase()) : true
    const matchesStatus = statusFilter === 'all' ? true : item.status === statusFilter
    return matchesSearch && matchesTag && matchesStatus
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans antialiased relative z-10 px-4 md:px-0">
      
      {/* Search Header Block */}
      <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Explore AI Systems</h1>
          <p className="text-slate-500 text-xs mt-0.5">Discover and integrate production-ready custom workflows seamlessly.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0 self-start sm:self-auto">
          <button onClick={() => setStatusFilter('all')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>All</button>
          <button onClick={() => setStatusFilter('open')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${statusFilter === 'open' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-emerald-600'}`}>Open to Acquire</button>
          <button onClick={() => setStatusFilter('booked')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${statusFilter === 'booked' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500 hover:text-amber-600'}`}>Booked</button>
        </div>
      </div>
      
      <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xs space-y-4">
        <div className="space-y-2.5">
          <input
            type="text"
            placeholder="Search systems by matching keyword attributes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-orange-500 text-slate-900 placeholder-slate-400 shadow-2xs"
          />
          <div className="flex flex-wrap gap-1.5 items-center">
            {popularTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors font-medium ${
                  activeTag === tag ? 'bg-orange-500 text-white border-orange-500' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cards Stream - Transformed into a clean multi-column dashboard matrix */}
      {loading ? (
        <div className="bg-white border border-slate-200 h-36 animate-pulse rounded-xl" />
      ) : filteredListings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs font-medium uppercase tracking-wide">No matching systems found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((item) => {
            const isMyListing = currentUserId === item.creator_id || currentUserId === item.profiles?.id
            const isEditing = editingListingId === item.id

            return (
            <div key={item.id} className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors min-h-[280px]">
              <div>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 w-full">
                    {/* Clickable Profile Avatar */}
                    <button 
                      onClick={() => onViewProfile(item.profiles)}
                      className="w-9 h-9 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shadow-2xs shrink-0 cursor-pointer transition-transform hover:scale-105"
                      title="View Profile Credentials"
                    >
                      {item.profiles?.avatar_url ? (
                        <img src={item.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-orange-500 text-white font-bold flex items-center justify-center text-2xs uppercase">
                          {item.profiles?.full_name?.substring(0,2) || 'CR'}
                        </div>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">System Title</label>
                          <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-orange-500" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 tracking-tight truncate" title={item.title}>{item.title}</h3>
                          {item.status === 'booked' && <span className="text-[9px] font-extrabold bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-md uppercase tracking-wide animate-pulse shrink-0">Booked</span>}
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                        By: <button onClick={() => onViewProfile(item.profiles)} className="text-slate-600 font-semibold hover:text-orange-500 hover:underline">{item.profiles?.full_name || 'Verified Creator'}</button>
                      </p>
                    </div>

                    {isMyListing && !isEditing && (
                      <div className="flex items-center gap-1 shrink-0 ml-auto">
                        <button onClick={() => startEditing(item)} className="p-1.5 px-2.5 text-[10px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded uppercase transition-colors">✏️ Edit</button>
                        <button onClick={() => handleDeletePost(item.id)} className="p-1.5 px-2.5 text-[10px] font-bold border border-red-100 text-red-600 hover:bg-red-50 rounded uppercase transition-colors">🗑️ Delete</button>
                      </div>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-3 pt-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">System Description</label>
                      <textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 bg-white focus:outline-none focus:border-orange-500" />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Demo URL</label>
                        <input type="text" value={editDemoUrl} onChange={(e) => setEditDemoUrl(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-orange-500" placeholder="https://..." />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tech Stack (Comma Separated)</label>
                        <input type="text" value={editTechStack} onChange={(e) => setEditTechStack(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-orange-500" placeholder="React, Python, Supabase" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Inline Architecture Badges Mapping */}
                    {item.tech_stack && item.tech_stack.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {item.tech_stack.map((tech, idx) => (
                          <span key={idx} className="text-[9px] font-semibold bg-slate-100 text-slate-500 border border-slate-200/60 px-1.5 py-0.5 rounded">
                            {tech}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3">
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap line-clamp-4">{item.description}</p>
                      {item.description && item.description.length > 120 && (
                        <button onClick={() => setSelectedSystem(item)} className="text-[10px] font-extrabold text-orange-500 hover:text-orange-600 uppercase tracking-wider mt-1.5 transition-colors">Read more</button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Anchored bottom alignment block */}
              <div className="flex justify-end items-center gap-2 pt-2.5 border-t border-slate-100 mt-auto">
                {isEditing ? (
                  <>
                    <button onClick={() => setEditingListingId(null)} className="px-3 py-1.5 text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-md uppercase">Cancel</button>
                    <button onClick={() => handleSaveChanges(item.id)} className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md uppercase shadow-2xs">Save</button>
                  </>
                ) : item.status === 'booked' ? (
                  <button disabled className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed uppercase tracking-wider w-full sm:w-auto">🔒 Booked</button>
                ) : (
                  <>
                    {item.demo_url && (
                      <a href={item.demo_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-md text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                        Demo
                      </a>
                    )}
                    <button onClick={() => onAcquireSystem(item.creator_id, { type: 'system', title: item.title, id: item.id })} className="px-3 py-1.5 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors shadow-2xs">
                      Acquire & Chat
                    </button>
                  </>
                )}
              </div>
            </div>
          )})}
        </div>
      )}

      {selectedSystem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedSystem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight truncate" title={selectedSystem.title}>{selectedSystem.title}</h2>
                {selectedSystem.status === 'booked' && <span className="text-[10px] font-extrabold bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-0.5 rounded-md uppercase tracking-wide animate-pulse shrink-0">Booked</span>}
              </div>
              <button onClick={() => setSelectedSystem(null)} className="p-1.5 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-md shrink-0 shadow-2xs">
                ✖
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                  {selectedSystem.profiles?.avatar_url ? (
                    <img src={selectedSystem.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-orange-500 text-white font-bold flex items-center justify-center text-xs uppercase">
                      {selectedSystem.profiles?.full_name?.substring(0,2) || 'CR'}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Creator</p>
                  <p className="text-sm font-bold text-slate-900">{selectedSystem.profiles?.full_name || 'Verified Creator'}</p>
                </div>
              </div>

              {selectedSystem.tech_stack && selectedSystem.tech_stack.length > 0 && (
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Architecture / Tech Stack</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSystem.tech_stack.map((tech, idx) => (
                      <span key={idx} className="text-[10px] font-bold bg-white text-slate-600 border border-slate-200 px-2 py-1 rounded shadow-2xs">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">System Description</p>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedSystem.description}</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
              {selectedSystem.status === 'booked' ? (
                <button disabled className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed uppercase tracking-wider">🔒 Booked</button>
              ) : (
                <>
                  {selectedSystem.demo_url && (
                    <a href={selectedSystem.demo_url} target="_blank" rel="noreferrer" className="px-4 py-2 text-xs font-bold border border-slate-200 rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-2xs">
                      View Live Demo
                    </a>
                  )}
                  <button onClick={() => { setSelectedSystem(null); onAcquireSystem(selectedSystem.creator_id, { type: 'system', title: selectedSystem.title, id: selectedSystem.id }); }} className="px-4 py-2 text-xs font-black bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors shadow-2xs">
                    Acquire & Chat Now
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}