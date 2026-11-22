export type SupplierId = "A" | "B";

export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface HotelOffer extends SupplierHotel {
  supplier: "Supplier A" | "Supplier B";
}

export interface CompareHotelsInput {
  city: string;
  minPrice: number | null;
  maxPrice: number | null;
  refresh?: boolean;
}

export interface StoredOfferRequest extends CompareHotelsInput {
  requestId: string;
  hotels: HotelOffer[];
  cacheable: boolean;
}
