import React from 'react'

export default function ParticleBackground() {
  const htmlSource = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background-color: #ffffff;
          overflow: hidden;
        }
        #tsparticles {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/tsparticles@2/tsparticles.bundle.min.js"></script>
    </head>
    <body>
      <div id="tsparticles"></div>
      <script>
        tsParticles.load("tsparticles", {
          particles: {
            number: { value: 35 },
            size: { value: 2.5 },
            color: { 
              value: "#f97316" // Orange Particles
            },
            move: { 
              enable: true, 
              speed: 1 
            },
            line_linked: { 
              enable: true, 
              color: "#000000", // Black Connection Threads
              opacity: 0.2,
              distance: 130 
            }
          }
        });
      </script>
    </body>
    </html>
  `

  return (
    <iframe
      title="cyber-grid-matrix"
      srcDoc={htmlSource}
      className="fixed inset-0 w-full h-full border-none pointer-events-none z-0"
      style={{ background: 'white' }}
    />
  )
}