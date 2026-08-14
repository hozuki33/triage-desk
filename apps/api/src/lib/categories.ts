export const CATEGORIES = [
  "refund_issue",
  "delivery_delay",
  "product_quality",
  "account_security",
  "billing_payment",
  "feature_request",
  "other",
] as const;

export type TicketCategory = (typeof CATEGORIES)[number];

export const categoryLabel: Record<TicketCategory, string> = {
  refund_issue: "退款问题",
  delivery_delay: "物流延迟",
  product_quality: "产品质量",
  account_security: "账号安全",
  billing_payment: "计费支付",
  feature_request: "功能需求",
  other: "其他",
};
