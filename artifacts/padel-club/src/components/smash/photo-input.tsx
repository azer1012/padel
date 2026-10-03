import { useEffect, useRef, useState } from "react";
import { uploadPhoto } from "@workspace/api-client-react";
import {
  ImageBrokenIcon,
  LinkSimpleIcon,
  SpinnerIcon,
  StarIcon,
  UploadSimpleIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemo } from "@/components/smash/demo";
import { apiErrorText } from "@/lib/api-errors";
import { useTx } from "@/lib/i18n";
import { preparePhoto, UnreadablePhotoError } from "@/lib/photo";
import { mediaSrc } from "@/services/api";

/** Same rule as the API: an https link, or a file of the site itself. */
const LINK = /^(https:\/\/\S+|\/(?!\/)\S*)$/;

function Thumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return broken ? (
    <ImageBrokenIcon className="size-5 text-muted-foreground" />
  ) : (
    <img
      src={mediaSrc(url)}
      alt=""
      onError={() => setBroken(true)}
      className="size-full object-cover"
    />
  );
}

/**
 * Photos of a court, an article of the news, a tournament or a boutique article. The
 * desk picks a file (from the computer, or the phone's gallery or camera): it is made
 * lighter in the browser, sent to the club's storage, and its address is what the form
 * saves. A link can still be pasted instead. `max` 1 = one photo, replaced by the next.
 */
export function PhotoInput({
  id,
  value,
  onChange,
  max = 1,
  onBusyChange,
  testId = "photo",
}: {
  /** Of the file input: what the field's label points to. */
  id: string;
  /** Addresses of the photos, the first one being the cover. */
  value: string[];
  onChange: (photos: string[]) => void;
  max?: number;
  /** True while a photo is being sent: the form waits before saving. */
  onBusyChange?: (busy: boolean) => void;
  testId?: string;
}) {
  const tx = useTx();
  const demo = useDemo();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const single = max === 1;
  const full = !single && value.length >= max;

  const tellBusy = useRef(onBusyChange);
  tellBusy.current = onBusyChange;
  const working = (b: boolean) => {
    setBusy(b);
    tellBusy.current?.(b);
  };
  // A form closed while a photo is on its way is not left waiting
  useEffect(() => () => tellBusy.current?.(false), []);

  async function add(picked: File[]) {
    setError(null);
    const room = single ? 1 : max - value.length;
    if (room <= 0) {
      setError(
        tx({
          fr: `${max} photos au maximum : retirez-en une pour en ajouter une autre.`,
          en: `${max} photos at most: remove one to add another.`,
          ar: `${max} صور كحد أقصى: احذف واحدة لإضافة أخرى.`,
        }),
      );
      return;
    }
    const files = picked.slice(0, room);
    let photos = single ? [] : [...value];
    working(true);
    try {
      for (const file of files) {
        const sent = await uploadPhoto(await preparePhoto(file));
        photos = [...photos, sent.url];
        onChange(photos);
      }
      if (picked.length > files.length)
        setError(
          tx({
            fr: `${max} photos au maximum : les suivantes n'ont pas été ajoutées.`,
            en: `${max} photos at most: the others were not added.`,
            ar: `${max} صور كحد أقصى: لم تُضف البقية.`,
          }),
        );
    } catch (err) {
      setError(
        err instanceof UnreadablePhotoError
          ? tx({
              fr: "Ce fichier n'est pas une photo lisible. Choisissez une image JPEG, PNG ou WebP.",
              en: "This file is not a readable photo. Pick a JPEG, PNG or WebP image.",
              ar: "هذا الملف ليس صورة مقروءة. اختر صورة JPEG أو PNG أو WebP.",
            })
          : apiErrorText(err, tx),
      );
    } finally {
      working(false);
    }
  }

  function addLink() {
    const url = link.trim();
    if (!LINK.test(url)) {
      setError(
        tx({
          fr: "Le lien doit commencer par https://",
          en: "The link must start with https://",
          ar: "يجب أن يبدأ الرابط بـ https://",
        }),
      );
      return;
    }
    setError(null);
    if (single) onChange([url]);
    else if (full) {
      setError(
        tx({
          fr: `${max} photos au maximum.`,
          en: `${max} photos at most.`,
          ar: `${max} صور كحد أقصى.`,
        }),
      );
      return;
    } else if (!value.includes(url)) onChange([...value, url]);
    setLink("");
    setLinkOpen(false);
  }

  const remove = (i: number) => onChange(value.filter((_, at) => at !== i));
  const makeFirst = (i: number) => onChange([value[i], ...value.filter((_, at) => at !== i)]);

  return (
    <div className="flex flex-col gap-2.5" data-testid={testId}>
      <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
        {value.map((url, i) => (
          <li
            key={url}
            data-testid={`${testId}-item-${i}`}
            className="relative flex size-[88px] items-center justify-center overflow-hidden rounded-2xl bg-mist"
          >
            <Thumb url={url} />
            {!single && i === 0 && value.length > 1 && (
              <span className="absolute inset-x-0 bottom-0 bg-night/75 py-0.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-white">
                {tx({ fr: "Principale", en: "Cover", ar: "الرئيسية" })}
              </span>
            )}
            {!single && i > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => makeFirst(i)}
                aria-label={tx({
                  fr: `Mettre la photo ${i + 1} en premier`,
                  en: `Make photo ${i + 1} the cover`,
                  ar: `اجعل الصورة ${i + 1} الرئيسية`,
                })}
                className="absolute bottom-1 start-1 flex size-7 items-center justify-center rounded-full bg-white/95 text-night shadow-sm transition-transform hover:scale-110 disabled:opacity-50"
              >
                <StarIcon className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(i)}
              aria-label={
                single
                  ? tx({ fr: "Retirer la photo", en: "Remove the photo", ar: "إزالة الصورة" })
                  : tx({
                      fr: `Retirer la photo ${i + 1}`,
                      en: `Remove photo ${i + 1}`,
                      ar: `إزالة الصورة ${i + 1}`,
                    })
              }
              className="absolute end-1 top-1 flex size-7 items-center justify-center rounded-full bg-white/95 text-destructive shadow-sm transition-transform hover:scale-110 disabled:opacity-50"
            >
              <XIcon className="size-3.5" />
            </button>
          </li>
        ))}
        {!demo && !full && (
          <li>
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => input.current?.click()}
              data-testid={`${testId}-add`}
              className="flex h-[88px] min-w-[132px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#CBD3EE] bg-card px-4 text-sm font-bold text-court transition-colors hover:border-court hover:bg-mist disabled:opacity-70"
            >
              {busy ? (
                <SpinnerIcon className="spin size-5" />
              ) : (
                <UploadSimpleIcon className="size-5" />
              )}
              {busy
                ? tx({ fr: "Envoi…", en: "Sending…", ar: "جارٍ الإرسال…" })
                : single && value.length
                  ? tx({ fr: "Changer la photo", en: "Change the photo", ar: "تغيير الصورة" })
                  : tx({ fr: "Choisir une photo", en: "Choose a photo", ar: "اختر صورة" })}
            </button>
          </li>
        )}
      </ul>
      {!demo && (
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/*"
          multiple={!single}
          hidden
          data-testid={`${testId}-file`}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            // The same file can be picked again after an error
            e.target.value = "";
            if (files.length) void add(files);
          }}
        />
      )}
      {linkOpen || demo ? (
        <div className="flex items-center gap-2">
          <Input
            id={demo ? id : undefined}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Never the form around it: Enter adds the link
              e.preventDefault();
              addLink();
            }}
            placeholder="https://…"
            dir="ltr"
            maxLength={500}
            aria-label={tx({ fr: "Lien de la photo", en: "Link of the photo", ar: "رابط الصورة" })}
            data-testid={`${testId}-link`}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addLink}
            data-testid={`${testId}-link-add`}
          >
            {single && value.length
              ? tx({ fr: "Remplacer", en: "Replace", ar: "استبدال" })
              : tx({ fr: "Ajouter", en: "Add", ar: "إضافة" })}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLinkOpen(true)}
          data-testid={`${testId}-link-toggle`}
          className="inline-flex min-h-6 items-center gap-1.5 self-start text-[13px] font-bold text-court hover:underline"
        >
          <LinkSimpleIcon className="size-3.5" />
          {tx({
            fr: "Ou coller le lien d'une photo",
            en: "Or paste the link of a photo",
            ar: "أو الصق رابط صورة",
          })}
        </button>
      )}
      <p className="m-0 text-xs text-muted-foreground">
        {demo
          ? tx({
              fr: "Dans la démo, l'envoi de fichiers est désactivé : collez un lien.",
              en: "File upload is switched off in the demo: paste a link.",
              ar: "رفع الملفات معطّل في النسخة التجريبية: الصق رابطًا.",
            })
          : single
            ? tx({
                fr: "Depuis l'ordinateur ou le téléphone. La photo est allégée automatiquement.",
                en: "From the computer or the phone. The photo is made lighter automatically.",
                ar: "من الحاسوب أو الهاتف. تُخفَّف الصورة تلقائيًا.",
              })
            : tx({
                fr: `Jusqu'à ${max} photos, allégées automatiquement. La première est celle de la fiche.`,
                en: `Up to ${max} photos, made lighter automatically. The first one is the article's cover.`,
                ar: `حتى ${max} صور تُخفَّف تلقائيًا. الأولى هي صورة المنتج الرئيسية.`,
              })}
      </p>
      {error && (
        <p
          role="alert"
          data-testid={`${testId}-error`}
          className="m-0 rounded-2xl bg-[#FDE4E4] px-4 py-2.5 text-sm font-semibold text-[#7A1C20]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
