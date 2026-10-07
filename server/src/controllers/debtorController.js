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

  let query = supabaseAdmin
    .from("customers")
    .select("*")
    .eq("is_active", true)
    .order("current_balance", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  // The debtors overview only needs customer rows. It previously waited for a
  // second payments query even though total_paid is not used by this page.
  // Keeping this endpoint to one database round-trip makes the list paint much
  // sooner while debtor details still load full payment history on demand.
  const { data, error } = await query;

  if (error) throw new ApiError(400, error.message);

  const rows = data || [];

  const summary = rows.reduce((acc, row) => {
    acc[row.currency === "USD" ? "USD" : "AFN"] += Number(row.current_balance || 0);
    acc.total += 1;

    if (
      Number(row.current_balance || 0) > 0 &&
      row.last_payment_date &&
      Date.now() - new Date(row.last_payment_date).getTime() > 14 * 86400000
    ) {
      acc.overdue += 1;
    }

    return acc;
  }, { AFN: 0, USD: 0, total: 0, overdue: 0 });

  return sendData(response, rows, "Debtors loaded", 200, { summary });

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

  const { data: customer, error: findError } = await supabaseAdmin.from("customers").select("*").eq("id", request.params.id).single();

  if (findError || !customer) throw new ApiError(404, "Debtor پیدا نه شو.");

  if (Number(customer.current_balance || 0) > 0) throw new ApiError(400, "د پور تر تصفیې مخکې قرضدار نه شي حذف کېدای.");

  const { data: recycleRow, error: recycleError } = await supabaseAdmin
    .from("recycle_bin")
    .insert({
      entity_type: "debtor",
      entity_id: String(customer.id),
      label: customer.name || "قرضدار",
      data: customer,
      deleted_by: request.auth?.user?.id || null,
    })
    .select("id")
    .single();

  if (recycleError || !recycleRow) {
    throw new ApiError(400, `Recycle Bin ته انتقال ناکام شو: ${recycleError?.message || "نامعلومه ستونزه"}`);
  }

  const { data, error } = await supabaseAdmin.from("customers").update({ is_active: false }).eq("id", request.params.id).select("id").single();

  if (error || !data) {
    await supabaseAdmin.from("recycle_bin").delete().eq("id", recycleRow.id);
    throw new ApiError(400, error?.message || "Debtor delete failed");
  }

  return sendData(response, { ...data, recycle_bin_id: recycleRow.id }, "Debtor moved to Recycle Bin");

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



  const storedPayment = paymentResult?.data || {};

  const payment = {

    ...storedPayment,

    amount,

    method,

    payment_date: paymentDate,

    amount_words: storedPayment.amount_words || request.body.amount_words || "",

    payment_date_shamsi:

      storedPayment.payment_date_shamsi || request.body.payment_date_shamsi || "",

    hawala_number: storedPayment.hawala_number || request.body.hawala_number || "",

    market: storedPayment.market || request.body.market || "",

    shop_address: storedPayment.shop_address || request.body.shop_address || "",

    notes: storedPayment.notes || request.body.notes || "",

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
