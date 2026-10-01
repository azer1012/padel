import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/lib/pwa";
import { useTx } from "@/lib/i18n";

const KEY = "smash-install-dismissed";
const SNOOZE_MS = 21 * 24 * 60 * 60 * 1000;

function snoozed() {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** "Install the app" card: one tap on Android/Chrome, instructions on iPhone. */
export function InstallBanner() {
  const tx = useTx();
  const { mode, install } = useInstallPrompt();
  const [hidden, setHidden] = useState(snoozed);
  const [iosHelp, setIosHelp] = useState(false);
  if (!mode || hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <aside
      className="on-dark enter relative flex flex-col gap-4 overflow-hidden rounded-[28px] bg-night p-5 text-white sm:flex-row sm:items-center sm:p-6"
      aria-label={tx({ fr: "Installer l'application", en: "Install the app", ar: "تثبيت التطبيق" })}
    >
      <img
        src={`${import.meta.env.BASE_URL}icon-192.png`}
        alt=""
        className="size-14 shrink-0 rounded-2xl"
      />
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-lg font-extrabold">
          {tx({
            fr: "Smash Padel sur votre écran d'accueil",
            en: "Smash Padel on your home screen",
            ar: "Smash Padel على شاشتك الرئيسية",
          })}
        </span>
        {iosHelp ? (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[15px] text-soft-d">
            <li className="flex items-center gap-2">
              1. {tx({ fr: "Touchez", en: "Tap", ar: "اضغط" })}{" "}
              <Share className="size-4 text-ball" aria-label="Share" />{" "}
              {tx({ fr: "en bas de Safari", en: "at the bottom of Safari", ar: "أسفل Safari" })}
            </li>
            <li className="flex items-center gap-2">
              2. {tx({ fr: "Choisissez", en: "Choose", ar: "اختر" })}{" "}
              <SquarePlus className="size-4 text-ball" aria-hidden="true" /> «&nbsp;
              {tx({
                fr: "Sur l'écran d'accueil",
                en: "Add to Home Screen",
                ar: "إضافة إلى الشاشة الرئيسية",
              })}
              &nbsp;»
            </li>
          </ol>
        ) : (
          <span className="text-[15px] text-soft-d">
            {tx({
              fr: "Réservez en un tap et recevez les rappels avant vos matchs.",
              en: "Book in one tap and get reminders before your matches.",
              ar: "احجز بنقرة واستلم التذكيرات قبل مبارياتك.",
            })}
          </span>
        )}
      </div>
      {!iosHelp && (
        <Button
          variant="lime"
          onClick={async () => {
            if (mode === "ios") setIosHelp(true);
            else if (await install()) setHidden(true);
          }}
        >
          <Download />
          {tx({ fr: "Installer", en: "Install", ar: "تثبيت" })}
        </Button>
      )}
      <button
        type="button"
        onClick={dismiss}
        className="absolute end-3 top-3 flex size-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10"
        aria-label={tx({ fr: "Plus tard", en: "Not now", ar: "لاحقًا" })}
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}
