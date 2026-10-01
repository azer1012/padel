import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  usePushPublicKey,
  useUpdateNotificationPrefs,
  pushTest,
} from "@workspace/api-client-react";
import {
  BellIcon,
  DeviceMobileIcon,
  EnvelopeSimpleIcon,
  PaperPlaneTiltIcon,
} from "@/components/icons";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTx } from "@/lib/i18n";
import {
  currentPushSubscription,
  disablePush,
  enablePush,
  isIOS,
  isStandalone,
  pushSupported,
} from "@/lib/pwa";

export function NotificationSettings({
  me,
}: {
  me: { emailNotifications?: boolean; pushNotifications?: boolean } | undefined;
}) {
  const tx = useTx();
  const { toast } = useToast();
  const qc = useQueryClient();
  const prefs = useUpdateNotificationPrefs();
  const { data: key } = usePushPublicKey();
  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const email = me?.emailNotifications ?? true;

  useEffect(() => {
    currentPushSubscription()
      .then((s) => setDeviceOn(!!s))
      .catch(() => {});
  }, []);

  const save = (data: { emailNotifications?: boolean; pushNotifications?: boolean }) =>
    prefs.mutate(data, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetMeQueryKey() }) });

  const iosNeedsInstall = isIOS() && !isStandalone();
  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
  const canPush = pushSupported() && !!key?.enabled && !denied;

  async function togglePush(on: boolean) {
    setBusy(true);
    try {
      if (on) {
        const r = await enablePush(key?.publicKey);
        if (r === "enabled") {
          setDeviceOn(true);
          save({ pushNotifications: true });
          toast({
            title: tx({
              fr: "Notifications activées sur cet appareil",
              en: "Notifications on for this device",
              ar: "تم تفعيل الإشعارات على هذا الجهاز",
            }),
          });
        } else if (r === "denied")
          toast({
            title: tx({
              fr: "Notifications bloquées",
              en: "Notifications blocked",
              ar: "الإشعارات محظورة",
            }),
            description: tx({
              fr: "Autorisez-les dans les réglages du navigateur.",
              en: "Allow them in your browser settings.",
              ar: "اسمح بها في إعدادات المتصفح.",
            }),
            variant: "destructive",
          });
      } else {
        await disablePush();
        setDeviceOn(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const Row = ({
    icon: Icon,
    title,
    text,
    children,
  }: {
    icon: typeof BellIcon;
    title: string;
    text: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-center gap-4 rounded-[20px] bg-mist p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-card text-court">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold">{title}</span>
        <span className="text-[13px] text-muted-foreground">{text}</span>
      </span>
      {children}
    </div>
  );

  return (
    <section
      className="enter flex flex-col gap-4 rounded-[32px] bg-card p-6 shadow-sm sm:p-8"
      aria-labelledby="notif-title"
    >
      <h2 id="notif-title" className="disp m-0 flex items-center gap-2 text-2xl">
        <BellIcon className="size-6 text-court" />
        {tx({ fr: "Notifications", en: "Notifications", ar: "الإشعارات" })}
      </h2>
      <p className="m-0 text-[15px] text-muted-foreground">
        {tx({
          fr: "Confirmations, rappel 2 h avant le match, tokens ajoutés. Jamais de pub.",
          en: "Confirmations, a reminder 2 h before your match, tokens added. Never ads.",
          ar: "التأكيدات، تذكير قبل المباراة بساعتين، الرصيد المضاف. بدون إعلانات.",
        })}
      </p>
      <Row
        icon={EnvelopeSimpleIcon}
        title="Email"
        text={tx({
          fr: "Récapitulatifs et rappels par email",
          en: "Summaries and reminders by email",
          ar: "الملخصات والتذكيرات عبر البريد",
        })}
      >
        <Switch
          checked={email}
          disabled={prefs.isPending}
          onCheckedChange={(v) => save({ emailNotifications: v })}
          aria-label="Email"
        />
      </Row>
      <Row
        icon={DeviceMobileIcon}
        title={tx({ fr: "Sur cet appareil", en: "On this device", ar: "على هذا الجهاز" })}
        text={
          iosNeedsInstall
            ? tx({
                fr: "Sur iPhone, installez d'abord l'app sur l'écran d'accueil.",
                en: "On iPhone, add the app to your home screen first.",
                ar: "على iPhone، أضف التطبيق إلى الشاشة الرئيسية أولًا.",
              })
            : denied
              ? tx({
                  fr: "Bloquées dans les réglages du navigateur.",
                  en: "Blocked in your browser settings.",
                  ar: "محظورة في إعدادات المتصفح.",
                })
              : !pushSupported()
                ? tx({
                    fr: "Non disponible sur ce navigateur.",
                    en: "Not available in this browser.",
                    ar: "غير متاح في هذا المتصفح.",
                  })
                : !key?.enabled
                  ? tx({ fr: "Bientôt disponible.", en: "Coming soon.", ar: "قريبًا." })
                  : tx({
                      fr: "Notifications instantanées, même app fermée",
                      en: "Instant alerts, even when the app is closed",
                      ar: "تنبيهات فورية حتى والتطبيق مغلق",
                    })
        }
      >
        <Switch
          checked={deviceOn}
          disabled={busy || (!deviceOn && (!canPush || iosNeedsInstall))}
          onCheckedChange={togglePush}
          aria-label={tx({
            fr: "Notifications push",
            en: "Push notifications",
            ar: "الإشعارات الفورية",
          })}
        />
      </Row>
      {deviceOn && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() =>
            pushTest().then(
              (r) =>
                !r.sent &&
                toast({
                  title: tx({
                    fr: "Aucun appareil joignable",
                    en: "No device reachable",
                    ar: "لا يوجد جهاز متاح",
                  }),
                  variant: "destructive",
                }),
            )
          }
        >
          <PaperPlaneTiltIcon />
          {tx({ fr: "Envoyer un test", en: "Send a test", ar: "إرسال تجربة" })}
        </Button>
      )}
    </section>
  );
}
