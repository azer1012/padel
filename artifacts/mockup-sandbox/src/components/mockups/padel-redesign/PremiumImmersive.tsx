import React from "react";

export function PremiumImmersive() {
  return (
    <div className="min-h-screen text-white font-['Inter'] relative" style={{ backgroundColor: "#0B0F1A" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap');
        
        .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 50;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        .gold-text {
          color: #D4AF37;
        }

        .gold-border {
          border-color: #D4AF37;
        }

        .gold-hover:hover {
          background-color: rgba(212, 175, 55, 0.1);
        }
      `}</style>

      <div className="noise-overlay"></div>

      {/* TOP NAV */}
      <nav className="absolute top-0 w-full z-40 px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-['Playfair_Display'] italic text-2xl tracking-wider">PADEL CLUB</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></span>
          <span className="text-sm tracking-widest uppercase text-white/70">Club Privé</span>
        </div>
        <div className="flex items-center gap-8">
          <button className="gold-text uppercase tracking-widest text-sm hover:opacity-80 transition-opacity">
            Connexion
          </button>
          <button className="px-6 py-2 border border-[#D4AF37]/50 rounded-full gold-text uppercase tracking-widest text-sm gold-hover transition-colors">
            Réserver
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1400')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed"
          }}
        ></div>
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-[#0B0F1A]/40 via-[#0B0F1A]/60 to-[#0B0F1A]"></div>
        
        <div className="relative z-20 flex flex-col items-center text-center px-4 max-w-4xl mx-auto mt-20">
          <span className="gold-text uppercase tracking-[0.3em] text-sm mb-6 font-medium">
            Bienvenue au Club
          </span>
          <h1 className="font-['Playfair_Display'] text-6xl md:text-8xl mb-8 leading-tight">
            L'Excellence <br/>
            <span className="italic">du Padel</span>
          </h1>
          
          <div className="flex items-center w-64 justify-center gap-4 mb-8">
            <div className="h-px bg-white/20 flex-1"></div>
            <div className="w-2 h-2 rotate-45 border border-[#D4AF37]"></div>
            <div className="h-px bg-white/20 flex-1"></div>
          </div>
          
          <p className="text-lg md:text-xl text-white/70 font-light max-w-2xl mb-12 leading-relaxed">
            Une expérience sportive incomparable dans un cadre prestigieux. Découvrez nos installations premium et rejoignez une communauté d'esthètes.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6">
            <button className="px-8 py-4 bg-[#D4AF37] text-[#0B0F1A] rounded-full uppercase tracking-widest text-sm font-semibold hover:bg-white transition-colors">
              Réserver un court
            </button>
            <button className="px-8 py-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-full uppercase tracking-widest text-sm font-medium hover:bg-white/10 transition-colors">
              Découvrir le club
            </button>
          </div>
        </div>
      </section>

      {/* EXPERIENCE SECTION */}
      <section className="py-32 px-8 max-w-7xl mx-auto space-y-40">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="relative h-[600px] rounded-3xl overflow-hidden group">
            <div className="absolute inset-0 bg-[#D4AF37]/20 z-10 mix-blend-overlay group-hover:opacity-0 transition-opacity duration-700"></div>
            <img 
              src="https://images.unsplash.com/photo-1599930113854-d6d7fd521f10?w=600" 
              alt="Premium Indoor Court"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
            />
          </div>
          <div className="space-y-8">
            <span className="gold-text uppercase tracking-[0.2em] text-sm font-medium">Nos Terrains</span>
            <h2 className="font-['Playfair_Display'] text-4xl md:text-5xl leading-tight">
              L'écrin parfait <br/>
              <span className="italic text-white/80">pour votre jeu</span>
            </h2>
            <p className="text-white/60 font-light leading-relaxed text-lg">
              Nos terrains indoor panoramiques offrent des conditions de jeu parfaites toute l'année. Éclairage LED anti-éblouissement, moquette dernière génération, et hauteur sous plafond spectaculaire. Chaque détail a été pensé pour les joueurs exigeants.
            </p>
            <a href="#" className="inline-flex items-center gap-2 gold-text uppercase tracking-wider text-sm font-medium hover:gap-4 transition-all">
              Découvrir les installations <span className="text-lg">→</span>
            </a>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-8 order-2 md:order-1">
            <span className="gold-text uppercase tracking-[0.2em] text-sm font-medium">Matchs Ouverts</span>
            <h2 className="font-['Playfair_Display'] text-4xl md:text-5xl leading-tight">
              Rencontrez <br/>
              <span className="italic text-white/80">votre niveau</span>
            </h2>
            <p className="text-white/60 font-light leading-relaxed text-lg">
              Rejoignez des parties adaptées à votre style de jeu. Notre système de matchmaking exclusif vous permet de trouver des partenaires de votre niveau, dans une atmosphère de compétition courtoise et élégante.
            </p>
            <a href="#" className="inline-flex items-center gap-2 gold-text uppercase tracking-wider text-sm font-medium hover:gap-4 transition-all">
              Voir les matchs <span className="text-lg">→</span>
            </a>
          </div>
          <div className="relative h-[600px] rounded-3xl overflow-hidden group order-1 md:order-2">
            <div className="absolute inset-0 bg-[#0B0F1A]/20 z-10 mix-blend-overlay group-hover:opacity-0 transition-opacity duration-700"></div>
            <img 
              src="https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600" 
              alt="Match in progress"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
            />
          </div>
        </div>
      </section>

      {/* COURT SHOWCASE */}
      <section className="py-32 bg-[#1a1f35]">
        <div className="max-w-7xl mx-auto px-8">
          <div className="text-center mb-20">
            <h2 className="font-['Playfair_Display'] text-4xl md:text-5xl">Choisissez Votre Terrain</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { name: "TERRAIN A", status: "Disponible", statusColor: "text-emerald-400" },
              { name: "TERRAIN B", status: "Occupé (14h-16h)", statusColor: "text-white/40" },
              { name: "TERRAIN C", status: "Disponible", statusColor: "text-emerald-400" }
            ].map((court, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden group hover:border-[#D4AF37]/30 transition-colors">
                <div className="h-48 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[#0B0F1A]/40 z-10"></div>
                  <img src="https://images.unsplash.com/photo-1599930113854-d6d7fd521f10?w=400" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Court" />
                  <div className="absolute top-4 right-4 z-20 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full border border-white/10 text-xs font-medium uppercase tracking-wider">
                    <span className={court.statusColor}>{court.status}</span>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  <div>
                    <span className="gold-text text-xs uppercase tracking-[0.2em]">{court.name}</span>
                    <h3 className="font-['Playfair_Display'] text-2xl mt-2">Indoor Premium</h3>
                  </div>
                  <div className="flex items-center justify-between py-4 border-y border-white/10">
                    <span className="text-sm text-white/60">Durée</span>
                    <span className="font-medium">90 min</span>
                  </div>
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-sm text-white/60">Tarif</span>
                    <span className="font-medium gold-text">4 tokens</span>
                  </div>
                  <button className="w-full py-4 border border-[#D4AF37]/30 rounded-full uppercase tracking-widest text-sm hover:bg-[#D4AF37] hover:text-[#0B0F1A] transition-all">
                    Réserver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MEMBERSHIP SECTION */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a1f35] to-[#0B0F1A]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#D4AF37]/5 rounded-full blur-[120px] pointer-events-none"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-8 text-center">
          <h2 className="font-['Playfair_Display'] text-4xl md:text-5xl mb-6">Rejoignez le Club</h2>
          <p className="text-white/60 max-w-2xl mx-auto mb-20 text-lg">Acquérez des tokens pour réserver vos sessions. Un système flexible pour les joueurs réguliers, sans engagement.</p>

          <div className="grid md:grid-cols-3 gap-8 items-center">
            {/* Tier 1 */}
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h3 className="uppercase tracking-widest text-sm text-white/60 mb-8">Découverte</h3>
              <div className="font-['Playfair_Display'] text-6xl mb-2">10<span className="text-2xl text-white/40 ml-2">tokens</span></div>
              <div className="text-xl mb-8">90 €</div>
              <ul className="space-y-4 text-left text-white/70 text-sm mb-8">
                <li className="flex items-center gap-3"><span className="gold-text">♦</span> Valable 3 mois</li>
                <li className="flex items-center gap-3"><span className="gold-text">♦</span> Réservation 7j à l'avance</li>
              </ul>
              <button className="w-full py-3 border border-white/20 rounded-full text-sm uppercase tracking-wider hover:bg-white hover:text-black transition-colors">
                Sélectionner
              </button>
            </div>

            {/* Tier 2 (Featured) */}
            <div className="p-10 rounded-3xl bg-[#252b45] border border-[#D4AF37]/50 shadow-[0_0_50px_rgba(212,175,55,0.1)] relative transform md:-translate-y-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#D4AF37] text-[#0B0F1A] px-4 py-1 rounded-full text-xs uppercase tracking-widest font-bold">
                Le plus prisé
              </div>
              <h3 className="uppercase tracking-widest text-sm gold-text mb-8">Passion</h3>
              <div className="font-['Playfair_Display'] text-6xl mb-2">30<span className="text-2xl text-white/40 ml-2">tokens</span></div>
              <div className="text-xl mb-8">250 €</div>
              <ul className="space-y-4 text-left text-white/90 text-sm mb-8">
                <li className="flex items-center gap-3"><span className="gold-text">♦</span> Valable 6 mois</li>
                <li className="flex items-center gap-3"><span className="gold-text">♦</span> Réservation 14j à l'avance</li>
                <li className="flex items-center gap-3"><span className="gold-text">♦</span> 1 location de raquette offerte/mois</li>
              </ul>
              <button className="w-full py-4 bg-[#D4AF37] text-[#0B0F1A] rounded-full text-sm uppercase tracking-wider font-semibold hover:bg-white transition-colors">
                Sélectionner
              </button>
            </div>

            {/* Tier 3 */}
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h3 className="uppercase tracking-widest text-sm text-white/60 mb-8">Excellence</h3>
              <div className="font-['Playfair_Display'] text-6xl mb-2">50<span className="text-2xl text-white/40 ml-2">tokens</span></div>
              <div className="text-xl mb-8">390 €</div>
              <ul className="space-y-4 text-left text-white/70 text-sm mb-8">
                <li className="flex items-center gap-3"><span className="gold-text">♦</span> Valable 1 an</li>
                <li className="flex items-center gap-3"><span className="gold-text">♦</span> Réservation 21j à l'avance</li>
                <li className="flex items-center gap-3"><span className="gold-text">♦</span> Serviettes incluses</li>
              </ul>
              <button className="w-full py-3 border border-white/20 rounded-full text-sm uppercase tracking-wider hover:bg-white hover:text-black transition-colors">
                Sélectionner
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="border-t border-white/10 bg-[#0B0F1A] py-12">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between text-white/50 text-sm uppercase tracking-[0.2em] gap-6 text-center">
          <span>247 membres réguliers</span>
          <span className="hidden md:block w-1 h-1 rounded-full bg-[#D4AF37]"></span>
          <span>6 terrains d'exception</span>
          <span className="hidden md:block w-1 h-1 rounded-full bg-[#D4AF37]"></span>
          <span>Établi depuis 2019</span>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="py-8 text-center text-white/30 text-xs uppercase tracking-widest border-t border-white/5">
        © 2024 Padel Club. L'art de vivre sportif.
      </footer>
    </div>
  );
}
