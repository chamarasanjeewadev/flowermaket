export type ListingStatus = "unclaimed" | "invited" | "claimed" | "opted_out" | "blocked";

/** A florist listing near a customer, with the facts needed to rank/notify it. */
export interface MatchCandidate {
  listingId: string;
  shopId: string | null;
  lat: number;
  lng: number;
  googleRating: number | null;
  status: ListingStatus;
  phone: string | null;
  /** Shop is active, a florist, and has consented + verified a notification phone. */
  shopEligible: boolean;
}
