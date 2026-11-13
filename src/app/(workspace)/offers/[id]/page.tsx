"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useDemo } from "@/components/providers/workspace-provider";
import { useSession } from "@/components/shell/auth-gate";
import { OfferDetailsView } from "@/components/offers/offer-details-view";

export default function OfferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const {
    state,
    ready,
    toggleOfferFavourite,
    submitOffer,
    decideOffer,
    updateOfferStatus,
    editOffer,
    deleteOffer,
    addOfferComment,
    addOfferAttachment,
    deleteOfferAttachment,
  } = useDemo();
  const { identity } = useSession();

  const offer = (state.offers || []).find((o) => o.id === id || o.number === id);

  if (!ready) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center text-xs text-neutral-500">
        Loading offer details...
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-xs">
        <h2 className="text-base font-bold text-neutral-900">Offer Not Found</h2>
        <p className="mt-2 text-xs text-neutral-500">
          The requested offer does not exist or may have been deleted.
        </p>
        <Link
          href="/offers"
          className="mt-4 inline-block rounded-lg bg-neutral-950 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
        >
          &larr; Back to Offers Dashboard
        </Link>
      </div>
    );
  }

  return (
    <OfferDetailsView
      offer={offer}
      role={identity.role}
      onToggleFavourite={async (offerId) => {
        return toggleOfferFavourite(offerId);
      }}
      onSubmitForReview={async (offerId) => {
        return submitOffer(offerId);
      }}
      onDecide={async (decision, note) => {
        return decideOffer({ id: offer.id, decision, note });
      }}
      onUpdateStatus={async (status) => {
        return updateOfferStatus({ id: offer.id, status });
      }}
      onEditOffer={async (draft) => {
        return editOffer({ ...draft, id: offer.id });
      }}
      onDeleteOffer={async (offerId) => {
        const err = await deleteOffer(offerId);
        if (!err) {
          router.push(offer.kind === "purchasing" ? "/offers/purchasing" : "/offers/selling");
        }
        return err;
      }}
      onAddComment={async (comment) => {
        return addOfferComment({ id: offer.id, comment });
      }}
      onAddAttachment={async (att) => {
        return addOfferAttachment({ id: offer.id, ...att });
      }}
      onDeleteAttachment={async (attachmentId) => {
        return deleteOfferAttachment({ id: offer.id, attachmentId });
      }}
    />
  );
}

