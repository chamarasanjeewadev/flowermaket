import { DISTRICTS, ORDER_UNITS } from "../constants";
import type { ValidationError } from "./shops";

export interface OrderItemInput {
  categoryId?: string | null;
  descriptionEn: string;
  descriptionSi?: string | null;
  variant?: string | null;
  quantity: number;
  unit: string;
  notes?: string | null;
}

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerLocale?: "en" | "si";
  deliveryAddress?: string | null;
  deliveryDistrict?: string | null;
  deliveryCity?: string | null;
  neededByDate?: string | null;
  notesInternal?: string | null;
  notesCustomer?: string | null;
  items?: OrderItemInput[];
}

export function validateOrderItemInput(item: OrderItemInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!item.descriptionEn?.trim()) errors.push({ field: "descriptionEn", message: "Description is required" });
  if (!Number.isInteger(item.quantity) || item.quantity <= 0)
    errors.push({ field: "quantity", message: "Quantity must be a positive whole number" });
  if (!ORDER_UNITS.includes(item.unit as (typeof ORDER_UNITS)[number]))
    errors.push({ field: "unit", message: "Unknown unit" });
  return errors;
}

export function validateCreateOrderInput(input: CreateOrderInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!input.customerName?.trim()) errors.push({ field: "customerName", message: "Customer name is required" });
  const digits = (input.customerPhone ?? "").replace(/\D/g, "");
  if (digits.length < 9) errors.push({ field: "customerPhone", message: "A valid phone number is required" });
  if (input.deliveryDistrict && !DISTRICTS.some((d) => d.slug === input.deliveryDistrict))
    errors.push({ field: "deliveryDistrict", message: "Unknown district" });
  (input.items ?? []).forEach((it, i) => {
    for (const e of validateOrderItemInput(it)) errors.push({ field: `items.${i}.${e.field}`, message: e.message });
  });
  return errors;
}
