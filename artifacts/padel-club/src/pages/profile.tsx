import { useEffect, useState } from "react";
import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, Page, PageHeader } from "@/components/smash/primitives";
import { useToast } from "@/hooks/use-toast";
import { NotificationSettings } from "@/components/smash/notification-settings";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useI18n, useTx, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function Profile() {
  const tx = useTx();
  const { t, setLang } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const { data: user, isLoading } = useGetMe();
  const updateMutation = useUpdateMe();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    language: "fr" as Lang,
  });

  useEffect(() => {
    if (user)
      setForm({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
        language: (user.language ?? "fr") as Lang,
      });
  }, [user]);

  const dirty =
    !!user &&
    (form.firstName !== (user.firstName ?? "") ||
      form.lastName !== (user.lastName ?? "") ||
      form.phone !== (user.phone ?? "") ||
      form.language !== (user.language ?? "fr"));

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      {
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          language: form.language,
        },
      },
      {
        onSuccess: () => {
          setLang(form.language);
          toast({
            title: tx({ fr: "Profil enregistré", en: "Profile saved", ar: "تم حفظ الملف" }),
          });
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: () =>
          toast({
            title: tx({ fr: "Erreur d'enregistrement", en: "Couldn't save", ar: "تعذر الحفظ" }),
            variant: "destructive",
          }),
      },
    );
  }

  async function sendReset() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/profile`,
    });
    toast(
      error
        ? { title: error.message, variant: "destructive" }
        : {
            title: tx({
              fr: "Lien envoyé par email",
              en: "Link sent by email",
              ar: "تم إرسال الرابط",
            }),
          },
    );
  }

  const name = `${form.firstName} ${form.lastName}`.trim() || user?.email || "";
  const langs: { v: Lang; l: string }[] = [
    { v: "fr", l: "Français" },
    { v: "ar", l: "العربية" },
    { v: "en", l: "English" },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow={t("profile")}
        title={tx({ fr: "Votre profil", en: "Your profile", ar: "ملفك الشخصي" })}
      />
      {isLoading ? (
        <Skeleton className="h-[420px] !rounded-[32px]" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="on-dark enter flex flex-col items-start gap-5 self-start rounded-[32px] bg-night p-7 text-white">
            <Avatar name={name} size={84} />
            <span className="flex flex-col gap-1">
              <span className="disp text-3xl leading-tight">{name}</span>
              <span className="text-sm text-muted-d">{user?.email}</span>
            </span>
            {user?.role === "admin" && (
              <span className="rounded-full bg-ball px-3 py-1 text-xs font-extrabold text-night">
                Admin
              </span>
            )}
            <div className="flex w-full flex-col gap-2 pt-2">
              <Button variant="outline-dark" size="sm" onClick={sendReset}>
                <KeyRound />
                {tx({
                  fr: "Changer le mot de passe",
                  en: "Change password",
                  ar: "تغيير كلمة المرور",
                })}
              </Button>
              <Button variant="outline-dark" size="sm" onClick={signOut}>
                <LogOut />
                {t("signOut")}
              </Button>
            </div>
          </aside>

          <form
            onSubmit={handleSave}
            className="enter flex flex-col gap-5 rounded-[32px] bg-card p-6 shadow-sm sm:p-8"
          >
            <h2 className="disp m-0 text-2xl">
              {tx({ fr: "Informations", en: "Personal details", ar: "المعلومات" })}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="fn">{tx({ fr: "Prénom", en: "First name", ar: "الاسم" })}</Label>
                <Input
                  id="fn"
                  data-testid="input-first-name"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Ahmed"
                />
              </div>
              <div>
                <Label htmlFor="ln">{tx({ fr: "Nom", en: "Last name", ar: "اللقب" })}</Label>
                <Input
                  id="ln"
                  data-testid="input-last-name"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Ben Ali"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="em">Email</Label>
              <Input id="em" value={user?.email ?? ""} disabled />
              <p className="mt-2 text-xs text-muted-foreground">
                {tx({
                  fr: "L'email ne peut pas être modifié ici.",
                  en: "Email can't be changed here.",
                  ar: "لا يمكن تغيير البريد هنا.",
                })}
              </p>
            </div>
            <div>
              <Label htmlFor="ph">{tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" })}</Label>
              <Input
                id="ph"
                data-testid="input-phone"
                type="tel"
                autoComplete="tel"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+216 XX XXX XXX"
              />
            </div>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-sm font-bold">{t("language")}</legend>
              <div role="radiogroup" data-testid="select-language" className="flex flex-wrap gap-2">
                {langs.map((l) => (
                  <button
                    key={l.v}
                    type="button"
                    role="radio"
                    aria-checked={form.language === l.v}
                    onClick={() => setForm((f) => ({ ...f, language: l.v }))}
                    className={cn(
                      "h-11 rounded-full border-2 px-5 font-bold transition-colors",
                      form.language === l.v
                        ? "border-ink bg-ink text-white"
                        : "border-[#E4E8F7] hover:border-[#C6CEF6]",
                    )}
                  >
                    {l.l}
                  </button>
                ))}
              </div>
            </fieldset>
            <Button
              type="submit"
              data-testid="btn-save-profile"
              size="lg"
              className="self-start"
              disabled={!dirty || updateMutation.isPending}
            >
              <Save />
              {updateMutation.isPending
                ? tx({ fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…" })
                : tx({ fr: "Enregistrer", en: "Save changes", ar: "حفظ" })}
            </Button>
          </form>
        </div>
      )}
      {!isLoading && <NotificationSettings me={user as any} />}
    </Page>
  );
}
