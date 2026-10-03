import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiErrorCode,
  shopKeys,
  useAdminShopOrders,
  useAdminShopProducts,
  useCreateShopProduct,
  useDeleteShopProduct,
  useMarkPaymentRefunded,
  useUpdateShopOrder,
  useUpdateShopProduct,
  type AdminShopOrder,
  type AdminShopProduct,
  type ShopOrderStatus,
  type ShopProductInput,
} from "@workspace/api-client-react";
import {
  CheckIcon,
  ClipboardTextIcon,
  PackageIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusIcon,
  ShoppingBagIcon,
  StorefrontIcon,
  TrashIcon,
  TruckIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/smash/primitives";
import { Field, Pill, Segmented, useConfirm } from "@/components/smash/admin";
import { PhotoInput } from "@/components/smash/photo-input";
import { useToast } from "@/hooks/use-toast";
import { useClubRules } from "@/hooks/use-club-rules";
import { shopMoney, useOrderStatus, useShopCategories } from "@/hooks/use-order-status";
import { useI18n, useTx } from "@/lib/i18n";
import { apiErrorText } from "@/lib/api-errors";
import { plural } from "@/lib/labels";
import { clubDateTime } from "@/lib/club-time";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/services/api";

type Filter = "pending" | "open" | "all";
type Form = {
  name: string;
  description: string;
  category: string;
  price: string;
  stock: string;
  imageUrls: string[];
  isActive: boolean;
};
const blank: Form = {
  name: "",
  description: "",
  category: "racket",
  price: "",
  stock: "1",
  imageUrls: [],
  isActive: true,
};

export default function AdminShop() {
  const tx = useTx();
  const { lang } = useI18n();
  const rules = useClubRules();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const orderStatus = useOrderStatus();
  const categories = useShopCategories();

  const [filter, setFilter] = useState<Filter>("pending");
  const {
    data: orders,
    isLoading: loadingOrders,
    isError: ordersError,
    refetch: refetchOrders,
  } = useAdminShopOrders(filter === "all" ? undefined : filter);
  const {
    data: products,
    isLoading,
    isError: productsError,
    refetch: refetchProducts,
  } = useAdminShopProducts();
  const moveOrder = useUpdateShopOrder();
  const create = useCreateShopProduct(),
    update = useUpdateShopProduct(),
    del = useDeleteShopProduct();
  const [editing, setEditing] = useState<AdminShopProduct | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  /** A photo is on its way to the storage: saving waits for its address. */
  const [photoBusy, setPhotoBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const refreshOrders = () => {
    qc.invalidateQueries({ queryKey: shopKeys.adminOrdersAll });
    qc.invalidateQueries({ queryKey: shopKeys.adminProducts });
  };
  const refreshProducts = () => {
    qc.invalidateQueries({ queryKey: shopKeys.adminProducts });
    qc.invalidateQueries({ queryKey: shopKeys.products });
  };

  const list = orders?.data ?? [];
  /** Orders the list does not show: the API answers the most recent ones only. */
  const older = Math.max(0, (orders?.total ?? 0) - list.length);

  const markRefunded = useMarkPaymentRefunded();
  /** The desk refunded an online payment in the gateway's merchant space, and says so. */
  async function refunded(paymentId: number, amount: number, currency: string) {
    const ok = await confirm({
      title: tx({
        fr: `Avez-vous remboursé ${shopMoney(amount)} ${currency} au membre ?`,
        en: `Did you refund ${shopMoney(amount)} ${currency} to the member?`,
        ar: `هل أرجعت ${shopMoney(amount)} ${currency} للعضو؟`,
      }),
      description: tx({
        fr: "Le site ne rembourse pas tout seul : le remboursement se fait dans l'espace marchand de la passerelle de paiement. Confirmez ici une fois qu'il est fait.",
        en: "The site does not refund by itself: the refund is made in the payment gateway's merchant space. Confirm here once it is done.",
        ar: "الموقع لا يعيد المبلغ تلقائيًا: يتم الإرجاع من فضاء التاجر في بوابة الدفع. أكّد هنا بعد إتمامه.",
      }),
      confirmLabel: tx({
        fr: "Oui, c'est remboursé",
        en: "Yes, it is refunded",
        ar: "نعم، تم الإرجاع",
      }),
    });
    if (!ok) return;
    markRefunded.mutate(paymentId, {
      onSuccess: () => {
        toast({
          title: tx({ fr: "Remboursement noté", en: "Refund recorded", ar: "تم تسجيل الإرجاع" }),
        });
        refreshOrders();
      },
      onError: (err) =>
        toast({
          title: tx({ fr: "Action impossible", en: "Couldn't do that", ar: "تعذر تنفيذ الإجراء" }),
          description: apiErrorText(err, tx),
          variant: "destructive",
        }),
    });
  }

  async function move(order: AdminShopOrder, status: ShopOrderStatus) {
    if (status === "cancelled") {
      const ok = await confirm({
        title: tx({
          fr: `Annuler la commande n° ${order.id} ?`,
          en: `Cancel order #${order.id}?`,
          ar: `إلغاء الطلب رقم ${order.id}؟`,
        }),
        description: order.paidOnlineAt
          ? tx({
              fr: `Les articles retournent en stock et le membre est prévenu. Cette commande est payée en ligne : vous devrez lui rembourser ${shopMoney(order.total)} ${order.currency}.`,
              en: `The articles go back in stock and the member is told. This order is paid online: you will have to refund ${shopMoney(order.total)} ${order.currency}.`,
              ar: `تعود المنتجات إلى المخزون ويُبلَّغ العضو. هذا الطلب مدفوع عبر الإنترنت: عليك إرجاع ${shopMoney(order.total)} ${order.currency}.`,
            })
          : tx({
              fr: "Les articles retournent en stock et le membre est prévenu.",
              en: "The articles go back in stock and the member is told.",
              ar: "تعود المنتجات إلى المخزون ويُبلَّغ العضو.",
            }),
        confirmLabel: tx({ fr: "Annuler la commande", en: "Cancel the order", ar: "إلغاء الطلب" }),
        destructive: true,
      });
      if (!ok) return;
    }
    moveOrder.mutate(
      { id: order.id, status },
      {
        onSuccess: () => {
          toast({
            title: tx({
              fr: `Commande n° ${order.id} : ${orderStatus(status).label.toLowerCase()}`,
              en: `Order #${order.id}: ${orderStatus(status).label.toLowerCase()}`,
              ar: `الطلب رقم ${order.id}: ${orderStatus(status).label}`,
            }),
          });
          refreshOrders();
        },
        onError: (err) =>
          toast({
            title: tx({
              fr: "Action impossible",
              en: "Couldn't do that",
              ar: "تعذر تنفيذ الإجراء",
            }),
            description: apiErrorText(err, tx),
            variant: "destructive",
          }),
      },
    );
  }

  const openNew = () => {
    setForm(blank);
    setEditing("new");
  };
  const openEdit = (p: AdminShopProduct) => {
    setForm({
      name: p.name,
      description: p.description ?? "",
      category: p.category,
      price: String(p.price),
      stock: String(p.stock),
      imageUrls: p.imageUrls ?? [],
      isActive: p.isActive,
    });
    setEditing(p);
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    const stock = Math.max(0, parseInt(form.stock) || 0);
    const data: ShopProductInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      price: Number(form.price),
      imageUrls: form.imageUrls,
      isActive: form.isActive,
    };
    const done = (m: string) => () => {
      toast({ title: m });
      setEditing(null);
      refreshProducts();
    };
    const fail = (err: unknown) => {
      toast({
        title: tx({ fr: "Enregistrement impossible", en: "Couldn't save", ar: "تعذر الحفظ" }),
        description: apiErrorText(err, tx),
        variant: "destructive",
      });
      // Orders took stock while the form was open: show the real figure, keep the form
      const current = (err as { data?: { details?: { stock?: unknown } } })?.data?.details?.stock;
      if (
        apiErrorCode(err) === "STOCK_CHANGED" &&
        typeof current === "number" &&
        editing !== "new"
      ) {
        setEditing((e) => (e && e !== "new" ? { ...e, stock: current } : e));
        set("stock", String(current));
        refreshProducts();
      }
    };
    if (editing && editing !== "new")
      update.mutate(
        {
          id: editing.id,
          // The stock is only sent when changed, with the figure it was changed from:
          // an order placed meanwhile is never undone
          data: stock !== editing.stock ? { ...data, stock, stockWas: editing.stock } : data,
        },
        {
          onSuccess: done(
            tx({ fr: "Article mis à jour", en: "Article updated", ar: "تم التحديث" }),
          ),
          onError: fail,
        },
      );
    else
      create.mutate(
        { ...data, stock },
        {
          onSuccess: done(tx({ fr: "Article ajouté", en: "Article added", ar: "تمت الإضافة" })),
          onError: fail,
        },
      );
  }

  async function remove(p: AdminShopProduct) {
    if (
      !(await confirm({
        title: tx({ fr: `Retirer ${p.name} ?`, en: `Remove ${p.name}?`, ar: `إزالة ${p.name}؟` }),
        description: tx({
          fr: "S'il a déjà été commandé, il est retiré de la vente et gardé pour l'historique.",
          en: "If it was ever ordered, it is taken off sale and kept for the history.",
          ar: "إذا طُلب سابقًا، يُسحب من البيع ويُحفظ في السجل.",
        }),
        confirmLabel: tx({ fr: "Retirer", en: "Remove", ar: "إزالة" }),
        destructive: true,
      }))
    )
      return;
    del.mutate(p.id, {
      onSuccess: (r) => {
        toast({
          title: r?.archived
            ? tx({
                fr: "Article retiré de la vente",
                en: "Article taken off sale",
                ar: "سُحب من البيع",
              })
            : tx({ fr: "Article supprimé", en: "Article deleted", ar: "تم الحذف" }),
        });
        refreshProducts();
      },
      onError: (err) =>
        toast({
          title: tx({ fr: "Suppression impossible", en: "Couldn't remove", ar: "تعذر الحذف" }),
          description: apiErrorText(err, tx),
          variant: "destructive",
        }),
    });
  }

  return (
    <Page wide>
      <PageHeader
        eyebrow="Admin"
        title={tx({ fr: "Boutique", en: "Shop", ar: "المتجر" })}
        subtitle={tx({
          fr: "Les commandes à confirmer par téléphone, et les articles en vente.",
          en: "Orders to confirm by phone, and the articles on sale.",
          ar: "الطلبات التي تُؤكَّد هاتفيًا، والمنتجات المعروضة للبيع.",
        })}
        actions={
          <Button onClick={openNew} data-testid="btn-create-product">
            <PlusIcon />
            {tx({ fr: "Ajouter un article", en: "Add an article", ar: "إضافة منتج" })}
          </Button>
        }
      />

      {/* Orders */}
      <section className="enter flex flex-col gap-4 rounded-[28px] bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="disp m-0 flex items-center gap-2 text-2xl">
            <ClipboardTextIcon className="size-6 text-court" />
            {tx({ fr: "Commandes", en: "Orders", ar: "الطلبات" })}
            {(orders?.pending ?? 0) > 0 && (
              <span data-testid="pending-orders">
                <Pill tone="warning">
                  {tx({
                    fr: `${orders!.pending} à appeler`,
                    en: `${orders!.pending} to call`,
                    ar: `${orders!.pending} للاتصال`,
                  })}
                </Pill>
              </span>
            )}
          </h2>
          <div className="w-full sm:w-auto sm:min-w-[360px]">
            <Segmented<Filter>
              label={tx({ fr: "Filtre", en: "Filter", ar: "تصفية" })}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "pending", label: tx({ fr: "À appeler", en: "To call", ar: "للاتصال" }) },
                {
                  value: "open",
                  label: tx({ fr: "En cours", en: "In progress", ar: "قيد التنفيذ" }),
                },
                { value: "all", label: tx({ fr: "Toutes", en: "All", ar: "الكل" }) },
              ]}
            />
          </div>
        </div>
        {ordersError ? (
          <ErrorState
            text={tx({
              fr: "Les commandes n'ont pas chargé.",
              en: "The orders didn't load.",
              ar: "لم يتم تحميل الطلبات.",
            })}
            onRetry={() => refetchOrders()}
          />
        ) : loadingOrders ? (
          <Skeleton className="h-28" />
        ) : list.length === 0 ? (
          <p className="m-0 rounded-2xl bg-mist px-4 py-8 text-center text-muted-foreground">
            {filter === "pending"
              ? tx({
                  fr: "Aucune commande en attente d'appel.",
                  en: "No order is waiting for a call.",
                  ar: "لا طلبات بانتظار الاتصال.",
                })
              : tx({ fr: "Aucune commande.", en: "No orders.", ar: "لا طلبات." })}
          </p>
        ) : (
          <ul className="stagger m-0 flex list-none flex-col gap-3 p-0">
            {list.map((o) => {
              const st = orderStatus(o.status);
              return (
                <li
                  key={o.id}
                  data-testid={`admin-order-${o.id}`}
                  className="flex flex-col gap-4 rounded-[22px] border border-[#E4E8F7] p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="disp text-2xl leading-none">
                          {tx({ fr: `n° ${o.id}`, en: `#${o.id}`, ar: `رقم ${o.id}` })}
                        </span>
                        <Pill tone={st.tone}>{st.label}</Pill>
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
                      </span>
                      <span className="text-[17px] font-extrabold">{o.contactName}</span>
                      <span className="text-xs text-muted-foreground">
                        {clubDateTime(o.createdAt, lang)}
                        {o.member && o.member.name !== o.contactName ? ` · ${o.member.name}` : ""}
                      </span>
                    </span>
                    <Button asChild variant={o.status === "pending" ? "default" : "secondary"}>
                      <a href={`tel:${o.contactPhone.replace(/[^\d+]/g, "")}`}>
                        <PhoneIcon />
                        <span dir="ltr">{o.contactPhone}</span>
                      </a>
                    </Button>
                  </div>

                  <ul className="m-0 flex list-none flex-col gap-1.5 rounded-2xl bg-mist/70 p-3 text-[15px]">
                    {o.items.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3">
                        <span className="flex items-center gap-2 font-bold">
                          <PackageIcon className="size-4 text-court" />
                          {i.quantity} × {i.productName}
                        </span>
                        <span className="shrink-0" dir="ltr">
                          {shopMoney(i.unitPrice * i.quantity)} {o.currency}
                        </span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 border-t border-[#DCE2F8] pt-2 font-extrabold">
                      <span>
                        {o.paidOnlineAt
                          ? tx({
                              fr: "Déjà payée en ligne : rien à encaisser",
                              en: "Already paid online: nothing to collect",
                              ar: "مدفوع عبر الإنترنت: لا شيء للتحصيل",
                            })
                          : tx({
                              fr: "Total à encaisser",
                              en: "Total to collect",
                              ar: "المجموع للتحصيل",
                            })}
                      </span>
                      <span dir="ltr">
                        {shopMoney(o.total)} {o.currency}
                      </span>
                    </li>
                  </ul>

                  {/* Paid online then cancelled: the money is owed back to the member */}
                  {(o.payments ?? [])
                    .filter((p) => p.status === "refund_due" || p.status === "refunded")
                    .map((p) => (
                      <div
                        key={p.id}
                        data-testid={`refund-${p.id}`}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold",
                          p.status === "refund_due"
                            ? "bg-[#FDE4E4] text-[#7A1C20]"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        <span>
                          {p.status === "refund_due"
                            ? tx({
                                fr: `${shopMoney(p.amount)} ${o.currency} payés en ligne à rembourser au membre (depuis l'espace marchand de la passerelle de paiement).`,
                                en: `${shopMoney(p.amount)} ${o.currency} paid online to refund to the member (from the payment gateway's merchant space).`,
                                ar: `${shopMoney(p.amount)} ${o.currency} مدفوعة عبر الإنترنت يجب إرجاعها للعضو.`,
                              })
                            : tx({
                                fr: `${shopMoney(p.amount)} ${o.currency} remboursés au membre.`,
                                en: `${shopMoney(p.amount)} ${o.currency} refunded to the member.`,
                                ar: `تم إرجاع ${shopMoney(p.amount)} ${o.currency} للعضو.`,
                              })}
                        </span>
                        {p.status === "refund_due" && (
                          <Button
                            size="sm"
                            variant="dark"
                            onClick={() => refunded(p.id, p.amount, o.currency)}
                            disabled={markRefunded.isPending}
                          >
                            <CheckIcon />
                            {tx({
                              fr: "Remboursement effectué",
                              en: "Refund done",
                              ar: "تم الإرجاع",
                            })}
                          </Button>
                        )}
                      </div>
                    ))}

                  <div className="flex flex-col gap-1 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      {o.deliveryMethod === "delivery" ? (
                        <>
                          <TruckIcon className="size-4 text-court" />
                          {tx({ fr: "Livraison", en: "Delivery", ar: "توصيل" })} ·{" "}
                          {[o.address, o.city].filter(Boolean).join(", ")}
                        </>
                      ) : (
                        <>
                          <StorefrontIcon className="size-4 text-court" />
                          {tx({
                            fr: "Retrait au club",
                            en: "Pick-up at the club",
                            ar: "استلام من النادي",
                          })}
                        </>
                      )}
                    </span>
                    {o.notes && <span className="text-muted-foreground">« {o.notes} »</span>}
                  </div>

                  {!["delivered", "cancelled"].includes(o.status) && (
                    <div className="flex flex-wrap gap-2">
                      {o.status === "pending" && (
                        <Button
                          onClick={() => move(o, "confirmed")}
                          disabled={moveOrder.isPending}
                          data-testid={`confirm-order-${o.id}`}
                        >
                          <CheckIcon />
                          {tx({
                            fr: "Confirmée par téléphone",
                            en: "Confirmed by phone",
                            ar: "تم التأكيد هاتفيًا",
                          })}
                        </Button>
                      )}
                      {o.status === "confirmed" && o.deliveryMethod === "delivery" && (
                        <Button onClick={() => move(o, "shipped")} disabled={moveOrder.isPending}>
                          <TruckIcon />
                          {tx({ fr: "Envoyée", en: "Sent", ar: "تم الإرسال" })}
                        </Button>
                      )}
                      {(o.status === "shipped" ||
                        (o.status === "confirmed" && o.deliveryMethod === "pickup")) && (
                        <Button onClick={() => move(o, "delivered")} disabled={moveOrder.isPending}>
                          <CheckIcon />
                          {o.paidOnlineAt
                            ? tx({ fr: "Remise", en: "Handed over", ar: "سُلّم" })
                            : tx({
                                fr: "Remise et payée",
                                en: "Handed over and paid",
                                ar: "سُلّم ودُفع",
                              })}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => move(o, "cancelled")}
                        disabled={moveOrder.isPending}
                      >
                        <XIcon />
                        {tx({ fr: "Annuler", en: "Cancel", ar: "إلغاء" })}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {older > 0 && (
          <p className="m-0 text-center text-sm text-muted-foreground">
            {tx({
              fr: `Les ${list.length} commandes les plus récentes. ${older} plus ${plural(older, "ancienne", "anciennes")} non ${plural(older, "affichée", "affichées")}.`,
              en: `The ${list.length} most recent orders. ${older} older not shown.`,
              ar: `أحدث ${list.length} طلبًا. ${older} أقدم غير معروضة.`,
            })}
          </p>
        )}
      </section>

      {/* Catalogue */}
      <h2 className="disp m-0 text-2xl">
        {tx({ fr: "Articles en vente", en: "Articles on sale", ar: "المنتجات المعروضة" })}
      </h2>
      {productsError ? (
        <ErrorState
          text={tx({
            fr: "Les articles n'ont pas chargé.",
            en: "The articles didn't load.",
            ar: "لم يتم تحميل المنتجات.",
          })}
          onRetry={() => refetchProducts()}
        />
      ) : isLoading ? (
        <Skeleton className="h-[140px] !rounded-[26px]" />
      ) : !products?.length ? (
        <EmptyState
          icon={<ShoppingBagIcon className="size-7" />}
          title={tx({
            fr: "Aucun article en vente",
            en: "Nothing on sale yet",
            ar: "لا منتجات للبيع",
          })}
          text={tx({
            fr: "Ajoutez vos raquettes, balles, sacs et tenues : les membres les commandent depuis le site.",
            en: "Add your rackets, balls, bags and clothing: members order them from the site.",
            ar: "أضف المضارب والكرات والحقائب والملابس ليطلبها الأعضاء من الموقع.",
          })}
          action={
            <Button onClick={openNew}>
              <PlusIcon />
              {tx({ fr: "Ajouter un article", en: "Add an article", ar: "إضافة منتج" })}
            </Button>
          }
        />
      ) : (
        <ul className="stagger m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <li
              key={p.id}
              className={cn(
                "lift enter flex min-w-0 items-center gap-3 rounded-[24px] bg-card p-4 shadow-sm",
                !p.isActive && "opacity-55",
              )}
            >
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-mist text-court">
                {p.imageUrls[0] ? (
                  <img
                    src={mediaSrc(p.imageUrls[0])}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <ShoppingBagIcon className="size-7" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[17px] font-extrabold">{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {shopMoney(p.price)} {rules.currency} · {categories.label(p.category)}
                </span>
                <span className="flex flex-wrap gap-1.5 pt-1">
                  <Pill tone={p.stock === 0 ? "danger" : p.stock <= 3 ? "warning" : "muted"}>
                    {tx({
                      fr: `stock ${p.stock}`,
                      en: `stock ${p.stock}`,
                      ar: `المخزون ${p.stock}`,
                    })}
                  </Pill>
                  {p.imageUrls.length > 1 && (
                    <Pill tone="muted">
                      {tx({
                        fr: `${p.imageUrls.length} photos`,
                        en: `${p.imageUrls.length} photos`,
                        ar: `${p.imageUrls.length} صور`,
                      })}
                    </Pill>
                  )}
                  {!p.isActive && (
                    <Pill tone="muted">
                      {tx({ fr: "hors vente", en: "off sale", ar: "خارج البيع" })}
                    </Pill>
                  )}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => openEdit(p)}
                aria-label={tx({
                  fr: `Modifier ${p.name}`,
                  en: `Edit ${p.name}`,
                  ar: `تعديل ${p.name}`,
                })}
              >
                <PencilSimpleIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive"
                onClick={() => remove(p)}
                aria-label={tx({
                  fr: `Retirer ${p.name}`,
                  en: `Remove ${p.name}`,
                  ar: `إزالة ${p.name}`,
                })}
              >
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-[540px]">
          <DialogHeader className="text-start">
            <DialogTitle>
              {editing === "new"
                ? tx({ fr: "Nouvel article", en: "New article", ar: "منتج جديد" })
                : tx({ fr: "Modifier l'article", en: "Edit the article", ar: "تعديل المنتج" })}
            </DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={save}>
            <Field label={tx({ fr: "Nom", en: "Name", ar: "الاسم" })} htmlFor="sp-name" required>
              <Input
                id="sp-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Raquette Carbone Pro"
                maxLength={120}
                required
              />
            </Field>
            <Field
              label={tx({ fr: "Catégorie", en: "Category", ar: "الفئة" })}
              htmlFor="sp-category"
            >
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger id="sp-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.all.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={tx({
                  fr: `Prix (${rules.currency})`,
                  en: `Price (${rules.currency})`,
                  ar: `السعر (${rules.currency})`,
                })}
                htmlFor="sp-price"
                required
              >
                <Input
                  id="sp-price"
                  type="number"
                  min={0.01}
                  step="0.01"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                  required
                />
              </Field>
              <Field
                label={tx({ fr: "En stock", en: "In stock", ar: "المخزون" })}
                htmlFor="sp-stock"
                hint={tx({
                  fr: "Diminue à chaque commande.",
                  en: "Goes down with each order.",
                  ar: "ينقص مع كل طلب.",
                })}
              >
                <Input
                  id="sp-stock"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.stock}
                  onChange={(e) => set("stock", e.target.value)}
                />
              </Field>
            </div>
            <Field label={tx({ fr: "Photos", en: "Photos", ar: "الصور" })} htmlFor="sp-image">
              <PhotoInput
                id="sp-image"
                testId="product-photos"
                max={6}
                value={form.imageUrls}
                onChange={(v) => set("imageUrls", v)}
                onBusyChange={setPhotoBusy}
              />
            </Field>
            <Field
              label={tx({ fr: "Description", en: "Description", ar: "الوصف" })}
              htmlFor="sp-desc"
            >
              <Textarea
                id="sp-desc"
                rows={3}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={2000}
              />
            </Field>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[20px] bg-secondary p-4 font-bold">
              {tx({
                fr: "En vente sur le site",
                en: "On sale on the site",
                ar: "معروض للبيع في الموقع",
              })}
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </label>
            <Button
              type="submit"
              size="lg"
              disabled={create.isPending || update.isPending || photoBusy}
              loading={create.isPending || update.isPending}
            >
              {tx({ fr: "Enregistrer", en: "Save", ar: "حفظ" })}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </Page>
  );
}
