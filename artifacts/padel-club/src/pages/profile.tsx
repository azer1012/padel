import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  useUpdateMe,
  useDeleteAccount,
  getGetMeQueryKey,
  type UserGender,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FloppyDiskIcon, KeyIcon, SignOutIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiErrorText } from "@/lib/api-errors";
import { plural, tokensLabel } from "@/lib/labels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, Page, PageHeader } from "@/components/smash/primitives";
import { useToast } from "@/hooks/use-toast";
import { NotificationSettings } from "@/components/smash/notification-settings";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { useI18n, useTx, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useDemo } from "@/components/smash/demo";

export default function Profile() {
  const tx = useTx();
  const { t, setLang } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const { data: user, isLoading } = useGetMe();
  const demo = useDemo();
  const updateMutation = useUpdateMe();
  const deleteAccount = useDeleteAccount();
  const [, setLocation] = useLocation();
  const [deleting, setDeleting] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    gender: null as UserGender | null,
    language: "fr" as Lang,
  });

  useEffect(() => {
    if (user)
      setForm({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
        gender: user.gender ?? null,
        language: (user.language ?? "fr") as Lang,
      });
  }, [user]);

  const dirty =
    !!user &&
    (form.firstName !== (user.firstName ?? "") ||
      form.lastName !== (user.lastName ?? "") ||
      form.phone !== (user.phone ?? "") ||
      form.gender !== (user.gender ?? null) ||
      form.language !== (user.language ?? "fr"));

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      {
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          gender: form.gender,
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
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/reset-password`,
    });
    toast(
      error
        ? { title: authErrorMessage(error, tx), variant: "destructive" }
        : {
            title: tx({
              fr: "Lien envoyé par email",
              en: "Link sent by email",
              ar: "تم إرسال الرابط",
            }),
          },
    );
  }

  // Deleting the account: the tokens shown as given up are sent along, so a balance
  // that moved meanwhile stops the deletion instead of losing more than was agreed
  const tokensLeft = user?.tokenBalance ?? 0;
  function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    deleteAccount.mutate(
      { forfeitTokens: tokensLeft },
      {
        onSuccess: async () => {
          setDeleting(false);
          toast({
            title: tx({ fr: "Compte supprimé", en: "Account deleted", ar: "تم حذف الحساب" }),
          });
          await signOut();
          setLocation("/");
        },
        onError: (err) => {
          setDeleteError(apiErrorText(err, tx));
          // The balance moved since the screen was drawn: show the current one
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
      },
    );
  }

  const name = `${form.firstName} ${form.lastName}`.trim() || user?.email || "";
  const langs: { v: Lang; l: string }[] = [
    { v: "fr", l: "Français" },
    { v: "ar", l: "العربية" },
    { v: "en", l: "English" },
  ];
  const genders: { v: UserGender; l: string }[] = [
    { v: "male", l: tx({ fr: "Homme", en: "Male", ar: "ذكر" }) },
    { v: "female", l: tx({ fr: "Femme", en: "Female", ar: "أنثى" }) },
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
              {demo ? (
                // A shared demo account: its password is the same for every visitor
                <p className="m-0 rounded-2xl bg-white/8 px-4 py-3 text-sm text-soft-d">
                  {tx({
                    fr: "Compte de démonstration partagé : son mot de passe ne se change pas.",
                    en: "A shared demo account: its password can't be changed.",
                    ar: "حساب تجريبي مشترك: لا يمكن تغيير كلمة مروره.",
                  })}
                </p>
              ) : (
                <Button variant="outline-dark" size="sm" onClick={sendReset}>
                  <KeyIcon />
                  {tx({
                    fr: "Changer le mot de passe",
                    en: "Change password",
                    ar: "تغيير كلمة المرور",
                  })}
                </Button>
              )}
              <Button variant="outline-dark" size="sm" onClick={signOut}>
                <SignOutIcon />
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
              <legend className="mb-2 text-sm font-bold">
                {tx({ fr: "Genre", en: "Gender", ar: "الجنس" })}
              </legend>
              <div role="radiogroup" data-testid="select-gender" className="flex flex-wrap gap-2">
                {genders.map((g) => (
                  <button
                    key={g.v}
                    type="button"
                    role="radio"
                    aria-checked={form.gender === g.v}
                    onClick={() => setForm((f) => ({ ...f, gender: g.v }))}
                    className={cn(
                      "h-11 rounded-full border-2 px-5 font-bold transition-colors",
                      form.gender === g.v
                        ? "border-ink bg-ink text-white"
                        : "border-[#E4E8F7] hover:border-[#C6CEF6]",
                    )}
                  >
                    {g.l}
                  </button>
                ))}
              </div>
            </fieldset>
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
              loading={updateMutation.isPending}
            >
              <FloppyDiskIcon />
              {updateMutation.isPending
                ? tx({ fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…" })
                : tx({ fr: "Enregistrer", en: "Save changes", ar: "حفظ" })}
            </Button>
          </form>
        </div>
      )}
      {!isLoading && <NotificationSettings me={user} />}

      {/* The demo's accounts are shared by every visitor: they can't be deleted */}
      {!isLoading && user && !demo && (
        <section className="enter flex flex-col gap-3 rounded-[28px] border border-[#F3C9C9] bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex flex-col gap-1">
            <span className="text-[17px] font-extrabold">
              {tx({ fr: "Supprimer mon compte", en: "Delete my account", ar: "حذف حسابي" })}
            </span>
            <span className="text-sm text-muted-foreground">
              {tx({
                fr: "Votre nom, votre e-mail et votre téléphone sont effacés. C'est définitif.",
                en: "Your name, e-mail and phone are erased. This cannot be undone.",
                ar: "يُمحى اسمك وبريدك وهاتفك. لا يمكن التراجع.",
              })}
            </span>
          </span>
          <Button
            variant="outline-destructive"
            onClick={() => {
              setUnderstood(false);
              setDeleteError(null);
              setDeleting(true);
            }}
            data-testid="btn-delete-account"
          >
            <TrashIcon />
            {tx({ fr: "Supprimer mon compte", en: "Delete my account", ar: "حذف حسابي" })}
          </Button>
        </section>
      )}

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {tx({
                fr: "Supprimer définitivement votre compte ?",
                en: "Delete your account for good?",
                ar: "حذف حسابك نهائيًا؟",
              })}
            </DialogTitle>
            <DialogDescription>
              {tx({
                fr: "Vous ne pourrez plus vous connecter. Vos matchs passés restent dans l'historique du club, sans votre nom.",
                en: "You will no longer be able to sign in. Your past matches stay in the club's history, without your name.",
                ar: "لن تتمكن من تسجيل الدخول. تبقى مبارياتك السابقة في سجل النادي دون اسمك.",
              })}
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={confirmDelete}>
            {tokensLeft > 0 && (
              <p
                data-testid="delete-tokens-lost"
                className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
              >
                {tx({
                  fr: `Il vous reste ${tokensLabel(tokensLeft)} : ${plural(tokensLeft, "il sera perdu", "ils seront perdus")}. Pour les utiliser ou vous les faire rembourser, voyez d'abord l'accueil du club.`,
                  en: `You still have ${tokensLabel(tokensLeft)}: ${plural(tokensLeft, "it", "they")} will be lost. To use them or be refunded, see the club's front desk first.`,
                  ar: `ما زال لديك ${tokensLabel(tokensLeft)}: ستخسرها. لاستخدامها أو استرجاعها راجع استقبال النادي أولًا.`,
                })}
              </p>
            )}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-secondary p-4 text-sm font-bold">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-[#A3262B]"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                data-testid="check-delete-account"
              />
              {tokensLeft > 0
                ? tx({
                    fr: `Je supprime mon compte et je renonce à ${tokensLabel(tokensLeft)}.`,
                    en: `I delete my account and give up ${tokensLabel(tokensLeft)}.`,
                    ar: `أحذف حسابي وأتخلى عن ${tokensLabel(tokensLeft)}.`,
                  })
                : tx({
                    fr: "Je supprime mon compte, c'est définitif.",
                    en: "I delete my account, for good.",
                    ar: "أحذف حسابي نهائيًا.",
                  })}
            </label>
            {deleteError && (
              <p
                role="alert"
                className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
              >
                {deleteError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setDeleting(false)}>
                {tx({ fr: "Garder mon compte", en: "Keep my account", ar: "الإبقاء على حسابي" })}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!understood || deleteAccount.isPending}
                loading={deleteAccount.isPending}
                data-testid="btn-confirm-delete-account"
              >
                {tx({ fr: "Supprimer mon compte", en: "Delete my account", ar: "حذف حسابي" })}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
