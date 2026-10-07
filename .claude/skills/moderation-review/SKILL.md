---
name: moderation-review
description: Work the FlowerMarket.lk moderation queues — pending products and pending shop verifications — approving, blocking with reasons, or escalating. Use for "review pending products", "moderation queue", or "verify shops".
---

# Moderation review

Dispatch the `marketplace-moderator` agent when the queue is large (more than ~10 items);
otherwise work it directly with the same checks (see `.claude/agents/marketplace-moderator.md`).

1. `list_products_for_moderation` moderation=pending — review each (open image URLs if the
   description is unclear).
2. Present a table: product, shop, price (Rs), verdict (approve / block / unsure), reason.
3. With the operator's OK: `approve_products` for the approvals in one call; `moderate_product`
   status=blocked with a specific note for each block. Leave "unsure" pending.
4. `list_shops` status=pending — same pattern with `review_shop` (verified / rejected + notes).

Report the counts and every block/reject reason so the operator can follow up with sellers.
