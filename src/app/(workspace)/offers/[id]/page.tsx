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
    acceptSellingOffer,
    submitSellingOffer,
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
          href="/offers/purchasing"
          className="mt-4 inline-block rounded-lg bg-neutral-950 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
        >
          &larr; Back to Offers Catalog
        </Link>
      </div>
    );
  }

  // Strict privacy: Offers Users cannot view other traders' Selling Offers
  if (identity.role === "offers_user" && offer.kind === "selling") {
    const isOwner =
      (identity.id && offer.createdBy === identity.id) ||
      Boolean(identity.email && offer.emailAddress && offer.emailAddress.toLowerCase() === identity.email.toLowerCase()) ||
      Boolean(identity.name && offer.createdByName === identity.name);
    if (!isOwner) {
      return (
        <div className="mx-auto max-w-lg rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700 text-xl font-bold">
            ✕
          </div>
          <h2 className="mt-3 text-base font-bold text-neutral-900">Access Restricted</h2>
          <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
            You do not have permission to view other users&apos; selling proposals. Offers Users can only view published purchasing offers and track their own submitted proposals.
          </p>
          <Link
            href="/offers/purchasing"
            className="mt-4 inline-block rounded-lg bg-neutral-950 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800"
          >
            &larr; Back to Offers Portal
          </Link>
        </div>
      );
    }
  }

  return (
    <OfferDetailsView
      offer={offer}
      role={identity.role}
      onSubmitSellingOffer={async (draft) => {
        return submitSellingOffer(draft);
      }}
      onToggleFavourite={async (offerId) => {
        return toggleOfferFavourite(offerId);
      }}
      onSubmitForReview={async (offerId) => {
        return submitOffer(offerId);
      }}
      onDecide={async (decision, note) => {
        return decideOffer({ id: offer.id, decision, note });
      }}
      onAcceptOffer={async (num) => {
        return acceptSellingOffer(num);
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

