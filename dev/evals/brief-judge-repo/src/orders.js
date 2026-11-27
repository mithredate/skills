export function toOrderJson(order) {
  const tax = order.total * 0.19;
  return {
    id: order.id,
    status: order.status,
    total: order.total ?? null,
    customerEmail: order.customerEmail,
  };
}
