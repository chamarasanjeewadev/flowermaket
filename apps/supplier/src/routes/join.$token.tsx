import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@flowers/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@flowers/ui/components/card";
import { Flower, PartyPopper } from "lucide-react";
import type { SellerType } from "@flowers/api/constants";
import { getInvite } from "../server/auth";

export const Route = createFileRoute("/join/$token")({
  loader: async ({ params }) => {
    const invite = await getInvite({ data: { token: params.token } });
    return { invite, token: params.token };
  },
  component: JoinPage,
});

const BENEFITS: Record<SellerType, string[]> = {
  farmer: [
    "Reach buyers across Sri Lanka directly",
    "Better prices — fewer middlemen",
    "Free listing to get started",
  ],
  florist: [
    "Your own online storefront",
    "More orders, online",
    "Showcase your bouquets and products",
  ],
  supplier: [
    "Reach shops, event planners and florists in bulk",
    "Receive sourcing requests (RFQs) and quote fast",
    "Free listing to get started",
  ],
};

const TYPE_LABEL: Record<SellerType, string> = {
  florist: "florist",
  supplier: "supplier",
  farmer: "farmer",
};

function JoinPage() {
  const { invite, token } = Route.useLoaderData();

  if (!invite.valid) {
    const message =
      invite.reason === "used"
        ? "This invite has already been used."
        : invite.reason === "expired"
          ? "This invite link has expired."
          : "This invite link is not valid.";
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Invite unavailable</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="brand" className="w-full">
              <Link to="/register">Create an account anyway</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const types = invite.sellerTypes ?? [];
  const benefits = BENEFITS[types[0] ?? "farmer"];
  const typeLabel = types.length
    ? types.map((x) => TYPE_LABEL[x]).join(" & ")
    : "seller";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand/10">
            <PartyPopper className="size-6 text-brand" />
          </div>
          <CardTitle className="font-display text-2xl sm:text-3xl">
            {invite.nameEn ? `Welcome, ${invite.nameEn}!` : "You're invited!"}
          </CardTitle>
          <CardDescription>
            Join FlowerMarket.lk as a {typeLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ul className="space-y-2 text-sm">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Flower className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <Button asChild variant="brand" className="w-full">
            <Link to="/register" search={{ invite: token }}>
              Create your account
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
