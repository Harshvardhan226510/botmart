<div align="center">
  <h1>🤖 BotMart</h1>
  <p><strong>The Premier B2B Marketplace for AI Automation & Systems</strong></p>

  <p>
    <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite" alt="Vite" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  </p>
</div>

---

## 📖 Overview

**BotMart** is a comprehensive two-sided marketplace engineered to bridge the gap between AI Developers and Enterprise Business Clients. 

It serves as a centralized hub where businesses can discover and acquire pre-built AI automation pipelines, while empowering developers to monetize their AI systems or secure custom contracting opportunities for bespoke operational requirements.

## ✨ Core Features

### 🏢 For Business Clients
- **Business Feed:** Browse a dynamic, real-time catalog of pre-built AI systems engineered by verified developers.
- **Job Board:** Post operational bottlenecks, estimated timelines, and tech stack requirements to attract top developer talent.
- **Secure Acquisition:** Initiate isolated, secure chats with creators to negotiate and acquire systems directly.

### 💻 For AI Developers (Creators)
- **Creator Portal:** Publish robust pre-built AI systems with live demo URLs directly to the global business feed.
- **Verified Profiles:** Build trust through digital resumes featuring GitHub and LinkedIn integrations.
- **Custom Contracts:** Browse the Job Board and apply directly to business requirements to secure custom development deals.

### 💬 The Negotiation Engine (Context-Isolated Inbox)
BotMart features a highly sophisticated, real-time messaging system built on Supabase WebSockets:
- **Strict Project Isolation:** Chat rooms are intrinsically bound to a specific context (either a custom job requirement or a pre-built system). A developer and client can safely negotiate multiple distinct projects simultaneously without thread collision.
- **State-Machine Deals:** Features a robust "Propose Agreement" and "Confirm Deal" mechanism. Database records dynamically update to 'booked' to prevent double-booking, utilizing custom PostgreSQL PL/pgSQL RPCs to completely eliminate race conditions and unauthorized state mutations.

---

## 🛠️ Technology Stack

- **Frontend Core:** React 19, Vite
- **Styling & UI:** Tailwind CSS v4, shadcn/ui, Radix Primitives
- **Animations:** tw-animate-css, tsParticles
- **Backend-as-a-Service:** Supabase (PostgreSQL, Auth, Realtime WebSockets, Row Level Security)
- **Deployment:** Vercel-ready

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18+)
- A [Supabase](https://supabase.com/) account and project.

### 1. Clone the repository
```bash
git clone https://github.com/Harshvardhan226510/botmart.git
cd botmart
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and add your Supabase connection strings:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run the development server
```bash
npm run dev
```
Navigate to `http://localhost:5173` in your browser to see the application running.

---

## 🗄️ Database Architecture

BotMart relies on a strictly relational PostgreSQL database heavily utilizing Row Level Security (RLS) policies:
- `profiles`: User metadata, roles, and trust indicators.
- `listings`: Catalog of AI systems uploaded by creators.
- `job_posts`: Repository of custom business requirements.
- `chat_rooms`: The core negotiation engine handling contract states.
- `messages`: Real-time chat payloads bound to specific rooms.

---

## 🤝 Support
For account help or technical support, please reach out directly to the support team at **22harshavardhan22@gmail.com**.
