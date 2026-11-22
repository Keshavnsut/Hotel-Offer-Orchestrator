import { config } from "../config";
import type { SupplierHotel, SupplierId } from "../types";

const supplierAHotels: SupplierHotel[] = [
  { hotelId: "a-del-01", name: "Holtin", price: 6000, city: "delhi", commissionPct: 10 },
  { hotelId: "a-del-02", name: "Radison", price: 5900, city: "delhi", commissionPct: 13 },
  { hotelId: "a-del-03", name: "The Imperial", price: 11500, city: "delhi", commissionPct: 9 },
  { hotelId: "a-del-04", name: "Taj Palace", price: 9100, city: "delhi", commissionPct: 12 },
  { hotelId: "a-mum-01", name: "Holtin", price: 7200, city: "mumbai", commissionPct: 11 },
  { hotelId: "a-mum-02", name: "Trident Nariman Point", price: 7800, city: "mumbai", commissionPct: 15 },
  { hotelId: "a-jai-01", name: "Rambagh Palace", price: 14500, city: "jaipur", commissionPct: 12 },
];

const supplierBHotels: SupplierHotel[] = [
  { hotelId: "b-del-01", name: "Holtin", price: 5340, city: "delhi", commissionPct: 20 },
  { hotelId: "b-del-02", name: "Radison", price: 6200, city: "delhi", commissionPct: 15 },
  { hotelId: "b-del-03", name: "The Imperial", price: 11300, city: "delhi", commissionPct: 10 },
  { hotelId: "b-del-04", name: "Leela Palace", price: 9800, city: "delhi", commissionPct: 14 },
  { hotelId: "b-mum-01", name: "Holtin", price: 6900, city: "mumbai", commissionPct: 18 },
  { hotelId: "b-mum-02", name: "Trident Nariman Point", price: 8050, city: "mumbai", commissionPct: 10 },
  { hotelId: "b-jai-01", name: "Rambagh Palace", price: 13900, city: "jaipur", commissionPct: 15 },
];

export function isSupplierEnabled(supplier: SupplierId): boolean {
  return supplier === "A" ? config.supplierAEnabled : config.supplierBEnabled;
}

export function getSupplierHotels(supplier: SupplierId, city: string): SupplierHotel[] {
  const catalog = supplier === "A" ? supplierAHotels : supplierBHotels;
  const normalizedCity = city.trim().toLowerCase();
  return catalog.filter((hotel) => hotel.city.toLowerCase() === normalizedCity);
}
