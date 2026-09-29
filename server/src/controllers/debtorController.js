import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";
import { enqueuePaymentReceiptJob } from "../services/whatsappAutomationService.js";

const customerPayload = (body) => ({
  name: String(body.name || "").trim(),
  phone: String(body.phone || "").trim() || null,
  email: String(body.email || "").trim() || null,
  address: String(body.address || "").trim() || null,
  currency: body.currency === "USD" ? "USD" : "AFN",
  notes: String(body.notes || "").trim() || null,
  photo: body.photo !== undefined ? String(body.photo || "") || null : undefined,
  debt_status: body.debt_status === "bad" ? "bad" : body.debt_status === "active" ? "active" : undefined,
  bad_debt_at: body.bad_debt_at || undefined,
});

export const listDebtors = asyncHandler(async (request, response) => {
  const search = String(request.query.search || "").trim();
  const limit = Math.min(500, Math.max(1, Number(request.query.limit || 100)));
  let query = supabaseAdmin.from("customers").select("*").eq("is_active", true).order("current_balance", { ascending: false }).limit(limit);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw new ApiError(400, error.message);

  const rows = data || [];

  // Add each debtor's received amount with one batched query so the UI can show
  // received and remaining values together without making one request per debtor.
  let normalizedRows = rows;
  if (rows.length) {
    const customerIds = rows.map((row) => row.id).filter(Boolean);
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from("payments")
      .select("customer_id,amount")
      .in("customer_id", customerIds);

    if (!paymentsError) {
      const paidByCustomer = (payments || []).reduce((map, payment) => {
        const id = payment.customer_id;
        map.set(id, (map.get(id) || 0) + Number(payment.amount || 0));
        return map;
      }, new Map());

      normalizedRows = rows.map((row) => ({
        ...row,
        total_paid: paidByCustomer.get(row.id) || 0,
      }));
    }
  }

  const summary = normalizedRows.reduce((acc, row) => {
    acc[row.currency === "USD" ? "USD" : "AFN"] += Number(row.current_balance || 0);
    acc.total += 1;
    if (Number(row.current_balance || 0) > 0 && row.last_payment_date && Date.now() - new Date(row.last_payment_date).getTime() > 14 * 86400000) acc.overdue += 1;
    return acc;
  }, { AFN: 0, USD: 0, total: 0, overdue: 0 });

  return sendData(response, normalizedRows, "Debtors loaded", 200, { summary });
});

export const createDebtor = asyncHandler(async (request, response) => {
  const payload = customerPayload(request.body);
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  if (!payload.name) throw new ApiError(400, "Customer name ضروري دی.");
  const { data, error } = await supabaseAdmin.from("customers").insert({ ...payload, created_by: request.auth.user.id }).select().single();
  if (error) throw new ApiError(400, error.message);
  await supabaseAdmin.from("notifications").insert({ type: "debtor", title: "New Debtor", message: `${data.name} اضافه شو.`, entity_id: data.id });
  return sendData(response, data, "Debtor created", 201);
});

export const updateDebtor = asyncHandler(async (request, response) => {
  const payload = customerPayload(request.body);
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  if (!payload.name) delete payload.name;
  const { data, error } = await supabaseAdmin.from("customers").update(payload).eq("id", request.params.id).select().single();
  if (error || !data) throw new ApiError(400, error?.message || "Debtor update failed");
  return sendData(response, data, "Debtor updated");
});

export const deleteDebtor = asyncHandler(async (request, response) => {
  const { data: customer, error: findError } = await supabaseAdmin.from("customers").select("current_balance").eq("id", request.params.id).single();
  if (findError || !customer) throw new ApiError(404, "Debtor پیدا نه شو.");
  if (Number(customer.current_balance || 0) > 0) throw new ApiError(400, "د پور تر تصفیې مخکې قرضدار نه شي حذف کېدای.");
  const { data, error } = await supabaseAdmin.from("customers").update({ is_active: false }).eq("id", request.params.id).select("id").single();
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Debtor deleted");
});

export const getDebtor = asyncHandler(async (request, response) => {
  const id = request.params.id;
  const [{ data: customer, error }, { data: invoices }, { data: payments }, { data: balances }] = await Promise.all([
    supabaseAdmin.from("customers").select("*").eq("id", id).single(),
    supabaseAdmin.from("sales_invoices").select("*").eq("customer_id", id).order("invoice_date", { ascending: false }),
    supabaseAdmin.from("payments").select("*, sales_invoices(invoice_number)").eq("customer_id", id).order("payment_date", { ascending: false }),
    supabaseAdmin.from("debtor_balance_records").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
  ]);
  if (error || !customer) throw new ApiError(404, "Debtor پیدا نه شو.");
  const normalizedPayments = (payments || []).map((item) => ({ ...item, invoice_number: item.sales_invoices?.invoice_number || null }));
  const summary = {
    totalDebt: (invoices || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
    totalPaid: (payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0),
  };
  const normalizedBalances = (balances || []).map((item) => ({ ...item, date: item.record_date, note: item.note || "" }));
  return sendData(response, { customer, invoices: invoices || [], payments: normalizedPayments, balances: normalizedBalances, summary });
});

export const recordPayment = asyncHandler(async (request, response) => {
  const amount = Number(request.body.amount || 0);
  if (amount <= 0) throw new ApiError(400, "Payment amount ناسم دی.");

  const paymentDate =
    request.body.payment_date ||
    request.body.date ||
    new Date().toISOString().slice(0, 10);
  const method = request.body.method === "hawala" || request.body.method === "bank"
    ? "hawala"
    : "cash";

  const rpcPayload = {
    customer_id: request.params.id,
    amount,
    method,
    payment_date: paymentDate,
    amount_words: request.body.amount_words || null,
    payment_date_shamsi: request.body.payment_date_shamsi || null,
    hawala_number: request.body.hawala_number || null,
    market: request.body.market || null,
    shop_address: request.body.shop_address || null,
    notes: request.body.notes || null,
    user_id: request.auth.user.id,
  };

  const { data: rpcResult, error } = await supabaseAdmin.rpc(
    "record_customer_payment",
    { payload: rpcPayload },
  );
  if (error) throw new ApiError(400, error.message);

  const [{ data: customer, error: customerError }, paymentResult] = await Promise.all([
    supabaseAdmin.from("customers").select("*").eq("id", request.params.id).single(),
    rpcResult?.payment_id
      ? supabaseAdmin.from("payments").select("*").eq("id", rpcResult.payment_id).single()
      : supabaseAdmin
          .from("payments")
          .select("*")
          .eq("customer_id", request.params.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);

  if (customerError || !customer) {
    throw new ApiError(400, customerError?.message || "د قرضدار تازه حساب ترلاسه نه شو.");
  }

  if (paymentResult?.error) {
    throw new ApiError(400, paymentResult.error.message);
  }

  const storedPayment = paymentResult?.data || {};
  const paymentId =
    rpcResult?.payment_id ||
    storedPayment.id ||
    null;

  let savedPayment = storedPayment;

  /*
    record_customer_payment RPC may create the payment row without copying
    the extra Hawala fields. Persist them directly in public.payments so
    they remain available after refresh and appear in Payment History.
  */
  if (paymentId) {
    const detailsPatch = {
      method,
      payment_date: paymentDate,
      amount_words: request.body.amount_words || null,
      payment_date_shamsi: request.body.payment_date_shamsi || null,
      hawala_number:
        method === "hawala"
          ? request.body.hawala_number || null
          : null,
      market:
        method === "hawala"
          ? request.body.market || null
          : null,
      shop_address:
        method === "hawala"
          ? request.body.shop_address || null
          : null,
      notes:
        request.body.notes ||
        request.body.note ||
        null,
    };

    const { data: updatedPayment, error: detailsError } =
      await supabaseAdmin
        .from("payments")
        .update(detailsPatch)
        .eq("id", paymentId)
        .eq("customer_id", request.params.id)
        .select("*")
        .single();

    if (detailsError) {
      throw new ApiError(400, detailsError.message);
    }

    savedPayment = updatedPayment || storedPayment;
  }

  const payment = {
    ...savedPayment,
    amount,
    method,
    payment_date: paymentDate,
    amount_words:
      savedPayment.amount_words ||
      request.body.amount_words ||
      "",
    payment_date_shamsi:
      savedPayment.payment_date_shamsi ||
      request.body.payment_date_shamsi ||
      "",
    hawala_number:
      savedPayment.hawala_number ||
      request.body.hawala_number ||
      "",
    market:
      savedPayment.market ||
      request.body.market ||
      "",
    shop_address:
      savedPayment.shop_address ||
      request.body.shop_address ||
      "",
    notes:
      savedPayment.notes ||
      request.body.notes ||
      request.body.note ||
      "",
  };

  let whatsapp = { queued: false };
  try {
    whatsapp = await enqueuePaymentReceiptJob({ customer, payment });
  } catch (whatsappError) {
    console.error("[WhatsApp] Payment receipt queue failed:", whatsappError?.message || whatsappError);
    whatsapp = { queued: false, error: whatsappError?.message || "Queue failed" };
  }

  return sendData(
    response,
    { customer, payment, result: rpcResult, whatsapp },
    "Payment recorded",
    201,
  );
});


export const recordBalance = asyncHandler(async (request, response) => {
  const amount = Number(request.body.amount || 0);
  if (amount <= 0) throw new ApiError(400, "د باقیاتو مقدار سم نه دی.");
  const type = request.body.type === "goods_credit" ? "goods_credit" : "bill_transfer";
  const { data: customer, error: findError } = await supabaseAdmin.from("customers").select("*").eq("id", request.params.id).single();
  if (findError || !customer) throw new ApiError(404, "قرضدار پیدا نه شو.");
  const { data: record, error } = await supabaseAdmin.from("debtor_balance_records").insert({
    customer_id: request.params.id, type, amount, amount_words: request.body.amount_words || null,
    record_date: request.body.date || new Date().toISOString().slice(0,10), date_shamsi: request.body.date_shamsi || null,
    bill_number: request.body.bill_number || null, bill_image: request.body.bill_image || null, bill_image_name: request.body.bill_image_name || null,
    note: request.body.note || null, created_by: request.auth.user.id,
  }).select().single();
  if (error) throw new ApiError(400, error.message);
  const nextBalance = Number(customer.current_balance || 0) + amount;
  const { data: updated, error: updateError } = await supabaseAdmin.from("customers").update({ current_balance: nextBalance }).eq("id", request.params.id).select().single();
  if (updateError) throw new ApiError(400, updateError.message);
  return sendData(response, { customer: updated, balance: { ...record, date: record.record_date }, balances: [record] }, "Balance recorded", 201);
});


export const updatePayment = asyncHandler(async (request, response) => {
  const { id: customerId, paymentId } = request.params;
  const amount = Number(request.body.amount || 0);
  if (amount <= 0) throw new ApiError(400, "Payment amount ناسم دی.");

  const [{ data: customer, error: customerError }, { data: oldPayment, error: paymentError }] = await Promise.all([
    supabaseAdmin.from("customers").select("*").eq("id", customerId).single(),
    supabaseAdmin.from("payments").select("*").eq("id", paymentId).eq("customer_id", customerId).single(),
  ]);
  if (customerError || !customer) throw new ApiError(404, "قرضدار پیدا نه شو.");
  if (paymentError || !oldPayment) throw new ApiError(404, "وصولي پیدا نه شوه.");

  const oldAmount = Number(oldPayment.amount || 0);
  const nextBalance = Number(customer.current_balance || 0) + oldAmount - amount;
  // Only update columns that actually exist in the current payments table.
  // Some older WMS databases do not have fields such as amount_words or
  // payment_date_shamsi, and sending those keys makes PostgREST return 400.
  const requestedPatch = {
    amount,
    method: request.body.method === "hawala" || request.body.method === "bank"
      ? "hawala"
      : (request.body.method || oldPayment.method || "cash"),
    payment_date: request.body.payment_date || request.body.date || oldPayment.payment_date,
    amount_words: request.body.amount_words,
    payment_date_shamsi: request.body.payment_date_shamsi,
    hawala_number: request.body.hawala_number,
    market: request.body.market,
    shop_address: request.body.shop_address,
    notes: request.body.notes ?? request.body.note,
  };

  const paymentPatch = Object.fromEntries(
    Object.entries(requestedPatch).filter(
      ([key, value]) => value !== undefined && Object.prototype.hasOwnProperty.call(oldPayment, key),
    ),
  );

  const { data: payment, error: updatePaymentError } = await supabaseAdmin
    .from("payments").update(paymentPatch).eq("id", paymentId).eq("customer_id", customerId).select().single();
  if (updatePaymentError) throw new ApiError(400, updatePaymentError.message);

  const { data: updatedCustomer, error: updateCustomerError } = await supabaseAdmin
    .from("customers").update({ current_balance: nextBalance }).eq("id", customerId).select().single();
  if (updateCustomerError) {
    await supabaseAdmin.from("payments").update(oldPayment).eq("id", paymentId).eq("customer_id", customerId);
    throw new ApiError(400, updateCustomerError.message);
  }

  return sendData(response, { customer: updatedCustomer, payment }, "Payment updated");
});

export const updateBalance = asyncHandler(async (request, response) => {
  const { id: customerId, balanceId } = request.params;
  const amount = Number(request.body.amount || 0);
  if (amount < 0) throw new ApiError(400, "د باقیاتو مقدار سم نه دی.");

  const [{ data: customer, error: customerError }, { data: oldRecord, error: recordError }] = await Promise.all([
    supabaseAdmin.from("customers").select("*").eq("id", customerId).single(),
    supabaseAdmin.from("debtor_balance_records").select("*").eq("id", balanceId).eq("customer_id", customerId).single(),
  ]);
  if (customerError || !customer) throw new ApiError(404, "قرضدار پیدا نه شو.");
  if (recordError || !oldRecord) throw new ApiError(404, "د باقیاتو ریکارډ پیدا نه شو.");

  const oldAmount = Number(oldRecord.amount || 0);
  const nextBalance = Number(customer.current_balance || 0) - oldAmount + amount;
  const recordPatch = {
    amount,
    type: request.body.type || oldRecord.type,
    amount_words: request.body.amount_words ?? oldRecord.amount_words ?? null,
    record_date: request.body.record_date || request.body.date || oldRecord.record_date,
    date_shamsi: request.body.date_shamsi ?? oldRecord.date_shamsi ?? null,
    bill_number: request.body.bill_number ?? oldRecord.bill_number ?? null,
    bill_image: request.body.bill_image ?? oldRecord.bill_image ?? null,
    bill_image_name: request.body.bill_image_name ?? oldRecord.bill_image_name ?? null,
    note: request.body.note ?? oldRecord.note ?? null,
  };

  const { data: balance, error: updateRecordError } = await supabaseAdmin
    .from("debtor_balance_records").update(recordPatch).eq("id", balanceId).eq("customer_id", customerId).select().single();
  if (updateRecordError) throw new ApiError(400, updateRecordError.message);

  const { data: updatedCustomer, error: updateCustomerError } = await supabaseAdmin
    .from("customers").update({ current_balance: nextBalance }).eq("id", customerId).select().single();
  if (updateCustomerError) {
    await supabaseAdmin.from("debtor_balance_records").update(oldRecord).eq("id", balanceId).eq("customer_id", customerId);
    throw new ApiError(400, updateCustomerError.message);
  }

  return sendData(response, { customer: updatedCustomer, balance: { ...balance, date: balance.record_date } }, "Balance updated");
});


export const deletePayment = asyncHandler(async (request, response) => {
  const { id: customerId, paymentId } = request.params;
  const [{ data: customer, error: customerError }, { data: payment, error: paymentError }] = await Promise.all([
    supabaseAdmin.from("customers").select("*").eq("id", customerId).single(),
    supabaseAdmin.from("payments").select("*").eq("id", paymentId).eq("customer_id", customerId).single(),
  ]);
  if (customerError || !customer) throw new ApiError(404, "قرضدار پیدا نه شو.");
  if (paymentError || !payment) throw new ApiError(404, "وصولي پیدا نه شوه.");

  const nextBalance = Number(customer.current_balance || 0) + Number(payment.amount || 0);
  const { error: deleteError } = await supabaseAdmin.from("payments").delete().eq("id", paymentId).eq("customer_id", customerId);
  if (deleteError) throw new ApiError(400, deleteError.message);

  const { data: updatedCustomer, error: updateError } = await supabaseAdmin
    .from("customers").update({ current_balance: nextBalance }).eq("id", customerId).select().single();
  if (updateError) {
    const restore = { ...payment };
    delete restore.id;
    await supabaseAdmin.from("payments").insert({ ...restore, id: payment.id });
    throw new ApiError(400, updateError.message);
  }
  return sendData(response, { customer: updatedCustomer, deleted_id: paymentId }, "Payment deleted");
});

export const deleteBalance = asyncHandler(async (request, response) => {
  const { id: customerId, balanceId } = request.params;
  const [{ data: customer, error: customerError }, { data: record, error: recordError }] = await Promise.all([
    supabaseAdmin.from("customers").select("*").eq("id", customerId).single(),
    supabaseAdmin.from("debtor_balance_records").select("*").eq("id", balanceId).eq("customer_id", customerId).single(),
  ]);
  if (customerError || !customer) throw new ApiError(404, "قرضدار پیدا نه شو.");
  if (recordError || !record) throw new ApiError(404, "د باقیاتو ریکارډ پیدا نه شو.");

  const nextBalance = Math.max(0, Number(customer.current_balance || 0) - Number(record.amount || 0));
  const { error: deleteError } = await supabaseAdmin.from("debtor_balance_records").delete().eq("id", balanceId).eq("customer_id", customerId);
  if (deleteError) throw new ApiError(400, deleteError.message);

  const { data: updatedCustomer, error: updateError } = await supabaseAdmin
    .from("customers").update({ current_balance: nextBalance }).eq("id", customerId).select().single();
  if (updateError) {
    const restore = { ...record };
    delete restore.id;
    await supabaseAdmin.from("debtor_balance_records").insert({ ...restore, id: record.id });
    throw new ApiError(400, updateError.message);
  }
  return sendData(response, { customer: updatedCustomer, deleted_id: balanceId }, "Balance deleted");
});
