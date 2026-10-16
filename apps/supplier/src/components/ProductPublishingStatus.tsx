import { Badge } from "@flowers/ui/components/badge";
import { useT } from "../i18n/react";
export function ProductPublishingStatus({ product, shopVerified }: { product: { status: string; moderationStatus: string; stockQty: number | null; moderationNote?: string | null }; shopVerified: boolean }) {
  const { locale } = useT(); const si = locale === "si";
  const state = product.status !== "active" ? { label: si ? "කෙටුම්පත" : "Draft", reason: si ? "සමාලෝචනයට ඉදිරිපත් කිරීමට නිෂ්පාදනය විවෘත කරන්න." : "Open this product to submit it for review." }
    : product.moderationStatus === "blocked" ? { label: si ? "වෙනස්කම් අවශ්‍යයි" : "Changes requested", reason: product.moderationNote ?? (si ? "FlowerMarket සමඟ අවශ්‍ය වෙනස්කම් තහවුරු කරන්න." : "Contact FlowerMarket to confirm the changes needed.") }
    : product.moderationStatus === "pending" ? { label: si ? "සමාලෝචනය බලාපොරොත්තුවෙන්" : "Awaiting review", reason: si ? "FlowerMarket නිෂ්පාදනය අනුමත කළ යුතුයි." : "FlowerMarket must approve this listing before it goes live." }
    : !shopVerified ? { label: si ? "සාප්පු අනුමැතිය අවශ්‍යයි" : "Awaiting shop approval", reason: si ? "මගේ සාප්පුවේ සැකසුම් සම්පූර්ණ කරන්න." : "Complete your store setup in My Store and submit it for approval." }
    : product.stockQty === 0 ? { label: si ? "දැනට නොමැත" : "Unavailable", reason: si ? "තොගය හෝ ඇණවුමට සකස් කිරීමේ සැකසුම යාවත්කාලීන කරන්න." : "Update availability when this product can be supplied again." }
    : { label: si ? "සජීවී" : "Live", reason: si ? "අනුමත සහ ප්‍රකාශිතයි." : "Approved and published." };
  return <div className="space-y-1"><Badge variant={state.label === "Live" || state.label === "සජීවී" ? "success" : "secondary"}>{state.label}</Badge><p className="max-w-xs text-xs text-muted-foreground">{state.reason}</p></div>;
}
