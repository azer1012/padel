import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CourtLines } from "@/components/smash/primitives";
import { useTx } from "@/lib/i18n";

export default function NotFound() {
  const tx = useTx();
  return (
    <div className="on-dark relative flex min-h-[80dvh] flex-col items-center justify-center gap-7 overflow-hidden bg-night px-5 py-20 text-center text-white">
      <div aria-hidden="true" className="absolute h-[260px] w-[480px] rotate-[-9deg] rounded-xl border-[3px] border-white/10 bg-court/20"><CourtLines /></div>
      <span className="relative flex size-20 items-center justify-center rounded-full bg-ball text-night"><span className="disp text-3xl">404</span></span>
      <h1 className="disp relative m-0 text-[clamp(56px,9vw,120px)] leading-[0.9]">{tx({ fr: "Balle dehors.", en: "Ball's out.", ar: "الكرة خارج الملعب." })}</h1>
      <p className="relative m-0 max-w-[440px] text-lg text-muted-d">{tx({ fr: "Cette page n'existe pas. Revenez sur le terrain.", en: "This page doesn't exist. Get back on court.", ar: "هذه الصفحة غير موجودة. عد إلى الملعب." })}</p>
      <div className="relative flex flex-wrap justify-center gap-3">
        <Button asChild variant="lime" size="lg"><Link href="/">{tx({ fr: "Accueil", en: "Home", ar: "الرئيسية" })}</Link></Button>
        <Button asChild variant="outline-dark" size="lg"><Link href="/terrains">{tx({ fr: "Réserver", en: "Book a court", ar: "احجز" })}</Link></Button>
      </div>
    </div>
  );
}
