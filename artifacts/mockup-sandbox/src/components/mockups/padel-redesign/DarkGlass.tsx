import React from "react";

export function DarkGlass() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans overflow-x-hidden selection:bg-[#00ff88] selection:text-black relative">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap');

        :root {
          --neon: #00ff88;
          --bg-dark: #0a0a0a;
        }

        .font-rajdhani { font-family: 'Rajdhani', sans-serif; }
        .font-barlow { font-family: 'Barlow Condensed', sans-serif; }

        .glass-panel {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 1rem;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .glass-panel:hover {
          border-color: rgba(0, 255, 136, 0.3);
          box-shadow: 0 10px 40px -10px rgba(0, 255, 136, 0.15), inset 0 0 20px rgba(255,255,255,0.02);
          transform: translateY(-4px);
        }

        .neon-text {
          text-shadow: 0 0 20px rgba(0, 255, 136, 0.4);
        }

        .btn-neon {
          background: rgba(0, 255, 136, 0.05);
          border: 1px solid var(--neon);
          color: var(--neon);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.3s ease;
          box-shadow: 0 0 15px rgba(0, 255, 136, 0.2), inset 0 0 10px rgba(0, 255, 136, 0.1);
        }

        .btn-neon:hover {
          background: var(--neon);
          color: #000;
          box-shadow: 0 0 30px rgba(0, 255, 136, 0.5);
          text-shadow: none;
        }

        .btn-ghost {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          transition: all 0.3s ease;
        }

        .btn-ghost:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .glow-halo {
          position: absolute;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(0,255,136,0.15) 0%, rgba(10,10,10,0) 70%);
          pointer-events: none;
          z-index: 0;
          border-radius: 50%;
          filter: blur(40px);
        }

        .hero-bg-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(10,10,10,0.6) 0%, rgba(10,10,10,1) 100%);
          z-index: 1;
        }
        
        .hero-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: blur(4px) brightness(0.7);
          z-index: 0;
          opacity: 0.5;
        }
      `}} />

      {/* Global Background Halos */}
      <div className="glow-halo top-[-200px] left-[-200px]"></div>
      <div className="glow-halo top-[40%] right-[-300px] opacity-50"></div>
      <div className="glow-halo bottom-[-200px] left-[20%] opacity-30"></div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-panel !rounded-none !border-t-0 !border-x-0 !border-b-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-barlow text-2xl font-bold tracking-wider text-white">PADEL CLUB</span>
          <div className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_10px_#00ff88]"></div>
        </div>
        
        <div className="hidden md:flex items-center gap-8 font-rajdhani font-semibold text-lg text-gray-400">
          <a href="#" className="hover:text-white transition-colors">Terrains</a>
          <a href="#" className="hover:text-white transition-colors text-white neon-text">Open Matches</a>
          <a href="#" className="hover:text-white transition-colors">Tournois</a>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-[#00ff88]/10 border border-[#00ff88]/30 px-3 py-1.5 rounded-full">
            <span className="text-[#00ff88]">⚡</span>
            <span className="font-rajdhani font-bold text-[#00ff88]">12 tokens</span>
          </div>
          <button className="btn-neon font-rajdhani font-bold px-5 py-2 rounded-lg text-sm">
            Se connecter
          </button>
        </div>
      </nav>

      <main className="relative z-10 pt-20">
        {/* Hero Section */}
        <section className="relative min-h-[85vh] flex items-center justify-center px-4 py-20 overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1400" 
            alt="Padel Court" 
            className="hero-image"
          />
          <div className="hero-bg-overlay"></div>
          
          <div className="relative z-10 text-center max-w-4xl mx-auto flex flex-col items-center">
            <div className="inline-block px-4 py-1.5 mb-6 glass-panel !rounded-full border-[#00ff88]/30">
              <span className="font-rajdhani font-bold text-[#00ff88] tracking-widest text-sm uppercase">Plateforme Premium</span>
            </div>
            
            <h1 className="font-barlow text-6xl md:text-8xl font-bold text-white mb-6 tracking-tighter leading-none">
              RÉSERVEZ VOTRE <br/>
              <span className="relative inline-block">
                TERRAIN
                <div className="absolute bottom-2 left-0 w-full h-3 bg-[#00ff88]/50 blur-[8px] -z-10"></div>
                <div className="absolute bottom-2 left-0 w-full h-1 bg-[#00ff88]"></div>
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl font-rajdhani text-gray-400 mb-10 max-w-2xl">
              Rejoignez l'élite. Réservez des terrains premium, trouvez des partenaires et dominez les tournois locaux.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="btn-neon font-barlow text-xl px-8 py-4 rounded-xl">
                Réserver maintenant
              </button>
              <button className="btn-ghost font-barlow text-xl px-8 py-4 rounded-xl">
                Voir les matchs
              </button>
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="max-w-6xl mx-auto px-4 -mt-10 relative z-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel p-6 flex items-center gap-6">
              <div className="w-14 h-14 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center text-2xl text-[#00ff88]">
                🏃
              </div>
              <div>
                <div className="font-barlow text-4xl font-bold text-white neon-text">247</div>
                <div className="font-rajdhani text-gray-400 uppercase tracking-wider font-semibold">Joueurs actifs</div>
              </div>
            </div>
            <div className="glass-panel p-6 flex items-center gap-6">
              <div className="w-14 h-14 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center text-2xl text-[#00ff88]">
                🎾
              </div>
              <div>
                <div className="font-barlow text-4xl font-bold text-white neon-text">6</div>
                <div className="font-rajdhani text-gray-400 uppercase tracking-wider font-semibold">Terrains</div>
              </div>
            </div>
            <div className="glass-panel p-6 flex items-center gap-6">
              <div className="w-14 h-14 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/30 flex items-center justify-center text-2xl text-[#00ff88]">
                ⭐
              </div>
              <div>
                <div className="font-barlow text-4xl font-bold text-white neon-text">98%</div>
                <div className="font-rajdhani text-gray-400 uppercase tracking-wider font-semibold">Satisfaction</div>
              </div>
            </div>
          </div>
        </section>

        {/* Court Grid */}
        <section className="max-w-6xl mx-auto px-4 py-24 relative z-10">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="font-barlow text-4xl md:text-5xl font-bold text-white">NOS TERRAINS</h2>
              <p className="font-rajdhani text-gray-400 text-lg">Infrastructures dernière génération.</p>
            </div>
            <a href="#" className="hidden md:block font-rajdhani font-bold text-[#00ff88] hover:text-white transition-colors">Tout voir →</a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="glass-panel group overflow-hidden flex flex-col">
              <div className="relative h-48 overflow-hidden">
                <img src="https://images.unsplash.com/photo-1599930113854-d6d7fd521f10?w=600" alt="Terrain A" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent"></div>
                <div className="absolute top-4 right-4 bg-[#00ff88]/20 border border-[#00ff88] px-3 py-1 rounded-full backdrop-blur-md">
                  <span className="font-rajdhani font-bold text-[#00ff88] text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse"></span>
                    Disponible
                  </span>
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="font-barlow text-2xl font-bold text-white mb-1">TERRAIN A INDOOR</h3>
                <p className="font-rajdhani text-gray-400 mb-6">Surface panoramique, éclairage LED pro.</p>
                
                <div className="mt-auto flex items-center justify-between">
                  <div className="font-rajdhani font-bold text-xl text-white">
                    4 <span className="text-[#00ff88]">tokens</span> <span className="text-sm text-gray-500 font-normal">/ 90 min</span>
                  </div>
                  <button className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white group-hover:bg-[#00ff88] group-hover:border-[#00ff88] group-hover:text-black transition-all">
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="glass-panel group overflow-hidden flex flex-col">
              <div className="relative h-48 overflow-hidden">
                <img src="https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600" alt="Terrain B" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent"></div>
                <div className="absolute top-4 right-4 bg-white/10 border border-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                  <span className="font-rajdhani font-bold text-gray-300 text-sm flex items-center gap-2">
                    Occupé (14h-16h)
                  </span>
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="font-barlow text-2xl font-bold text-white mb-1">TERRAIN B OUTDOOR</h3>
                <p className="font-rajdhani text-gray-400 mb-6">Jeu en extérieur, idéal par beau temps.</p>
                
                <div className="mt-auto flex items-center justify-between">
                  <div className="font-rajdhani font-bold text-xl text-white">
                    3 <span className="text-[#00ff88]">tokens</span> <span className="text-sm text-gray-500 font-normal">/ 90 min</span>
                  </div>
                  <button className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white group-hover:bg-white group-hover:text-black transition-all">
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="glass-panel group overflow-hidden flex flex-col">
              <div className="relative h-48 overflow-hidden">
                <img src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600" alt="Terrain C" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] to-transparent"></div>
                <div className="absolute top-4 right-4 bg-[#00ff88]/20 border border-[#00ff88] px-3 py-1 rounded-full backdrop-blur-md">
                  <span className="font-rajdhani font-bold text-[#00ff88] text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse"></span>
                    Disponible
                  </span>
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="font-barlow text-2xl font-bold text-white mb-1">TERRAIN C PRO</h3>
                <p className="font-rajdhani text-gray-400 mb-6">Moquette WPT, sortie de piste autorisée.</p>
                
                <div className="mt-auto flex items-center justify-between">
                  <div className="font-rajdhani font-bold text-xl text-white">
                    5 <span className="text-[#00ff88]">tokens</span> <span className="text-sm text-gray-500 font-normal">/ 90 min</span>
                  </div>
                  <button className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white group-hover:bg-[#00ff88] group-hover:border-[#00ff88] group-hover:text-black transition-all">
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Matches */}
        <section className="max-w-6xl mx-auto px-4 pb-32 relative z-10">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="font-barlow text-4xl md:text-5xl font-bold text-white">MATCHS OUVERTS</h2>
              <p className="font-rajdhani text-gray-400 text-lg">Rejoignez une partie de votre niveau.</p>
            </div>
            <a href="#" className="hidden md:block font-rajdhani font-bold text-[#00ff88] hover:text-white transition-colors">Voir le planning →</a>
          </div>

          <div className="flex flex-col gap-4">
            {/* Match 1 */}
            <div className="glass-panel p-5 flex flex-col md:flex-row items-center gap-6 justify-between">
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="text-center w-16">
                  <div className="font-barlow font-bold text-2xl text-white">18:00</div>
                  <div className="font-rajdhani text-sm text-[#00ff88]">Aujourd'hui</div>
                </div>
                <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                <div>
                  <div className="font-barlow font-bold text-xl text-white">Niveau Intermédiaire (N5-N6)</div>
                  <div className="font-rajdhani text-gray-400">Terrain A Indoor</div>
                </div>
              </div>

              <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-3">
                    <img src="https://ui-avatars.com/api/?name=Thomas+M&background=0D8ABC&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Thomas" />
                    <img src="https://ui-avatars.com/api/?name=Lucas+D&background=10B981&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Lucas" />
                    <img src="https://ui-avatars.com/api/?name=Marc+V&background=F59E0B&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Marc" />
                    <div className="w-10 h-10 rounded-full border-2 border-[#0a0a0a] bg-white/5 border-dashed flex items-center justify-center text-gray-400 font-rajdhani text-sm">
                      ?
                    </div>
                  </div>
                  <div className="font-rajdhani font-bold text-[#00ff88] text-sm bg-[#00ff88]/10 px-2 py-1 rounded">
                    1 place libre
                  </div>
                </div>
                <button className="btn-neon font-rajdhani font-bold px-4 py-2 rounded-lg text-sm whitespace-nowrap">
                  Rejoindre
                </button>
              </div>
            </div>

            {/* Match 2 */}
            <div className="glass-panel p-5 flex flex-col md:flex-row items-center gap-6 justify-between">
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="text-center w-16">
                  <div className="font-barlow font-bold text-2xl text-white">20:30</div>
                  <div className="font-rajdhani text-sm text-gray-400">Ce soir</div>
                </div>
                <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                <div>
                  <div className="font-barlow font-bold text-xl text-white">Match Amical (N7-N8)</div>
                  <div className="font-rajdhani text-gray-400">Terrain C Pro</div>
                </div>
              </div>

              <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-3">
                    <img src="https://ui-avatars.com/api/?name=Sophie+L&background=EC4899&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Sophie" />
                    <img src="https://ui-avatars.com/api/?name=Julie+R&background=8B5CF6&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Julie" />
                    <div className="w-10 h-10 rounded-full border-2 border-[#0a0a0a] bg-white/5 border-dashed flex items-center justify-center text-gray-400 font-rajdhani text-sm">
                      ?
                    </div>
                    <div className="w-10 h-10 rounded-full border-2 border-[#0a0a0a] bg-white/5 border-dashed flex items-center justify-center text-gray-400 font-rajdhani text-sm">
                      ?
                    </div>
                  </div>
                  <div className="font-rajdhani font-bold text-[#00ff88] text-sm bg-[#00ff88]/10 px-2 py-1 rounded">
                    2 places
                  </div>
                </div>
                <button className="btn-neon font-rajdhani font-bold px-4 py-2 rounded-lg text-sm whitespace-nowrap">
                  Rejoindre
                </button>
              </div>
            </div>
            
            {/* Match 3 */}
            <div className="glass-panel p-5 flex flex-col md:flex-row items-center gap-6 justify-between opacity-75 grayscale-[50%]">
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="text-center w-16">
                  <div className="font-barlow font-bold text-2xl text-white">21:00</div>
                  <div className="font-rajdhani text-sm text-gray-400">Demain</div>
                </div>
                <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                <div>
                  <div className="font-barlow font-bold text-xl text-white">Niveau Avancé (N3-N4)</div>
                  <div className="font-rajdhani text-gray-400">Terrain B Outdoor</div>
                </div>
              </div>

              <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-3">
                    <img src="https://ui-avatars.com/api/?name=Alex+P&background=3B82F6&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Alex" />
                    <img src="https://ui-avatars.com/api/?name=Hugo+C&background=EF4444&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Hugo" />
                    <img src="https://ui-avatars.com/api/?name=Simon+G&background=F59E0B&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Simon" />
                    <img src="https://ui-avatars.com/api/?name=Max+T&background=10B981&color=fff" className="w-10 h-10 rounded-full border-2 border-[#0a0a0a]" alt="Max" />
                  </div>
                  <div className="font-rajdhani font-bold text-gray-400 text-sm bg-white/10 px-2 py-1 rounded">
                    Complet
                  </div>
                </div>
                <button disabled className="btn-ghost font-rajdhani font-bold px-4 py-2 rounded-lg text-sm whitespace-nowrap opacity-50 cursor-not-allowed">
                  Complet
                </button>
              </div>
            </div>
            
          </div>
        </section>

      </main>
    </div>
  );
}
