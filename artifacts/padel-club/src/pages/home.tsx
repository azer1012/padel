import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header className="px-6 h-20 flex items-center justify-between border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur z-50">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Padel Club" className="h-8" />
        </div>
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/terrains" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            Courts
          </Link>
          <Link href="/tournaments" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            Tournaments
          </Link>
          <Link href="/news" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            News
          </Link>
          <Link href="/contact" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            Contact
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="hidden sm:flex text-foreground hover:text-primary hover:bg-secondary">
              Sign In
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold">
              Join Now
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative h-[80vh] min-h-[600px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img 
              src="/src/assets/images/hero-padel.png" 
              alt="Padel Court" 
              className="w-full h-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          </div>
          
          <div className="relative z-10 container max-w-5xl mx-auto px-4 text-center space-y-8">
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-foreground uppercase italic drop-shadow-lg">
              Elevate Your <span className="text-primary">Game</span>
            </h1>
            <p className="text-lg md:text-2xl text-muted-foreground max-w-2xl mx-auto font-medium">
              Tunisia's premier padel tennis facility. Premium indoor and outdoor courts, professional coaching, and elite tournaments.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/sign-up">
                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-wide uppercase shadow-[0_0_20px_rgba(57,255,20,0.3)]">
                  Book a Court
                </Button>
              </Link>
              <Link href="/terrains">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-lg border-border hover:bg-secondary hover:text-foreground text-foreground">
                  Explore Terrains
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="py-24 bg-secondary/30">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-black uppercase italic mb-12">How it works</h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="p-6 bg-card border border-border rounded-xl">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4 text-xl font-bold">1</div>
                <h3 className="text-xl font-bold mb-2">Buy Tokens</h3>
                <p className="text-muted-foreground">Purchase tokens to load your wallet. 1 token = 25 TND per player for 90 minutes.</p>
              </div>
              <div className="p-6 bg-card border border-border rounded-xl">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4 text-xl font-bold">2</div>
                <h3 className="text-xl font-bold mb-2">Book a Court</h3>
                <p className="text-muted-foreground">Select your preferred indoor or outdoor terrain, date, and time slot. A court requires 4 tokens (100 TND).</p>
              </div>
              <div className="p-6 bg-card border border-border rounded-xl">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-4 text-xl font-bold">3</div>
                <h3 className="text-xl font-bold mb-2">Play Padel</h3>
                <p className="text-muted-foreground">Show up with your friends and enjoy our premium sports facility.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-card border-t border-border py-12 text-center text-muted-foreground">
        <div className="container mx-auto px-4">
          <p className="font-bold text-foreground mb-4">PADEL <span className="text-primary">CLUB</span></p>
          <p>© {new Date().getFullYear()} Padel Club Tunisia. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}