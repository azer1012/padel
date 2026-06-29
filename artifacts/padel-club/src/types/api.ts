export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface User {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: "admin" | "player";
  avatarUrl?: string;
  tokenBalance: number;
  language: "fr" | "ar" | "en";
  createdAt: string;
  updatedAt?: string;
}

export interface Terrain {
  id: number;
  name: string;
  description?: string;
  type: "indoor" | "outdoor";
  isActive: boolean;
  pricePerPerson: number;
  capacity: number;
  openingTime: string;
  closingTime: string;
  photos: string[];
  createdAt: string;
}

export interface Reservation {
  id: number;
  terrainId: number;
  userId?: number;
  guestName?: string;
  guestPhone?: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "pending";
  tokensCharged: number;
  bookingType: "online" | "phone" | "manual";
  bookingMode: "full_court" | "own_spot";
  totalSpots: number;
  isPublic: boolean;
  publicDescription?: string;
  notes?: string;
  createdAt: string;
}

export interface ReservationPlayer {
  id: number;
  reservationId: number;
  userId: number;
  paymentType: "token" | "cash";
  paymentStatus: "paid" | "pending" | "refunded";
  tokensCharged: number;
  notes?: string;
  joinedAt: string;
}

export interface TokenTransaction {
  id: number;
  userId: number;
  adminId?: number;
  reservationId?: number;
  type: "credit" | "debit" | "adjustment";
  amount: number;
  balanceAfter: number;
  description: string;
  notes?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  type:
    | "booking_confirmed"
    | "booking_cancelled"
    | "tokens_added"
    | "reservation_reminder"
    | "announcement";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface Tournament {
  id: number;
  name: string;
  description?: string;
  status: "upcoming" | "open" | "ongoing" | "completed" | "cancelled";
  startDate: string;
  endDate?: string;
  maxTeams?: number;
  registeredTeams: number;
  prizeInfo?: string;
  imageUrl?: string;
  createdAt: string;
}
