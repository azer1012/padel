import type { ReactNode } from "react";
import { EnvelopeSimpleIcon, WhatsappLogoIcon } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTx } from "@/lib/i18n";

/** The studio that builds the platform (same on every installation). */
const AMIVIO = {
  whatsapp: "+216 23 653 160",
  whatsappHref: "https://wa.me/21623653160",
  email: "amiviotn@gmail.com",
};

const row =
  "flex items-center gap-3 rounded-2xl border-2 border-[#E4E8F7] px-4 py-3 font-bold transition-colors hover:border-[#C6CEF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-court";

/** Footer credit: "Créé par AmiVio [logo]". A click opens AmiVio's contact details. */
export function AmivioCredit() {
  const tx = useTx();
  return (
    <AmivioContact>
      <button
        type="button"
        data-testid="amivio-credit"
        aria-label={tx({
          fr: "Créé par AmiVio : nous contacter",
          en: "Created by AmiVio: contact us",
          ar: "من تصميم AmiVio: تواصل معنا",
        })}
        className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ball"
      >
        <span>
          {tx({ fr: "Créé par", en: "Created by", ar: "من تصميم" })}{" "}
          <span className="font-bold text-white">AmiVio</span>
        </span>
        <img
          src={`${import.meta.env.BASE_URL}amivio-logo.webp`}
          alt=""
          width={70}
          height={24}
          loading="lazy"
          className="h-6 w-auto"
        />
      </button>
    </AmivioContact>
  );
}

/** AmiVio's contact details (WhatsApp, e-mail), opened by the element passed as child. */
export function AmivioContact({ children }: { children: ReactNode }) {
  const tx = useTx();
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-[420px]">
        <DialogHeader className="text-start">
          <DialogTitle>
            {tx({ fr: "Contacter AmiVio", en: "Contact AmiVio", ar: "تواصل مع AmiVio" })}
          </DialogTitle>
          <DialogDescription>
            {tx({
              fr: "Sites web, applications et plateformes sur mesure.",
              en: "Custom websites, apps and platforms.",
              ar: "مواقع وتطبيقات ومنصات حسب الطلب.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <a href={AMIVIO.whatsappHref} target="_blank" rel="noreferrer" className={row}>
            <WhatsappLogoIcon className="size-5 shrink-0 text-[#128C7E]" />
            <span className="flex flex-col">
              <span className="text-xs font-semibold text-muted-foreground">WhatsApp</span>
              <span dir="ltr">{AMIVIO.whatsapp}</span>
            </span>
          </a>
          <a href={`mailto:${AMIVIO.email}`} className={row}>
            <EnvelopeSimpleIcon className="size-5 shrink-0 text-court" />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold text-muted-foreground">
                {tx({ fr: "E-mail", en: "Email", ar: "البريد الإلكتروني" })}
              </span>
              <span dir="ltr" className="break-all">
                {AMIVIO.email}
              </span>
            </span>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
