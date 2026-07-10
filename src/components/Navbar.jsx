import React from 'react'

export default function Navbar({ currentView, setCurrentView }) {
  const navItems = [
    { id: 'feed', label: 'Systems Feed' },
    { id: 'jobs', label: 'Business Needs' },
    { id: 'creator', label: 'Creator Portal' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'profile', label: 'Profile' }
  ]

  return (
    <header className="bg-white sticky top-0 z-50 w-full border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          
          <span 
            className="text-xl font-bold tracking-tight text-slate-900 cursor-pointer select-none shrink-0" 
            onClick={() => setCurrentView('feed')}
          >
            bot<span className="text-orange-500">mart</span>
          </span>
          
          {/* Mobile Scrollable, Desktop Static Navigation Wrapper with hidden cross-browser scrollbar tracks */}
          <nav className="flex items-center space-x-6 overflow-x-auto whitespace-nowrap py-1 px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`text-sm font-medium transition-colors relative py-1 shrink-0 ${
                  currentView === item.id
                    ? 'text-orange-500 font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {item.label}
                {currentView === item.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full" />
                )}
              </button>
            ))}
          </nav>

        </div>
      </div>
    </header>
  )
}