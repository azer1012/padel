import { forwardRef, useState, type ComponentProps } from "react";
import { EyeIcon, EyeSlashIcon } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { useTx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** The club's password rule, as stated next to every "new password" field. */
export const passwordIsStrong = (value: string) =>
  value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

/** Password field with a show / hide toggle (sign-in, sign-up, new password). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(
  ({ className, ...props }, ref) => {
    const tx = useTx();
    const [shown, setShown] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={shown ? "text" : "password"}
          className={cn("pe-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={
            shown
              ? tx({ fr: "Masquer le mot de passe", en: "Hide password", ar: "إخفاء كلمة المرور" })
              : tx({ fr: "Afficher le mot de passe", en: "Show password", ar: "إظهار كلمة المرور" })
          }
          className="absolute end-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
        >
          {shown ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
