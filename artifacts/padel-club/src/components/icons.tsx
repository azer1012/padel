/**
 * The club icon set (Phosphor). Import icons from here, never from the package:
 * one place sets the defaults (bold weight to match the heavy display type,
 * decorative by default for screen readers) and the list of icons in use.
 *
 * Weights carry meaning: `bold` everywhere, `fill` for the active nav item,
 * `duotone` for large feature tiles and empty states.
 */
import { createContext, forwardRef, useContext, type ReactNode } from "react";
import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";
import {
  ArchiveIcon as ArchiveBase,
  ArrowCounterClockwiseIcon as ArrowCounterClockwiseBase,
  ArrowDownIcon as ArrowDownBase,
  ArrowDownLeftIcon as ArrowDownLeftBase,
  ArrowRightIcon as ArrowRightBase,
  ArrowsClockwiseIcon as ArrowsClockwiseBase,
  ArrowsLeftRightIcon as ArrowsLeftRightBase,
  ArrowUpIcon as ArrowUpBase,
  ArrowUpRightIcon as ArrowUpRightBase,
  ArrowUUpLeftIcon as ArrowUUpLeftBase,
  BellIcon as BellBase,
  BoxArrowUpIcon as BoxArrowUpBase,
  CashRegisterIcon as CashRegisterBase,
  CreditCardIcon as CreditCardBase,
  LockOpenIcon as LockOpenBase,
  CalendarBlankIcon as CalendarBlankBase,
  CalendarCheckIcon as CalendarCheckBase,
  CalendarDotsIcon as CalendarDotsBase,
  CalendarPlusIcon as CalendarPlusBase,
  CalendarXIcon as CalendarXBase,
  CaretDownIcon as CaretDownBase,
  CaretLeftIcon as CaretLeftBase,
  CaretRightIcon as CaretRightBase,
  CaretUpIcon as CaretUpBase,
  CheckCircleIcon as CheckCircleBase,
  CheckIcon as CheckBase,
  CircleNotchIcon as CircleNotchBase,
  ClipboardTextIcon as ClipboardTextBase,
  ClockCountdownIcon as ClockCountdownBase,
  ClockIcon as ClockBase,
  CoinsIcon as CoinsBase,
  ConfettiIcon as ConfettiBase,
  CopyIcon as CopyBase,
  CourtBasketballIcon as CourtBasketballBase,
  DeviceMobileIcon as DeviceMobileBase,
  DownloadSimpleIcon as DownloadSimpleBase,
  EnvelopeOpenIcon as EnvelopeOpenBase,
  EnvelopeSimpleIcon as EnvelopeSimpleBase,
  ExportIcon as ExportBase,
  EyeIcon as EyeBase,
  EyeSlashIcon as EyeSlashBase,
  FacebookLogoIcon as FacebookLogoBase,
  FloppyDiskIcon as FloppyDiskBase,
  GearSixIcon as GearSixBase,
  GiftIcon as GiftBase,
  GlobeIcon as GlobeBase,
  GridFourIcon as GridFourBase,
  HandHeartIcon as HandHeartBase,
  HandTapIcon as HandTapBase,
  ImageBrokenIcon as ImageBrokenBase,
  LinkSimpleIcon as LinkSimpleBase,
  StarIcon as StarBase,
  UploadSimpleIcon as UploadSimpleBase,
  InfoIcon as InfoBase,
  InstagramLogoIcon as InstagramLogoBase,
  KeyIcon as KeyBase,
  LightningIcon as LightningBase,
  ListBulletsIcon as ListBulletsBase,
  ListIcon as ListBase,
  LockSimpleIcon as LockSimpleBase,
  MagnifyingGlassIcon as MagnifyingGlassBase,
  MapPinIcon as MapPinBase,
  MinusIcon as MinusBase,
  MoneyIcon as MoneyBase,
  NavigationArrowIcon as NavigationArrowBase,
  NewspaperIcon as NewspaperBase,
  PackageIcon as PackageBase,
  PaperPlaneTiltIcon as PaperPlaneTiltBase,
  PencilSimpleIcon as PencilSimpleBase,
  PhoneIcon as PhoneBase,
  PlusIcon as PlusBase,
  PlusSquareIcon as PlusSquareBase,
  ProhibitIcon as ProhibitBase,
  PulseIcon as PulseBase,
  QrCodeIcon as QrCodeBase,
  RepeatIcon as RepeatBase,
  ShareNetworkIcon as ShareNetworkBase,
  ShieldCheckIcon as ShieldCheckBase,
  ShoppingBagIcon as ShoppingBagBase,
  ShoppingCartSimpleIcon as ShoppingCartSimpleBase,
  ShieldSlashIcon as ShieldSlashBase,
  ShieldWarningIcon as ShieldWarningBase,
  SignOutIcon as SignOutBase,
  SquaresFourIcon as SquaresFourBase,
  StorefrontIcon as StorefrontBase,
  SunIcon as SunBase,
  TagIcon as TagBase,
  TennisBallIcon as TennisBallBase,
  TimerIcon as TimerBase,
  ToggleRightIcon as ToggleRightBase,
  TrashIcon as TrashBase,
  TruckIcon as TruckBase,
  TrophyIcon as TrophyBase,
  UserCircleIcon as UserCircleBase,
  UserIcon as UserBase,
  UserPlusIcon as UserPlusBase,
  UsersThreeIcon as UsersThreeBase,
  WalletIcon as WalletBase,
  WarehouseIcon as WarehouseBase,
  WarningCircleIcon as WarningCircleBase,
  WarningIcon as WarningBase,
  WhatsappLogoIcon as WhatsappLogoBase,
  WrenchIcon as WrenchBase,
  XIcon as XBase,
} from "@phosphor-icons/react";

export type { IconProps, IconWeight };
export type AppIcon = Icon;

const WeightContext = createContext<IconWeight>("bold");

/** Sets the default weight for every icon below it (e.g. duotone inside an empty state). */
export function IconWeightProvider({
  weight,
  children,
}: {
  weight: IconWeight;
  children: ReactNode;
}) {
  return <WeightContext.Provider value={weight}>{children}</WeightContext.Provider>;
}

function icon(Base: Icon): Icon {
  const Wrapped = forwardRef<SVGSVGElement, IconProps>(function AppIcon(props, ref) {
    const weight = useContext(WeightContext);
    // 24px when no size class is given (CSS width/height override it).
    return <Base ref={ref} size={24} weight={weight} aria-hidden="true" {...props} />;
  });
  Wrapped.displayName = Base.displayName;
  return Wrapped as Icon;
}

export const ArchiveIcon = icon(ArchiveBase);
export const ArrowCounterClockwiseIcon = icon(ArrowCounterClockwiseBase);
export const ArrowDownIcon = icon(ArrowDownBase);
export const ArrowDownLeftIcon = icon(ArrowDownLeftBase);
export const ArrowRightIcon = icon(ArrowRightBase);
export const ArrowsClockwiseIcon = icon(ArrowsClockwiseBase);
export const ArrowsLeftRightIcon = icon(ArrowsLeftRightBase);
export const ArrowUpIcon = icon(ArrowUpBase);
export const ArrowUpRightIcon = icon(ArrowUpRightBase);
export const ArrowUUpLeftIcon = icon(ArrowUUpLeftBase);
export const BellIcon = icon(BellBase);
export const BoxArrowUpIcon = icon(BoxArrowUpBase);
export const CashRegisterIcon = icon(CashRegisterBase);
export const CreditCardIcon = icon(CreditCardBase);
export const LockOpenIcon = icon(LockOpenBase);
export const CalendarBlankIcon = icon(CalendarBlankBase);
export const CalendarCheckIcon = icon(CalendarCheckBase);
export const CalendarDotsIcon = icon(CalendarDotsBase);
export const CalendarPlusIcon = icon(CalendarPlusBase);
export const CalendarXIcon = icon(CalendarXBase);
export const CaretDownIcon = icon(CaretDownBase);
export const CaretLeftIcon = icon(CaretLeftBase);
export const CaretRightIcon = icon(CaretRightBase);
export const CaretUpIcon = icon(CaretUpBase);
export const CheckCircleIcon = icon(CheckCircleBase);
export const CheckIcon = icon(CheckBase);
export const ClipboardTextIcon = icon(ClipboardTextBase);
export const ClockCountdownIcon = icon(ClockCountdownBase);
export const ClockIcon = icon(ClockBase);
export const CoinsIcon = icon(CoinsBase);
export const ConfettiIcon = icon(ConfettiBase);
export const CopyIcon = icon(CopyBase);
export const CourtIcon = icon(CourtBasketballBase);
export const DeviceMobileIcon = icon(DeviceMobileBase);
export const DownloadSimpleIcon = icon(DownloadSimpleBase);
export const EnvelopeOpenIcon = icon(EnvelopeOpenBase);
export const EnvelopeSimpleIcon = icon(EnvelopeSimpleBase);
export const ExportIcon = icon(ExportBase);
export const EyeIcon = icon(EyeBase);
export const EyeSlashIcon = icon(EyeSlashBase);
export const FacebookLogoIcon = icon(FacebookLogoBase);
export const FloppyDiskIcon = icon(FloppyDiskBase);
export const GearSixIcon = icon(GearSixBase);
export const GiftIcon = icon(GiftBase);
export const GlobeIcon = icon(GlobeBase);
export const GridFourIcon = icon(GridFourBase);
export const HandHeartIcon = icon(HandHeartBase);
export const HandTapIcon = icon(HandTapBase);
export const ImageBrokenIcon = icon(ImageBrokenBase);
export const LinkSimpleIcon = icon(LinkSimpleBase);
export const StarIcon = icon(StarBase);
export const UploadSimpleIcon = icon(UploadSimpleBase);
export const InfoIcon = icon(InfoBase);
export const InstagramLogoIcon = icon(InstagramLogoBase);
export const KeyIcon = icon(KeyBase);
export const LightningIcon = icon(LightningBase);
export const ListBulletsIcon = icon(ListBulletsBase);
export const LockSimpleIcon = icon(LockSimpleBase);
export const MagnifyingGlassIcon = icon(MagnifyingGlassBase);
export const MapPinIcon = icon(MapPinBase);
export const MenuIcon = icon(ListBase);
export const MinusIcon = icon(MinusBase);
export const MoneyIcon = icon(MoneyBase);
export const NavigationArrowIcon = icon(NavigationArrowBase);
export const NewspaperIcon = icon(NewspaperBase);
export const PackageIcon = icon(PackageBase);
export const PaperPlaneTiltIcon = icon(PaperPlaneTiltBase);
export const PencilSimpleIcon = icon(PencilSimpleBase);
export const PhoneIcon = icon(PhoneBase);
export const PlusIcon = icon(PlusBase);
export const PlusSquareIcon = icon(PlusSquareBase);
export const ProhibitIcon = icon(ProhibitBase);
export const PulseIcon = icon(PulseBase);
export const QrCodeIcon = icon(QrCodeBase);
export const RepeatIcon = icon(RepeatBase);
export const ShareNetworkIcon = icon(ShareNetworkBase);
export const ShieldCheckIcon = icon(ShieldCheckBase);
export const ShoppingBagIcon = icon(ShoppingBagBase);
export const ShoppingCartIcon = icon(ShoppingCartSimpleBase);
export const StorefrontIcon = icon(StorefrontBase);
export const TruckIcon = icon(TruckBase);
export const ShieldSlashIcon = icon(ShieldSlashBase);
export const ShieldWarningIcon = icon(ShieldWarningBase);
export const SignOutIcon = icon(SignOutBase);
export const SquaresFourIcon = icon(SquaresFourBase);
export const SpinnerIcon = icon(CircleNotchBase);
export const SunIcon = icon(SunBase);
export const TagIcon = icon(TagBase);
export const TennisBallIcon = icon(TennisBallBase);
export const TimerIcon = icon(TimerBase);
export const ToggleRightIcon = icon(ToggleRightBase);
export const TrashIcon = icon(TrashBase);
export const TrophyIcon = icon(TrophyBase);
export const UserCircleIcon = icon(UserCircleBase);
export const UserIcon = icon(UserBase);
export const UserPlusIcon = icon(UserPlusBase);
export const UsersIcon = icon(UsersThreeBase);
export const WalletIcon = icon(WalletBase);
export const WarehouseIcon = icon(WarehouseBase);
export const WarningCircleIcon = icon(WarningCircleBase);
export const WarningIcon = icon(WarningBase);
export const WhatsappLogoIcon = icon(WhatsappLogoBase);
export const WrenchIcon = icon(WrenchBase);
export const XIcon = icon(XBase);
