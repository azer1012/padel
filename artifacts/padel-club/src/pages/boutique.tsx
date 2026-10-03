import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  shopKeys,
  useGetMe,
  useMyShopOrders,
  usePlaceShopOrder,
  usePayShopOrder,
  useShopProducts,
  type ShopDeliveryMethod,
  type ShopOrder,
  type ShopProduct,
} from "@workspace/api-client-react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  MinusIcon,
  MoneyIcon,
  PackageIcon,
  PhoneIcon,
  PlusIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  StorefrontIcon,
  TrashIcon,
  TruckIcon,
  CreditCardIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, Segmented } from "@/components/smash/admin";
import { cart, useCart } from "@/hooks/use-cart";
import { usePaymentReturn } from "@/hooks/use-payment-return";
import { PaymentReturn } from "@/components/smash/payment-return";
import { shopMoney, useOrderStatus, useShopCategories } from "@/hooks/use-order-status";
import { useClubRules } from "@/hooks/use-club-rules";
import { useAuth } from "@/lib/auth";
import { useI18n, useTx } from "@/lib/i18n";
import { apiErrorText } from "@/lib/api-errors";
import { clubDateTime } from "@/lib/club-time";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/services/api";

/** Same rule as the API. */
const PHONE_RE = /^[+\d][\d\s().-]{5,29}$/;
const money = shopMoney;

function NoPhoto({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-full items-center justify-center bg-mist text-court", className)}
    >
      <ShoppingBagIcon className="size-12" weight="duotone" />
    </span>
  );
}

/** The article's first photo (cart lines). */
function ProductImage({ product, className }: { product: ShopProduct; className?: string }) {
  const [broken, setBroken] = useState(false);
  const cover = product.imageUrls[0];
  if (cover && !broken)
    return (
      <img
        src={mediaSrc(cover)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cn("size-full object-cover", className)}
      />
    );
  return <NoPhoto className={className} />;
}

/**
 * The photos of an article on its card. Several photos are side by side in a strip
 * that snaps: swiped with a finger, moved with the arrows of the card or of the
 * keyboard. A photo that does not load leaves the strip.
 */
function ProductPhotos({ product, className }: { product: ShopProduct; className?: string }) {
  const tx = useTx();
  const strip = useRef<HTMLDivElement>(null);
  const [broken, setBroken] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  const photos = product.imageUrls.filter((u) => !broken.includes(u));

  if (photos.length <= 1) {
    if (!photos.length) return <NoPhoto className={className} />;
    return (
      <img
        src={mediaSrc(photos[0])}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken((b) => [...b, photos[0]])}
        className={cn("size-full object-cover", className)}
      />
    );
  }

  const go = (to: number) => {
    const el = strip.current;
    if (!el) return;
    const next = Math.max(0, Math.min(photos.length - 1, to));
    // In a right-to-left page the strip scrolls towards negative positions
    const sign = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: sign * next * el.clientWidth, behavior: calm ? "auto" : "smooth" });
  };
  const arrow =
    "absolute top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-night shadow-sm transition-[opacity,transform] hover:scale-105 disabled:opacity-0 [&_svg]:size-4";

  return (
    <div className="relative size-full" data-testid={`product-photos-${product.id}`}>
      <div
        ref={strip}
        role="region"
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label={tx({
          fr: `Photos de ${product.name} : ${at + 1} sur ${photos.length}`,
          en: `Photos of ${product.name}: ${at + 1} of ${photos.length}`,
          ar: `صور ${product.name}: ${at + 1} من ${photos.length}`,
        })}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
          go(at + ((e.key === "ArrowRight") !== rtl ? 1 : -1));
        }}
        className={cn(
          "flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {photos.map((url) => (
          <img
            key={url}
            src={mediaSrc(url)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken((b) => [...b, url])}
            className="size-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {/* The strip itself takes the keyboard (arrows): these are for the mouse and the finger */}
      <button
        type="button"
        tabIndex={-1}
        disabled={at === 0}
        onClick={() => go(at - 1)}
        aria-label={tx({ fr: "Photo précédente", en: "Previous photo", ar: "الصورة السابقة" })}
        className={cn(arrow, "start-3")}
      >
        <CaretLeftIcon className="rtl:scale-x-[-1]" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        disabled={at >= photos.length - 1}
        onClick={() => go(at + 1)}
        aria-label={tx({ fr: "Photo suivante", en: "Next photo", ar: "الصورة التالية" })}
        className={cn(arrow, "end-3")}
      >
        <CaretRightIcon className="rtl:scale-x-[-1]" />
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5"
      >
        {photos.map((url, i) => (
          <span
            key={url}
            className={cn(
              "h-1.5 rounded-full shadow-sm transition-[width,background-color] duration-300",
              i === at ? "w-5 bg-white" : "w-1.5 bg-white/60",
            )}
          />
        ))}
      </span>
    </div>
  );
}

function Stepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const tx = useTx();
  return (
    <span
      className="flex items-center gap-1 rounded-full bg-secondary p-1"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label={tx({ fr: "Retirer un", en: "Remove one", ar: "إنقاص واحد" })}
        className="flex size-9 items-center justify-center rounded-full bg-card shadow-sm transition-transform active:scale-90"
      >
        <MinusIcon className="size-4" />
      </button>
      <span className="min-w-8 text-center font-extrabold" dir="ltr" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={tx({ fr: "Ajouter un", en: "Add one", ar: "إضافة واحد" })}
        className="flex size-9 items-center justify-center rounded-full bg-card shadow-sm transition-transform active:scale-90 disabled:opacity-40"
      >
        <PlusIcon className="size-4" />
      </button>
    </span>
  );
}

export default function Boutique() {
  const tx = useTx();
  const { lang } = useI18n();
  const rules = useClubRules();
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { label: categoryLabel } = useShopCategories();
  const orderStatus = useOrderStatus();

  const { data: products, isLoading, isError, refetch } = useShopProducts();
  const { data: me } = useGetMe({ query: { enabled: isSignedIn } });
  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useMyShopOrders({ enabled: isSignedIn });
  const place = usePlaceShopOrder();
  const { lines, count, quantityOf } = useCart();

  const [tab, setTab] = useState<"shop" | "orders">("shop");
  const [category, setCategory] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [done, setDone] = useState<ShopOrder | null>(null);
  const [method, setMethod] = useState<ShopDeliveryMethod>("pickup");
  const [form, setForm] = useState({ name: "", phone: "", address: "", city: "", notes: "" });
  const [formError, setFormError] = useState<string | null>(null);
  /** One key per checkout: a double tap or a retried request creates one order. */
  const checkoutKey = useRef<string>(crypto.randomUUID());

  // The member's own name and phone, once, when the profile arrives
  const prefilled = useRef(false);
  useEffect(() => {
    if (!me || prefilled.current) return;
    prefilled.current = true;
    setForm((f) => ({
      ...f,
      name: f.name || `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim(),
      phone: f.phone || (me.phone ?? ""),
    }));
  }, [me]);

  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  /** Cart lines the catalogue still sells, with their article. */
  const items = lines
    .map((l) => ({ ...l, product: byId.get(l.productId) }))
    .filter((l): l is typeof l & { product: ShopProduct } => !!l.product);
  const total = items.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  /** Lines asking for more than what is left (the stock moved since they were added). */
  const short = items.filter((l) => l.quantity > l.product.stock);
  // Until the catalogue is known, the saved cart's own count
  const units = products ? items.reduce((sum, l) => sum + l.quantity, 0) : count;

  // Articles taken off sale since they were put in the cart leave it
  useEffect(() => {
    if (!products || !rules.shopEnabled) return;
    for (const l of lines) if (!byId.has(l.productId)) cart.remove(l.productId);
  }, [products, byId, lines, rules.shopEnabled]);
  const categories = [...new Set((products ?? []).map((p) => p.category))];
  const shown = (products ?? []).filter((p) => category === "all" || p.category === category);

  const openCart = () => {
    setDone(null);
    setFormError(null);
    setPayError(null);
    setCartOpen(true);
  };

  // Online payment: the API opens a payment for the order's own total and answers
  // with the page to pay on. An order is never lost when that fails: it stays to be
  // paid later, online or on reception.
  const online = rules.onlinePayment.enabled;
  const payOrder = usePayShopOrder();
  const [payNow, setPayNow] = useState<"reception" | "online">("reception");
  const [payingOrder, setPayingOrder] = useState<number | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const payOnline = (orderId: number, onFail?: () => void) => {
    setPayError(null);
    setPayingOrder(orderId);
    payOrder.mutate(orderId, {
      onSuccess: (payment) => {
        // Stays "loading" until the browser has left for the payment page
        if (payment.checkoutUrl) window.location.assign(payment.checkoutUrl);
        else setPayingOrder(null);
      },
      onError: (err) => {
        setPayingOrder(null);
        setPayError(apiErrorText(err, tx));
        onFail?.();
      },
    });
  };
  const back = usePaymentReturn(() => {
    qc.invalidateQueries({ queryKey: shopKeys.myOrders });
  });
  // Back from the payment page: the member lands on their orders
  useEffect(() => {
    if (back.returning) setTab("orders");
  }, [back.returning]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!isSignedIn) {
      setLocation(`/sign-in?redirect=${encodeURIComponent("/boutique")}`);
      return;
    }
    if (short.length) {
      setFormError(
        tx({
          fr: "Il n'en reste plus assez en stock pour un article : ajustez sa quantité.",
          en: "One article doesn't have enough left in stock: adjust its quantity.",
          ar: "الكمية المتوفرة من أحد المنتجات غير كافية: عدّل كميته.",
        }),
      );
      return;
    }
    if (!PHONE_RE.test(form.phone.trim())) {
      setFormError(
        tx({
          fr: "Indiquez un numéro de téléphone valide : le club vous appelle pour confirmer.",
          en: "Enter a valid phone number: the club calls you to confirm.",
          ar: "أدخل رقم هاتف صحيحًا: سيتصل بك النادي للتأكيد.",
        }),
      );
      return;
    }
    if (method === "delivery" && !form.address.trim()) {
      setFormError(
        tx({
          fr: "Indiquez l'adresse de livraison.",
          en: "Enter the delivery address.",
          ar: "أدخل عنوان التوصيل.",
        }),
      );
      return;
    }
    place.mutate(
      {
        items: items.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        deliveryMethod: method,
        contactName: form.name.trim() || undefined,
        contactPhone: form.phone.trim(),
        address: method === "delivery" ? form.address.trim() : undefined,
        city: method === "delivery" ? form.city.trim() || undefined : undefined,
        notes: form.notes.trim() || undefined,
        idempotencyKey: checkoutKey.current,
      },
      {
        onSuccess: (order) => {
          cart.clear();
          checkoutKey.current = crypto.randomUUID();
          qc.invalidateQueries({ queryKey: shopKeys.products });
          qc.invalidateQueries({ queryKey: shopKeys.myOrders });
          // The order exists whatever happens next: paying it online is a second step
          if (online && payNow === "online") payOnline(order.id, () => setDone(order));
          else setDone(order);
        },
        onError: (err) => {
          setFormError(apiErrorText(err, tx));
          // The stock moved under the cart: show what is really left
          qc.invalidateQueries({ queryKey: shopKeys.products });
        },
      },
    );
  }

  if (!rules.isLoading && !rules.shopEnabled)
    return (
      <Page>
        <EmptyState
          icon={<StorefrontIcon className="size-7" />}
          title={tx({
            fr: "La boutique n'est pas ouverte",
            en: "The shop is not open",
            ar: "المتجر غير متاح",
          })}
          action={
            <Button asChild>
              <Link href="/terrains">
                {tx({ fr: "Réserver un terrain", en: "Book a court", ar: "احجز ملعبًا" })}
              </Link>
            </Button>
          }
        />
      </Page>
    );

  return (
    <Page wide>
      <PageHeader
        eyebrow={tx({ fr: "Boutique", en: "Shop", ar: "المتجر" })}
        title={tx({
          fr: "Équipez-vous au club.",
          en: "Gear up at the club.",
          ar: "تجهّز من النادي.",
        })}
        subtitle={tx({
          fr: "Commandez en ligne, sans payer maintenant : le club vous appelle pour confirmer, puis vous livre ou garde votre commande à l'accueil.",
          en: "Order online, nothing to pay now: the club calls you to confirm, then delivers your order or keeps it at the front desk.",
          ar: "اطلب عبر الموقع دون دفع الآن: يتصل بك النادي للتأكيد ثم يوصل طلبك أو يحتفظ به في الاستقبال.",
        })}
        actions={
          <Button
            onClick={openCart}
            variant={units ? "default" : "secondary"}
            data-testid="btn-cart"
          >
            <ShoppingCartIcon />
            {tx({ fr: "Panier", en: "Cart", ar: "السلة" })}
            {units > 0 && (
              <span className="pop-in flex h-6 min-w-6 items-center justify-center rounded-full bg-ball px-1.5 text-xs font-extrabold text-night">
                {units}
              </span>
            )}
          </Button>
        }
      />

      <PaymentReturn
        state={back}
        paid={tx({
          fr: `Paiement reçu : votre commande n° ${back.payment?.shopOrderId ?? ""} est payée. Le club vous appelle pour la confirmer.`,
          en: `Payment received: your order #${back.payment?.shopOrderId ?? ""} is paid. The club will call you to confirm it.`,
          ar: `تم استلام الدفع: طلبك رقم ${back.payment?.shopOrderId ?? ""} مدفوع. سيتصل بك النادي لتأكيده.`,
        })}
      />
      {payError && !cartOpen && (
        <p
          role="alert"
          className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
        >
          {payError}
        </p>
      )}

      {isSignedIn && (
        <div className="enter max-w-[420px]">
          <Segmented<"shop" | "orders">
            label={tx({ fr: "Affichage", en: "View", ar: "العرض" })}
            value={tab}
            onChange={setTab}
            options={[
              { value: "shop", label: tx({ fr: "Articles", en: "Articles", ar: "المنتجات" }) },
              {
                value: "orders",
                label: `${tx({ fr: "Mes commandes", en: "My orders", ar: "طلباتي" })}${orders?.length ? ` · ${orders.length}` : ""}`,
              },
            ]}
          />
        </div>
      )}

      {tab === "orders" ? (
        ordersError ? (
          <ErrorState
            text={tx({
              fr: "Vos commandes n'ont pas chargé.",
              en: "Your orders didn't load.",
              ar: "لم يتم تحميل طلباتك.",
            })}
            onRetry={() => refetchOrders()}
          />
        ) : ordersLoading ? (
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-[200px] !rounded-[28px]" />
            ))}
          </div>
        ) : !orders?.length ? (
          <EmptyState
            icon={<PackageIcon className="size-7" />}
            title={tx({ fr: "Aucune commande", en: "No orders yet", ar: "لا طلبات بعد" })}
            action={
              <Button onClick={() => setTab("shop")}>
                {tx({ fr: "Voir les articles", en: "See the articles", ar: "عرض المنتجات" })}
              </Button>
            }
          />
        ) : (
          <ul className="stagger m-0 flex list-none flex-col gap-4 p-0">
            {orders.map((o) => {
              const st = orderStatus(o.status);
              return (
                <li
                  key={o.id}
                  data-testid={`order-${o.id}`}
                  className="flex flex-col gap-4 rounded-[28px] bg-card p-5 shadow-sm sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="disp text-2xl">
                        {tx({
                          fr: `Commande n° ${o.id}`,
                          en: `Order #${o.id}`,
                          ar: `الطلب رقم ${o.id}`,
                        })}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {clubDateTime(o.createdAt, lang)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {o.paidOnlineAt && (
                        <Pill tone="success">
                          <CheckIcon />
                          {tx({
                            fr: "Payée en ligne",
                            en: "Paid online",
                            ar: "مدفوع عبر الإنترنت",
                          })}
                        </Pill>
                      )}
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </span>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[15px]">
                    {o.items.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3">
                        <span>
                          {i.quantity} × {i.productName}
                        </span>
                        <span className="shrink-0 font-semibold" dir="ltr">
                          {money(i.unitPrice * i.quantity)} {o.currency}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF1FA] pt-4">
                    <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      {o.deliveryMethod === "delivery" ? (
                        <>
                          <TruckIcon className="size-4" />
                          {tx({ fr: "Livraison", en: "Delivery", ar: "توصيل" })}
                          {o.address ? ` · ${o.address}` : ""}
                        </>
                      ) : (
                        <>
                          <StorefrontIcon className="size-4" />
                          {tx({
                            fr: "Retrait au club",
                            en: "Pick-up at the club",
                            ar: "استلام من النادي",
                          })}
                        </>
                      )}
                    </span>
                    <span className="disp text-2xl" dir="ltr">
                      {money(o.total)} {o.currency}
                    </span>
                  </div>
                  {o.status === "pending" && (
                    // No cancel button: the club calls every order, and cancels it on request
                    <p className="m-0 flex items-start gap-2 text-sm font-semibold">
                      <PhoneIcon className="mt-0.5 size-4 shrink-0 text-court" />
                      {tx({
                        fr: `Le club vous appelle au ${o.contactPhone} pour confirmer. Vous avez changé d'avis ? Dites-le lors de l'appel : le club annule la commande.`,
                        en: `The club will call ${o.contactPhone} to confirm. Changed your mind? Say so on the call: the club cancels the order.`,
                        ar: `سيتصل بك النادي على ${o.contactPhone} للتأكيد. غيّرت رأيك؟ أخبر النادي عند الاتصال ليلغي الطلب.`,
                      })}
                    </p>
                  )}
                  {online &&
                    !o.paidOnlineAt &&
                    ["pending", "confirmed", "shipped"].includes(o.status) && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">
                          {tx({
                            fr: "À régler en espèces à la réception, ou en ligne dès maintenant.",
                            en: "To pay in cash on reception, or online right now.",
                            ar: "يُدفع نقدًا عند الاستلام أو عبر الإنترنت الآن.",
                          })}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => payOnline(o.id)}
                          disabled={payOrder.isPending}
                          loading={payingOrder === o.id}
                          data-testid={`btn-pay-order-${o.id}`}
                        >
                          <CreditCardIcon />
                          {tx({
                            fr: `Payer ${money(o.total)} ${o.currency} en ligne`,
                            en: `Pay ${money(o.total)} ${o.currency} online`,
                            ar: `ادفع ${money(o.total)} ${o.currency} عبر الإنترنت`,
                          })}
                        </Button>
                      </div>
                    )}
                </li>
              );
            })}
          </ul>
        )
      ) : isError ? (
        <ErrorState
          text={tx({
            fr: "La boutique n'a pas chargé.",
            en: "The shop didn't load.",
            ar: "لم يتم تحميل المتجر.",
          })}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[420px] !rounded-[32px]" />
          ))}
        </div>
      ) : !products?.length ? (
        <EmptyState
          icon={<ShoppingBagIcon className="size-7" />}
          title={tx({
            fr: "La boutique se remplit bientôt",
            en: "The shop is filling up soon",
            ar: "المتجر سيمتلئ قريبًا",
          })}
          text={tx({
            fr: "Revenez dans quelques jours, ou demandez à l'accueil.",
            en: "Come back in a few days, or ask at the front desk.",
            ar: "عد بعد أيام قليلة أو اسأل في الاستقبال.",
          })}
        />
      ) : (
        <>
          {categories.length > 1 && (
            <div
              role="group"
              aria-label={tx({ fr: "Catégorie", en: "Category", ar: "الفئة" })}
              className="enter pill-group"
            >
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  className="pill-tab"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {c === "all" ? tx({ fr: "Tout", en: "All", ar: "الكل" }) : categoryLabel(c)}
                </button>
              ))}
            </div>
          )}
          <div className="stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => {
              const inCart = quantityOf(p.id);
              const soldOut = p.stock <= 0;
              return (
                <article
                  key={p.id}
                  data-testid={`product-${p.id}`}
                  className="lift group flex flex-col overflow-hidden rounded-[32px] bg-card shadow-sm"
                >
                  <div className="relative h-[240px] overflow-hidden">
                    <ProductPhotos
                      product={p}
                      className="transition-transform duration-700 group-hover:scale-105"
                    />
                    <Pill tone="lilac" className="absolute start-4 top-4">
                      {categoryLabel(p.category)}
                    </Pill>
                    {soldOut ? (
                      <Pill tone="danger" className="absolute end-4 top-4">
                        {tx({ fr: "Rupture de stock", en: "Out of stock", ar: "نفد المخزون" })}
                      </Pill>
                    ) : p.stock <= 3 ? (
                      <Pill tone="warning" className="absolute end-4 top-4">
                        {tx({
                          fr: `Plus que ${p.stock}`,
                          en: `Only ${p.stock} left`,
                          ar: `بقي ${p.stock} فقط`,
                        })}
                      </Pill>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-6">
                    <h2 className="disp m-0 text-[26px] leading-tight">{p.name}</h2>
                    {p.description && (
                      <p className="m-0 line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                      <span className="disp text-[30px]" dir="ltr">
                        {money(p.price)}{" "}
                        <span className="text-base font-bold text-muted-foreground">
                          {rules.currency}
                        </span>
                      </span>
                      {inCart > 0 ? (
                        <Stepper
                          value={inCart}
                          max={p.stock}
                          onChange={(v) => cart.set(p.id, v, p.stock)}
                          label={tx({
                            fr: `Quantité de ${p.name}`,
                            en: `Quantity of ${p.name}`,
                            ar: `كمية ${p.name}`,
                          })}
                        />
                      ) : (
                        <Button
                          onClick={() => cart.add(p.id, p.stock)}
                          disabled={soldOut}
                          aria-label={tx({
                            fr: `Ajouter ${p.name} au panier`,
                            en: `Add ${p.name} to the cart`,
                            ar: `أضف ${p.name} إلى السلة`,
                          })}
                        >
                          <PlusIcon />
                          {tx({ fr: "Ajouter", en: "Add", ar: "إضافة" })}
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* Cart and checkout */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-[560px]">
          {done ? (
            <div
              className="flex flex-col items-center gap-4 py-4 text-center"
              data-testid="order-done"
            >
              <span className="pop-in flex size-16 items-center justify-center rounded-full bg-ball text-night">
                <CheckIcon className="size-8" />
              </span>
              <DialogTitle>
                {tx({ fr: "Commande envoyée !", en: "Order sent!", ar: "تم إرسال الطلب!" })}
              </DialogTitle>
              <DialogDescription className="max-w-[400px]">
                {tx({
                  fr: `Commande n° ${done.id} · ${money(done.total)} ${done.currency}. Le club vous appelle au ${done.contactPhone} pour confirmer. Vous réglez en espèces à la réception.`,
                  en: `Order #${done.id} · ${money(done.total)} ${done.currency}. The club will call ${done.contactPhone} to confirm. You pay in cash on reception.`,
                  ar: `الطلب رقم ${done.id} · ${money(done.total)} ${done.currency}. سيتصل بك النادي على ${done.contactPhone} للتأكيد. الدفع نقدًا عند الاستلام.`,
                })}
              </DialogDescription>
              {payError && (
                // The order is placed; only the payment page did not open
                <p
                  role="alert"
                  className="m-0 rounded-2xl bg-[#FFEBD9] px-4 py-3 text-sm font-semibold text-[#7A3A0E]"
                >
                  {tx({
                    fr: "Votre commande est enregistrée, mais la page de paiement ne s'est pas ouverte. Vous pourrez la payer depuis « Mes commandes », ou en espèces à la réception.",
                    en: "Your order is placed, but the payment page did not open. You can pay it from “My orders”, or in cash on reception.",
                    ar: "تم تسجيل طلبك، لكن صفحة الدفع لم تُفتح. يمكنك الدفع من «طلباتي» أو نقدًا عند الاستلام.",
                  })}
                </p>
              )}
              <Button
                onClick={() => {
                  setCartOpen(false);
                  setTab("orders");
                }}
              >
                {tx({ fr: "Voir mes commandes", en: "See my orders", ar: "عرض طلباتي" })}
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader className="text-start">
                <DialogTitle>{tx({ fr: "Votre panier", en: "Your cart", ar: "سلتك" })}</DialogTitle>
                <DialogDescription>
                  {tx({
                    fr: online
                      ? "Payez en ligne maintenant, ou en espèces à la réception."
                      : "Aucun paiement en ligne : vous réglez en espèces à la réception.",
                    en: online
                      ? "Pay online now, or in cash on reception."
                      : "No online payment: you pay in cash on reception.",
                    ar: online
                      ? "ادفع عبر الإنترنت الآن أو نقدًا عند الاستلام."
                      : "لا دفع عبر الإنترنت: تدفع نقدًا عند الاستلام.",
                  })}
                </DialogDescription>
              </DialogHeader>
              {items.length === 0 ? (
                <p className="m-0 rounded-2xl bg-mist px-4 py-8 text-center text-muted-foreground">
                  {tx({
                    fr: "Votre panier est vide.",
                    en: "Your cart is empty.",
                    ar: "سلتك فارغة.",
                  })}
                </p>
              ) : (
                <form className="flex flex-col gap-5" onSubmit={submit}>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {items.map((l) => (
                      <li
                        key={l.productId}
                        className="flex items-center gap-3 rounded-2xl bg-mist/70 p-2.5"
                      >
                        <span className="size-14 shrink-0 overflow-hidden rounded-xl">
                          <ProductImage product={l.product} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-bold">{l.product.name}</span>
                          <span className="text-sm text-muted-foreground" dir="ltr">
                            {money(l.product.price)} {rules.currency}
                          </span>
                          {l.quantity > l.product.stock && (
                            <span
                              data-testid="cart-line-short"
                              className="text-sm font-semibold text-[#B1452A]"
                            >
                              {l.product.stock <= 0
                                ? tx({
                                    fr: "Rupture de stock : retirez-le",
                                    en: "Out of stock: remove it",
                                    ar: "نفد المخزون: احذفه",
                                  })
                                : tx({
                                    fr: `Plus que ${l.product.stock} en stock`,
                                    en: `Only ${l.product.stock} left`,
                                    ar: `بقي ${l.product.stock} فقط`,
                                  })}
                            </span>
                          )}
                        </span>
                        <Stepper
                          value={l.quantity}
                          max={l.product.stock}
                          onChange={(v) => cart.set(l.productId, v, l.product.stock)}
                          label={tx({
                            fr: `Quantité de ${l.product.name}`,
                            en: `Quantity of ${l.product.name}`,
                            ar: `كمية ${l.product.name}`,
                          })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          onClick={() => cart.remove(l.productId)}
                          aria-label={tx({
                            fr: `Retirer ${l.product.name}`,
                            en: `Remove ${l.product.name}`,
                            ar: `إزالة ${l.product.name}`,
                          })}
                        >
                          <TrashIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between rounded-2xl bg-night px-5 py-4 text-white">
                    <span className="label text-muted-d">
                      {tx({ fr: "Total", en: "Total", ar: "المجموع" })}
                    </span>
                    <span className="disp text-3xl" dir="ltr" data-testid="cart-total">
                      {money(total)} {rules.currency}
                    </span>
                  </div>

                  {isSignedIn ? (
                    <>
                      <Field label={tx({ fr: "Réception", en: "Reception", ar: "الاستلام" })}>
                        <Segmented<ShopDeliveryMethod>
                          label={tx({ fr: "Réception", en: "Reception", ar: "الاستلام" })}
                          value={method}
                          onChange={setMethod}
                          options={[
                            {
                              value: "pickup",
                              label: tx({
                                fr: "Retrait au club",
                                en: "Pick-up at the club",
                                ar: "استلام من النادي",
                              }),
                            },
                            {
                              value: "delivery",
                              label: tx({ fr: "Livraison", en: "Delivery", ar: "توصيل" }),
                            },
                          ]}
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label={tx({ fr: "Nom", en: "Name", ar: "الاسم" })}
                          htmlFor="order-name"
                        >
                          <Input
                            id="order-name"
                            autoComplete="name"
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            maxLength={120}
                          />
                        </Field>
                        <Field
                          label={tx({ fr: "Téléphone", en: "Phone", ar: "الهاتف" })}
                          htmlFor="order-phone"
                          required
                          hint={tx({
                            fr: "Le club vous appelle à ce numéro.",
                            en: "The club calls you on this number.",
                            ar: "يتصل بك النادي على هذا الرقم.",
                          })}
                        >
                          <Input
                            id="order-phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            dir="ltr"
                            value={form.phone}
                            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                            placeholder="+216 20 000 000"
                            maxLength={30}
                            required
                          />
                        </Field>
                      </div>
                      {method === "delivery" && (
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                          <Field
                            label={tx({
                              fr: "Adresse de livraison",
                              en: "Delivery address",
                              ar: "عنوان التوصيل",
                            })}
                            htmlFor="order-address"
                            required
                          >
                            <Input
                              id="order-address"
                              autoComplete="street-address"
                              value={form.address}
                              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                              maxLength={300}
                              required
                            />
                          </Field>
                          <Field
                            label={tx({ fr: "Ville", en: "City", ar: "المدينة" })}
                            htmlFor="order-city"
                          >
                            <Input
                              id="order-city"
                              autoComplete="address-level2"
                              value={form.city}
                              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                              maxLength={80}
                            />
                          </Field>
                        </div>
                      )}
                      <Field
                        label={tx({
                          fr: "Remarque (optionnel)",
                          en: "Note (optional)",
                          ar: "ملاحظة (اختياري)",
                        })}
                        htmlFor="order-notes"
                      >
                        <Textarea
                          id="order-notes"
                          rows={2}
                          value={form.notes}
                          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                          maxLength={500}
                          placeholder={tx({
                            fr: "Taille, couleur, meilleur moment pour vous appeler…",
                            en: "Size, colour, best time to call you…",
                            ar: "المقاس، اللون، أفضل وقت للاتصال بك…",
                          })}
                        />
                      </Field>
                      {online && (
                        <Field label={tx({ fr: "Paiement", en: "Payment", ar: "الدفع" })}>
                          <Segmented<"reception" | "online">
                            label={tx({ fr: "Paiement", en: "Payment", ar: "الدفع" })}
                            value={payNow}
                            onChange={setPayNow}
                            options={[
                              {
                                value: "reception",
                                label: tx({
                                  fr: "Espèces à la réception",
                                  en: "Cash on reception",
                                  ar: "نقدًا عند الاستلام",
                                }),
                              },
                              {
                                value: "online",
                                label: tx({
                                  fr: "En ligne maintenant",
                                  en: "Online now",
                                  ar: "عبر الإنترنت الآن",
                                }),
                              },
                            ]}
                          />
                        </Field>
                      )}
                      <p className="m-0 flex items-start gap-2.5 rounded-2xl bg-ball/50 px-4 py-3 text-sm font-semibold text-night">
                        {online && payNow === "online" ? (
                          <CreditCardIcon className="mt-0.5 size-4 shrink-0" />
                        ) : (
                          <MoneyIcon className="mt-0.5 size-4 shrink-0" />
                        )}
                        {online && payNow === "online"
                          ? tx({
                              fr: `Vous payez ${money(total)} ${rules.currency} sur la page sécurisée de paiement, puis le club vous appelle pour confirmer la commande. Si elle est annulée, le club vous rembourse.`,
                              en: `You pay ${money(total)} ${rules.currency} on the secure payment page, then the club calls you to confirm the order. If it is cancelled, the club refunds you.`,
                              ar: `تدفع ${money(total)} ${rules.currency} في صفحة الدفع الآمنة، ثم يتصل بك النادي لتأكيد الطلب. إن أُلغي يعيد النادي المبلغ.`,
                            })
                          : tx({
                              fr: "Rien n'est débité maintenant. Le club vous appelle pour confirmer, et vous payez en espèces à la réception.",
                              en: "Nothing is charged now. The club calls you to confirm, and you pay in cash on reception.",
                              ar: "لا يُخصم شيء الآن. يتصل بك النادي للتأكيد وتدفع نقدًا عند الاستلام.",
                            })}
                      </p>
                    </>
                  ) : (
                    <p className="m-0 rounded-2xl bg-mist px-4 py-3 text-sm font-semibold">
                      {tx({
                        fr: "Connectez-vous pour commander : votre panier vous attend.",
                        en: "Sign in to order: your cart will be waiting.",
                        ar: "سجّل الدخول للطلب: سلتك في انتظارك.",
                      })}
                    </p>
                  )}

                  {formError && (
                    <p
                      role="alert"
                      className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-3 text-sm font-semibold text-[#7A1C20]"
                    >
                      {formError}
                    </p>
                  )}
                  <Button
                    type="submit"
                    size="lg"
                    disabled={place.isPending || payingOrder !== null}
                    loading={place.isPending || payingOrder !== null}
                    data-testid="btn-place-order"
                  >
                    {isSignedIn
                      ? online && payNow === "online"
                        ? tx({
                            fr: `Commander et payer ${money(total)} ${rules.currency}`,
                            en: `Order and pay ${money(total)} ${rules.currency}`,
                            ar: `اطلب وادفع ${money(total)} ${rules.currency}`,
                          })
                        : tx({ fr: "Commander", en: "Place the order", ar: "تأكيد الطلب" })
                      : tx({
                          fr: "Se connecter pour commander",
                          en: "Sign in to order",
                          ar: "سجّل الدخول للطلب",
                        })}
                  </Button>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
