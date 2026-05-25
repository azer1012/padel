import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "fr" | "ar" | "en";

const translations = {
  fr: {
    home: "Accueil",
    courts: "Terrains",
    tournaments: "Tournois",
    news: "Actualités",
    contact: "Contact",
    signIn: "Se connecter",
    signOut: "Se déconnecter",
    joinNow: "S'inscrire",
    dashboard: "Tableau de bord",
    reservations: "Réservations",
    wallet: "Portefeuille",
    profile: "Profil",
    admin: "Administration",
    bookCourt: "Réserver un terrain",
    exploreTerrains: "Explorer les terrains",
    availableSlots: "Créneaux disponibles",
    selectDate: "Choisir une date",
    bookNow: "Réserver",
    cancel: "Annuler",
    booked: "Réservé",
    available: "Disponible",
    past: "Passé",
    confirmBooking: "Confirmer la réservation",
    tokensRequired: "jeton(s) requis",
    insufficientTokens: "Jetons insuffisants",
    bookingSuccess: "Réservation confirmée",
    bookingError: "Erreur de réservation",
    myReservations: "Mes réservations",
    upcomingBookings: "Prochaines réservations",
    pastBookings: "Réservations passées",
    noUpcoming: "Aucune réservation à venir.",
    noPast: "Aucune réservation passée.",
    myWallet: "Mon portefeuille",
    tokenBalance: "Solde de jetons",
    transactionHistory: "Historique des transactions",
    noTransactions: "Aucune transaction.",
    language: "Langue",
  },
  ar: {
    home: "الرئيسية",
    courts: "الملاعب",
    tournaments: "البطولات",
    news: "الأخبار",
    contact: "اتصل بنا",
    signIn: "تسجيل الدخول",
    signOut: "تسجيل الخروج",
    joinNow: "انضم الآن",
    dashboard: "لوحة التحكم",
    reservations: "الحجوزات",
    wallet: "المحفظة",
    profile: "الملف الشخصي",
    admin: "الإدارة",
    bookCourt: "حجز ملعب",
    exploreTerrains: "استكشاف الملاعب",
    availableSlots: "المواعيد المتاحة",
    selectDate: "اختر تاريخاً",
    bookNow: "احجز الآن",
    cancel: "إلغاء",
    booked: "محجوز",
    available: "متاح",
    past: "منتهي",
    confirmBooking: "تأكيد الحجز",
    tokensRequired: "رمز(رموز) مطلوبة",
    insufficientTokens: "رصيد الرموز غير كافٍ",
    bookingSuccess: "تم تأكيد الحجز",
    bookingError: "خطأ في الحجز",
    myReservations: "حجوزاتي",
    upcomingBookings: "الحجوزات القادمة",
    pastBookings: "الحجوزات السابقة",
    noUpcoming: "لا توجد حجوزات قادمة.",
    noPast: "لا توجد حجوزات سابقة.",
    myWallet: "محفظتي",
    tokenBalance: "رصيد الرموز",
    transactionHistory: "سجل المعاملات",
    noTransactions: "لا توجد معاملات.",
    language: "اللغة",
  },
  en: {
    home: "Home",
    courts: "Courts",
    tournaments: "Tournaments",
    news: "News",
    contact: "Contact",
    signIn: "Sign In",
    signOut: "Sign Out",
    joinNow: "Join Now",
    dashboard: "Dashboard",
    reservations: "Reservations",
    wallet: "Wallet",
    profile: "Profile",
    admin: "Admin",
    bookCourt: "Book a Court",
    exploreTerrains: "Explore Terrains",
    availableSlots: "Available Slots",
    selectDate: "Select Date",
    bookNow: "Book Now",
    cancel: "Cancel",
    booked: "Booked",
    available: "Available",
    past: "Past",
    confirmBooking: "Confirm Booking",
    tokensRequired: "token(s) required",
    insufficientTokens: "Insufficient tokens",
    bookingSuccess: "Booking Confirmed",
    bookingError: "Booking Error",
    myReservations: "My Reservations",
    upcomingBookings: "Upcoming Bookings",
    pastBookings: "Past Bookings",
    noUpcoming: "No upcoming reservations.",
    noPast: "No past reservations.",
    myWallet: "My Wallet",
    tokenBalance: "Token Balance",
    transactionHistory: "Transaction History",
    noTransactions: "No transactions found.",
    language: "Language",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType>({
  lang: "fr",
  setLang: () => {},
  t: (key) => translations.en[key],
  isRTL: false,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem("padel-lang") as Lang) ?? "fr";
  });

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("padel-lang", newLang);
  };

  const isRTL = lang === "ar";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
  }, [lang, isRTL]);

  const t = (key: TranslationKey): string => translations[lang][key];

  return (
    <I18nContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
