import React from "react";

export function SportyDynamic() {
  return (
    <div className="min-h-screen bg-[#111111] text-white font-sans overflow-x-hidden selection:bg-[#FF6B00] selection:text-white">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: inline-block;
          white-space: nowrap;
          animation: marquee 20s linear infinite;
        }
        .clip-diagonal {
          clip-path: polygon(0 0, 100% 10vw, 100% 100%, 0 100%);
        }
        .clip-diagonal-top {
          clip-path: polygon(0 10vw, 100% 0, 100% 100%, 0 100%);
        }
        .card-hover:hover .card-img {
          transform: scale(1.05);
        }
      `}</style>

      {/* TOP NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#111111]/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-8 h-8 text-[#FF6B00]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
          </svg>
          <span className="font-['Bebas_Neue'] text-3xl tracking-wider pt-1">PADEL CLUB</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-8 font-bold text-sm uppercase tracking-widest text-white/70">
            <a href="#" className="hover:text-white transition-colors">Terrains</a>
            <a href="#" className="hover:text-white transition-colors">Tournois</a>
            <a href="#" className="hover:text-white transition-colors">Boutique</a>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-[#FF6B00] text-black font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 text-sm">
              <span className="text-lg leading-none">⚡</span>
              <span>12</span>
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-[#FF6B00] overflow-hidden">
              <img src="https://i.pravatar.cc/150?u=padel" alt="Avatar" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="relative h-screen min-h-[600px] flex items-center pt-20">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1400" 
            alt="Padel Action" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-[#111111]/80 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-transparent to-transparent"></div>
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-3xl flex">
            <div className="w-2 bg-[#FF6B00] mr-6 shrink-0"></div>
            <div>
              <h1 className="font-['Bebas_Neue'] text-7xl md:text-9xl leading-[0.85] tracking-tight mb-6">
                DOMINEZ<br />LE TERRAIN
              </h1>
              <p className="text-xl md:text-2xl text-white/80 font-medium mb-10 max-w-xl">
                Réservez votre créneau en 30 secondes. Rejoignez l'élite du padel.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button className="bg-[#FF6B00] hover:bg-[#ff8533] text-black font-black uppercase tracking-widest px-8 py-5 flex items-center justify-center gap-3 transition-transform hover:-translate-y-1">
                  Réserver maintenant
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
                <button className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-bold uppercase tracking-widest px-8 py-5 transition-colors border border-white/20 text-center">
                  Voir les matchs ouverts
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* DIAGONAL DIVIDER */}
      <div className="h-24 md:h-32 bg-[#FF6B00] clip-diagonal -mt-16 relative z-20 flex items-center overflow-hidden">
        {/* LIVE MATCHES TICKER inside the divider */}
        <div className="w-full bg-[#111111]/20 py-3 transform -skew-y-0 text-black font-bold uppercase tracking-widest text-lg md:text-xl flex overflow-hidden whitespace-nowrap">
          <div className="animate-marquee">
            <span className="mx-4">🔴 EN DIRECT —</span>
            <span className="mx-4">TERRAIN A: DUPONT/MARTIN VS LEROY/GARCIA (SET 2)</span>
            <span className="mx-4">⚡</span>
            <span className="mx-4">🔴 EN DIRECT —</span>
            <span className="mx-4">TERRAIN C: TOURNOI PRO QUALIFIERS</span>
            <span className="mx-4">⚡</span>
            <span className="mx-4">🔴 EN DIRECT —</span>
            <span className="mx-4">TERRAIN E: ENTRAÎNEMENT ÉQUIPE 1</span>
            <span className="mx-4">⚡</span>
            <span className="mx-4">🔴 EN DIRECT —</span>
            <span className="mx-4">TERRAIN A: DUPONT/MARTIN VS LEROY/GARCIA (SET 2)</span>
            <span className="mx-4">⚡</span>
            <span className="mx-4">🔴 EN DIRECT —</span>
            <span className="mx-4">TERRAIN C: TOURNOI PRO QUALIFIERS</span>
            <span className="mx-4">⚡</span>
            <span className="mx-4">🔴 EN DIRECT —</span>
            <span className="mx-4">TERRAIN E: ENTRAÎNEMENT ÉQUIPE 1</span>
          </div>
        </div>
      </div>

      {/* COURTS SECTION */}
      <section className="py-24 px-6 container mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div>
            <h2 className="font-['Bebas_Neue'] text-5xl md:text-7xl tracking-wide text-white">
              CHOISISSEZ <span className="text-[#FF6B00]">VOTRE TERRAIN</span>
            </h2>
            <p className="text-white/60 font-medium text-lg mt-2 uppercase tracking-wider">Installations premium. Surface WPT.</p>
          </div>
          <button className="text-white uppercase font-bold tracking-widest text-sm border-b-2 border-[#FF6B00] pb-1 hover:text-[#FF6B00] transition-colors">
            Voir tous les terrains
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: "TERRAIN A", img: "https://images.unsplash.com/photo-1599930113854-d6d7fd521f10?w=600", tag: "INDOOR", tokens: 4, free: "3/4" },
            { name: "TERRAIN B", img: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600", tag: "OUTDOOR", tokens: 3, free: "2/4" },
            { name: "TERRAIN C", img: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600", tag: "PANORAMIQUE", tokens: 5, free: "4/4" }
          ].map((court, i) => (
            <div key={i} className="group cursor-pointer card-hover relative h-[450px] overflow-hidden bg-black flex flex-col justify-end">
              <div className="absolute inset-0">
                <img 
                  src={court.img} 
                  alt={court.name} 
                  className="w-full h-full object-cover opacity-70 transition-transform duration-700 card-img grayscale group-hover:grayscale-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
              </div>
              
              <div className="relative p-6 z-10 border-t-4 border-transparent group-hover:border-[#FF6B00] transition-colors">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="inline-block bg-[#FF6B00] text-black font-bold text-xs px-3 py-1 uppercase tracking-wider mb-3">
                      {court.tag} · {court.tokens} TOKENS
                    </div>
                    <h3 className="font-['Bebas_Neue'] text-4xl">{court.name}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black text-white">{court.free}</div>
                    <div className="text-xs font-bold text-white/50 uppercase tracking-widest">LIBRE</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* OPEN MATCHES */}
      <section className="bg-[#FF6B00] clip-diagonal-top pt-32 pb-24 px-6 relative z-10">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <h2 className="font-['Bebas_Neue'] text-5xl md:text-7xl tracking-wide text-black">
              MATCHS <span className="text-white">OUVERTS</span>
            </h2>
            <button className="text-black uppercase font-black tracking-widest text-sm border-b-2 border-black pb-1 hover:text-white hover:border-white transition-colors">
              Créer un match
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { time: "18:00 - 19:30", court: "TERRAIN A", level: "INTERMÉDIAIRE", players: 2 },
              { time: "19:30 - 21:00", court: "TERRAIN C", level: "AVANCÉ", players: 3 },
              { time: "21:00 - 22:30", court: "TERRAIN B", level: "DÉBUTANT", players: 1 }
            ].map((match, i) => (
              <div key={i} className="bg-[#111111] p-6 hover:-translate-y-2 transition-transform duration-300 shadow-2xl">
                <div className="flex justify-between items-start border-b border-white/10 pb-4 mb-4">
                  <div>
                    <div className="text-[#FF6B00] font-black text-xl">{match.time}</div>
                    <div className="text-white/60 font-bold text-sm uppercase tracking-wider">{match.court}</div>
                  </div>
                  <div className="bg-white/10 px-2 py-1 text-xs font-bold uppercase tracking-widest text-white">
                    {match.level}
                  </div>
                </div>
                
                <div className="flex justify-between items-center mb-6">
                  <div className="flex -space-x-3">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className={`w-12 h-12 rounded-full border-2 border-[#111] flex items-center justify-center
                        ${j < match.players ? 'bg-zinc-800' : 'bg-transparent border-dashed border-white/30'}
                      `}>
                        {j < match.players ? (
                          <img src={`https://i.pravatar.cc/150?u=${i}${j}`} alt="Player" className="w-full h-full rounded-full" />
                        ) : (
                          <span className="text-white/30 text-lg">+</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-white">{4 - match.players}</div>
                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">PLACES</div>
                  </div>
                </div>

                <button className="w-full bg-white hover:bg-zinc-200 text-black font-black uppercase tracking-widest py-4 transition-colors">
                  Rejoindre
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS ROW */}
      <section className="bg-[#0a0a0a] py-20 px-6 border-y border-white/5 relative z-0">
        <div className="container mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <div>
            <div className="font-['Bebas_Neue'] text-7xl md:text-8xl text-white mb-2">247+</div>
            <div className="text-[#FF6B00] font-bold uppercase tracking-widest text-sm">Matchs Joués Ce Mois</div>
          </div>
          <div className="relative">
            {/* Geometric accent */}
            <div className="hidden md:block absolute left-0 top-1/2 -translate-y-1/2 w-px h-24 bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
            <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-px h-24 bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
            
            <div className="font-['Bebas_Neue'] text-7xl md:text-8xl text-white mb-2">6</div>
            <div className="text-[#FF6B00] font-bold uppercase tracking-widest text-sm">Terrains Premium</div>
          </div>
          <div>
            <div className="font-['Bebas_Neue'] text-7xl md:text-8xl text-white mb-2">98%</div>
            <div className="text-[#FF6B00] font-bold uppercase tracking-widest text-sm">Joueurs Satisfaits</div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#111111] py-12 px-6 border-t border-white/10">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-['Bebas_Neue'] text-4xl tracking-wider text-white/50 hover:text-white transition-colors cursor-pointer">
            PADEL CLUB
          </div>
          <div className="flex gap-8 text-sm font-bold uppercase tracking-widest text-white/40">
            <a href="#" className="hover:text-[#FF6B00] transition-colors">Mentions Légales</a>
            <a href="#" className="hover:text-[#FF6B00] transition-colors">Contact</a>
            <a href="#" className="hover:text-[#FF6B00] transition-colors">FAQ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
